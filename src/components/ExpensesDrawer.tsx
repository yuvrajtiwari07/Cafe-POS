import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Wallet,
  Banknote,
  QrCode,
  CreditCard,
  Plus,
  Trash2,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  FileSpreadsheet,
  Check,
  Search,
  UserMinus,
  Receipt,
  Pencil,
  Users,
  ExternalLink,
  Database,
  Loader2,
} from 'lucide-react';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import {
  Bill,
  Cafe,
  ExpenseType,
  LedgerEntry,
  LedgerEntryKind,
  LedgerPaymentMode,
  WalletOpeningBalances,
} from '../types';
import { auth, db, cleanFirestoreData, handleFirestoreError, OperationType } from '../firebase';
import { INITIAL_EXPENSE_SEED_ROWS } from '../data/initialExpensesSeed';
import {
  deleteLedgerEntryFromSheets,
  seedInitialExpensesToDbAndSheet,
  syncLedgerEntryToSheets,
} from '../services/googleSheetsSync';
import { saveLocalLedger, saveWalletOpeningBalances } from '../services/storage';
import { showToast } from '../services/toast';
import {
  addDaysToLocalDateStr,
  formatBusinessDayRange,
  formatHumanDate,
  getBusinessDateStr,
  getCurrentBusinessDateStr,
} from '../utils/dateUtils';
import { computeWalletSummary, isCafePaidExpense } from '../utils/walletBalances';

const WITHDRAWAL_PEOPLE = ['Yuvraj', 'Prateek', 'Yash', 'Ishita'] as const;
const EXPENSE_PAYEES = ['Cafe', 'Prateek', 'Ishita', 'Yash', 'Yuvraj', 'Ankit'] as const;

interface ExpensesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cafe: Cafe;
  bills: Bill[];
  ledger: LedgerEntry[];
  openingBalances: WalletOpeningBalances;
  onLedgerUpdated: (entries: LedgerEntry[]) => void;
  onOpeningBalancesUpdated: (balances: WalletOpeningBalances) => void;
  onCafeUpdated?: (updated: Cafe) => void;
  onOpenSettings?: () => void;
  user: any;
}

