import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Printer,
  QrCode,
  Banknote,
  CreditCard,
  UtensilsCrossed,
  ShoppingBag,
  Bike,
  Sparkles,
  X,
  MessageSquare,
  CheckCircle2,
  RotateCcw,
  Users,
  Layers,
  AlertCircle,
  Share2,
  Receipt,
  Check,
  ChefHat,
  PlusCircle,
  Split,
  ArrowLeft,
  ChevronRight,
  LayoutGrid,
  Clock,
  Eye,
} from 'lucide-react';
import { Bill, Cafe, MenuItem, OrderItem, OrderType, PaymentMode, TableOrder, KitchenOrderTicket } from '../types';
import {
  getNextBillNumber,
  saveBillLocally,
  getLocalTables,
  saveLocalTable,
  clearLocalTable,
  saveAllLocalTables,
  getCustomTables,
  saveCustomTables,
} from '../services/storage';
import { db, cleanFirestoreData } from '../firebase';
import { doc, collection, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { showToast } from '../services/toast';
import { KitchenReceiptModal } from './KitchenReceiptModal';
import {
  generateKOTEscPosBuffer,
  isBluetoothConnected,
  printToBluetoothDevice,
  getConnectedDeviceName,
} from '../services/escpos';
import { checkStockAvailability, deductInventoryForOrder } from '../services/inventoryEngine';
import { KitchenTimer } from './KitchenTimer';
import { syncBillToSheets } from '../services/googleSheetsSync';

interface BillingPOSProps {
  cafe: Cafe;
  menu: MenuItem[];
  onBillCreated: (bill: Bill) => void;
  onNavigateToMenu?: () => void;
  cashierName?: string;
  cashierEmail?: string;
  cashierId?: string;
  user?: any;
}

// 4 Predefined fixed cafe tables (per request)
const FIXED_TABLE_IDS = ['Table 1', 'Table 2', 'Table 3', 'Table 4'];

export const BillingPOS: React.FC<BillingPOSProps> = ({
  cafe,
  menu,
  onBillCreated,
  onNavigateToMenu,
  cashierName = '',
  cashierEmail = '',
  cashierId,
  user,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const isLegacyNumberedTable = (id: string) =>
    /^table\s*\d+$/i.test(id.trim()) && !FIXED_TABLE_IDS.includes(id);

  // Multi-table state dictionary: tableId -> TableOrder
  const [tables, setTables] = useState<Record<string, TableOrder>>(() => {
    const local = getLocalTables(cafe.id);
    const cleaned: Record<string, TableOrder> = {};
    Object.entries(local).forEach(([id, order]) => {
      if (!isLegacyNumberedTable(id) && (order?.items?.length || 0) > 0) {
        cleaned[id] = order;
      }
    });
    return cleaned;
  });

  // Up to 5 extra custom tables with customer names in place of table numbers
  const [customTables, setCustomTables] = useState<string[]>(() => {
    return getCustomTables(cafe.id);
  });

  // View mode: 'tables' (Floor & Active Orders Dashboard) vs 'pos' (Main POS item picker & cart)
  const [viewMode, setViewMode] = useState<'tables' | 'pos'>('tables');
  const [tableFilter, setTableFilter] = useState<'all' | 'occupied' | 'available'>('all');

  // Current active table (default Table 1)
  const [activeTableId, setActiveTableId] = useState<string>('Table 1');
  const [customTableName, setCustomTableName] = useState<string>('');
  const [showAddTableInput, setShowAddTableInput] = useState<boolean>(false);

  // Active table's tender & settings - UPI QR default is NO per user request
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('upi');
  const [includeQrOnBill, setIncludeQrOnBill] = useState<boolean>(false);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState<boolean>(false);
  const [activeItemNoteId, setActiveItemNoteId] = useState<string | null>(null);
  const [tempNoteText, setTempNoteText] = useState<string>('');

  // Post-payment clear table prompt modal
  const [clearTablePrompt, setClearTablePrompt] = useState<{
    bill: Bill;
    tableId: string;
  } | null>(null);

  // Split payment allocations
  const [splitCash, setSplitCash] = useState<number>(0);
  const [splitUpi, setSplitUpi] = useState<number>(0);
  const [splitCard, setSplitCard] = useState<number>(0);

  // Custom Item / Surcharge Modal (e.g. Extra Cheese, packaging, custom item)
  const [showCustomItemModal, setShowCustomItemModal] = useState<boolean>(false);
  const [customItemName, setCustomItemName] = useState<string>('');
  const [customItemPrice, setCustomItemPrice] = useState<string>('');
  const [customItemQty, setCustomItemQty] = useState<number>(1);
  const [customItemNote, setCustomItemNote] = useState<string>('');
  const [customItemIsVeg, setCustomItemIsVeg] = useState<boolean>(true);

  // Kitchen Order Ticket (KOT) modal state
  const [kotTicket, setKotTicket] = useState<KitchenOrderTicket | null>(null);
  const [isPrintingKot, setIsPrintingKot] = useState<boolean>(false);

  // Idempotency lock for checkout (Section 47)
  const [isCheckingOut, setIsCheckingOut] = useState<boolean>(false);

  // Sync ref to prevent broadcast echo loops
  const isSyncingFromRemote = useRef<boolean>(false);

  // 1. Real-time multi-device synchronization for shared tables
  useEffect(() => {
    if (!cafe.id || cafe.id === 'default-corner-cafe') return;

    try {
      const unsub = onSnapshot(
        collection(db, 'cafes', cafe.id, 'tables'),
        (snapshot) => {
          isSyncingFromRemote.current = true;
          const remoteTables: Record<string, TableOrder> = {};
          const activeRemoteCustomIds: string[] = [];

          snapshot.docs.forEach((d) => {
            const data = { ...d.data(), id: d.id } as TableOrder;
            const hasItems = (data.items || []).length > 0;

            // Purge stale legacy numbered tables (e.g. Table 5, Table 6) or empty docs
            if (isLegacyNumberedTable(d.id) || !hasItems) {
              if (user) {
                deleteDoc(doc(db, 'cafes', cafe.id, 'tables', d.id)).catch(() => {});
              }
              return;
            }

            remoteTables[d.id] = data;

            if (!FIXED_TABLE_IDS.includes(d.id)) {
              activeRemoteCustomIds.push(d.id);
            }
          });

          // Ensure any active custom customer table from Firestore is visible in customTables
          if (activeRemoteCustomIds.length > 0) {
            setCustomTables((prev) => {
              const merged = Array.from(new Set([...prev, ...activeRemoteCustomIds]));
              if (merged.length !== prev.length) {
                saveCustomTables(cafe.id, merged);
                return merged;
              }
              return prev;
            });
          }

          setTables(remoteTables);
          saveAllLocalTables(cafe.id, remoteTables);
          isSyncingFromRemote.current = false;
        },
        (err) => {
          console.warn('Real-time table sync info:', err.message);
        }
      );

      return () => unsub();
    } catch (e) {
      console.warn('Could not initialize table listener', e);
    }
  }, [cafe.id, user]);

  // Active table order data
  const currentTableOrder: TableOrder = useMemo(() => {
    if (tables[activeTableId]) {
      return tables[activeTableId];
    }
    const isCustom = !activeTableId.toLowerCase().startsWith('table');
    return {
      id: activeTableId,
      tableNumber: activeTableId,
      orderType: 'dine-in',
      items: [],
      subtotal: 0,
      grandTotal: 0,
      discountPercent: 0,
      taxPercent: 0,
      updatedAt: new Date().toISOString(),
      isCustomTable: isCustom,
      customerName: isCustom ? activeTableId : undefined,
    };
  }, [tables, activeTableId]);

  const cart = currentTableOrder.items || [];
  // Separate items into unbilled (new items to charge on this bill) vs already billed items
  const unbilledItems = useMemo(() => cart.filter((i) => !i.isBilled), [cart]);
  const billedItems = useMemo(() => cart.filter((i) => i.isBilled), [cart]);

  const orderType = currentTableOrder.orderType || 'dine-in';
  const discountPercent = currentTableOrder.discountPercent || 0;
  const taxPercent = currentTableOrder.taxPercent || 0;
  const customerMobile = currentTableOrder.customerMobile || '';

  // Extract unique menu categories
  const categories = useMemo(() => {
    const list = Array.from(new Set(menu.map((m) => m.category)));
    return ['All', ...list];
  }, [menu]);

  // Filtered menu items
  const filteredItems = useMemo(() => {
    return menu.filter((item) => {
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [menu, selectedCategory, searchQuery]);

  // Items to charge in the next bill (only the UNBILLED items, preventing double-billing earlier charged amounts!)
  const itemsToCharge = unbilledItems.length > 0 ? unbilledItems : cart;

  const subtotal = useMemo(() => {
    return itemsToCharge.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [itemsToCharge]);

  const discountAmount = useMemo(() => {
    return (subtotal * discountPercent) / 100;
  }, [subtotal, discountPercent]);

  const taxableAmount = Math.max(0, subtotal - discountAmount);

  const taxAmount = useMemo(() => {
    return (taxableAmount * taxPercent) / 100;
  }, [taxableAmount, taxPercent]);

  const grandTotal = Math.round(taxableAmount + taxAmount);

  // Cumulative total of all items on table (both billed & unbilled)
  const totalTableAmount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [cart]);

  const totalBilledAmount = useMemo(() => {
    return billedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [billedItems]);

  // Helper to commit table order changes both locally and to Firestore
  const updateActiveTable = useCallback(
    (updater: (prev: TableOrder) => TableOrder) => {
      const updated = updater(currentTableOrder);
      // Re-calculate totals for unbilled items
      const nextUnbilled = (updated.items || []).filter((i) => !i.isBilled);
      const targetItems = nextUnbilled.length > 0 ? nextUnbilled : (updated.items || []);
      const newSubtotal = targetItems.reduce((s, i) => s + i.price * i.quantity, 0);
      const discAmt = (newSubtotal * (updated.discountPercent || 0)) / 100;
      const taxAmt = (Math.max(0, newSubtotal - discAmt) * (updated.taxPercent || 0)) / 100;
      const newGrand = Math.round(Math.max(0, newSubtotal - discAmt) + taxAmt);

      const finalized: TableOrder = {
        ...updated,
        subtotal: newSubtotal,
        grandTotal: newGrand,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.displayName || user?.email || 'Staff',
      };

      // 1. Update local state
      setTables((prev) => ({
        ...prev,
        [finalized.id]: finalized,
      }));

      // 2. Persist to localStorage
      saveLocalTable(cafe.id, finalized);

      // 3. Broadcast to Firestore for multi-device live sync
      if (cafe.id && cafe.id !== 'default-corner-cafe' && user) {
        try {
          setDoc(
            doc(db, 'cafes', cafe.id, 'tables', finalized.id),
            cleanFirestoreData(finalized),
            { merge: true }
          ).catch((e) => console.warn('Cloud table update sync warning:', e));
        } catch (e) {
          console.warn('Firestore table setDoc error', e);
        }
      }
    },
    [cafe.id, currentTableOrder, user]
  );

  // Add item to active table
  const addToCart = (item: MenuItem) => {
    updateActiveTable((prev) => {
      const existing = (prev.items || []).find((i) => i.menuItemId === item.id);
      let newItems: OrderItem[];
      if (existing) {
        newItems = prev.items.map((i) =>
          i.menuItemId === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      } else {
        newItems = [
          ...(prev.items || []),
          {
            menuItemId: item.id,
            name: item.name,
            price: item.price,
            quantity: 1,
            isVeg: item.isVeg,
          },
        ];
      }
      return { ...prev, items: newItems };
    });
  };

  // Decrement item on active table
  const decrementCartItem = (menuItemId: string) => {
    updateActiveTable((prev) => {
      const target = (prev.items || []).find((i) => i.menuItemId === menuItemId);
      if (!target) return prev;
      let newItems: OrderItem[];
      if (target.quantity <= 1) {
        newItems = prev.items.filter((i) => i.menuItemId !== menuItemId);
      } else {
        newItems = prev.items.map((i) =>
          i.menuItemId === menuItemId ? { ...i, quantity: i.quantity - 1 } : i
        );
      }
      return { ...prev, items: newItems };
    });
  };

  // Remove item completely
  const removeFromCart = (menuItemId: string) => {
    updateActiveTable((prev) => ({
      ...prev,
      items: (prev.items || []).filter((i) => i.menuItemId !== menuItemId),
    }));
  };

  // Save special instructions note on item
  const saveNoteOnItem = (menuItemId: string) => {
    updateActiveTable((prev) => ({
      ...prev,
      items: (prev.items || []).map((i) =>
        i.menuItemId === menuItemId ? { ...i, notes: tempNoteText.trim() } : i
      ),
    }));
    setActiveItemNoteId(null);
    setTempNoteText('');
  };

  // Switch Order Type on active table
  const setOrderType = (newType: OrderType) => {
    updateActiveTable((prev) => ({ ...prev, orderType: newType }));
  };

  // Discount adjustment
  const setDiscountPercent = (pct: number) => {
    updateActiveTable((prev) => ({ ...prev, discountPercent: pct }));
  };

  // Tax adjustment
  const setTaxPercent = (taxPct: number) => {
    updateActiveTable((prev) => ({ ...prev, taxPercent: taxPct }));
  };

  // Customer Mobile update
  const setCustomerMobile = (mobile: string) => {
    updateActiveTable((prev) => ({ ...prev, customerMobile: mobile }));
  };

  // Clear Table completely
  const handleClearCurrentTable = async (tableToClear = activeTableId) => {
    // 1. Remove from local state
    setTables((prev) => {
      const next = { ...prev };
      delete next[tableToClear];
      return next;
    });

    // 2. Clear from localStorage
    clearLocalTable(cafe.id, tableToClear);

    // 3. Clear from Firestore
    if (cafe.id && cafe.id !== 'default-corner-cafe' && user) {
      try {
        await deleteDoc(doc(db, 'cafes', cafe.id, 'tables', tableToClear));
      } catch (e) {
        console.warn('Could not delete table doc in Firestore', e);
      }
    }

    showToast(`${tableToClear} cleared & ready for next guest!`, 'info');
  };

  // Add Custom Item or Add-on Charge (like Extra Cheese, Packaging, etc.)
  const handleAddCustomItem = () => {
    if (!customItemName.trim()) {
      showToast('Please enter an item or charge name (e.g. Extra Cheese)', 'warning');
      return;
    }
    const priceVal = parseFloat(customItemPrice);
    if (isNaN(priceVal) || priceVal < 0) {
      showToast('Please enter a valid price / charge amount', 'warning');
      return;
    }
    const qtyVal = Math.max(1, Number(customItemQty) || 1);

    updateActiveTable((prev) => {
      const customItem: OrderItem = {
        menuItemId: `custom-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        name: customItemName.trim(),
        price: priceVal,
        quantity: qtyVal,
        isVeg: customItemIsVeg,
        isCustom: true,
        notes: customItemNote.trim() || undefined,
      };
      return {
        ...prev,
        items: [...(prev.items || []), customItem],
      };
    });

    showToast(`Added "${customItemName.trim()}" (₹${priceVal * qtyVal}) to ${activeTableId}!`, 'success');
    setShowCustomItemModal(false);
    setCustomItemName('');
    setCustomItemPrice('');
    setCustomItemQty(1);
    setCustomItemNote('');
    setCustomItemIsVeg(true);
  };

  // Print Kitchen Order Ticket (KOT) - Strictly items & table/customer name, NO bill number or order ID
  const handlePrintKOTForTable = async (targetTableId: string = activeTableId, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const orderData = tables[targetTableId] || (targetTableId === activeTableId ? currentTableOrder : null);
    const tableItems = orderData?.items || [];
    const unbilled = tableItems.filter((i) => !i.isBilled);
    const itemsForKitchen = unbilled.length > 0 ? unbilled : tableItems;

    if (itemsForKitchen.length === 0 || isPrintingKot) {
      if (tableItems.length === 0) {
        showToast(`Add items to ${targetTableId} first before printing a Kitchen Ticket`, 'warning');
      }
      return;
    }

    setIsPrintingKot(true);

    try {
      const kot: KitchenOrderTicket = {
        tableNumber: targetTableId,
        items: [...itemsForKitchen],
        createdAt: new Date().toISOString(),
        isCustomCustomer: !targetTableId.toLowerCase().startsWith('table'),
      };

      // If thermal bluetooth printer is connected, dispatch exactly ONE slip
      if (isBluetoothConnected()) {
        try {
          const buffer = generateKOTEscPosBuffer(kot, cafe.name);
          await printToBluetoothDevice(buffer);
          showToast(`Kitchen Ticket printed for ${targetTableId}!`, 'success');
          return;
        } catch (e: any) {
          console.warn('Bluetooth print KOT error', e);
          showToast('Printer busy or disconnected, opening preview modal', 'warning');
        }
      }

      // If Bluetooth is not connected, open on-screen KOT preview modal
      setKotTicket(kot);
    } finally {
      setTimeout(() => setIsPrintingKot(false), 600);
    }
  };

  const handlePrintKOT = async () => {
    await handlePrintKOTForTable(activeTableId);
  };

  // Submit Bill & Prompt for Table Clearing
  const handlePunchBill = () => {
    if (itemsToCharge.length === 0 || isCheckingOut) return;

    // If all items already billed on this table
    if (cart.length > 0 && unbilledItems.length === 0) {
      showToast('All items on this table have already been charged & billed!', 'info');
      return;
    }

    // Stock availability validation according to cafe.inventoryMode (Section 46, 87)
    if (cafe.inventoryMode === 'STRICT') {
      const stockCheck = checkStockAvailability(cafe.id, itemsToCharge);
      if (!stockCheck.isAvailable) {
        const list = stockCheck.shortages
          .map((s) => `• ${s.ingredientName} for ${s.itemName} (Available: ${s.available}, Required: ${s.required})`)
          .join('\n');
        showToast(`Cannot complete checkout (STRICT Stock Mode):\n${list}`, 'error');
        return;
      }
    } else if (cafe.inventoryMode === 'WARNING') {
      const stockCheck = checkStockAvailability(cafe.id, itemsToCharge);
      if (!stockCheck.isAvailable) {
        showToast('Warning: One or more recipe ingredients are below needed stock level.', 'warning');
      }
    }

    setIsCheckingOut(true);

    try {
      const billNumber = getNextBillNumber(cafe.secretCode || 'POS', cafe.id);

      // Split payment details
      let finalSplitDetails = undefined;
      if (paymentMode === 'split') {
        const c = Number(splitCash) || 0;
        const u = Number(splitUpi) || 0;
        const card = Number(splitCard) || 0;
        finalSplitDetails = { cash: c, upi: u, card };
      }

      const hasUpiPortion =
        paymentMode === 'upi' || (paymentMode === 'split' && (finalSplitDetails?.upi || 0) > 0);

      const idempotencyKey = `chk-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      // Incremental Bill: charge only the newly added itemsToCharge (e.g. ₹50)
      const newBill: Bill = {
        id: `bill-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        cafeId: cafe.id,
        billNumber,
        items: [...itemsToCharge],
        subtotal,
        discountPercent,
        discountAmount,
        taxPercent,
        taxAmount,
        grandTotal,
        paymentMode,
        splitDetails: finalSplitDetails,
        includeQr: hasUpiPortion ? includeQrOnBill : false,
        orderType,
        tableOrToken: activeTableId,
        customerMobile: customerMobile.trim() || undefined,
        status: 'paid',
        cashierId: cashierId || 'staff',
        cashierName: '',
        cashierEmail: '',
        createdAt: new Date().toISOString(),
        isSynced: false,
        idempotencyKey,
      };

      // Save locally immediately
      saveBillLocally(newBill);

      // Auto-sync bill to linked Google Sheet (queues cleanly if offline / session not active)
      syncBillToSheets(cafe, newBill).catch(() => {});

      // Deduct inventory atomically for the newly billed items
      deductInventoryForOrder(
        cafe.id,
        itemsToCharge,
        newBill.id,
        newBill.billNumber,
        user?.displayName || 'Staff',
        user?.email
      ).catch((e) => console.warn('Inventory deduction background error', e));

      // Mark the billed items as billed on the table so future add-ons won't double-charge
      updateActiveTable((prev) => {
        const updatedItems = (prev.items || []).map((i) =>
          !i.isBilled ? { ...i, isBilled: true, billedBillNumber: billNumber } : i
        );
        return {
          ...prev,
          items: updatedItems,
        };
      });

      // Open thermal receipt modal
      onBillCreated(newBill);

      // Show prompt to clear the table
      setClearTablePrompt({
        bill: newBill,
        tableId: activeTableId,
      });

      setIsMobileCartOpen(false);
    } finally {
      setTimeout(() => setIsCheckingOut(false), 800);
    }
  };

  // Instant Pre-Bill / KOT print without marking as paid yet
  const handlePrintProforma = () => {
    if (cart.length === 0) return;

    const proformaBill: Bill = {
      id: `proforma-${Date.now()}`,
      cafeId: cafe.id,
      billNumber: `EST-${activeTableId.replace(/[^A-Za-z0-9]/g, '')}`,
      items: [...cart],
      subtotal,
      discountPercent,
      discountAmount,
      taxPercent,
      taxAmount,
      grandTotal,
      paymentMode,
      includeQr: paymentMode === 'upi' ? includeQrOnBill : false,
      orderType,
      tableOrToken: activeTableId,
      customerMobile: customerMobile.trim() || undefined,
      status: 'paid',
      cashierId: cashierId || 'guest',
      cashierName,
      cashierEmail,
      createdAt: new Date().toISOString(),
      isSynced: true,
    };

    onBillCreated(proformaBill);
  };

  // Calculate active tables count & list of all known tables (4 fixed + up to 5 custom customer tables)
  const allKnownTableIds = useMemo(() => {
    return [...FIXED_TABLE_IDS, ...customTables];
  }, [customTables]);

  const activeTablesCount = useMemo(() => {
    return allKnownTableIds.filter((tId) => (tables[tId]?.items || []).length > 0).length;
  }, [tables, allKnownTableIds]);

  const totalItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const totalActiveTablesValue = useMemo(() => {
    return allKnownTableIds.reduce((sum, tId) => {
      const items = tables[tId]?.items || [];
      return sum + items.reduce((iSum, i) => iSum + i.price * i.quantity, 0);
    }, 0);
  }, [tables, allKnownTableIds]);

  const handleAddCustomTable = (custName: string, autoEnterPos = true) => {
    const trimmed = custName.trim();
    if (!trimmed) return;
    if (customTables.length >= 5) {
      showToast('Maximum 5 extra customer tables allowed.', 'warning');
      return;
    }
    if (FIXED_TABLE_IDS.includes(trimmed) || customTables.includes(trimmed)) {
      showToast('A table with this name already exists.', 'warning');
      setActiveTableId(trimmed);
      if (autoEnterPos) setViewMode('pos');
      return;
    }
    const updated = [...customTables, trimmed];
    setCustomTables(updated);
    saveCustomTables(cafe.id, updated);
    setActiveTableId(trimmed);
    setCustomTableName('');
    setShowAddTableInput(false);
    if (autoEnterPos) setViewMode('pos');
    showToast(`Added customer table: ${trimmed}`, 'success');
  };

  const handleDeleteCustomTable = async (custName: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updated = customTables.filter((t) => t !== custName);
    setCustomTables(updated);
    saveCustomTables(cafe.id, updated);

    // Remove from local tables and delete doc from Firestore
    await handleClearCurrentTable(custName);

    if (activeTableId === custName) {
      setActiveTableId(FIXED_TABLE_IDS[0]);
    }
    showToast(`Deleted custom table: ${custName}`, 'info');
  };

  // Dedicated Screen: Table & Floor Active Orders Dashboard (Screen before Main POS)
  const renderTableOverviewScreen = () => {
    const displayedTableIds = allKnownTableIds.filter((tId) => {
      const isOccupied = (tables[tId]?.items?.length || 0) > 0;
      if (tableFilter === 'occupied') return isOccupied;
      if (tableFilter === 'available') return !isOccupied;
      return true;
    });

    return (
      <div className="space-y-4">
        {/* Floor Management Top Header: Kitchen Timer (left) + Quick Metrics (right) */}
        <div className="bg-[#fffbf5] p-3.5 sm:p-4 rounded-3xl border border-[#eedecb] shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <KitchenTimer />
          </div>

          {/* Quick Metrics & Add Customer Table Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="bg-[#f5ede0] px-3.5 py-2 rounded-2xl border border-[#eedecb] text-right">
              <span className="text-[10px] uppercase font-bold text-[#7d6e67] block">Active Orders Total</span>
              <span className="font-extrabold text-base sm:text-lg text-[#ea580c]">
                ₹{totalActiveTablesValue.toFixed(0)}
              </span>
            </div>

            <div className="bg-[#f5ede0] px-3.5 py-2 rounded-2xl border border-[#eedecb] text-right">
              <span className="text-[10px] uppercase font-bold text-[#7d6e67] block">Seated Tables</span>
              <span className="font-extrabold text-base sm:text-lg text-[#2b2320]">
                {activeTablesCount} / {allKnownTableIds.length}
              </span>
            </div>

            {!showAddTableInput ? (
              <button
                onClick={() => {
                  if (customTables.length >= 5) {
                    showToast('Maximum 5 custom customer tables allowed.', 'warning');
                    return;
                  }
                  setShowAddTableInput(true);
                }}
                disabled={customTables.length >= 5}
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-[#ea580c] hover:bg-[#c2410c] disabled:opacity-40 text-white rounded-2xl text-xs font-bold transition shadow-xs cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>+ Customer Table ({customTables.length}/5)</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5 bg-[#f4ebe1] p-1 rounded-2xl border border-[#eedecb]">
                <input
                  type="text"
                  placeholder="Customer name (e.g. Rahul)..."
                  value={customTableName}
                  onChange={(e) => setCustomTableName(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-white text-[#2b2320] font-semibold border border-[#eedecb] rounded-xl outline-hidden w-40 sm:w-48"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleAddCustomTable(customTableName);
                    }
                  }}
                />
                <button
                  onClick={() => handleAddCustomTable(customTableName)}
                  className="px-3 py-1.5 bg-[#ea580c] text-white text-xs font-bold rounded-xl cursor-pointer hover:bg-[#c2410c]"
                >
                  Add & Open
                </button>
                <button
                  onClick={() => setShowAddTableInput(false)}
                  className="p-1.5 text-[#7d6e67] hover:text-[#2b2320] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Filter Navigation Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 bg-[#fffbf5] px-3.5 py-2.5 rounded-2xl border border-[#eedecb]">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-[#7d6e67] mr-1">Filter:</span>
            {[
              { id: 'all', label: `All Tables (${allKnownTableIds.length})` },
              { id: 'occupied', label: `Occupied (${activeTablesCount})` },
              { id: 'available', label: `Available (${allKnownTableIds.length - activeTablesCount})` },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setTableFilter(f.id as any)}
                className={`px-3 py-1 text-xs font-bold rounded-xl transition cursor-pointer ${
                  tableFilter === f.id
                    ? 'bg-[#ea580c] text-white shadow-xs'
                    : 'text-[#615149] hover:bg-[#f4ebe1]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <span className="text-[11px] text-[#7d6e67]">
            Tip: Click any table card to enter the full item catalog & POS.
          </span>
        </div>

        {/* Tables & Added Order Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {displayedTableIds.map((tId) => {
            const tableData = tables[tId];
            const tableItems = tableData?.items || [];
            const isOccupied = tableItems.length > 0;
            const isCustom = !tId.toLowerCase().startsWith('table');
            const itemsCount = tableItems.reduce((s, i) => s + i.quantity, 0);
            const totalAmt = tableItems.reduce((s, i) => s + i.price * i.quantity, 0);
            const billedAmt = tableItems.filter((i) => i.isBilled).reduce((s, i) => s + i.price * i.quantity, 0);
            const unbilledAmt = tableItems.filter((i) => !i.isBilled).reduce((s, i) => s + i.price * i.quantity, 0);
            const currentOrderType = tableData?.orderType || 'dine-in';

            return (
              <div
                key={tId}
                onClick={() => {
                  setActiveTableId(tId);
                  setViewMode('pos');
                }}
                className={`group relative rounded-3xl p-4 sm:p-4.5 flex flex-col justify-between transition-all duration-200 cursor-pointer border ${
                  isOccupied
                    ? 'bg-white border-[#ea580c] shadow-md hover:shadow-xl hover:border-[#c2410c] ring-1 ring-[#ea580c]/30'
                    : 'bg-[#fffbf5]/80 hover:bg-white border-[#eedecb] hover:border-[#ea580c] shadow-xs hover:shadow-md'
                }`}
              >
                {/* Card Top: Table Title & Status */}
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-extrabold text-base text-[#2b2320] truncate">
                          {tId}
                        </h3>
                        {isCustom && (
                          <span className="text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800">
                            Customer
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[#7d6e67] block capitalize">
                        {currentOrderType} {tableData?.customerMobile ? `• 📞 ${tableData.customerMobile}` : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isOccupied ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-[#5c1d07] text-white shadow-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                          <span>In Service</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#f5ede0] text-[#7d6e67] border border-[#eedecb]">
                          Empty
                        </span>
                      )}

                      {/* Delete Custom Table button */}
                      {isCustom && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteCustomTable(tId, e)}
                          title={`Delete custom table "${tId}"`}
                          className="p-1 rounded-full text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Middle: Added Order Details or Empty Invitation */}
                  {isOccupied ? (
                    <div className="space-y-2 mt-2">
                      {/* Financial & Items Summary Banner */}
                      <div className="flex items-center justify-between bg-[#f5ede0] p-2.5 rounded-2xl border border-[#eedecb]">
                        <div>
                          <span className="text-[10px] font-bold text-[#7d6e67] block uppercase">Running Total</span>
                          <span className="text-base font-black text-[#ea580c]">
                            ₹{totalAmt}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-bold text-[#2b2320] block">
                            {itemsCount} {itemsCount === 1 ? 'dish' : 'dishes'}
                          </span>
                          {billedAmt > 0 && unbilledAmt > 0 && (
                            <span className="text-[10px] text-emerald-700 font-semibold block">
                              (₹{billedAmt} paid + ₹{unbilledAmt} new)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Added Dishes List Preview */}
                      <div className="bg-[#faf6f0] rounded-2xl p-2.5 border border-[#eedecb]/80 space-y-1.5 max-h-[145px] overflow-y-auto">
                        <span className="text-[10px] uppercase font-bold text-[#8c7a72] block pb-0.5 border-b border-[#eedecb]/50">
                          Dishes on this table:
                        </span>
                        {tableItems.slice(0, 4).map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs gap-1">
                            <span className="text-[#2b2320] font-medium truncate">
                              <strong className="text-[#ea580c] font-bold mr-1">{item.quantity}x</strong>
                              {item.name}
                            </span>
                            <span className="font-bold text-[#615149] shrink-0 text-[11px]">
                              ₹{item.price * item.quantity}
                              {item.isBilled && <span className="text-[9px] text-emerald-700 ml-1">✓</span>}
                            </span>
                          </div>
                        ))}
                        {tableItems.length > 4 && (
                          <span className="text-[10px] text-[#ea580c] font-bold block pt-0.5">
                            + {tableItems.length - 4} more items...
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="py-6 px-3 text-center my-auto rounded-2xl border border-dashed border-[#e3d3c2] bg-[#fbf6ee]/50">
                      <div className="w-9 h-9 rounded-full bg-[#f4ebe1] text-[#8c7a72] flex items-center justify-center mx-auto mb-2">
                        <UtensilsCrossed className="w-4 h-4" />
                      </div>
                      <p className="text-xs font-bold text-[#2b2320]">Available Table</p>
                      <p className="text-[11px] text-[#8c7a72] mt-0.5">Ready for guests. Tap to take order.</p>
                    </div>
                  )}
                </div>

                {/* Card Bottom: Action Buttons */}
                <div className="pt-3 mt-3 border-t border-[#eedecb] flex items-center gap-1.5">
                  {isOccupied ? (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTableId(tId);
                          setViewMode('pos');
                        }}
                        className="flex-1 py-2 px-3 bg-[#ea580c] hover:bg-[#c2410c] text-white rounded-xl font-bold text-xs shadow-xs transition flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <span>Open POS</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handlePrintKOTForTable(tId, e)}
                        disabled={isPrintingKot}
                        className="py-2 px-2.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1 cursor-pointer shrink-0"
                        title={`1-tap print Kitchen Order Ticket for ${tId}`}
                      >
                        <ChefHat className="w-3.5 h-3.5 text-amber-700" />
                        <span>KOT</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Are you sure you want to clear ${tId}? This will reset the table for the next guest.`)) {
                            handleClearCurrentTable(tId);
                          }
                        }}
                        className="py-2 px-2 text-[#7d6e67] hover:text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-semibold transition cursor-pointer"
                        title={`Clear ${tId}`}
                      >
                        Clear
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTableId(tId);
                        setViewMode('pos');
                      }}
                      className="w-full py-2 px-3 bg-[#f5ede0] hover:bg-[#ea580c] text-[#2b2320] hover:text-white rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Start Order & Add Items</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Quick "+ New Customer Table" card if under 5 custom tables */}
          {customTables.length < 5 && (
            <div
              onClick={() => setShowAddTableInput(true)}
              className="rounded-3xl p-5 border-2 border-dashed border-[#e3d3c2] hover:border-[#ea580c] bg-[#fffbf5]/40 hover:bg-[#fffbf5] flex flex-col items-center justify-center text-center transition cursor-pointer min-h-[220px]"
            >
              <div className="w-11 h-11 rounded-2xl bg-orange-100 text-[#ea580c] flex items-center justify-center mb-2.5">
                <Plus className="w-5 h-5" />
              </div>
              <h4 className="font-extrabold text-sm text-[#2b2320]">
                + New Customer Table
              </h4>
              <p className="text-[11px] text-[#7d6e67] max-w-[180px] mt-1">
                Add a guest by name ({customTables.length}/5 used). Custom name displays across bills & KOT.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-3 sm:py-4">
      {/* RENDER TABLE OVERVIEW FLOOR SCREEN OR MAIN POS ITEM PICKER */}
      {viewMode === 'tables' ? (
        renderTableOverviewScreen()
      ) : (
        <>
          {/* MAIN POS TOP NAVIGATION & ACTIVE TABLE BAR */}
          <div className="mb-3 bg-[#fffbf5] p-3 rounded-2xl border border-[#eedecb] shadow-xs flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Back to Tables Overview Button */}
                <button
                  onClick={() => setViewMode('tables')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f4ebe1] hover:bg-[#eedecb] text-[#2b2320] rounded-xl text-xs font-bold transition shadow-xs cursor-pointer border border-[#eedecb] active:scale-95"
                  title="Return to Table & Active Orders Overview"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-[#ea580c]" />
                  <span>Back to Tables</span>
                  {activeTablesCount > 0 && (
                    <span className="w-5 h-5 rounded-full bg-[#ea580c] text-white text-[10px] flex items-center justify-center font-bold ml-0.5">
                      {activeTablesCount}
                    </span>
                  )}
                </button>

                <div className="h-4 w-px bg-[#eedecb] hidden sm:block" />

                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-[#7d6e67] hidden sm:inline">Taking Order for:</span>
                  <span className="font-extrabold text-sm text-[#2b2320] bg-orange-50 text-[#ea580c] px-2.5 py-0.5 rounded-lg border border-orange-200">
                    {activeTableId}
                  </span>
                  <span className="text-[11px] font-semibold text-[#7d6e67] capitalize hidden md:inline">
                    ({orderType} • {totalItemsCount} items)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode('tables')}
                  className="text-xs font-bold text-[#7d6e67] hover:text-[#ea580c] flex items-center gap-1 cursor-pointer bg-[#f5ede0] px-2.5 py-1.5 rounded-xl border border-[#eedecb]"
                  title="Switch to Floor & Table Overview"
                >
                  <LayoutGrid className="w-3.5 h-3.5 text-[#ea580c]" />
                  <span className="hidden sm:inline">Floor Overview</span>
                </button>
              </div>
            </div>

            {/* Quick horizontal table switcher tabs so staff can still rapidly switch between tables without leaving POS */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1.5 border-t border-[#eedecb]/70">
          {allKnownTableIds.map((tId) => {
            const tableData = tables[tId];
            const isOccupied = (tableData?.items?.length || 0) > 0;
            const isSelected = activeTableId === tId;
            const isCustom = !tId.toLowerCase().startsWith('table');
            const itemsCount = (tableData?.items || []).reduce((s, i) => s + i.quantity, 0);
            const totalAmt = (tableData?.items || []).reduce((s, i) => s + i.price * i.quantity, 0);

            return (
              <div
                key={tId}
                className={`relative group rounded-xl transition shrink-0 flex items-stretch border ${
                  isOccupied
                    ? isSelected
                      ? 'bg-[#3b1204] text-white border-[#ea580c] ring-2 ring-[#ea580c] shadow-md'
                      : 'bg-[#5c1d07] text-white border-[#7c2d12] hover:bg-[#4a1605]'
                    : isSelected
                    ? 'bg-[#2b2320] text-white border-[#2b2320] shadow-sm ring-2 ring-[#ea580c]'
                    : 'bg-[#f5ede0] text-[#615149] border-[#eedecb] hover:bg-[#ebdccb]'
                }`}
              >
                <button
                  onClick={() => setActiveTableId(tId)}
                  className="px-3 py-2 text-left flex flex-col min-w-[96px] sm:min-w-[110px] cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="font-bold text-xs truncate">
                      {tId}
                    </span>
                    {isOccupied && (
                      <span className="w-2 h-2 rounded-full bg-[#f97316] animate-pulse shrink-0" />
                    )}
                  </div>
                  <div className="text-[10px] mt-0.5 truncate flex items-center justify-between">
                    {isOccupied ? (
                      <span className={isSelected ? 'text-orange-200 font-bold' : 'text-orange-300 font-bold'}>
                        Rs. {totalAmt} ({itemsCount})
                      </span>
                    ) : (
                      <span className={isSelected ? 'text-stone-300' : 'text-[#8c7a72]'}>Empty</span>
                    )}
                  </div>
                </button>

                {/* Delete button for custom customer table - can be deleted even if no order is added */}
                {isCustom && (
                  <button
                    type="button"
                    onClick={(e) => handleDeleteCustomTable(tId, e)}
                    title={`Delete custom table "${tId}"`}
                    className="px-1.5 text-stone-400 hover:text-rose-300 hover:bg-black/20 rounded-r-xl transition flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LEFT / CENTER: MENU TOUCH GRID (Cols 1-7 or 8) */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-3">
          {/* Search & Category Filter Bar */}
          <div className="bg-[#fffbf5] p-3 rounded-2xl border border-[#eedecb] shadow-xs flex flex-col gap-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-[#8c7a72] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search items, beverages, combos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#f4ebe1] pl-10 pr-4 py-2 rounded-xl text-sm text-[#2b2320] placeholder-[#9a8981] outline-hidden focus:ring-2 focus:ring-[#ea580c] transition border border-[#e3d3c2]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#8c7a72] hover:text-[#2b2320]"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Horizontal Category Pill Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {categories.map((cat) => {
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                      isSelected
                        ? 'bg-[#ea580c] text-white shadow-xs'
                        : 'bg-[#f5ede0] text-[#615149] hover:bg-[#ebdccb]'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Touch Item Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3">
            {filteredItems.map((item) => {
              const inCartItem = cart.find((c) => c.menuItemId === item.id);
              const qtyInCart = inCartItem?.quantity || 0;

              return (
                <div
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className={`group relative bg-white p-3 sm:p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between active:scale-[0.98] select-none ${
                    qtyInCart > 0
                      ? 'border-[#ea580c] shadow-sm bg-orange-50/20 ring-1 ring-[#ea580c]'
                      : 'border-[#eedecb] hover:border-[#ea580c] hover:shadow-sm'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <div className="flex items-center gap-1">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            item.isVeg ? 'bg-emerald-600' : 'bg-rose-600'
                          }`}
                          title={item.isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
                        />
                        <span className="text-[10px] text-[#8c7a72] uppercase font-semibold">
                          {item.category}
                        </span>
                      </div>
                      {item.popular && (
                        <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded-md flex items-center gap-0.5">
                          <Sparkles className="w-2.5 h-2.5 text-amber-600" /> Hot
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-xs sm:text-sm text-[#2b2320] group-hover:text-[#ea580c] transition line-clamp-2">
                      {item.name}
                    </h4>
                  </div>

                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-[#f7ede2]">
                    <span className="font-extrabold text-sm sm:text-base text-[#2b2320]">
                      Rs. {item.price.toFixed(0)}
                    </span>
                    {qtyInCart > 0 ? (
                      <div className="flex items-center gap-1.5 bg-[#ea580c] text-white px-2 py-0.5 rounded-lg text-xs font-bold">
                        <span>{qtyInCart}</span>
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-lg bg-[#f5ede0] group-hover:bg-[#ea580c] text-[#615149] group-hover:text-white flex items-center justify-center transition">
                        <Plus className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {filteredItems.length === 0 && (
            <div className="bg-[#fffbf5] rounded-2xl border border-dashed border-[#eedecb] p-8 text-center text-[#7d6e67]">
              {menu.length === 0 ? (
                <>
                  <p className="font-bold text-base text-[#2b2320] mb-1">Your Menu is Empty</p>
                  <p className="text-xs mb-4">
                    Open Menu Manager to add dishes or import your items.
                  </p>
                  {onNavigateToMenu && (
                    <button
                      onClick={onNavigateToMenu}
                      className="px-4 py-2 bg-[#ea580c] hover:bg-[#c2410c] text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
                    >
                      Open Menu Manager
                    </button>
                  )}
                </>
              ) : (
                <p className="text-sm">No items found matching "{searchQuery}"</p>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: ORDER CART & CHECKOUT PANEL (DESKTOP) */}
        <div className="hidden lg:block lg:col-span-5 xl:col-span-4">
          <div className="sticky top-24 bg-[#fffbf5] rounded-2xl border border-[#eedecb] shadow-sm p-4 flex flex-col max-h-[calc(100vh-7rem)]">
            {renderCartContent()}
          </div>
        </div>
      </div>

      {/* MOBILE STICKY FLOATING CART BAR */}
      <div className="lg:hidden fixed bottom-3 left-3 right-3 z-30">
        <div className="flex items-center gap-2">
          {/* Back to Tables button on mobile */}
          <button
            onClick={() => setViewMode('tables')}
            className="bg-[#2b2320] hover:bg-black active:scale-95 text-white py-3 px-3.5 rounded-2xl shadow-lg flex items-center justify-center font-bold text-xs gap-1.5 transition cursor-pointer shrink-0"
            title="Return to Table & Orders Floor Overview"
          >
            <ArrowLeft className="w-4 h-4 text-orange-400" />
            <span>Tables</span>
          </button>

          {/* Quick 1-tap KOT Button outside of checkout drawer */}
          {cart.length > 0 && (
            <button
              onClick={handlePrintKOT}
              disabled={isPrintingKot}
              className="bg-[#b45309] hover:bg-[#92400e] active:scale-95 text-white py-3 px-3.5 rounded-2xl shadow-lg flex items-center justify-center font-bold text-xs gap-1.5 transition cursor-pointer shrink-0"
              title="Print Kitchen Ticket (1-tap, no need to open checkout)"
            >
              <ChefHat className="w-4 h-4" />
              <span>KOT</span>
            </button>
          )}

          {cart.length > 0 && !isMobileCartOpen ? (
            <button
              onClick={() => setIsMobileCartOpen(true)}
              className="flex-1 bg-[#ea580c] hover:bg-[#c2410c] text-white py-3 px-4 rounded-2xl shadow-lg flex items-center justify-between font-bold text-sm transition active:scale-[0.99] cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs">
                  {totalItemsCount}
                </span>
                <span className="truncate max-w-[100px]">{activeTableId}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span>Rs. {grandTotal}</span>
                <span className="text-xs opacity-80">· Cart →</span>
              </div>
            </button>
          ) : cart.length === 0 ? (
            <div className="flex-1 bg-[#fffbf5] border border-[#eedecb] text-[#7d6e67] py-3 px-3 rounded-2xl text-xs font-semibold text-center truncate shadow-sm">
              Cart empty for {activeTableId}
            </div>
          ) : null}
        </div>
      </div>
    </>
  )}

      {/* MOBILE SLIDE-UP CART MODAL */}
      {isMobileCartOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/50">
          <div className="bg-[#fffbf5] rounded-t-3xl border-t border-[#eedecb] p-4 max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-[#eedecb]">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-[#2b2320]">{activeTableId}</h3>
                <span className="text-xs bg-[#f4ebe1] px-2 py-0.5 rounded-full text-[#7d6e67] font-semibold">
                  {totalItemsCount} items
                </span>
              </div>
              <button
                onClick={() => setIsMobileCartOpen(false)}
                className="p-1 rounded-full text-[#7d6e67] hover:bg-[#eedecb] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 pt-3">
              {renderCartContent()}
            </div>
          </div>
        </div>
      )}

      {/* POST-PAYMENT CLEAR TABLE PROMPT MODAL */}
      {clearTablePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl border border-[#eedecb] animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-7 h-7" />
            </div>

            <h3 className="text-center font-bold text-base sm:text-lg text-[#2b2320]">
              Payment Completed!
            </h3>
            <p className="text-center text-xs text-[#7d6e67] mt-1">
              Bill <strong className="text-[#2b2320]">{clearTablePrompt.bill.billNumber}</strong> for{' '}
              <strong className="text-[#ea580c]">{clearTablePrompt.tableId}</strong> generated (Rs.{' '}
              {clearTablePrompt.bill.grandTotal}).
            </p>

            <div className="mt-4 p-3 rounded-2xl bg-[#fffbf5] border border-[#eedecb] text-center text-xs text-[#2b2320]">
              <span className="font-bold">Would you like to clear {clearTablePrompt.tableId} now?</span>
              <p className="text-[11px] text-[#7d6e67] mt-0.5">
                Clearing frees the table for the next guest and resets the shared cart.
              </p>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={() => {
                  handleClearCurrentTable(clearTablePrompt.tableId);
                  setClearTablePrompt(null);
                  setViewMode('tables');
                }}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Yes, Clear & Return to Tables</span>
              </button>

              <button
                onClick={() => {
                  setClearTablePrompt(null);
                  setViewMode('tables');
                }}
                className="w-full py-2 rounded-xl bg-[#f5ede0] hover:bg-[#eedecb] text-[#615149] font-semibold text-xs transition cursor-pointer"
              >
                Keep Active & Return to Table Floor
              </button>

              <button
                onClick={() => setClearTablePrompt(null)}
                className="w-full py-1 text-center text-[11px] text-[#7d6e67] hover:text-[#2b2320] font-semibold cursor-pointer"
              >
                Stay on POS Screen for {clearTablePrompt.tableId}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KITCHEN ORDER TICKET (KOT) MODAL */}
      {kotTicket && (
        <KitchenReceiptModal
          kot={kotTicket}
          cafe={cafe}
          printerConfig={{ paperWidth: 58, autoPrint: false, isSimulated: false }}
          onClose={() => setKotTicket(null)}
        />
      )}

      {/* CUSTOM ITEM / SURCHARGE ADDITION MODAL */}
      {showCustomItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl border border-[#eedecb] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#eedecb]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center text-amber-800">
                  <PlusCircle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#2b2320]">Add Custom Item / Charge</h3>
                  <p className="text-[10px] text-[#7d6e67]">Adds directly to {activeTableId} bill</p>
                </div>
              </div>
              <button
                onClick={() => setShowCustomItemModal(false)}
                className="p-1 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-3 space-y-3 text-xs">
              {/* Quick Suggestion Chips */}
              <div>
                <span className="text-[10px] font-bold text-[#7d6e67] block mb-1">
                  Quick Suggestions:
                </span>
                <div className="flex flex-wrap gap-1">
                  {[
                    { name: 'Extra Cheese', price: '30' },
                    { name: 'Extra Dip / Mayo', price: '20' },
                    { name: 'Parcel Packaging', price: '15' },
                    { name: 'Soft Drink', price: '40' },
                    { name: 'Extra Pav / Bread', price: '25' },
                    { name: 'Ice Cream Scoop', price: '50' },
                  ].map((chip) => (
                    <button
                      key={chip.name}
                      type="button"
                      onClick={() => {
                        setCustomItemName(chip.name);
                        setCustomItemPrice(chip.price);
                      }}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#f5ede0] hover:bg-orange-100 text-[#615149] hover:text-[#ea580c] transition border border-[#eedecb] cursor-pointer"
                    >
                      + {chip.name} (₹{chip.price})
                    </button>
                  ))}
                </div>
              </div>

              {/* Item Name / Cause Input */}
              <div>
                <label className="text-[11px] font-bold text-[#2b2320] block mb-1">
                  Item Name / Reason <span className="text-rose-500">*</span>:
                </label>
                <input
                  type="text"
                  value={customItemName}
                  onChange={(e) => setCustomItemName(e.target.value)}
                  placeholder="e.g. Extra Cheese, Parcel Box, Chef Special..."
                  className="w-full bg-[#faf6f0] px-3 py-2 rounded-xl text-xs font-semibold text-[#2b2320] border border-[#eedecb] outline-hidden focus:border-[#ea580c]"
                  autoFocus
                />
              </div>

              {/* Price & Quantity Grid */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-[#2b2320] block mb-1">
                    Amount (₹) <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={customItemPrice}
                    onChange={(e) => setCustomItemPrice(e.target.value)}
                    placeholder="e.g. 30"
                    className="w-full bg-[#faf6f0] px-3 py-2 rounded-xl text-xs font-bold text-[#ea580c] border border-[#eedecb] outline-hidden focus:border-[#ea580c]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[#2b2320] block mb-1">
                    Quantity:
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCustomItemQty((q) => Math.max(1, q - 1))}
                      className="w-8 h-8 rounded-lg bg-[#f5ede0] hover:bg-[#eedecb] text-[#2b2320] font-bold flex items-center justify-center cursor-pointer"
                    >
                      -
                    </button>
                    <span className="flex-1 text-center font-bold text-xs">{customItemQty}</span>
                    <button
                      type="button"
                      onClick={() => setCustomItemQty((q) => q + 1)}
                      className="w-8 h-8 rounded-lg bg-[#f5ede0] hover:bg-[#eedecb] text-[#2b2320] font-bold flex items-center justify-center cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Veg Toggle & Optional Note */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] font-bold text-[#2b2320]">Food Category:</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCustomItemIsVeg(true)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                      customItemIsVeg
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    Veg
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomItemIsVeg(false)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                      !customItemIsVeg
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    Non-Veg
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#7d6e67] block mb-1">
                  Kitchen Note / Instruction (Optional):
                </label>
                <input
                  type="text"
                  value={customItemNote}
                  onChange={(e) => setCustomItemNote(e.target.value)}
                  placeholder="e.g. Melted on top, serve in separate bowl..."
                  className="w-full bg-[#faf6f0] px-3 py-1.5 rounded-xl text-xs text-[#2b2320] border border-[#eedecb] outline-hidden"
                />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowCustomItemModal(false)}
                className="flex-1 py-2 rounded-xl bg-[#f5ede0] hover:bg-[#eedecb] text-[#615149] font-semibold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddCustomItem}
                className="flex-1 py-2 rounded-xl bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold text-xs shadow-xs transition cursor-pointer"
              >
                Add to Bill (₹{((parseFloat(customItemPrice) || 0) * customItemQty).toFixed(0)})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Common Cart renderer used for desktop sticky sidebar & mobile slide-up sheet
  function renderCartContent() {
    return (
      <div className="flex flex-col h-full gap-3">
        {/* Table Badge & Order Type Selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-sm text-[#2b2320]">{activeTableId}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-100 text-[#ea580c] font-bold">
                {cart.length > 0 ? `${totalItemsCount} items` : 'Empty'}
              </span>
            </div>

            {/* Print KOT / Running Estimate at any time */}
            {cart.length > 0 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handlePrintKOT}
                  className="text-[11px] font-bold text-[#b45309] hover:text-[#92400e] flex items-center gap-1 cursor-pointer bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-300 transition"
                  title="Print Kitchen Order Ticket (items and order ID only, strictly no prices)"
                >
                  <ChefHat className="w-3.5 h-3.5 text-amber-600" />
                  <span>KOT</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrintProforma}
                  className="text-[11px] font-bold text-[#ea580c] hover:text-[#c2410c] flex items-center gap-1 cursor-pointer bg-orange-50 px-2 py-0.5 rounded-lg border border-orange-200 transition"
                  title="Print current running order estimate"
                >
                  <Printer className="w-3 h-3" />
                  <span>Estimate</span>
                </button>
              </div>
            )}
          </div>

          {/* Order Type Selector */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#f4ebe1] rounded-xl border border-[#e3d3c2]">
            <button
              onClick={() => setOrderType('dine-in')}
              className={`flex items-center justify-center gap-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                orderType === 'dine-in'
                  ? 'bg-[#ea580c] text-white shadow-xs'
                  : 'text-[#615149] hover:bg-white/50'
              }`}
            >
              <UtensilsCrossed className="w-3.5 h-3.5" /> Dine-in
            </button>
            <button
              onClick={() => setOrderType('takeaway')}
              className={`flex items-center justify-center gap-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                orderType === 'takeaway'
                  ? 'bg-[#ea580c] text-white shadow-xs'
                  : 'text-[#615149] hover:bg-white/50'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" /> Takeaway
            </button>
            <button
              onClick={() => setOrderType('delivery')}
              className={`flex items-center justify-center gap-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                orderType === 'delivery'
                  ? 'bg-[#ea580c] text-white shadow-xs'
                  : 'text-[#615149] hover:bg-white/50'
              }`}
            >
              <Bike className="w-3.5 h-3.5" /> Delivery
            </button>
          </div>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[160px] max-h-[260px]">
          {cart.length === 0 ? (
            <div className="py-8 text-center text-[#9a8981]">
              <p className="text-xs">No items on {activeTableId} yet.</p>
              <p className="text-[11px] mt-0.5">Tap menu items to add to this table.</p>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.menuItemId}
                className={`p-2.5 rounded-xl border flex flex-col gap-1.5 text-xs ${
                  item.isBilled
                    ? 'bg-emerald-50/60 border-emerald-200'
                    : 'bg-white border-[#eedecb]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0 pr-2">
                    <span className="font-semibold text-[#2b2320] truncate">{item.name}</span>
                    {item.isBilled && (
                      <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded shrink-0">
                        ✓ Billed
                      </span>
                    )}
                  </div>
                  <span className="font-extrabold text-[#ea580c] shrink-0">
                    Rs. {(item.price * item.quantity).toFixed(0)}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-[#f7ede2]">
                  {/* Notes trigger */}
                  <button
                    onClick={() => {
                      setActiveItemNoteId(item.menuItemId);
                      setTempNoteText(item.notes || '');
                    }}
                    className="text-[11px] text-[#8c7a72] hover:text-[#ea580c] flex items-center gap-1 cursor-pointer"
                  >
                    <MessageSquare className="w-3 h-3" />
                    <span>{item.notes ? item.notes : '+ Note'}</span>
                  </button>

                  {/* Quantity Stepper */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => decrementCartItem(item.menuItemId)}
                      className="w-5 h-5 rounded-md bg-[#f5ede0] hover:bg-[#eedecb] text-[#2b2320] flex items-center justify-center cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="font-bold text-[#2b2320] min-w-[14px] text-center">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() =>
                        addToCart({
                          id: item.menuItemId,
                          cafeId: cafe.id,
                          name: item.name,
                          category: '',
                          price: item.price,
                          isVeg: item.isVeg ?? true,
                          isAvailable: true,
                        })
                      }
                      className="w-5 h-5 rounded-md bg-[#f5ede0] hover:bg-[#eedecb] text-[#2b2320] flex items-center justify-center cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => removeFromCart(item.menuItemId)}
                      className="text-stone-400 hover:text-rose-600 ml-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Inline Note Editor Modal/Drawer */}
                {activeItemNoteId === item.menuItemId && (
                  <div className="mt-1 flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="e.g. Less sugar, extra ice..."
                      value={tempNoteText}
                      onChange={(e) => setTempNoteText(e.target.value)}
                      className="flex-1 bg-[#f4ebe1] px-2 py-1 rounded-md text-[11px] outline-hidden border border-[#eedecb]"
                      autoFocus
                    />
                    <button
                      onClick={() => saveNoteOnItem(item.menuItemId)}
                      className="px-2 py-1 bg-[#ea580c] text-white rounded-md text-[11px] font-bold cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Button to add custom item or extra charge (like Extra Cheese, Packaging, etc) */}
        <button
          type="button"
          onClick={() => setShowCustomItemModal(true)}
          className="w-full py-2 px-3 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-[0.99]"
        >
          <PlusCircle className="w-3.5 h-3.5 text-amber-700" />
          <span>+ Add Custom Item / Charge (e.g. Extra Cheese)</span>
        </button>

        {/* Discounts & Tax Controls */}
        <div className="space-y-1.5 pt-2 border-t border-[#eedecb] text-xs">
          {/* Discount presets */}
          <div className="flex items-center justify-between">
            <span className="text-[#7d6e67] font-medium">Discount:</span>
            <div className="flex items-center gap-1">
              {[0, 5, 10].map((d) => (
                <button
                  key={d}
                  onClick={() => setDiscountPercent(d)}
                  className={`px-2 py-0.5 rounded-md font-semibold text-[11px] transition cursor-pointer ${
                    discountPercent === d
                      ? 'bg-[#ea580c] text-white'
                      : 'bg-[#f5ede0] text-[#615149] hover:bg-[#ebdccb]'
                  }`}
                >
                  {d}%
                </button>
              ))}
            </div>
          </div>

          {/* Tax / GST Toggle */}
          <div className="flex items-center justify-between">
            <span className="text-[#7d6e67] font-medium">GST / Taxes:</span>
            <div className="flex items-center gap-1">
              {[0, 5].map((t) => (
                <button
                  key={t}
                  onClick={() => setTaxPercent(t)}
                  className={`px-2 py-0.5 rounded-md font-semibold text-[11px] transition cursor-pointer ${
                    taxPercent === t
                      ? 'bg-[#2b2320] text-white'
                      : 'bg-[#f5ede0] text-[#615149] hover:bg-[#ebdccb]'
                  }`}
                >
                  {t}%
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Payment Tender Modes */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-bold text-[#7d6e67]">Payment Mode:</span>
          <div className="grid grid-cols-4 gap-1">
            <button
              onClick={() => setPaymentMode('upi')}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer border ${
                paymentMode === 'upi'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-white text-[#2b2320] border-[#eedecb] hover:bg-emerald-50'
              }`}
            >
              <QrCode className="w-3 h-3" />
              <span>UPI QR</span>
            </button>
            <button
              onClick={() => setPaymentMode('cash')}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer border ${
                paymentMode === 'cash'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-white text-[#2b2320] border-[#eedecb] hover:bg-amber-50'
              }`}
            >
              <Banknote className="w-3 h-3" />
              <span>Cash</span>
            </button>
            <button
              onClick={() => setPaymentMode('card')}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer border ${
                paymentMode === 'card'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-white text-[#2b2320] border-[#eedecb] hover:bg-indigo-50'
              }`}
            >
              <CreditCard className="w-3 h-3" />
              <span>Card</span>
            </button>
            <button
              onClick={() => {
                setPaymentMode('split');
                if (splitCash === 0 && splitUpi === 0) {
                  // Default to full UPI or 50/50
                  setSplitUpi(grandTotal);
                  setSplitCash(0);
                }
              }}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer border ${
                paymentMode === 'split'
                  ? 'bg-purple-700 text-white border-purple-700 shadow-xs'
                  : 'bg-white text-[#2b2320] border-[#eedecb] hover:bg-purple-50'
              }`}
            >
              <Split className="w-3 h-3" />
              <span>Split</span>
            </button>
          </div>

          {/* Interactive Split Tender Allocator */}
          {paymentMode === 'split' && (
            <div className="p-2.5 rounded-xl bg-purple-50/90 border border-purple-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-purple-950 font-bold text-[11px]">
                  <Split className="w-3.5 h-3.5 text-purple-700" />
                  <span>Split Tender (Cash + UPI)</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const half = Math.floor(grandTotal / 2);
                      setSplitCash(half);
                      setSplitUpi(grandTotal - half);
                      setSplitCard(0);
                    }}
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-200/80 text-purple-900 hover:bg-purple-300 transition cursor-pointer"
                  >
                    50/50
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSplitCash(0);
                      setSplitUpi(grandTotal);
                      setSplitCard(0);
                    }}
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-200/80 text-purple-900 hover:bg-purple-300 transition cursor-pointer"
                  >
                    All UPI
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-stone-700 block mb-0.5">
                    Cash Received (₹):
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={splitCash || ''}
                    placeholder="0"
                    onChange={(e) => {
                      const val = Math.max(0, parseFloat(e.target.value) || 0);
                      setSplitCash(val);
                      setSplitUpi(Math.max(0, grandTotal - val));
                    }}
                    className="w-full bg-white px-2 py-1.5 rounded-lg border border-purple-300 text-xs font-bold text-stone-900 outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-stone-700 block mb-0.5">
                    UPI Paid (₹):
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={splitUpi || ''}
                    placeholder="0"
                    onChange={(e) => {
                      const val = Math.max(0, parseFloat(e.target.value) || 0);
                      setSplitUpi(val);
                      setSplitCash(Math.max(0, grandTotal - val));
                    }}
                    className="w-full bg-white px-2 py-1.5 rounded-lg border border-purple-300 text-xs font-bold text-stone-900 outline-hidden"
                  />
                </div>
              </div>

              {/* Status / Balance indication */}
              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-purple-200 font-semibold">
                <span>Total: ₹{splitCash + splitUpi} / ₹{grandTotal}</span>
                {splitCash + splitUpi === grandTotal ? (
                  <span className="text-emerald-700 font-bold flex items-center gap-1 text-[10px]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Balanced
                  </span>
                ) : (
                  <span className="text-amber-800 font-bold text-[10px]">
                    {grandTotal - (splitCash + splitUpi) > 0
                      ? `Remaining: ₹${grandTotal - (splitCash + splitUpi)}`
                      : `Over by: ₹${splitCash + splitUpi - grandTotal}`}
                  </span>
                )}
              </div>

              {splitUpi > 0 && (
                <div className="flex items-center justify-between pt-1 text-[10px]">
                  <span className="text-purple-900 font-medium">Print UPI QR for ₹{splitUpi}?</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setIncludeQrOnBill(true)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                        includeQrOnBill ? 'bg-purple-700 text-white' : 'bg-white text-stone-600'
                      }`}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setIncludeQrOnBill(false)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                        !includeQrOnBill ? 'bg-stone-700 text-white' : 'bg-white text-stone-600'
                      }`}
                    >
                      No
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Ask if QR is required on bill ONLY when mode is UPI */}
          {paymentMode === 'upi' && (
            <div className="mt-2 p-2 rounded-xl bg-emerald-50/80 border border-emerald-200 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <QrCode className="w-3.5 h-3.5 text-emerald-700" />
                <span className="text-[11px] font-bold text-emerald-900">
                  Include Payment QR on Bill?
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIncludeQrOnBill(true)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition cursor-pointer ${
                    includeQrOnBill
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white text-stone-600 border border-emerald-200'
                  }`}
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setIncludeQrOnBill(false)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition cursor-pointer ${
                    !includeQrOnBill
                      ? 'bg-stone-700 text-white shadow-xs'
                      : 'bg-white text-stone-600 border border-emerald-200'
                  }`}
                >
                  No
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Customer Mobile (Optional) */}
        <input
          type="tel"
          placeholder="Customer Phone (for digital receipt)"
          value={customerMobile}
          onChange={(e) => setCustomerMobile(e.target.value)}
          className="w-full bg-[#f4ebe1] px-3 py-1.5 rounded-xl text-xs outline-hidden border border-[#eedecb] placeholder-[#9a8981]"
        />

        {/* Price Breakdown */}
        <div className="bg-[#f5ede0] p-2.5 rounded-xl border border-[#eedecb] text-xs space-y-1">
          {billedItems.length > 0 && (
            <div className="flex justify-between text-stone-500 pb-1 border-b border-stone-300 font-semibold">
              <span>Already Billed (Paid):</span>
              <span>Rs. {totalBilledAmount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-[#7d6e67]">
            <span>{billedItems.length > 0 ? 'New Add-on Subtotal:' : 'Subtotal:'}</span>
            <span>Rs. {subtotal.toFixed(2)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-emerald-700 font-medium">
              <span>Discount ({discountPercent}%):</span>
              <span>-Rs. {discountAmount.toFixed(2)}</span>
            </div>
          )}
          {taxAmount > 0 && (
            <div className="flex justify-between text-[#7d6e67]">
              <span>GST ({taxPercent}%):</span>
              <span>+Rs. {taxAmount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-1.5 border-t border-[#eedecb] font-extrabold text-sm sm:text-base text-[#2b2320]">
            <span>{billedItems.length > 0 ? 'New Charge Total:' : 'Grand Total:'}</span>
            <span className="text-[#ea580c]">Rs. {grandTotal.toFixed(2)}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-1">
          {cart.length > 0 && (
            <button
              onClick={() => handleClearCurrentTable(activeTableId)}
              className="px-3 py-2.5 rounded-xl bg-[#f5ede0] hover:bg-rose-100 text-[#7d6e67] hover:text-rose-700 text-xs font-bold transition cursor-pointer"
              title="Clear active table"
            >
              Clear Table
            </button>
          )}
          <button
            onClick={handlePunchBill}
            disabled={cart.length === 0 || (cart.length > 0 && unbilledItems.length === 0)}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm shadow-sm transition active:scale-[0.99] cursor-pointer ${
              cart.length === 0 || (cart.length > 0 && unbilledItems.length === 0)
                ? 'bg-stone-300 text-stone-500 cursor-not-allowed'
                : 'bg-linear-to-r from-[#ea580c] to-[#c2410c] text-white hover:opacity-95'
            }`}
          >
            <Printer className="w-4 h-4" />
            <span>
              {cart.length > 0 && unbilledItems.length === 0
                ? 'All Items Billed'
                : `Charge & Print Bill (Rs. ${grandTotal})`}
            </span>
          </button>
        </div>
      </div>
    );
  }
};
