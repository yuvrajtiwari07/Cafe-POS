import React, { useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, User } from './auth';
import { doc, onSnapshot, collection, getDocs } from './database';
import { auth, db, loginWithGoogle } from './database';
import { LogIn } from 'lucide-react';
import { Bill, Cafe, LedgerEntry, MenuItem, PrinterConfig, TabType, WalletOpeningBalances } from './types';
import {
  createDefaultCafe,
  DEFAULT_OPENING_BALANCES,
  getActiveCafe,
  getLocalBills,
  getLocalLedger,
  getLocalMenu,
  getPendingQueue,
  getPrinterConfig,
  getWalletOpeningBalances,
  savePrinterConfig,
  saveLocalLedger,
  saveLocalMenu,
  saveWalletOpeningBalances,
  setActiveCafe,
} from './services/storage';
import { syncEngine } from './services/syncEngine';
import { flushSheetSyncQueue, getPendingSheetSyncCount } from './services/googleSheetsSync';
import { isBluetoothConnected, getConnectedDeviceName } from './services/escpos';
import { Header } from './components/Header';
import { BillingPOS } from './components/BillingPOS';
import { TransactionsLog } from './components/TransactionsLog';
import { DailyReports } from './components/DailyReports';
import { MenuManager } from './components/MenuManager';
import { ReceiptModal } from './components/ReceiptModal';
import { CafeModal } from './components/CafeModal';
import { BluetoothModal } from './components/BluetoothModal';
import { InventoryManager } from './components/InventoryManager';
import { StaffManager } from './components/StaffManager';
import { SettingsManager } from './components/SettingsManager';
import { AndroidInstallModal } from './components/AndroidInstallModal';
import { ExpensesDrawer } from './components/ExpensesDrawer';
import { showToast, ToastMessage } from './services/toast';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activeCafe, setCafeState] = useState<Cafe>(() => {
    return getActiveCafe() || createDefaultCafe();
  });
  const [menu, setMenu] = useState<MenuItem[]>(() => {
    return getLocalMenu(activeCafe.id);
  });
  const [bills, setBills] = useState<Bill[]>(() => {
    return getLocalBills(activeCafe.id);
  });
  const [ledger, setLedger] = useState<LedgerEntry[]>(() => {
    return getLocalLedger(activeCafe.id);
  });
  const [openingBalances, setOpeningBalances] = useState<WalletOpeningBalances>(() => {
    return getWalletOpeningBalances(activeCafe.id);
  });
  const [pendingCount, setPendingCount] = useState<number>(() => {
    return getPendingQueue(activeCafe.id).length;
  });

  const [activeTab, setActiveTab] = useState<TabType>('pos');
  const [isOnline, setIsOnline] = useState<boolean>(() => syncEngine.isOnline());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Printer configuration & status
  const [printerConfig, setPrinterConfig] = useState<PrinterConfig>(() => getPrinterConfig());
  const [isPrinterConnected, setIsPrinterConnected] = useState<boolean>(() => isBluetoothConnected());
  const [printerDeviceName, setPrinterDeviceName] = useState<string | undefined>(
    () => getConnectedDeviceName() || undefined
  );

  // Modals & Drawers state - never start with showCafeModal = true on hard refresh if we have a cafe
  const [receiptBill, setReceiptBill] = useState<Bill | null>(null);
  const [showCafeModal, setShowCafeModal] = useState<boolean>(false);
  const [isInitialSetup, setIsInitialSetup] = useState<boolean>(false);
  const [showPrinterModal, setShowPrinterModal] = useState<boolean>(false);
  const [showAndroidInstallModal, setShowAndroidInstallModal] = useState<boolean>(false);
  const [showExpensesDrawer, setShowExpensesDrawer] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const handleToast = (e: any) => {
      const newToast: ToastMessage = e.detail;
      setToasts((prev) => [...prev, newToast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, 4000);
    };

    window.addEventListener('app_toast', handleToast);
    const query = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const loginError = query.get('error_description') || fragment.get('error_description');
    if (loginError) {
      showToast(`Google login: ${loginError}`, 'error');
      history.replaceState(null, '', window.location.pathname);
    }
    return () => window.removeEventListener('app_toast', handleToast);
  }, []);

  // Restore only cafes that the signed-in user can read under database policies.
  useEffect(() => {
    let generation = 0;
    const unsubAuth = onAuthStateChanged(auth, async (currentUser) => {
      const currentGeneration = ++generation;
      setUser(currentUser);
      setReceiptBill(null);
      setShowExpensesDrawer(false);
      syncEngine.setCafe(null);
      const local = getActiveCafe();
      const belongsToUser = currentUser && local &&
        (local.ownerId === currentUser.uid || local.memberUids?.includes(currentUser.uid));
      const fallback = belongsToUser ? local : createDefaultCafe();
      setActiveCafe(fallback);
      setCafeState(fallback);
      setShowCafeModal(false);
      if (!currentUser) return;
      try {
        const available = await getDocs(collection(db, 'cafes'));
        if (currentGeneration !== generation) return;
        const cafes = available.docs.map(d => ({ ...d.data(), id: d.id } as Cafe));
        const selected = cafes.find(c => c.id === local?.id) || cafes[0];
        if (selected) {
          setActiveCafe(selected);
          setCafeState(selected);
          setIsInitialSetup(false);
        } else {
          const empty = createDefaultCafe();
          setActiveCafe(empty);
          setCafeState(empty);
          setIsInitialSetup(true);
          setShowCafeModal(true);
        }
      } catch (error: any) {
        showToast(`Could not load restaurants: ${error.message}. Local offline data is still available.`, 'warning');
      }
    });
    return () => { generation++; unsubAuth(); };
  }, []);

  // Real-time listener for current Cafe document (for live approvals & updates)
  useEffect(() => {
    if (!user || !activeCafe.id || activeCafe.id === 'default-corner-cafe') return;

    try {
      const unsubCafe = onSnapshot(doc(db, 'cafes', activeCafe.id), (docSnap) => {
        if (!docSnap.exists()) {
          const empty = createDefaultCafe();
          setActiveCafe(empty);
          setCafeState(empty);
          setIsInitialSetup(true);
          setShowCafeModal(true);
          return;
        }
        if (docSnap.exists()) {
          const cloudCafe = { ...docSnap.data(), id: docSnap.id } as Cafe;
          const isOwnerMatch =
            user && cloudCafe.ownerId === user.uid;
          const isMemberMatch = user && cloudCafe.memberUids?.includes(user.uid);

          // Only revoke if user is confirmed NOT the owner and not in members list
          if (user && !isOwnerMatch && !isMemberMatch && (cloudCafe.memberUids?.length || 0) > 0) {
            showToast('Your access to this restaurant was revoked by the owner.', 'warning');
            const fallback = createDefaultCafe(user.uid, user.email || '', user.displayName || '');
            setActiveCafe(fallback);
            setCafeState(fallback);
            setIsInitialSetup(true);
            setShowCafeModal(true);
            return;
          }
          setActiveCafe(cloudCafe);
          setCafeState(cloudCafe);
        }
      });
      return () => unsubCafe();
    } catch (e) {
      console.warn('Cafe live listener error', e);
    }
  }, [activeCafe.id, user]);

  // Sync Engine Cafe binding
  useEffect(() => {
    syncEngine.setCafe(user && activeCafe.id !== 'default-corner-cafe' ? activeCafe.id : null);
    setMenu(getLocalMenu(activeCafe.id));
    setBills(getLocalBills(activeCafe.id));
    setLedger(getLocalLedger(activeCafe.id));
    setOpeningBalances(getWalletOpeningBalances(activeCafe.id));
    setPendingCount(getPendingQueue(activeCafe.id).length);
  }, [activeCafe.id, user?.uid]);

  // Real-time multi-device sync for Menu items subcollection
  useEffect(() => {
    if (!user || !activeCafe.id || activeCafe.id === 'default-corner-cafe') return;

    try {
      const unsubMenu = onSnapshot(
        collection(db, 'cafes', activeCafe.id, 'menu'),
        (snapshot) => {
          const cloudItems: MenuItem[] = [];
          snapshot.docs.forEach((docSnap) => {
            cloudItems.push({
              ...(docSnap.data() as MenuItem),
              id: docSnap.id,
              cafeId: activeCafe.id,
            });
          });
          setMenu(cloudItems);
          saveLocalMenu(activeCafe.id, cloudItems);
        },
        (err) => {
          console.warn('Real-time menu sync listener info:', err.message);
        }
      );
      return () => unsubMenu();
    } catch (e) {
      console.warn('Error setting up menu live listener', e);
    }
  }, [activeCafe.id, user?.uid]);

  // Real-time multi-device sync for Ledger (Expenditures, Withdrawals, CC Top-Ups) & Wallet Opening Balances
  useEffect(() => {
    if (!activeCafe.id || activeCafe.id === 'default-corner-cafe' || !user) return;

    let unsubLedger: (() => void) | undefined;
    let unsubWallet: (() => void) | undefined;

    try {
      unsubLedger = onSnapshot(
        collection(db, 'cafes', activeCafe.id, 'ledger'),
        (snapshot) => {
          const cloudEntries: LedgerEntry[] = [];
          snapshot.docs.forEach((docSnap) => {
            cloudEntries.push({
              ...(docSnap.data() as LedgerEntry),
              id: docSnap.id,
              cafeId: activeCafe.id,
            });
          });
          cloudEntries.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
          setLedger(cloudEntries);
          saveLocalLedger(activeCafe.id, cloudEntries);
        },
        (err) => {
          console.warn('Real-time ledger sync listener info:', err.message);
        }
      );
    } catch (e) {
      console.warn('Error setting up ledger live listener', e);
    }

    try {
      unsubWallet = onSnapshot(
        doc(db, 'cafes', activeCafe.id, 'settings', 'wallet'),
        (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as Partial<WalletOpeningBalances>;
            const normalized: WalletOpeningBalances = {
              cash: Number(data.cash ?? DEFAULT_OPENING_BALANCES.cash) || 0,
              upi: Number(data.upi ?? DEFAULT_OPENING_BALANCES.upi) || 0,
              creditCard: Number(data.creditCard ?? DEFAULT_OPENING_BALANCES.creditCard) || 0,
              updatedAt: data.updatedAt,
            };
            setOpeningBalances(normalized);
            saveWalletOpeningBalances(activeCafe.id, normalized);
          }
        },
        (err) => {
          console.warn('Real-time wallet settings listener info:', err.message);
        }
      );
    } catch (e) {
      console.warn('Error setting up wallet settings live listener', e);
    }

    return () => {
      if (unsubLedger) unsubLedger();
      if (unsubWallet) unsubWallet();
    };
  }, [activeCafe.id, user]);

  // Window custom events listeners
  useEffect(() => {
    const handleSyncStatus = (e: any) => {
      setIsOnline(e.detail.isOnline);
      setIsSyncing(e.detail.isSyncing);
    };

    const handleBillsUpdated = () => {
      setBills(getLocalBills(activeCafe.id));
    };

    const handleQueueUpdated = (e: any) => {
      if (e.detail?.cafeId === activeCafe.id) {
        setPendingCount(e.detail.count);
      }
    };

    const handleMenuUpdated = (e: any) => {
      if (e.detail?.cafeId === activeCafe.id) {
        setMenu(e.detail.items);
      }
    };

    const handleLedgerUpdated = (e: any) => {
      if (e.detail?.cafeId === activeCafe.id && Array.isArray(e.detail.entries)) {
        setLedger(e.detail.entries);
      }
    };

    const handleWalletOpeningUpdated = (e: any) => {
      if (e.detail?.cafeId === activeCafe.id && e.detail.balances) {
        setOpeningBalances(e.detail.balances);
      }
    };

    const handlePrinterConnection = (e: any) => {
      setIsPrinterConnected(e.detail.connected);
      if (e.detail.name) setPrinterDeviceName(e.detail.name);
    };

    const handleSheetsAuthChanged = (e: any) => {
      if (e.detail?.connected && activeCafe.googleSpreadsheetId && getPendingSheetSyncCount(activeCafe.id) > 0) {
        flushSheetSyncQueue(activeCafe)
          .then((res) => {
            if (res.flushed > 0) {
              showToast(`Synced ${res.flushed} queued POS updates to Google Sheets`, 'success');
            }
          })
          .catch(() => {});
      }
    };

    window.addEventListener('sync_status_changed', handleSyncStatus);
    window.addEventListener('bills_updated', handleBillsUpdated);
    window.addEventListener('queue_updated', handleQueueUpdated);
    window.addEventListener('menu_updated', handleMenuUpdated);
    window.addEventListener('ledger_updated', handleLedgerUpdated);
    window.addEventListener('wallet_opening_updated', handleWalletOpeningUpdated);
    window.addEventListener('printer_connection_changed', handlePrinterConnection);
    window.addEventListener('google_sheets_auth_changed', handleSheetsAuthChanged);

    return () => {
      window.removeEventListener('sync_status_changed', handleSyncStatus);
      window.removeEventListener('bills_updated', handleBillsUpdated);
      window.removeEventListener('queue_updated', handleQueueUpdated);
      window.removeEventListener('menu_updated', handleMenuUpdated);
      window.removeEventListener('ledger_updated', handleLedgerUpdated);
      window.removeEventListener('wallet_opening_updated', handleWalletOpeningUpdated);
      window.removeEventListener('printer_connection_changed', handlePrinterConnection);
      window.removeEventListener('google_sheets_auth_changed', handleSheetsAuthChanged);
    };
  }, [activeCafe]);

  // Manual Flush Queue
  const handleManualSync = useCallback(async () => {
    if (!isOnline) {
      showToast('You are currently offline. Queue will push automatically when internet is restored.', 'info');
      return;
    }
    const synced = await syncEngine.flushPendingQueue();
    if (synced > 0) {
      showToast(`Successfully synced ${synced} queued bills to database!`, 'success');
    }
  }, [isOnline]);

  // When a new bill is punched in POS
  const handleBillCreated = useCallback((newBill: Bill) => {
    setReceiptBill(newBill);
    setBills(getLocalBills(activeCafe.id));
  }, [activeCafe.id, user?.uid]);

  const handleCafeSelected = useCallback((newCafe: Cafe) => {
    setActiveCafe(newCafe);
    setCafeState(newCafe);
    setIsInitialSetup(false);
    setShowCafeModal(false);
  }, []);

  return (
    <div className="min-h-screen bg-[#fbf6ee] text-[#2b2320] flex flex-col font-sans antialiased selection:bg-[#ea580c] selection:text-white">
      {/* Top Header */}
      <Header
        cafe={activeCafe}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isOnline={isOnline}
        isSyncing={isSyncing}
        pendingCount={pendingCount}
        onManualSync={handleManualSync}
        onOpenCafeModal={() => {
          setIsInitialSetup(false);
          setShowCafeModal(true);
        }}
        onOpenPrinterModal={() => setShowPrinterModal(true)}
        isPrinterConnected={isPrinterConnected}
        printerDeviceName={printerDeviceName}
        user={user}
        onOpenAndroidInstallModal={() => setShowAndroidInstallModal(true)}
        onOpenExpensesDrawer={() => setShowExpensesDrawer(true)}
      />

      {/* Top Google Sign-In Announcement if not logged in */}
      {!user && (
        <div className="bg-linear-to-r from-[#ea580c] to-[#c2410c] text-white px-4 py-2.5 shadow-sm">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-center sm:text-left">
              <span className="bg-white/20 px-2 py-0.5 rounded-full font-bold text-[10px] uppercase tracking-wider">
                Google Login
              </span>
              <span>
                Sign in with Google to create your restaurant or join with your staff secret code. Real-time multi-device sync is enabled.
              </span>
            </div>
            <button
              onClick={loginWithGoogle}
              className="px-3.5 py-1.5 bg-white text-[#ea580c] font-bold rounded-xl hover:bg-orange-50 transition shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign in with Google</span>
            </button>
          </div>
        </div>
      )}

      {/* Main View Body */}
      <main key={`main-${activeCafe.id}`} className="flex-1 pb-16 lg:pb-6">
        {activeTab === 'pos' && (
          <BillingPOS
            cafe={activeCafe}
            menu={menu}
            onBillCreated={handleBillCreated}
            onNavigateToMenu={() => setActiveTab('menu')}
            cashierName={user?.displayName || user?.email?.split('@')[0] || 'Counter Cashier'}
            cashierEmail={user?.email || undefined}
            cashierId={user?.uid || 'guest'}
            user={user}
          />
        )}

        {activeTab === 'history' && (
          <TransactionsLog
            cafe={activeCafe}
            bills={bills}
            onSelectBillToReprint={(bill) => setReceiptBill(bill)}
          />
        )}

        {activeTab === 'reports' && (
          <DailyReports
            cafe={activeCafe}
            bills={bills}
            printerConfig={printerConfig}
            ledger={ledger}
            openingBalances={openingBalances}
            onOpenExpensesDrawer={() => setShowExpensesDrawer(true)}
          />
        )}

        {activeTab === 'menu' && (
          <MenuManager
            cafe={activeCafe}
            menu={menu}
            onMenuUpdated={setMenu}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryManager
            cafe={activeCafe}
            menu={menu}
            user={user}
          />
        )}

        {activeTab === 'staff' && (
          <StaffManager
            cafe={activeCafe}
            user={user}
            onCafeUpdated={handleCafeSelected}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsManager
            cafe={activeCafe}
            bills={bills}
            ledger={ledger}
            printerConfig={printerConfig}
            onCafeUpdated={handleCafeSelected}
            onBillsUpdated={setBills}
            onLedgerUpdated={setLedger}
            onPrinterConfigUpdated={(cfg) => {
              setPrinterConfig(cfg);
              savePrinterConfig(cfg);
            }}
            onClearMenu={() => {
              setMenu([]);
              saveLocalMenu(activeCafe.id, []);
            }}
            onOpenAndroidInstallModal={() => setShowAndroidInstallModal(true)}
          />
        )}
      </main>

      {/* Thermal Receipt Modal (for new bills or reprinting) */}
      {receiptBill && (
        <ReceiptModal
          bill={receiptBill}
          cafe={activeCafe}
          printerConfig={printerConfig}
          onClose={() => setReceiptBill(null)}
          onOpenPrinterSettings={() => {
            setReceiptBill(null);
            setShowPrinterModal(true);
          }}
        />
      )}

      {/* Restaurant Multi-Tenant, Place Choice & Staff Access Modal */}
      {showCafeModal && (
        <CafeModal
          currentCafe={activeCafe}
          onClose={() => {
            setIsInitialSetup(false);
            setShowCafeModal(false);
          }}
          onCafeSelected={handleCafeSelected}
          user={user}
          isInitialSetup={isInitialSetup}
        />
      )}

      {/* Wireless Bluetooth Thermal Printer Settings Modal */}
      {showPrinterModal && (
        <BluetoothModal
          config={printerConfig}
          onConfigChange={(newCfg) => {
            setPrinterConfig(newCfg);
            savePrinterConfig(newCfg);
          }}
          onClose={() => setShowPrinterModal(false)}
        />
      )}

      {/* Android & Mobile App Installation / Download Modal */}
      {showAndroidInstallModal && (
        <AndroidInstallModal onClose={() => setShowAndroidInstallModal(false)} />
      )}

      {/* Cash Counter, Expenditures, Withdrawals & Credit Card Top-Up Drawer */}
      <ExpensesDrawer
        key={`expenses-${activeCafe.id}`}
        isOpen={showExpensesDrawer}
        onClose={() => setShowExpensesDrawer(false)}
        cafe={activeCafe}
        bills={bills}
        ledger={ledger}
        openingBalances={openingBalances}
        onLedgerUpdated={setLedger}
        onOpeningBalancesUpdated={setOpeningBalances}
        onCafeUpdated={handleCafeSelected}
        onOpenSettings={() => setActiveTab('settings')}
        user={user}
      />

      {/* Offline Alert Indicator */}
      {!isOnline && (
        <div className="fixed bottom-3 left-3 z-40 bg-amber-600 text-white px-3 py-1.5 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span>Offline Mode: Bills are saved locally & will auto-sync to Supabase.</span>
        </div>
      )}

      {/* Floating Toast Notification Stack */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`px-4 py-2.5 rounded-2xl shadow-xl text-xs sm:text-sm font-semibold pointer-events-auto border transition-all animate-in fade-in slide-in-from-bottom-2 duration-200 ${
                toast.type === 'success'
                  ? 'bg-emerald-800 text-emerald-50 border-emerald-700'
                  : toast.type === 'warning' || toast.type === 'error'
                  ? 'bg-rose-800 text-rose-50 border-rose-700'
                  : 'bg-[#2b2320] text-[#fbf6ee] border-stone-700'
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
