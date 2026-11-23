import { Bill, Cafe, LedgerEntry, MenuItem, PrinterConfig, StaffMember, TableOrder, WalletOpeningBalances } from '../types';
import { getLocalDateStr } from '../utils/dateUtils';

const KEY_ACTIVE_CAFE = 'corner_cafe_active';
const KEY_PRINTER_CFG = 'corner_cafe_printer';

export function getLocalTables(cafeId: string): Record<string, TableOrder> {
  try {
    const raw = localStorage.getItem(`corner_tables_${cafeId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveLocalTable(cafeId: string, table: TableOrder): void {
  try {
    const current = getLocalTables(cafeId);
    current[table.id] = table;
    localStorage.setItem(`corner_tables_${cafeId}`, JSON.stringify(current));
    window.dispatchEvent(new CustomEvent('tables_updated', { detail: { cafeId, tableId: table.id } }));
  } catch (e) {
    console.error('Error saving local table', e);
  }
}

export function clearLocalTable(cafeId: string, tableId: string): void {
  try {
    const current = getLocalTables(cafeId);
    delete current[tableId];
    localStorage.setItem(`corner_tables_${cafeId}`, JSON.stringify(current));
    window.dispatchEvent(new CustomEvent('tables_updated', { detail: { cafeId, tableId } }));
  } catch (e) {
    console.error('Error clearing local table', e);
  }
}

export function saveAllLocalTables(cafeId: string, tables: Record<string, TableOrder>): void {
  try {
    localStorage.setItem(`corner_tables_${cafeId}`, JSON.stringify(tables));
    window.dispatchEvent(new CustomEvent('tables_updated', { detail: { cafeId } }));
  } catch (e) {
    console.error('Error saving all local tables', e);
  }
}

export function getCustomTables(cafeId: string): string[] {
  try {
    const raw = localStorage.getItem(`corner_custom_tables_${cafeId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomTables(cafeId: string, customTables: string[]): void {
  try {
    localStorage.setItem(`corner_custom_tables_${cafeId}`, JSON.stringify(customTables));
    window.dispatchEvent(new CustomEvent('custom_tables_updated', { detail: { cafeId, customTables } }));
  } catch (e) {
    console.error('Error saving custom tables', e);
  }
}

export function getActiveCafe(): Cafe | null {
  try {
    const data = localStorage.getItem(KEY_ACTIVE_CAFE);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    console.error('Error reading active cafe', e);
    return null;
  }
}

export function setActiveCafe(cafe: Cafe): void {
  try {
    localStorage.setItem(KEY_ACTIVE_CAFE, JSON.stringify(cafe));
    window.dispatchEvent(new CustomEvent('cafe_changed', { detail: cafe }));
  } catch (e) {
    console.error('Error saving active cafe', e);
  }
}

export function clearActiveCafe(): void {
  localStorage.removeItem(KEY_ACTIVE_CAFE);
  window.dispatchEvent(new CustomEvent('cafe_changed', { detail: null }));
}

// Generate default cafe for immediate use
export function createDefaultCafe(
  ownerId = 'guest-cashier',
  email = 'rajtiwari07102001@gmail.com',
  name = 'Admin Cashier'
): Cafe {
  return {
    id: 'default-corner-cafe',
    name: 'Bill Generator Cafe & Bistro',
    tagline: 'Smart Multi-Platform Billing',
    phone: '+91 98765 43210',
    address: 'Shop 4, Heritage Lane, MG Road',
    upiId: 'merchant@upi',
    paymentQrUrl: '',
    gstin: '27AABCC1234F1Z8',
    ownerId,
    ownerEmail: email,
    secretCode: 'CAFE-8821',
    memberUids: [ownerId],
    members: [
      {
        uid: ownerId,
        email,
        name,
        role: 'owner',
        joinedAt: new Date().toISOString(),
      },
    ],
    pendingRequests: [],
    openingTime: '00:00',
    closingTime: '23:59',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Offline-first Bills storage
export function getLocalBills(cafeId: string): Bill[] {
  try {
    const raw = localStorage.getItem(`corner_bills_${cafeId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveBillLocally(bill: Bill): void {
  const current = getLocalBills(bill.cafeId);
  // Avoid duplicate if existing
  const filtered = current.filter((b) => b.id !== bill.id);
  const updated = [bill, ...filtered];
  localStorage.setItem(`corner_bills_${bill.cafeId}`, JSON.stringify(updated));

  // If not synced, push into pending_sync_queue
  if (!bill.isSynced) {
    enqueuePendingBill(bill);
  }

  window.dispatchEvent(new CustomEvent('bills_updated', { detail: bill }));
}

export function updateLocalBillStatus(cafeId: string, billId: string, status: 'paid' | 'void'): void {
  const current = getLocalBills(cafeId);
  const updated = current.map((b) => (b.id === billId ? { ...b, status, isSynced: false } : b));
  localStorage.setItem(`corner_bills_${cafeId}`, JSON.stringify(updated));

  const target = updated.find((b) => b.id === billId);
  if (target) {
    enqueuePendingBill(target);
  }

  window.dispatchEvent(new CustomEvent('bills_updated'));
}

// Pending Sync Queue
export function getPendingQueue(cafeId: string): Bill[] {
  try {
    const raw = localStorage.getItem(`corner_pending_queue_${cafeId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function enqueuePendingBill(bill: Bill): void {
  const queue = getPendingQueue(bill.cafeId);
  const filtered = queue.filter((b) => b.id !== bill.id);
  filtered.push(bill);
  localStorage.setItem(`corner_pending_queue_${bill.cafeId}`, JSON.stringify(filtered));
  window.dispatchEvent(
    new CustomEvent('queue_updated', { detail: { cafeId: bill.cafeId, count: filtered.length } })
  );
}

export function markBillSyncedLocally(cafeId: string, billId: string): void {
  // Update in bills
  const bills = getLocalBills(cafeId);
  const updated = bills.map((b) =>
    b.id === billId ? { ...b, isSynced: true, syncedAt: new Date().toISOString() } : b
  );
  localStorage.setItem(`corner_bills_${cafeId}`, JSON.stringify(updated));

  // Remove from queue
  const queue = getPendingQueue(cafeId).filter((b) => b.id !== billId);
  localStorage.setItem(`corner_pending_queue_${cafeId}`, JSON.stringify(queue));

  window.dispatchEvent(new CustomEvent('queue_updated', { detail: { cafeId, count: queue.length } }));
  window.dispatchEvent(new CustomEvent('bills_updated'));
}

// Sequential Bill Number generator (persists sequence across app restarts and resumes from highest bill for date)
export function getNextBillNumber(cafeCode: string, cafeId?: string): string {
  const todayStr = getLocalDateStr();
  const keyDate = `corner_counter_${cafeCode}_${todayStr}`;
  const keyGlobal = `corner_counter_${cafeCode}`;

  let highestNum = 1000;

  // 1. Read existing local storage counters
  const currentToday = parseInt(localStorage.getItem(keyDate) || '0', 10);
  const currentGlobal = parseInt(localStorage.getItem(keyGlobal) || '0', 10);
  if (!isNaN(currentToday) && currentToday > highestNum) highestNum = currentToday;
  if (!isNaN(currentGlobal) && currentGlobal > highestNum) highestNum = currentGlobal;

  // 2. Scan all existing bills in storage to ensure we never regress on app restart
  if (cafeId) {
    try {
      const bills = getLocalBills(cafeId);
      bills.forEach((b) => {
        if (b.billNumber) {
          const match = b.billNumber.match(/(\d+)$/);
          if (match) {
            const parsed = parseInt(match[1], 10);
            if (!isNaN(parsed) && parsed > highestNum) {
              highestNum = parsed;
            }
          }
        }
      });
    } catch (e) {
      console.warn('Error reading local bills to determine next bill number', e);
    }
  }

  const next = highestNum + 1;
  localStorage.setItem(keyDate, next.toString());
  localStorage.setItem(keyGlobal, next.toString());

  const prefix = cafeCode.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'POS';
  return `#${prefix}-${next}`;
}

export function peekNextBillNumber(cafeCode: string, cafeId?: string): string {
  const todayStr = getLocalDateStr();
  const keyDate = `corner_counter_${cafeCode}_${todayStr}`;
  const keyGlobal = `corner_counter_${cafeCode}`;

  let highestNum = 1000;
  const currentToday = parseInt(localStorage.getItem(keyDate) || '0', 10);
  const currentGlobal = parseInt(localStorage.getItem(keyGlobal) || '0', 10);
  if (!isNaN(currentToday) && currentToday > highestNum) highestNum = currentToday;
  if (!isNaN(currentGlobal) && currentGlobal > highestNum) highestNum = currentGlobal;

  if (cafeId) {
    try {
      const bills = getLocalBills(cafeId);
      bills.forEach((b) => {
        if (b.billNumber) {
          const match = b.billNumber.match(/(\d+)$/);
          if (match) {
            const parsed = parseInt(match[1], 10);
            if (!isNaN(parsed) && parsed > highestNum) {
              highestNum = parsed;
            }
          }
        }
      });
    } catch (e) {
      // ignore
    }
  }

  const prefix = cafeCode.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'POS';
  return `#${prefix}-${highestNum + 1}`;
}

// Menu Items Storage
export function getLocalMenu(cafeId: string): MenuItem[] {
  try {
    const raw = localStorage.getItem(`corner_menu_${cafeId}`);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading local menu', e);
  }
  return [];
}

export function deleteMenuItemLocally(cafeId: string, itemId: string): MenuItem[] {
  const current = getLocalMenu(cafeId);
  const updated = current.filter((item) => item.id !== itemId);
  saveLocalMenu(cafeId, updated);
  return updated;
}

export function saveLocalMenu(cafeId: string, menu: MenuItem[]): void {
  localStorage.setItem(`corner_menu_${cafeId}`, JSON.stringify(menu));
  window.dispatchEvent(new CustomEvent('menu_updated', { detail: { cafeId, items: menu } }));
}

// Printer Configuration Storage
export const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
  paperWidth: 58,
  autoPrint: false,
  isSimulated: true,
  deviceName: 'Bluetooth POS Printer (Simulated)',
};

export function getPrinterConfig(): PrinterConfig {
  try {
    const raw = localStorage.getItem(KEY_PRINTER_CFG);
    return raw ? { ...DEFAULT_PRINTER_CONFIG, ...JSON.parse(raw) } : DEFAULT_PRINTER_CONFIG;
  } catch {
    return DEFAULT_PRINTER_CONFIG;
  }
}

export function savePrinterConfig(cfg: PrinterConfig): void {
  localStorage.setItem(KEY_PRINTER_CFG, JSON.stringify(cfg));
}

// Expenditures, Withdrawals & Credit Card Top-Up Ledger Storage
export function getLocalLedger(cafeId: string): LedgerEntry[] {
  try {
    const raw = localStorage.getItem(`corner_ledger_${cafeId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalLedger(cafeId: string, entries: LedgerEntry[]): void {
  try {
    localStorage.setItem(`corner_ledger_${cafeId}`, JSON.stringify(entries));
    window.dispatchEvent(new CustomEvent('ledger_updated', { detail: { cafeId, entries } }));
  } catch (e) {
    console.error('Error saving local ledger', e);
  }
}

export const DEFAULT_OPENING_BALANCES: WalletOpeningBalances = {
  cash: 0,
  upi: 0,
  creditCard: 0,
};

export function getWalletOpeningBalances(cafeId: string): WalletOpeningBalances {
  try {
    const raw = localStorage.getItem(`corner_wallet_opening_${cafeId}`);
    return raw ? { ...DEFAULT_OPENING_BALANCES, ...JSON.parse(raw) } : DEFAULT_OPENING_BALANCES;
  } catch {
    return DEFAULT_OPENING_BALANCES;
  }
}

export function saveWalletOpeningBalances(cafeId: string, balances: WalletOpeningBalances): void {
  try {
    localStorage.setItem(`corner_wallet_opening_${cafeId}`, JSON.stringify(balances));
    window.dispatchEvent(new CustomEvent('wallet_opening_updated', { detail: { cafeId, balances } }));
  } catch (e) {
    console.error('Error saving wallet opening balances', e);
  }
}