export const ExpensesDrawer: React.FC<ExpensesDrawerProps> = ({
  isOpen,
  onClose,
  cafe,
  bills,
  ledger,
  openingBalances,
  onLedgerUpdated,
  onOpeningBalancesUpdated,
  onCafeUpdated,
  onOpenSettings,
  user,
}) => {
  const [balanceView, setBalanceView] = useState<'cumulative' | 'daily'>('cumulative');
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    getCurrentBusinessDateStr(cafe.openingTime, cafe.closingTime)
  );

  // Opening balance editor state
  const [showOpeningEditor, setShowOpeningEditor] = useState<boolean>(false);
  const [openCash, setOpenCash] = useState<string>(String(openingBalances.cash || 0));
  const [openUpi, setOpenUpi] = useState<string>(String(openingBalances.upi || 0));
  const [openCc, setOpenCc] = useState<string>(String(openingBalances.creditCard || 0));

  // Add / Edit entry form state
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const [kind, setKind] = useState<LedgerEntryKind>('expenditure');
  const [paymentMode, setPaymentMode] = useState<LedgerPaymentMode>('cash');
  const [expenseType, setExpenseType] = useState<ExpenseType>('running');
  const [paidBy, setPaidBy] = useState<string>('Cafe');
  const [customPaidBy, setCustomPaidBy] = useState<string>('');
  const [expenseTitle, setExpenseTitle] = useState<string>('');
  const [person, setPerson] = useState<string>('Yuvraj');
  const [customPerson, setCustomPerson] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [entryDate, setEntryDate] = useState<string>(() =>
    getCurrentBusinessDateStr(cafe.openingTime, cafe.closingTime)
  );
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Inline confirmations & seed import state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showSeedConfirm, setShowSeedConfirm] = useState<boolean>(false);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);

  // History filtering state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [kindFilter, setKindFilter] = useState<'all' | LedgerEntryKind>('all');
  const [modeFilter, setModeFilter] = useState<'all' | LedgerPaymentMode>('all');
  const [payeeFilter, setPayeeFilter] = useState<string>('all');
  const [historyScope, setHistoryScope] = useState<'selected_date' | 'all_dates'>('all_dates');

  const existingSeedCount = useMemo(
    () => ledger.filter((e) => e.id.startsWith('seed-exp-')).length,
    [ledger]
  );

  useEffect(() => {
    const bizDate = getCurrentBusinessDateStr(cafe.openingTime, cafe.closingTime);
    setSelectedDate(bizDate);
    setEntryDate(bizDate);
  }, [cafe.id, cafe.openingTime, cafe.closingTime]);

  const cumulativeSummary = useMemo(
    () =>
      computeWalletSummary(
        bills,
        ledger,
        openingBalances,
        undefined,
        cafe.openingTime,
        cafe.closingTime
      ),
    [bills, ledger, openingBalances, cafe.openingTime, cafe.closingTime]
  );

  const dailySummary = useMemo(
    () =>
      computeWalletSummary(
        bills,
        ledger,
        openingBalances,
        selectedDate,
        cafe.openingTime,
        cafe.closingTime
      ),
    [bills, ledger, openingBalances, selectedDate, cafe.openingTime, cafe.closingTime]
  );

  const activeSummary = balanceView === 'cumulative' ? cumulativeSummary : dailySummary;

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...ledger]
      .sort((a, b) => {
        const dateCmp = (b.dateStr || '').localeCompare(a.dateStr || '');
        if (dateCmp !== 0) return dateCmp;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      })
      .filter((e) => {
        const entryBizDate = e.dateStr || getBusinessDateStr(e.createdAt, cafe.openingTime, cafe.closingTime);
        if (historyScope === 'selected_date' && entryBizDate !== selectedDate) {
          return false;
        }
        if (kindFilter !== 'all' && e.kind !== kindFilter) return false;
        if (modeFilter !== 'all' && e.paymentMode !== modeFilter) return false;
        if (payeeFilter === 'cafe_only' && !isCafePaidExpense(e)) return false;
        if (payeeFilter === 'partners_only' && (e.kind !== 'expenditure' || isCafePaidExpense(e))) return false;
        if (payeeFilter !== 'all' && payeeFilter !== 'cafe_only' && payeeFilter !== 'partners_only') {
          const entryPayee = (e.kind === 'withdrawal' ? e.person : e.paidBy || 'Cafe') || '';
          if (entryPayee.toLowerCase() !== payeeFilter.toLowerCase()) return false;
        }
        if (q) {
          const matchesNote = (e.note || '').toLowerCase().includes(q);
          const matchesTitle = (e.expenseTitle || '').toLowerCase().includes(q);
          const matchesPerson = (e.person || '').toLowerCase().includes(q);
          const matchesPaidBy = (e.paidBy || '').toLowerCase().includes(q);
          const matchesMode = (e.paymentMode || '').toLowerCase().includes(q);
          const matchesType = (e.expenseType || '').toLowerCase().includes(q);
          if (!matchesNote && !matchesTitle && !matchesPerson && !matchesPaidBy && !matchesMode && !matchesType) return false;
        }
        return true;
      });
  }, [ledger, historyScope, selectedDate, kindFilter, modeFilter, payeeFilter, searchQuery, cafe.openingTime, cafe.closingTime]);

  if (!isOpen) return null;

  const handleOpenBalanceEdit = () => {
    setOpenCash(String(openingBalances.cash || 0));
    setOpenUpi(String(openingBalances.upi || 0));
    setOpenCc(String(openingBalances.creditCard || 0));
    setShowOpeningEditor((prev) => !prev);
  };

  const handleSaveOpeningBalances = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated: WalletOpeningBalances = {
      cash: Number(openCash) || 0,
      upi: Number(openUpi) || 0,
      creditCard: Number(openCc) || 0,
      updatedAt: new Date().toISOString(),
    };

    saveWalletOpeningBalances(cafe.id, updated);
    onOpeningBalancesUpdated(updated);

    if (auth.currentUser && cafe.id && cafe.id !== 'default-corner-cafe') {
      const settingsPath = `cafes/${cafe.id}/settings/wallet`;
      try {
        await setDoc(doc(db, 'cafes', cafe.id, 'settings', 'wallet'), cleanFirestoreData(updated));
      } catch (err) {
        console.warn('Wallet opening balance cloud sync error', err);
        handleFirestoreError(err, OperationType.WRITE, settingsPath);
      }
    }

    setShowOpeningEditor(false);
    showToast('Opening balances updated!', 'success');
  };

  const resetEntryForm = () => {
    setEditingEntry(null);
    setAmount('');
    setExpenseTitle('');
    setNote('');
    setCustomPaidBy('');
    setCustomPerson('');
  };

  const handleStartEdit = (entry: LedgerEntry) => {
    setEditingEntry(entry);
    setKind(entry.kind);
    setPaymentMode(entry.paymentMode);
    setExpenseType(entry.expenseType || 'running');

    const entryPaidBy = entry.paidBy || 'Cafe';
    if ((EXPENSE_PAYEES as readonly string[]).includes(entryPaidBy)) {
      setPaidBy(entryPaidBy);
      setCustomPaidBy('');
    } else {
      setPaidBy('__CUSTOM__');
      setCustomPaidBy(entryPaidBy);
    }

    const entryPerson = entry.person || 'Yuvraj';
    if ((WITHDRAWAL_PEOPLE as readonly string[]).includes(entryPerson)) {
      setPerson(entryPerson);
      setCustomPerson('');
    } else {
      setPerson('__CUSTOM__');
      setCustomPerson(entryPerson);
    }

    setExpenseTitle(entry.expenseTitle || '');
    setAmount(String(entry.amount || ''));
    setEntryDate(entry.dateStr || getCurrentBusinessDateStr(cafe.openingTime, cafe.closingTime));
    setNote(entry.note || '');
  };

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('Please enter a valid positive amount.', 'warning');
      return;
    }

    const effectivePaidBy =
      kind === 'expenditure'
        ? paidBy === '__CUSTOM__'
          ? customPaidBy.trim().slice(0, 60) || 'Partner'
          : paidBy
        : 'Cafe';

    const effectiveMode: LedgerPaymentMode =
      kind === 'cc_topup'
        ? 'credit_card'
        : kind === 'withdrawal' && (paymentMode === 'credit_card' || paymentMode === 'personal')
        ? 'cash'
        : kind === 'expenditure' && effectivePaidBy.toLowerCase() === 'cafe' && paymentMode === 'personal'
        ? 'cash'
        : paymentMode;

    const effectivePerson =
      kind === 'withdrawal'
        ? person === '__CUSTOM__'
          ? customPerson.trim().slice(0, 60) || 'Partner'
          : person
        : undefined;

    const cleanTitle =
      expenseTitle.trim().slice(0, 120) ||
      (kind === 'cc_topup'
        ? 'Credit Card Top Up'
        : kind === 'withdrawal'
        ? `Withdrawal - ${effectivePerson}`
        : note.trim().slice(0, 120) ||
          `${expenseType === 'initial' ? 'Initial' : expenseType === 'fixed' ? 'Fixed' : 'Running'} Expense`);

    const cleanNote = note.trim().slice(0, 240) || cleanTitle;
    const nowIso = new Date().toISOString();

    const savedEntry: LedgerEntry = editingEntry
      ? {
          ...editingEntry,
          kind,
          amount: Math.round(numAmount * 100) / 100,
          paymentMode: effectiveMode,
          expenseType: kind === 'expenditure' ? expenseType : undefined,
          paidBy: effectivePaidBy,
          expenseTitle: cleanTitle,
          person: kind === 'withdrawal' ? effectivePerson : undefined,
          note: cleanNote,
          dateStr: entryDate || editingEntry.dateStr,
          updatedAt: nowIso,
        }
      : {
          id: `led-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          cafeId: cafe.id,
          kind,
          amount: Math.round(numAmount * 100) / 100,
          paymentMode: effectiveMode,
          ...(kind === 'expenditure' ? { expenseType } : {}),
          paidBy: effectivePaidBy,
          expenseTitle: cleanTitle,
          ...(kind === 'withdrawal' ? { person: effectivePerson } : {}),
          note: cleanNote,
          dateStr: entryDate || getCurrentBusinessDateStr(cafe.openingTime, cafe.closingTime),
          createdAt: nowIso,
          updatedAt: nowIso,
          createdByUid: user?.uid || 'staff',
          createdByName: user?.displayName || user?.email?.split('@')[0] || 'Staff',
        };

    setIsSubmitting(true);
    try {
      const updated = editingEntry
        ? ledger.map((item) => (item.id === editingEntry.id ? savedEntry : item))
        : [savedEntry, ...ledger];
      saveLocalLedger(cafe.id, updated);
      onLedgerUpdated(updated);

      if (auth.currentUser && cafe.id && cafe.id !== 'default-corner-cafe') {
        const ledgerPath = `cafes/${cafe.id}/ledger/${savedEntry.id}`;
        try {
          await setDoc(
            doc(db, 'cafes', cafe.id, 'ledger', savedEntry.id),
            cleanFirestoreData(savedEntry),
            { merge: true }
          );
        } catch (err) {
          handleFirestoreError(err, editingEntry ? OperationType.UPDATE : OperationType.CREATE, ledgerPath);
        }
      }

      // Auto-sync create/edit to Google Sheets (queues automatically if offline/disconnected)
      syncLedgerEntryToSheets(cafe, savedEntry).catch(() => {});

      const wasEditing = Boolean(editingEntry);
      resetEntryForm();
      showToast(
        wasEditing
          ? `Updated entry "${savedEntry.expenseTitle || savedEntry.note}" (₹${savedEntry.amount})`
          : kind === 'cc_topup'
          ? `Added ₹${savedEntry.amount} Credit Card Top Up`
          : kind === 'withdrawal'
          ? `Recorded ₹${savedEntry.amount} withdrawal for ${effectivePerson}`
          : effectivePaidBy.toLowerCase() === 'cafe'
          ? `Recorded ₹${savedEntry.amount} ${expenseType} expense (${formatModeLabel(effectiveMode)})`
          : `Recorded ₹${savedEntry.amount} partner spend by ${effectivePaidBy}`,
        'success'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEntry = async (entry: LedgerEntry) => {
    setConfirmDeleteId(null);
    if (editingEntry?.id === entry.id) {
      resetEntryForm();
    }

    const updated = ledger.filter((l) => l.id !== entry.id);
    saveLocalLedger(cafe.id, updated);
    onLedgerUpdated(updated);

    if (auth.currentUser && cafe.id && cafe.id !== 'default-corner-cafe') {
      const ledgerPath = `cafes/${cafe.id}/ledger/${entry.id}`;
      try {
        await deleteDoc(doc(db, 'cafes', cafe.id, 'ledger', entry.id));
      } catch (err) {
        console.warn('Could not delete ledger entry in Firestore', err);
        handleFirestoreError(err, OperationType.DELETE, ledgerPath);
      }
    }

    // Auto-delete row from linked Google Sheet
    deleteLedgerEntryFromSheets(cafe, entry.id).catch(() => {});
    showToast('Ledger entry removed', 'info');
  };

  const handleSeedInitialExpenses = async () => {
    setShowSeedConfirm(false);
    setIsSeeding(true);
    try {
      const res = await seedInitialExpensesToDbAndSheet(cafe, ledger);
      onLedgerUpdated(res.updatedLedger);
      onCafeUpdated?.(res.updatedCafe);
      showToast(
        res.syncedToSheet
          ? `Imported ${res.addedCount} expense rows into Firestore & synced to Google Sheet!`
          : `Imported ${res.addedCount} expense rows into Firestore (${res.skippedCount} already present).`,
        'success'
      );
    } catch (err: any) {
      showToast(err?.message || 'Could not import historical expenses', 'error');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleExportLedgerCSV = () => {
    if (filteredEntries.length === 0) {
      showToast('No ledger entries to export.', 'warning');
      return;
    }

    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = [
      'Date',
      'Expense',
      'Amount (INR)',
      'Paid By',
      'Category',
      'Payment Mode',
      'Description / Note',
      'Kind',
      'Recorded By',
    ];

    const rows = filteredEntries.map((e) => [
      esc(e.dateStr),
      esc(e.expenseTitle || e.note || ''),
      Number(e.amount || 0).toFixed(2),
      esc(e.kind === 'withdrawal' ? e.person || 'Staff' : e.paidBy || 'Cafe'),
      esc(
        e.kind === 'cc_topup'
          ? 'CC Top Up'
          : e.kind === 'withdrawal'
          ? 'Withdrawal'
          : (e.expenseType || 'running').toUpperCase()
      ),
      esc(formatModeLabel(e.paymentMode)),
      esc(e.note || ''),
      esc(e.kind),
      esc(e.createdByName || 'Staff'),
    ].join(','));

    const csv = '\uFEFF' + [headers.map(esc).join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const cleanCafeName = (cafe.name || 'Cafe').replace(/[^a-zA-Z0-9_-]/g, '_');
    link.setAttribute(
      'download',
      `${cleanCafeName}_Cash_Expenses_Ledger_${getCurrentBusinessDateStr(cafe.openingTime, cafe.closingTime)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast(`Exported ${filteredEntries.length} ledger entries!`, 'success');
  };

  const formatModeLabel = (mode: LedgerPaymentMode) => {
    if (mode === 'credit_card') return 'Credit Card';
    if (mode === 'upi') return 'UPI';
    if (mode === 'personal') return 'Personal';
    return 'Cash';
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-[1px]">
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className="relative z-10 w-full max-w-2xl bg-[#fbf6ee] h-full shadow-2xl border-l border-[#eedecb] flex flex-col overflow-hidden">
        {/* Drawer Header */}
        <div className="px-4 sm:px-6 py-4 bg-[#fffbf5] border-b border-[#eedecb] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#ea580c] text-white flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-[#2b2320] truncate">
                Cash, Expenses & Withdrawals
              </h2>
              <p className="text-xs text-[#7d6e67] truncate">
                {cafe.name} · Live counter, UPI & credit card top-up ledger
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleOpenBalanceEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#f4ebe1] hover:bg-[#eedecb] text-[#2b2320] text-xs font-semibold border border-[#e3d3c2] transition cursor-pointer whitespace-nowrap"
              title="Set opening cash, UPI, or credit card balances"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#ea580c]" />
              <span className="hidden sm:inline">Opening Balance</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-[#7d6e67] hover:text-[#2b2320] hover:bg-[#f4ebe1] transition cursor-pointer"
              aria-label="Close drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* Compact Google Sheets Backup & Historical Seed Strip */}
          <div className="bg-[#fffbf5] px-3.5 py-2.5 rounded-2xl border border-[#eedecb] flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0" />
              <span className="font-semibold text-[#2b2320] truncate">
                {cafe.googleSpreadsheetId
                  ? 'Auto-syncing expenses with Google Sheet'
                  : 'Connect Google Sheets in Settings for live backup'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {existingSeedCount < INITIAL_EXPENSE_SEED_ROWS.length && (
                <button
                  type="button"
                  disabled={isSeeding}
                  onClick={() => setShowSeedConfirm((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-[11px] transition cursor-pointer"
                >
                  {isSeeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                  <span>Import 162 Sheet Rows</span>
                </button>
              )}

              {cafe.googleSpreadsheetUrl ? (
                <a
                  href={cafe.googleSpreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[11px] transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Sheet</span>
                </a>
              ) : (
                onOpenSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenSettings();
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#f4ebe1] hover:bg-[#eedecb] text-[#2b2320] border border-[#e3d3c2] font-bold text-[11px] transition cursor-pointer"
                  >
                    <span>Setup Sheet</span>
                  </button>
                )
              )}
            </div>
          </div>

          {showSeedConfirm && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 text-xs space-y-2">
              <div className="font-bold text-amber-950">
                Confirm importing 162 historical expense rows (₹3,34,811.72)?
              </div>
              <p className="text-amber-900/90 leading-relaxed">
                Imports Sep 30 – Nov 22, 2026 rows into Firestore{cafe.googleSpreadsheetId ? ' and syncs your Google Sheet' : ''}. Only Cafe-paid rows (₹43,905.22) affect Cash/UPI/CC wallets; partner spends (₹2,90,906.50) are tracked separately below.
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowSeedConfirm(false)}
                  className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-950 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSeeding}
                  onClick={handleSeedInitialExpenses}
                  className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-bold cursor-pointer"
                >
                  {isSeeding ? 'Importing...' : 'Confirm Import'}
                </button>
              </div>
            </div>
          )}

          {/* View Toggle: Cumulative vs Daily */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-[#fffbf5] p-3 rounded-2xl border border-[#eedecb]">
            <div className="flex items-center gap-1 p-1 bg-[#f4ebe1] rounded-xl border border-[#e3d3c2] self-start">
              <button
                type="button"
                onClick={() => setBalanceView('cumulative')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  balanceView === 'cumulative'
                    ? 'bg-[#ea580c] text-white shadow-xs'
                    : 'text-[#615149] hover:text-[#2b2320]'
                }`}
              >
                Cumulative Wallet Balances
              </button>
              <button
                type="button"
                onClick={() => setBalanceView('daily')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  balanceView === 'daily'
                    ? 'bg-[#ea580c] text-white shadow-xs'
                    : 'text-[#615149] hover:text-[#2b2320]'
                }`}
              >
                Selected Date Activity
              </button>
            </div>

            {balanceView === 'daily' ? (
              <div className="flex flex-col sm:items-end gap-1">
                <div className="flex items-center gap-1 bg-[#f4ebe1] px-2 py-1 rounded-xl border border-[#e3d3c2]">
                  <button
                    type="button"
                    onClick={() => setSelectedDate((d) => addDaysToLocalDateStr(d, -1))}
                    className="p-1 text-[#7d6e67] hover:text-[#2b2320] rounded-lg hover:bg-white transition cursor-pointer"
                    title="Previous Day"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) =>
                      setSelectedDate(e.target.value || getCurrentBusinessDateStr(cafe.openingTime, cafe.closingTime))
                    }
                    className="bg-transparent text-xs font-bold text-[#2b2320] outline-hidden cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedDate((d) => addDaysToLocalDateStr(d, 1))}
                    className="p-1 text-[#7d6e67] hover:text-[#2b2320] rounded-lg hover:bg-white transition cursor-pointer"
                    title="Next Day"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <span className="text-[10px] text-[#7d6e67]">
                  {formatBusinessDayRange(selectedDate, cafe.openingTime, cafe.closingTime)}
                </span>
              </div>
            ) : (
              <span className="text-[11px] text-[#7d6e67] font-medium">
                All-time live balances including opening amounts
              </span>
            )}
          </div>

          {/* Opening Balances Inline Form */}
          {showOpeningEditor && (
            <form
              onSubmit={handleSaveOpeningBalances}
              className="bg-[#fffbf5] p-4 rounded-2xl border border-[#ea580c]/50 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#2b2320]">Set Opening Wallet Balances</h3>
                  <p className="text-[11px] text-[#7d6e67]">
                    Starting cash in drawer, UPI account balance, and initial credit card top-up fund.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOpeningEditor(false)}
                  className="text-xs text-[#7d6e67] hover:text-[#2b2320] cursor-pointer"
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <div>
                  <label className="font-semibold text-[#7d6e67] block mb-1">Opening Cash (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={openCash}
                    onChange={(e) => setOpenCash(e.target.value)}
                    className="w-full bg-[#f4ebe1] px-3 py-2 rounded-xl border border-[#e3d3c2] font-bold tabular-nums text-[#2b2320] outline-hidden focus:border-[#ea580c]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[#7d6e67] block mb-1">Opening UPI (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={openUpi}
                    onChange={(e) => setOpenUpi(e.target.value)}
                    className="w-full bg-[#f4ebe1] px-3 py-2 rounded-xl border border-[#e3d3c2] font-bold tabular-nums text-[#2b2320] outline-hidden focus:border-[#ea580c]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[#7d6e67] block mb-1">Opening CC Top-Up (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={openCc}
                    onChange={(e) => setOpenCc(e.target.value)}
                    className="w-full bg-[#f4ebe1] px-3 py-2 rounded-xl border border-[#e3d3c2] font-bold tabular-nums text-[#2b2320] outline-hidden focus:border-[#ea580c]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#ea580c] hover:bg-[#c2410c] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Opening Balances</span>
                </button>
              </div>
            </form>
          )}

          {/* 3 Main Wallet Balance Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Cash Counter */}
            <div className="bg-[#fffbf5] p-3.5 rounded-2xl border border-[#eedecb]">
              <div className="flex items-center justify-between text-xs text-[#7d6e67] mb-1">
                <span className="font-semibold">
                  {balanceView === 'cumulative' ? 'Cash Counter Balance' : 'Net Day Cash'}
                </span>
                <Banknote className="w-4 h-4 text-amber-600" />
              </div>
              <div
                className={`text-xl font-extrabold tabular-nums font-mono ${
                  activeSummary.cashBalance >= 0 ? 'text-[#2b2320]' : 'text-rose-700'
                }`}
              >
                ₹{activeSummary.cashBalance.toFixed(0)}
              </div>
              <div className="mt-2 pt-2 border-t border-[#f2e6d7] text-[11px] text-[#7d6e67] space-y-0.5 tabular-nums">
                <div className="flex justify-between">
                  <span>Sales (+):</span>
                  <span className="font-semibold text-emerald-700">+₹{activeSummary.cashSales.toFixed(0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Expenses (−):</span>
                  <span className="font-semibold text-rose-700">−₹{activeSummary.cashExpenses.toFixed(0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Withdrawals (−):</span>
                  <span className="font-semibold text-rose-700">−₹{activeSummary.cashWithdrawals.toFixed(0)}</span>
                </div>
              </div>
            </div>

            {/* UPI Balance */}
            <div className="bg-[#fffbf5] p-3.5 rounded-2xl border border-[#eedecb]">
              <div className="flex items-center justify-between text-xs text-[#7d6e67] mb-1">
                <span className="font-semibold">
                  {balanceView === 'cumulative' ? 'UPI Wallet Balance' : 'Net Day UPI'}
                </span>
                <QrCode className="w-4 h-4 text-emerald-600" />
              </div>
              <div
                className={`text-xl font-extrabold tabular-nums font-mono ${
                  activeSummary.upiBalance >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                ₹{activeSummary.upiBalance.toFixed(0)}
              </div>
              <div className="mt-2 pt-2 border-t border-[#f2e6d7] text-[11px] text-[#7d6e67] space-y-0.5 tabular-nums">
                <div className="flex justify-between">
                  <span>UPI Sales (+):</span>
                  <span className="font-semibold text-emerald-700">+₹{activeSummary.upiSales.toFixed(0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Expenses (−):</span>
                  <span className="font-semibold text-rose-700">−₹{activeSummary.upiExpenses.toFixed(0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Withdrawals (−):</span>
                  <span className="font-semibold text-rose-700">−₹{activeSummary.upiWithdrawals.toFixed(0)}</span>
                </div>
              </div>
            </div>

            {/* Credit Card Top-Up Balance */}
            <div className="bg-[#fffbf5] p-3.5 rounded-2xl border border-[#eedecb]">
              <div className="flex items-center justify-between text-xs text-[#7d6e67] mb-1">
                <span className="font-semibold">
                  {balanceView === 'cumulative' ? 'Credit Card Top-Up Left' : 'Day CC Net Change'}
                </span>
                <CreditCard className="w-4 h-4 text-indigo-600" />
              </div>
              <div
                className={`text-xl font-extrabold tabular-nums font-mono ${
                  activeSummary.ccBalanceLeft >= 0 ? 'text-indigo-700' : 'text-rose-700'
                }`}
              >
                ₹{activeSummary.ccBalanceLeft.toFixed(0)}
              </div>
              <div className="mt-2 pt-2 border-t border-[#f2e6d7] text-[11px] text-[#7d6e67] space-y-0.5 tabular-nums">
                <div className="flex justify-between">
                  <span>Top-Ups (+):</span>
                  <span className="font-semibold text-emerald-700">+₹{activeSummary.ccTopUps.toFixed(0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>CC Expenses (−):</span>
                  <span className="font-semibold text-rose-700">−₹{activeSummary.ccExpenses.toFixed(0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Running / Fixed:</span>
                  <span className="font-semibold text-[#2b2320]">
                    ₹{activeSummary.runningExpenses.toFixed(0)} / ₹{activeSummary.fixedExpenses.toFixed(0)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Partner Contributions (Separate from Cafe Wallets) */}
          {activeSummary.partnerSpendsTotal > 0 && (
            <div className="bg-[#fffbf5] p-4 rounded-2xl border border-[#eedecb] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#ea580c]" />
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-[#2b2320]">
                      Partner Contributions ({balanceView === 'cumulative' ? 'All Time' : formatHumanDate(selectedDate)})
                    </h3>
                    <p className="text-[11px] text-[#7d6e67]">
                      Tracked separately — does not deduct from Cafe Cash Counter, UPI, or Credit Card wallets
                    </p>
                  </div>
                </div>
                <div className="text-right tabular-nums">
                  <div className="text-[10px] uppercase font-bold text-[#7d6e67]">Total Partner Spends</div>
                  <div className="text-base font-extrabold font-mono text-[#2b2320]">
                    ₹{activeSummary.partnerSpendsTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {Object.entries(activeSummary.partnerSpendsByPerson)
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([partnerName, breakdown]) => (
                    <div
                      key={partnerName}
                      className="rounded-xl bg-[#fbf6ee] border border-[#eedecb] px-3 py-2 tabular-nums"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#2b2320] truncate">{partnerName}</span>
                        <span className="font-extrabold font-mono text-[#ea580c]">
                          ₹{breakdown.total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#7d6e67] mt-1 flex items-center justify-between">
                        <span>Init: ₹{breakdown.initial.toFixed(0)}</span>
                        <span>Run: ₹{breakdown.running.toFixed(0)}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Partner Withdrawal Summary Strip */}
          {Object.keys(activeSummary.withdrawalsByPerson).length > 0 && (
            <div className="bg-[#fffbf5] px-4 py-2.5 rounded-2xl border border-[#eedecb] flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-[#2b2320]">
                Withdrawals Breakdown ({balanceView === 'cumulative' ? 'All Time' : formatHumanDate(selectedDate)}):
              </span>
              <div className="flex flex-wrap items-center gap-3 text-[#7d6e67] tabular-nums">
                {Object.entries(activeSummary.withdrawalsByPerson).map(([name, val]) => (
                  <span key={name}>
                    <strong className="text-[#2b2320]">{name}</strong>: ₹{val.toFixed(0)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Record / Edit Entry Form */}
          <form
            onSubmit={handleAddEntry}
            className={`bg-[#fffbf5] p-4 rounded-2xl border space-y-3.5 ${
              editingEntry ? 'border-[#ea580c] ring-2 ring-[#ea580c]/15' : 'border-[#eedecb]'
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#2b2320]">
                {editingEntry ? 'Edit Ledger Entry' : 'Record New Entry'}
              </h3>
              {editingEntry ? (
                <button
                  type="button"
                  onClick={resetEntryForm}
                  className="text-xs font-bold text-rose-700 hover:underline cursor-pointer"
                >
                  Cancel Edit
                </button>
              ) : (
                <span className="text-[11px] text-[#7d6e67]">
                  Syncs to Firestore{cafe.googleSpreadsheetId ? ' & Google Sheet' : ''}
                </span>
              )}
            </div>

            {/* Entry Category Segmented Selector */}
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#f4ebe1] rounded-xl border border-[#e3d3c2]">
              <button
                type="button"
                onClick={() => {
                  setKind('expenditure');
                  setPaymentMode('cash');
                }}
                className={`py-2 px-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  kind === 'expenditure'
                    ? 'bg-[#ea580c] text-white shadow-xs'
                    : 'text-[#615149] hover:text-[#2b2320]'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Expenditure</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setKind('withdrawal');
                  if (paymentMode === 'credit_card') setPaymentMode('cash');
                }}
                className={`py-2 px-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  kind === 'withdrawal'
                    ? 'bg-[#ea580c] text-white shadow-xs'
                    : 'text-[#615149] hover:text-[#2b2320]'
                }`}
              >
                <UserMinus className="w-3.5 h-3.5" />
                <span>Withdrawal</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setKind('cc_topup');
                  setPaymentMode('credit_card');
                }}
                className={`py-2 px-2 rounded-lg text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  kind === 'cc_topup'
                    ? 'bg-[#ea580c] text-white shadow-xs'
                    : 'text-[#615149] hover:text-[#2b2320]'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>CC Top Up</span>
              </button>
            </div>

            {/* Conditional Controls based on Kind */}
            {kind === 'expenditure' && (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-[#7d6e67] block mb-1">Paid By</label>
                    <select
                      value={paidBy}
                      onChange={(e) => {
                        const next = e.target.value;
                        setPaidBy(next);
                        if (next !== 'Cafe') {
                          setPaymentMode('personal');
                        } else if (paymentMode === 'personal') {
                          setPaymentMode('cash');
                        }
                      }}
                      className="w-full bg-[#f4ebe1] px-3 py-2 rounded-xl border border-[#e3d3c2] font-bold text-[#2b2320] outline-hidden focus:border-[#ea580c]"
                    >
                      <option value="Cafe">Cafe (Deducts from Cafe Wallets)</option>
                      {EXPENSE_PAYEES.filter((p) => p !== 'Cafe').map((p) => (
                        <option key={p} value={p}>
                          {p} (Partner Spend)
                        </option>
                      ))}
                      <option value="__CUSTOM__">Other Partner...</option>
                    </select>
                    {paidBy === '__CUSTOM__' && (
                      <input
                        type="text"
                        placeholder="Partner name..."
                        value={customPaidBy}
                        onChange={(e) => setCustomPaidBy(e.target.value)}
                        className="mt-1.5 w-full bg-[#f4ebe1] px-3 py-1.5 rounded-xl border border-[#ea580c] text-xs outline-hidden"
                        required
                      />
                    )}
                  </div>

                  <div>
                    <label className="font-semibold text-[#7d6e67] block mb-1">Category</label>
                    <div className="grid grid-cols-3 gap-1 p-1 bg-[#f4ebe1] rounded-xl border border-[#e3d3c2]">
                      {(
                        [
                          { id: 'running', label: 'Running' },
                          { id: 'fixed', label: 'Fixed' },
                          { id: 'initial', label: 'Initial' },
                        ] as const
                      ).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setExpenseType(t.id)}
                          className={`py-1.5 rounded-lg font-bold transition cursor-pointer ${
                            expenseType === t.id
                              ? 'bg-white text-[#2b2320] shadow-xs'
                              : 'text-[#7d6e67]'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-[#7d6e67] block mb-1">Paid Via</label>
                  <div
                    className={`grid gap-1.5 p-1 bg-[#f4ebe1] rounded-xl border border-[#e3d3c2] ${
                      paidBy === 'Cafe' ? 'grid-cols-3' : 'grid-cols-4'
                    }`}
                  >
                    {(
                      [
                        { id: 'cash', label: 'Cash' },
                        { id: 'upi', label: 'UPI' },
                        { id: 'credit_card', label: 'Card' },
                        ...(paidBy !== 'Cafe' ? [{ id: 'personal' as const, label: 'Personal' }] : []),
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setPaymentMode(m.id)}
                        className={`py-1.5 rounded-lg font-bold transition cursor-pointer ${
                          paymentMode === m.id
                            ? 'bg-white text-[#ea580c] shadow-xs'
                            : 'text-[#7d6e67]'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  {paidBy !== 'Cafe' && (
                    <p className="text-[11px] text-[#7d6e67] mt-1">
                      Partner-paid expenses are logged in Partner Contributions and will not deduct from Cafe Cash, UPI, or Credit Card wallets.
                    </p>
                  )}
                </div>
              </div>
            )}

            {kind === 'withdrawal' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="font-semibold text-[#7d6e67] block mb-1">Withdrawn By</label>
                  <select
                    value={person}
                    onChange={(e) => setPerson(e.target.value)}
                    className="w-full bg-[#f4ebe1] px-3 py-2 rounded-xl border border-[#e3d3c2] font-bold text-[#2b2320] outline-hidden focus:border-[#ea580c]"
                  >
                    {WITHDRAWAL_PEOPLE.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                    <option value="__CUSTOM__">Other Person...</option>
                  </select>
                  {person === '__CUSTOM__' && (
                    <input
                      type="text"
                      placeholder="Enter name..."
                      value={customPerson}
                      onChange={(e) => setCustomPerson(e.target.value)}
                      className="mt-1.5 w-full bg-[#f4ebe1] px-3 py-1.5 rounded-xl border border-[#ea580c] text-xs outline-hidden"
                      required
                    />
                  )}
                </div>

                <div>
                  <label className="font-semibold text-[#7d6e67] block mb-1">Withdrawn From</label>
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#f4ebe1] rounded-xl border border-[#e3d3c2]">
                    <button
                      type="button"
                      onClick={() => setPaymentMode('cash')}
                      className={`py-1.5 rounded-lg font-bold transition cursor-pointer ${
                        paymentMode === 'cash'
                          ? 'bg-white text-amber-800 shadow-xs'
                          : 'text-[#7d6e67]'
                      }`}
                    >
                      Cash Counter
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMode('upi')}
                      className={`py-1.5 rounded-lg font-bold transition cursor-pointer ${
                        paymentMode === 'upi'
                          ? 'bg-white text-emerald-800 shadow-xs'
                          : 'text-[#7d6e67]'
                      }`}
                    >
                      UPI Account
                    </button>
                  </div>
                </div>
              </div>
            )}

            {kind === 'cc_topup' && (
              <div className="px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-900">
                Adds funds directly to your <strong>Credit Card Top-Up balance</strong>. Credit card expenditures automatically deduct from this balance.
              </div>
            )}

            {/* Amount, Date & Description */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 text-xs">
              <div className="sm:col-span-4">
                <label className="font-semibold text-[#7d6e67] block mb-1">Amount (₹)</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="0.01"
                  placeholder="e.g. 500"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-[#f4ebe1] px-3 py-2 rounded-xl border border-[#e3d3c2] font-extrabold text-sm tabular-nums text-[#2b2320] outline-hidden focus:border-[#ea580c] focus:bg-white"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="font-semibold text-[#7d6e67] block mb-1">Business Date</label>
                <input
                  type="date"
                  required
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full bg-[#f4ebe1] px-3 py-2 rounded-xl border border-[#e3d3c2] font-bold text-[#2b2320] outline-hidden focus:border-[#ea580c] focus:bg-white"
                />
              </div>

              <div className="sm:col-span-4 flex items-end">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 bg-[#ea580c] hover:bg-[#c2410c] disabled:opacity-50 text-white font-bold rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  <span>
                    {editingEntry
                      ? 'Save Changes'
                      : kind === 'cc_topup'
                      ? 'Add Top-Up'
                      : kind === 'withdrawal'
                      ? 'Save Withdrawal'
                      : 'Add Expense'}
                  </span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              {kind === 'expenditure' && (
                <input
                  type="text"
                  maxLength={120}
                  placeholder="Expense / Vendor (e.g. Milk, Hyperpure, Rent)..."
                  value={expenseTitle}
                  onChange={(e) => setExpenseTitle(e.target.value)}
                  className="w-full bg-[#f4ebe1] px-3 py-2 rounded-xl border border-[#e3d3c2] font-semibold text-[#2b2320] placeholder-[#9a8981] outline-hidden focus:border-[#ea580c] focus:bg-white"
                />
              )}
              <input
                type="text"
                maxLength={240}
                placeholder={
                  kind === 'cc_topup'
                    ? 'Note (e.g. HDFC Card top-up for November)...'
                    : kind === 'withdrawal'
                    ? 'Reason / note (optional)...'
                    : 'Description / Details (optional)...'
                }
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className={`w-full bg-[#f4ebe1] px-3 py-2 rounded-xl border border-[#e3d3c2] text-[#2b2320] placeholder-[#9a8981] outline-hidden focus:border-[#ea580c] focus:bg-white ${
                  kind !== 'expenditure' ? 'sm:col-span-2' : ''
                }`}
              />
            </div>
          </form>

          {/* Ledger Entries List */}
          <div className="bg-[#fffbf5] rounded-2xl border border-[#eedecb] overflow-hidden">
            <div className="p-3.5 border-b border-[#eedecb] flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[#2b2320]">
                  Ledger History ({filteredEntries.length})
                </h3>

                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-[#f4ebe1] p-0.5 rounded-lg border border-[#e3d3c2] text-[11px]">
                    <button
                      type="button"
                      onClick={() => setHistoryScope('all_dates')}
                      className={`px-2 py-1 rounded-md font-semibold cursor-pointer ${
                        historyScope === 'all_dates' ? 'bg-white text-[#2b2320] shadow-xs' : 'text-[#7d6e67]'
                      }`}
                    >
                      All Dates
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryScope('selected_date');
                        setBalanceView('daily');
                      }}
                      className={`px-2 py-1 rounded-md font-semibold cursor-pointer ${
                        historyScope === 'selected_date' ? 'bg-white text-[#2b2320] shadow-xs' : 'text-[#7d6e67]'
                      }`}
                    >
                      {formatHumanDate(selectedDate)}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleExportLedgerCSV}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#f4ebe1] hover:bg-[#eedecb] text-[#2b2320] text-xs font-semibold border border-[#e3d3c2] cursor-pointer"
                    title="Export filtered ledger to CSV"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                    <span>CSV</span>
                  </button>
                </div>
              </div>

              {/* Search & Type/Mode Filters */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="relative flex-1 min-w-[160px]">
                  <Search className="w-3.5 h-3.5 text-[#8c7a72] absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search note, person..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#f4ebe1] pl-8 pr-3 py-1.5 rounded-xl border border-[#e3d3c2] text-xs text-[#2b2320] outline-hidden"
                  />
                </div>

                <select
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value as any)}
                  className="bg-[#f4ebe1] px-2.5 py-1.5 rounded-xl border border-[#e3d3c2] text-xs font-semibold text-[#2b2320] outline-hidden cursor-pointer"
                >
                  <option value="all">All Types</option>
                  <option value="expenditure">Expenditures</option>
                  <option value="withdrawal">Withdrawals</option>
                  <option value="cc_topup">CC Top Ups</option>
                </select>

                <select
                  value={modeFilter}
                  onChange={(e) => setModeFilter(e.target.value as any)}
                  className="bg-[#f4ebe1] px-2.5 py-1.5 rounded-xl border border-[#e3d3c2] text-xs font-semibold text-[#2b2320] outline-hidden cursor-pointer"
                >
                  <option value="all">All Modes</option>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="personal">Personal</option>
                </select>

                <select
                  value={payeeFilter}
                  onChange={(e) => setPayeeFilter(e.target.value)}
                  className="bg-[#f4ebe1] px-2.5 py-1.5 rounded-xl border border-[#e3d3c2] text-xs font-semibold text-[#2b2320] outline-hidden cursor-pointer"
                >
                  <option value="all">All Payees</option>
                  <option value="cafe_only">Cafe Wallet Only</option>
                  <option value="partners_only">Partners Only</option>
                  {EXPENSE_PAYEES.filter((p) => p !== 'Cafe').map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="divide-y divide-[#eedecb]/70 max-h-[380px] overflow-y-auto">
              {filteredEntries.map((entry) => {
                const isInflow = entry.kind === 'cc_topup';
                const isPartnerExpense = entry.kind === 'expenditure' && !isCafePaidExpense(entry);
                const displayTitle = entry.expenseTitle || entry.note;
                const showSubNote = entry.expenseTitle && entry.note && entry.note !== entry.expenseTitle;
                const isPendingDelete = confirmDeleteId === entry.id;

                return (
                  <div
                    key={entry.id}
                    className={`px-4 py-3 flex items-center justify-between gap-3 transition text-xs ${
                      editingEntry?.id === entry.id ? 'bg-orange-50/70' : 'hover:bg-[#fbf6ee]'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          isInflow
                            ? 'bg-emerald-100 text-emerald-700'
                            : entry.kind === 'withdrawal'
                            ? 'bg-amber-100 text-amber-800'
                            : isPartnerExpense
                            ? 'bg-stone-200/80 text-stone-700'
                            : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {isInflow ? (
                          <ArrowDownLeft className="w-4 h-4" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="font-bold text-[#2b2320] truncate">
                          {displayTitle}
                        </div>
                        {showSubNote && (
                          <div className="text-[11px] text-[#7d6e67] truncate">
                            {entry.note}
                          </div>
                        )}
                        <div className="text-[11px] text-[#7d6e67] flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span>
                            {formatHumanDate(
                              entry.dateStr || getBusinessDateStr(entry.createdAt, cafe.openingTime, cafe.closingTime)
                            )}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {entry.kind === 'cc_topup'
                              ? 'Credit Card Top Up'
                              : entry.kind === 'withdrawal'
                              ? `Withdrawal (${entry.person || 'Staff'})`
                              : `${
                                  entry.expenseType === 'initial'
                                    ? 'Initial'
                                    : entry.expenseType === 'fixed'
                                    ? 'Fixed'
                                    : 'Running'
                                } · ${entry.paidBy || 'Cafe'}`}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-[#2b2320]">
                            {formatModeLabel(entry.paymentMode)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`font-extrabold font-mono tabular-nums text-sm mr-1 ${
                          isInflow
                            ? 'text-emerald-700'
                            : isPartnerExpense
                            ? 'text-stone-700'
                            : 'text-rose-700'
                        }`}
                      >
                        {isInflow ? '+' : isPartnerExpense ? '' : '−'}₹{Number(entry.amount || 0).toFixed(0)}
                      </span>

                      {isPendingDelete ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDeleteEntry(entry)}
                            className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 rounded-lg bg-stone-200 hover:bg-stone-300 text-stone-700 text-[11px] font-semibold cursor-pointer"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleStartEdit(entry)}
                            className="p-1.5 text-stone-400 hover:text-[#ea580c] hover:bg-orange-50 rounded-lg transition cursor-pointer"
                            title="Edit entry"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(entry.id)}
                            className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Delete entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {filteredEntries.length === 0 && (
                <div className="px-4 py-8 text-center text-xs text-[#7d6e67]">
                  No expenses, withdrawals, or credit card top-ups recorded for this filter.
                </div>
              )}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};
