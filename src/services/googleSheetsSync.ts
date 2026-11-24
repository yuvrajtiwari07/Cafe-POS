import { doc, setDoc, updateDoc, writeBatch } from '../database';
import {
  auth,
  clearGoogleSheetsAccessToken,
  cleanData,
  db,
  getGoogleSheetsAccessToken,
  handleDatabaseError,
  OperationType,
} from '../database';
import {
  Bill,
  BillStatus,
  Cafe,
  ExpenseType,
  LedgerEntry,
  LedgerEntryKind,
  LedgerPaymentMode,
  OrderType,
  PaymentMode,
} from '../types';
import { getBusinessDateStr, getLocalDateStr } from '../utils/dateUtils';
import { getLocalBills, saveLocalLedger, setActiveCafe } from './storage';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export const TAB_ALL_SALES = 'All Sales';
export const TAB_EXPENSES = 'Expenses & Withdrawals';

export const ALL_SALES_HEADERS = [
  'Bill ID',
  'Bill No',
  'Business Date',
  'Calendar Date',
  'Time',
  'Table / Customer',
  'Order Type',
  'Items Summary',
  'Subtotal',
  'Discount',
  'Tax',
  'Amount',
  'Payment Mode',
  'Cash Amt',
  'UPI Amt',
  'Card Amt',
  'Status',
  'Note',
  'Updated At',
];

export const DAILY_SALES_HEADERS = [
  'Order no.',
  'Amount',
  'Payment Mode',
  'Note',
  'Bill No',
  'Time',
  'Table / Customer',
  'Items',
  'Status',
  'Bill ID',
];

export const EXPENSES_HEADERS = [
  'Entry ID',
  'Date',
  'Expense',
  'Amount',
  'Paid By',
  'Category',
  'Payment Mode',
  'Description',
  'Kind',
  'Updated At',
];

export interface SheetTabMeta {
  sheetId: number;
  title: string;
  index: number;
}

export interface SpreadsheetMeta {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  sheets: SheetTabMeta[];
}

export type SheetSyncQueueOp =
  | { key: string; type: 'upsert_bill'; bill: Bill; queuedAt: string }
  | { key: string; type: 'upsert_ledger'; entry: LedgerEntry; queuedAt: string }
  | { key: string; type: 'delete_ledger'; entryId: string; queuedAt: string };

export interface SheetPullPreview {
  billsToCreate: Bill[];
  billsToUpdate: Bill[];
  ledgerToCreate: LedgerEntry[];
  ledgerToUpdate: LedgerEntry[];
  billIdWritebacks: { rowNumber: number; id: string }[];
  ledgerIdWritebacks: { rowNumber: number; id: string }[];
  scannedSalesRows: number;
  scannedExpenseRows: number;
}



// ---------------------------------------------------------------------------
// Formatting & parsing helpers
// ---------------------------------------------------------------------------

export function quoteSheetName(title: string): string {
  const escaped = title.replace(/'/g, "''");
  return `'${escaped}'`;
}

export function formatDailyTabTitle(businessDateStr: string): string {
  const [y, m, d] = businessDateStr.split('-').map(Number);
  if (!y || !m || !d) return businessDateStr.replace(/[[\]*?:/\\]/g, '-');
  const dt = new Date(y, m - 1, d);
  const label = dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return label.replace(/[[\]*?:/\\]/g, '-');
}

function formatTimeShort(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function normalizePaymentModeLabel(mode: PaymentMode): string {
  if (mode === 'cash') return 'Cash';
  if (mode === 'upi') return 'UPI';
  if (mode === 'card') return 'Card';
  return 'Split';
}

function parseBillPaymentMode(raw: string): PaymentMode {
  const v = (raw || '').trim().toLowerCase();
  if (v === 'cash') return 'cash';
  if (v === 'card' || v === 'credit card' || v === 'debit card') return 'card';
  if (v === 'split') return 'split';
  return 'upi';
}

function parseBillStatus(raw: string): BillStatus {
  const v = (raw || '').trim().toLowerCase();
  if (v === 'void' || v === 'not paid' || v === 'cancelled' || v === 'canceled') return 'void';
  return 'paid';
}

function parseOrderType(raw: string): OrderType {
  const v = (raw || '').trim().toLowerCase();
  if (v === 'takeaway' || v === 'parcel') return 'takeaway';
  if (v === 'delivery') return 'delivery';
  return 'dine-in';
}

function getBillPaymentBreakdown(bill: Bill): { cash: number; upi: number; card: number } {
  if (bill.status === 'void') return { cash: 0, upi: 0, card: 0 };
  if (bill.paymentMode === 'split' && bill.splitDetails) {
    return {
      cash: Number(bill.splitDetails.cash) || 0,
      upi: Number(bill.splitDetails.upi) || 0,
      card: Number(bill.splitDetails.card) || 0,
    };
  }
  if (bill.paymentMode === 'cash') return { cash: bill.grandTotal, upi: 0, card: 0 };
  if (bill.paymentMode === 'upi') return { cash: 0, upi: bill.grandTotal, card: 0 };
  if (bill.paymentMode === 'card') return { cash: 0, upi: 0, card: bill.grandTotal };
  return { cash: 0, upi: 0, card: 0 };
}

function formatBillItemsSummary(bill: Bill): string {
  if (!bill.items || bill.items.length === 0) return '';
  return bill.items.map((it) => `${it.name} x${it.quantity}`).join(', ');
}

export function billToAllSalesRow(bill: Bill, cafe: Cafe): (string | number)[] {
  const businessDate = getBusinessDateStr(bill.createdAt, cafe.openingTime, cafe.closingTime);
  const calendarDate = getLocalDateStr(bill.createdAt);
  const split = getBillPaymentBreakdown(bill);
  return [
    bill.id,
    bill.billNumber || '',
    businessDate,
    calendarDate,
    formatTimeShort(bill.createdAt),
    bill.tableOrToken || '',
    bill.orderType || 'dine-in',
    formatBillItemsSummary(bill),
    Number(bill.subtotal || 0),
    Number(bill.discountAmount || 0),
    Number(bill.taxAmount || 0),
    Number(bill.grandTotal || 0),
    normalizePaymentModeLabel(bill.paymentMode),
    Number(split.cash || 0),
    Number(split.upi || 0),
    Number(split.card || 0),
    bill.status === 'void' ? 'Void' : 'Paid',
    bill.customerMobile ? `Mob: ${bill.customerMobile}` : '',
    bill.syncedAt || bill.createdAt || new Date().toISOString(),
  ];
}

export function billToDailySalesRow(bill: Bill, orderIndex: number): (string | number)[] {
  const noteParts: string[] = [];
  if (bill.paymentMode === 'split' && bill.splitDetails) {
    const parts: string[] = [];
    if (bill.splitDetails.cash) parts.push(`Cash ₹${bill.splitDetails.cash}`);
    if (bill.splitDetails.upi) parts.push(`UPI ₹${bill.splitDetails.upi}`);
    if (bill.splitDetails.card) parts.push(`Card ₹${bill.splitDetails.card}`);
    if (parts.length > 0) noteParts.push(parts.join(' + '));
  }
  if (bill.status === 'void') noteParts.push('VOID');
  if (bill.customerMobile) noteParts.push(bill.customerMobile);

  return [
    orderIndex,
    Number(bill.grandTotal || 0),
    normalizePaymentModeLabel(bill.paymentMode),
    noteParts.join(' | '),
    bill.billNumber || '',
    formatTimeShort(bill.createdAt),
    bill.tableOrToken || '',
    formatBillItemsSummary(bill),
    bill.status === 'void' ? 'Void' : 'Paid',
    bill.id,
  ];
}

function ledgerKindLabel(kind: LedgerEntryKind): string {
  if (kind === 'withdrawal') return 'Withdrawal';
  if (kind === 'cc_topup') return 'CC Top Up';
  return 'Expenditure';
}

function ledgerCategoryLabel(entry: LedgerEntry): string {
  if (entry.kind === 'withdrawal') return 'Withdrawal';
  if (entry.kind === 'cc_topup') return 'CC Top Up';
  if (entry.expenseType === 'initial') return 'Initial';
  if (entry.expenseType === 'fixed') return 'Fixed';
  return 'Running';
}

function ledgerPaymentModeLabel(mode: LedgerPaymentMode): string {
  if (mode === 'cash') return 'Cash';
  if (mode === 'upi') return 'UPI';
  if (mode === 'credit_card') return 'Credit card';
  return 'Personal';
}

export function ledgerEntryToRow(entry: LedgerEntry): (string | number)[] {
  const paidBy =
    entry.kind === 'withdrawal'
      ? entry.person || entry.paidBy || 'Staff'
      : entry.paidBy?.trim() || 'Cafe';
  const title =
    entry.expenseTitle?.trim() ||
    (entry.kind === 'withdrawal'
      ? `Withdrawal - ${paidBy}`
      : entry.kind === 'cc_topup'
      ? 'Credit Card Top Up'
      : entry.note || 'Expense');

  return [
    entry.id,
    entry.dateStr,
    title,
    Number(entry.amount || 0),
    paidBy,
    ledgerCategoryLabel(entry),
    ledgerPaymentModeLabel(entry.paymentMode),
    entry.note || title,
    ledgerKindLabel(entry.kind),
    entry.updatedAt || entry.createdAt || new Date().toISOString(),
  ];
}

function parseFlexibleDateStr(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return getLocalDateStr();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(trimmed);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return getLocalDateStr(parsed);
  }
  return getLocalDateStr();
}

function parseLedgerMode(raw: string, paidBy: string): LedgerPaymentMode {
  const v = (raw || '').trim().toLowerCase();
  if (v === 'cash') return 'cash';
  if (v === 'upi') return 'upi';
  if (v === 'credit card' || v === 'credit_card' || v === 'card' || v === 'cc') return 'credit_card';
  if (v === 'personal') return 'personal';
  return paidBy.toLowerCase() === 'cafe' ? 'cash' : 'personal';
}

function parseLedgerKindAndCategory(
  rawKind: string,
  rawCategory: string
): { kind: LedgerEntryKind; expenseType?: ExpenseType } {
  const k = (rawKind || '').trim().toLowerCase();
  const c = (rawCategory || '').trim().toLowerCase();

  if (k === 'withdrawal' || c === 'withdrawal') {
    return { kind: 'withdrawal' };
  }
  if (k === 'cc top up' || k === 'cc_topup' || c === 'cc top up' || c === 'cc_topup') {
    return { kind: 'cc_topup' };
  }

  let expenseType: ExpenseType = 'running';
  if (c === 'initial') expenseType = 'initial';
  else if (c === 'fixed') expenseType = 'fixed';
  return { kind: 'expenditure', expenseType };
}

function parseNumberCell(raw: unknown): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  const cleaned = String(raw ?? '')
    .replace(/[₹,\s]/g, '')
    .trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Local Pending Sheet Sync Queue (stores operation metadata only, NEVER tokens)
// ---------------------------------------------------------------------------

function queueKey(cafeId: string): string {
  return `billdedo_sb1_sheets_queue_${cafeId}`;
}

export function getPendingSheetSyncQueue(cafeId: string): SheetSyncQueueOp[] {
  try {
    const raw = localStorage.getItem(queueKey(cafeId));
    return raw ? (JSON.parse(raw) as SheetSyncQueueOp[]) : [];
  } catch {
    return [];
  }
}

export function getPendingSheetSyncCount(cafeId: string): number {
  return getPendingSheetSyncQueue(cafeId).length;
}

function savePendingSheetSyncQueue(cafeId: string, queue: SheetSyncQueueOp[]): void {
  try {
    localStorage.setItem(queueKey(cafeId), JSON.stringify(queue));
    window.dispatchEvent(
      new CustomEvent('sheets_queue_updated', {
        detail: { cafeId, count: queue.length },
      })
    );
  } catch (err) {
    console.warn('Could not persist Google Sheets sync queue', err);
  }
}

export function enqueueSheetSyncOp(cafeId: string, op: SheetSyncQueueOp): void {
  const existing = getPendingSheetSyncQueue(cafeId).filter((item) => item.key !== op.key);
  existing.push(op);
  savePendingSheetSyncQueue(cafeId, existing);
}

// ---------------------------------------------------------------------------
// Low-level Google Sheets REST v4 helpers
// ---------------------------------------------------------------------------

function requireToken(): string {
  const token = getGoogleSheetsAccessToken();
  if (!token) {
    throw new Error('Google Sheets is not connected in this session. Please connect Google Sheets first.');
  }
  return token;
}

async function sheetsFetch<T = any>(path: string, init: RequestInit = {}, explicitToken?: string): Promise<T> {
  const token = explicitToken || requireToken();
  const url = path.startsWith('http') ? path : `${SHEETS_API_BASE}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  if (response.status === 401) {
    clearGoogleSheetsAccessToken();
    throw new Error('Google Sheets access token expired. Please click "Connect Google Sheets" to reconnect.');
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const errJson = await response.json();
      detail = errJson?.error?.message || detail;
    } catch {
      // ignore json parse error
    }
    throw new Error(`Google Sheets API error (${response.status}): ${detail}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function fetchSpreadsheetMeta(spreadsheetId: string): Promise<SpreadsheetMeta> {
  const data = await sheetsFetch<any>(
    `/${encodeURIComponent(
      spreadsheetId
    )}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title,index)`
  );
  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetUrl: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    title: data.properties?.title || 'Cafe Backup Workbook',
    sheets: (data.sheets || []).map((s: any) => ({
      sheetId: s.properties.sheetId,
      title: s.properties.title,
      index: s.properties.index ?? 0,
    })),
  };
}

export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(trimmed);
  if (match) return match[1];
  return trimmed;
}

async function getValues(spreadsheetId: string, range: string): Promise<string[][]> {
  const data = await sheetsFetch<any>(
    `/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`
  );
  return (data.values || []) as string[][];
}

async function batchUpdateValues(
  spreadsheetId: string,
  data: { range: string; values: (string | number)[][] }[]
): Promise<void> {
  if (data.length === 0) return;
  await sheetsFetch(`/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data,
    }),
  });
}

async function clearValues(spreadsheetId: string, ranges: string[]): Promise<void> {
  if (ranges.length === 0) return;
  await sheetsFetch(`/${encodeURIComponent(spreadsheetId)}/values:batchClear`, {
    method: 'POST',
    body: JSON.stringify({ ranges }),
  });
}

async function batchUpdateSpreadsheet(spreadsheetId: string, requests: any[]): Promise<any> {
  if (requests.length === 0) return null;
  return sheetsFetch(`/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests }),
  });
}

function buildHeaderStyleRequests(sheetId: number, colCount: number, freezeRows = 1): any[] {
  return [
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { frozenRowCount: freezeRows },
        },
        fields: 'gridProperties.frozenRowCount',
      },
    },
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: colCount,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.96, green: 0.93, blue: 0.89 },
            textFormat: {
              bold: true,
              foregroundColor: { red: 0.16, green: 0.12, blue: 0.1 },
            },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat)',
      },
    },
  ];
}

function getDailySummaryValues(): (string | number)[][] {
  return [
    ['Daily Summary', 'Amount (₹)'],
    ['Cash', '=SUMIFS(B2:B2000, C2:C2000, "Cash", I2:I2000, "Paid")'],
    ['UPI', '=SUMIFS(B2:B2000, C2:C2000, "UPI", I2:I2000, "Paid")'],
    ['Card', '=SUMIFS(B2:B2000, C2:C2000, "Card", I2:I2000, "Paid")'],
    ['Split', '=SUMIFS(B2:B2000, C2:C2000, "Split", I2:I2000, "Paid")'],
    ['Total', '=SUM(M2:M5)'],
    ['Not paid / Void', '=SUMIFS(B2:B2000, I2:I2000, "Void")'],
    ['NET TOTAL', '=M6'],
  ];
}

function getExpensesSummaryValues(): {
  payeeBlock: (string | number)[][];
  categoryBlock: (string | number)[][];
} {
  const payees = ['Prateek', 'Yuvraj', 'Ishita', 'Yash', 'Ankit', 'Cafe'];
  const payeeBlock: (string | number)[][] = [
    ['Paid By', 'Total', 'Initial', 'Running', 'Fixed', 'UPI', 'Cash', 'Credit Card'],
    ...payees.map((name, idx) => {
      const r = idx + 2;
      return [
        name,
        `=SUMIFS($D$2:$D$5000, $E$2:$E$5000, L${r}, $I$2:$I$5000, "Expenditure")`,
        `=SUMIFS($D$2:$D$5000, $E$2:$E$5000, L${r}, $F$2:$F$5000, "Initial")`,
        `=SUMIFS($D$2:$D$5000, $E$2:$E$5000, L${r}, $F$2:$F$5000, "Running")`,
        `=SUMIFS($D$2:$D$5000, $E$2:$E$5000, L${r}, $F$2:$F$5000, "Fixed")`,
        `=SUMIFS($D$2:$D$5000, $E$2:$E$5000, L${r}, $G$2:$G$5000, "UPI", $I$2:$I$5000, "Expenditure")`,
        `=SUMIFS($D$2:$D$5000, $E$2:$E$5000, L${r}, $G$2:$G$5000, "Cash", $I$2:$I$5000, "Expenditure")`,
        `=SUMIFS($D$2:$D$5000, $E$2:$E$5000, L${r}, $G$2:$G$5000, "Credit card", $I$2:$I$5000, "Expenditure")`,
      ];
    }),
    [
      'ALL TOTAL',
      '=SUM(M2:M7)',
      '=SUM(N2:N7)',
      '=SUM(O2:O7)',
      '=SUM(P2:P7)',
      '=SUM(Q2:Q7)',
      '=SUM(R2:R7)',
      '=SUM(S2:S7)',
    ],
  ];

  const categoryBlock: (string | number)[][] = [
    ['Category Summary', 'Amount (₹)'],
    ['Initial', '=SUMIFS($D$2:$D$5000, $F$2:$F$5000, "Initial")'],
    ['Running', '=SUMIFS($D$2:$D$5000, $F$2:$F$5000, "Running")'],
    ['Fixed', '=SUMIFS($D$2:$D$5000, $F$2:$F$5000, "Fixed")'],
    ['Withdrawal', '=SUMIFS($D$2:$D$5000, $F$2:$F$5000, "Withdrawal")'],
    ['CC Top Up', '=SUMIFS($D$2:$D$5000, $F$2:$F$5000, "CC Top Up")'],
    ['Total Expenditures', '=SUM(M11:M13)'],
  ];

  return { payeeBlock, categoryBlock };
}

async function ensureTabsExist(
  spreadsheetId: string,
  requiredTabTitles: string[]
): Promise<SpreadsheetMeta> {
  const meta = await fetchSpreadsheetMeta(spreadsheetId);
  const existingTitles = new Set(meta.sheets.map((s) => s.title));
  const missing = requiredTabTitles.filter((t) => !existingTitles.has(t));

  if (missing.length === 0) return meta;

  const addRequests = missing.map((title) => ({
    addSheet: {
      properties: {
        title,
        gridProperties: {
          rowCount: title === TAB_EXPENSES ? 2000 : 1000,
          columnCount: 22,
        },
      },
    },
  }));

  const resp = await batchUpdateSpreadsheet(spreadsheetId, addRequests);
  const newSheets: SheetTabMeta[] = [];
  const styleRequests: any[] = [];

  (resp?.replies || []).forEach((reply: any) => {
    const props = reply?.addSheet?.properties;
    if (props) {
      newSheets.push({
        sheetId: props.sheetId,
        title: props.title,
        index: props.index ?? 0,
      });
      const colCount =
        props.title === TAB_ALL_SALES ? ALL_SALES_HEADERS.length : 10;
      styleRequests.push(...buildHeaderStyleRequests(props.sheetId, colCount, 1));
    }
  });

  if (styleRequests.length > 0) {
    await batchUpdateSpreadsheet(spreadsheetId, styleRequests);
  }

  // Initialize headers & formulas on newly created tabs
  const valueUpdates: { range: string; values: (string | number)[][] }[] = [];
  for (const sheet of newSheets) {
    const q = quoteSheetName(sheet.title);
    if (sheet.title === TAB_ALL_SALES) {
      valueUpdates.push({ range: `${q}!A1:S1`, values: [ALL_SALES_HEADERS] });
    } else if (sheet.title === TAB_EXPENSES) {
      const { payeeBlock, categoryBlock } = getExpensesSummaryValues();
      valueUpdates.push({ range: `${q}!A1:J1`, values: [EXPENSES_HEADERS] });
      valueUpdates.push({ range: `${q}!L1:S8`, values: payeeBlock });
      valueUpdates.push({ range: `${q}!L10:M16`, values: categoryBlock });
    } else {
      // Daily sales tab
      valueUpdates.push({ range: `${q}!A1:J1`, values: [DAILY_SALES_HEADERS] });
      valueUpdates.push({ range: `${q}!L1:M8`, values: getDailySummaryValues() });
    }
  }

  if (valueUpdates.length > 0) {
    await batchUpdateValues(spreadsheetId, valueUpdates);
  }

  return fetchSpreadsheetMeta(spreadsheetId);
}

async function persistCafeSheetMetadata(cafe: Cafe, patch: Partial<Cafe>): Promise<Cafe> {
  const updatedCafe: Cafe = {
    ...cafe,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  setActiveCafe(updatedCafe);
  if (auth.currentUser && cafe.id && cafe.id !== 'default-corner-cafe') {
    try {
      await updateDoc(doc(db, 'cafes', cafe.id), cleanData({
        ...patch,
        updatedAt: updatedCafe.updatedAt,
      }));
    } catch (err) {
      console.warn('Could not persist Google Sheet metadata to database immediately', err);
    }
  }
  return updatedCafe;
}

// ---------------------------------------------------------------------------
// Public Workbook Creation & Full Push
// ---------------------------------------------------------------------------

export async function createCafeBackupWorkbook(
  cafe: Cafe,
  bills: Bill[],
  ledger: LedgerEntry[]
): Promise<{ updatedCafe: Cafe; meta: SpreadsheetMeta }> {
  const title = `${cafe.name} — POS Sales & Expenses Backup`;

  // Collect daily tabs to pre-create (distinct business dates from recent bills, or today)
  const dailyDateSet = new Set<string>();
  bills.forEach((b) => {
    dailyDateSet.add(getBusinessDateStr(b.createdAt, cafe.openingTime, cafe.closingTime));
  });
  const todayBusinessDate = getBusinessDateStr(new Date(), cafe.openingTime, cafe.closingTime);
  dailyDateSet.add(todayBusinessDate);

  // Limit initial pre-created daily tabs to most recent 14 business days to keep workbook crisp
  const recentDailyDates = Array.from(dailyDateSet).sort().reverse().slice(0, 14);
  const dailyTabTitles = recentDailyDates.map(formatDailyTabTitle);

  const sheetsConfig = [
    {
      properties: {
        title: TAB_ALL_SALES,
        gridProperties: { rowCount: Math.max(1000, bills.length + 200), columnCount: 22, frozenRowCount: 1 },
      },
    },
    {
      properties: {
        title: TAB_EXPENSES,
        gridProperties: { rowCount: Math.max(2000, ledger.length + 300), columnCount: 22, frozenRowCount: 1 },
      },
    },
    ...dailyTabTitles.map((tabTitle) => ({
      properties: {
        title: tabTitle,
        gridProperties: { rowCount: 500, columnCount: 16, frozenRowCount: 1 },
      },
    })),
  ];

  const created = await sheetsFetch<any>('', {
    method: 'POST',
    body: JSON.stringify({
      properties: { title },
      sheets: sheetsConfig,
    }),
  });

  const spreadsheetId: string = created.spreadsheetId;
  const spreadsheetUrl: string =
    created.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  const createdSheets: SheetTabMeta[] = (created.sheets || []).map((s: any) => ({
    sheetId: s.properties.sheetId,
    title: s.properties.title,
    index: s.properties.index ?? 0,
  }));

  // Style headers across all created tabs
  const styleRequests: any[] = [];
  createdSheets.forEach((sh) => {
    const colCount = sh.title === TAB_ALL_SALES ? ALL_SALES_HEADERS.length : 10;
    styleRequests.push(...buildHeaderStyleRequests(sh.sheetId, colCount, 1));
  });
  if (styleRequests.length > 0) {
    await batchUpdateSpreadsheet(spreadsheetId, styleRequests);
  }

  const updatedCafe = await persistCafeSheetMetadata(cafe, {
    googleSpreadsheetId: spreadsheetId,
    googleSpreadsheetUrl: spreadsheetUrl,
    googleSheetTitle: title,
    lastSheetSyncedAt: new Date().toISOString(),
  });

  await pushFullBackupToSheets(updatedCafe, bills, ledger);

  return {
    updatedCafe,
    meta: {
      spreadsheetId,
      spreadsheetUrl,
      title,
      sheets: createdSheets,
    },
  };
}

export async function linkExistingSpreadsheet(
  cafe: Cafe,
  spreadsheetIdOrUrl: string
): Promise<{ updatedCafe: Cafe; meta: SpreadsheetMeta }> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetIdOrUrl);
  if (!spreadsheetId) {
    throw new Error('Please enter a valid Google Sheets URL or Spreadsheet ID.');
  }
  const meta = await ensureTabsExist(spreadsheetId, [TAB_ALL_SALES, TAB_EXPENSES]);
  const updatedCafe = await persistCafeSheetMetadata(cafe, {
    googleSpreadsheetId: meta.spreadsheetId,
    googleSpreadsheetUrl: meta.spreadsheetUrl,
    googleSheetTitle: meta.title,
  });
  return { updatedCafe, meta };
}

export async function pushFullBackupToSheets(
  cafe: Cafe,
  bills: Bill[],
  ledger: LedgerEntry[]
): Promise<{ salesCount: number; expensesCount: number; dailyTabsSynced: number; updatedCafe: Cafe }> {
  if (!cafe.googleSpreadsheetId) {
    throw new Error('No Google Sheet is linked to this cafe yet.');
  }
  const spreadsheetId = cafe.googleSpreadsheetId;

  // Group bills by business date (chronological within each day)
  const sortedBills = [...bills].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const billsByDay = new Map<string, Bill[]>();
  sortedBills.forEach((b) => {
    const bizDate = getBusinessDateStr(b.createdAt, cafe.openingTime, cafe.closingTime);
    const list = billsByDay.get(bizDate) || [];
    list.push(b);
    billsByDay.set(bizDate, list);
  });

  const todayBiz = getBusinessDateStr(new Date(), cafe.openingTime, cafe.closingTime);
  if (!billsByDay.has(todayBiz)) {
    billsByDay.set(todayBiz, []);
  }

  // Keep daily tabs for the 14 most recent business days (All Sales holds complete history)
  const dailyDatesToSync = Array.from(billsByDay.keys()).sort().reverse().slice(0, 14);
  const dailyTabTitles = dailyDatesToSync.map(formatDailyTabTitle);

  await ensureTabsExist(spreadsheetId, [TAB_ALL_SALES, TAB_EXPENSES, ...dailyTabTitles]);

  // Clear data columns cleanly (preserving right-side summary blocks before rewriting them)
  const rangesToClear = [
    `${quoteSheetName(TAB_ALL_SALES)}!A2:S5000`,
    `${quoteSheetName(TAB_EXPENSES)}!A2:J5000`,
    ...dailyTabTitles.map((t) => `${quoteSheetName(t)}!A2:J2000`),
  ];
  await clearValues(spreadsheetId, rangesToClear);

  const sortedLedger = [...ledger].sort((a, b) => {
    if (a.dateStr !== b.dateStr) return a.dateStr.localeCompare(b.dateStr);
    return a.createdAt.localeCompare(b.createdAt);
  });

  const { payeeBlock, categoryBlock } = getExpensesSummaryValues();

  const updates: { range: string; values: (string | number)[][] }[] = [
    {
      range: `${quoteSheetName(TAB_ALL_SALES)}!A1:S${sortedBills.length + 1}`,
      values: [ALL_SALES_HEADERS, ...sortedBills.map((b) => billToAllSalesRow(b, cafe))],
    },
    {
      range: `${quoteSheetName(TAB_EXPENSES)}!A1:J${sortedLedger.length + 1}`,
      values: [EXPENSES_HEADERS, ...sortedLedger.map(ledgerEntryToRow)],
    },
    {
      range: `${quoteSheetName(TAB_EXPENSES)}!L1:S8`,
      values: payeeBlock,
    },
    {
      range: `${quoteSheetName(TAB_EXPENSES)}!L10:M16`,
      values: categoryBlock,
    },
  ];

  dailyDatesToSync.forEach((bizDate) => {
    const tabTitle = formatDailyTabTitle(bizDate);
    const dayBills = billsByDay.get(bizDate) || [];
    const q = quoteSheetName(tabTitle);
    updates.push({
      range: `${q}!A1:J${dayBills.length + 1}`,
      values: [DAILY_SALES_HEADERS, ...dayBills.map((b, idx) => billToDailySalesRow(b, idx + 1))],
    });
    updates.push({
      range: `${q}!L1:M8`,
      values: getDailySummaryValues(),
    });
  });

  await batchUpdateValues(spreadsheetId, updates);

  // Clear pending sync queue since everything is now fully synced
  savePendingSheetSyncQueue(cafe.id, []);

  const updatedCafe = await persistCafeSheetMetadata(cafe, {
    lastSheetSyncedAt: new Date().toISOString(),
  });

  return {
    salesCount: sortedBills.length,
    expensesCount: sortedLedger.length,
    dailyTabsSynced: dailyDatesToSync.length,
    updatedCafe,
  };
}

// ---------------------------------------------------------------------------
// Incremental Auto-Sync CRUD Operations (Bill & Ledger)
// ---------------------------------------------------------------------------

async function upsertRowById(
  spreadsheetId: string,
  tabTitle: string,
  idColLetter: string,
  rowRangeEndCol: string,
  rowId: string,
  rowValues: (string | number)[]
): Promise<number> {
  const q = quoteSheetName(tabTitle);
  const colValues = await getValues(spreadsheetId, `${q}!${idColLetter}2:${idColLetter}5000`);
  let existingRowIndex = -1;
  for (let i = 0; i < colValues.length; i++) {
    if (String(colValues[i]?.[0] ?? '').trim() === rowId) {
      existingRowIndex = i + 2; // 1-indexed, offset by header
      break;
    }
  }

  const targetRow = existingRowIndex > 0 ? existingRowIndex : colValues.length + 2;
  await batchUpdateValues(spreadsheetId, [
    {
      range: `${q}!A${targetRow}:${rowRangeEndCol}${targetRow}`,
      values: [rowValues],
    },
  ]);
  return targetRow;
}

export async function syncBillToSheets(cafe: Cafe, bill: Bill): Promise<boolean> {
  if (!cafe.googleSpreadsheetId) return false;

  const token = getGoogleSheetsAccessToken();
  if (!token) {
    enqueueSheetSyncOp(cafe.id, {
      key: `bill:${bill.id}`,
      type: 'upsert_bill',
      bill,
      queuedAt: new Date().toISOString(),
    });
    return false;
  }

  try {
    const bizDate = getBusinessDateStr(bill.createdAt, cafe.openingTime, cafe.closingTime);
    const dailyTabTitle = formatDailyTabTitle(bizDate);
    await ensureTabsExist(cafe.googleSpreadsheetId, [TAB_ALL_SALES, dailyTabTitle]);

    // 1. Upsert in All Sales (Bill ID in col A)
    await upsertRowById(
      cafe.googleSpreadsheetId,
      TAB_ALL_SALES,
      'A',
      'S',
      bill.id,
      billToAllSalesRow(bill, cafe)
    );

    // 2. Upsert in Daily Sales Tab (Bill ID in col J)
    const qDaily = quoteSheetName(dailyTabTitle);
    const dailyIds = await getValues(cafe.googleSpreadsheetId, `${qDaily}!J2:J2000`);
    let existingRow = -1;
    for (let i = 0; i < dailyIds.length; i++) {
      if (String(dailyIds[i]?.[0] ?? '').trim() === bill.id) {
        existingRow = i + 2;
        break;
      }
    }
    const orderIndex = existingRow > 0 ? existingRow - 1 : dailyIds.length + 1;
    const targetRow = existingRow > 0 ? existingRow : dailyIds.length + 2;
    await batchUpdateValues(cafe.googleSpreadsheetId, [
      {
        range: `${qDaily}!A${targetRow}:J${targetRow}`,
        values: [billToDailySalesRow(bill, orderIndex)],
      },
    ]);

    return true;
  } catch (err) {
    console.warn('Auto-sync bill to Google Sheets failed; queued for retry', err);
    enqueueSheetSyncOp(cafe.id, {
      key: `bill:${bill.id}`,
      type: 'upsert_bill',
      bill,
      queuedAt: new Date().toISOString(),
    });
    return false;
  }
}

export async function syncLedgerEntryToSheets(cafe: Cafe, entry: LedgerEntry): Promise<boolean> {
  if (!cafe.googleSpreadsheetId) return false;

  const token = getGoogleSheetsAccessToken();
  if (!token) {
    enqueueSheetSyncOp(cafe.id, {
      key: `ledger:${entry.id}`,
      type: 'upsert_ledger',
      entry,
      queuedAt: new Date().toISOString(),
    });
    return false;
  }

  try {
    await ensureTabsExist(cafe.googleSpreadsheetId, [TAB_EXPENSES]);
    await upsertRowById(
      cafe.googleSpreadsheetId,
      TAB_EXPENSES,
      'A',
      'J',
      entry.id,
      ledgerEntryToRow(entry)
    );
    return true;
  } catch (err) {
    console.warn('Auto-sync ledger entry to Google Sheets failed; queued for retry', err);
    enqueueSheetSyncOp(cafe.id, {
      key: `ledger:${entry.id}`,
      type: 'upsert_ledger',
      entry,
      queuedAt: new Date().toISOString(),
    });
    return false;
  }
}

export async function deleteLedgerEntryFromSheets(cafe: Cafe, entryId: string): Promise<boolean> {
  if (!cafe.googleSpreadsheetId) return false;

  const token = getGoogleSheetsAccessToken();
  if (!token) {
    enqueueSheetSyncOp(cafe.id, {
      key: `ledger:${entryId}`,
      type: 'delete_ledger',
      entryId,
      queuedAt: new Date().toISOString(),
    });
    return false;
  }

  try {
    const meta = await fetchSpreadsheetMeta(cafe.googleSpreadsheetId);
    const expenseTab = meta.sheets.find((s) => s.title === TAB_EXPENSES);
    if (!expenseTab) return true;

    const q = quoteSheetName(TAB_EXPENSES);
    const idCol = await getValues(cafe.googleSpreadsheetId, `${q}!A2:A5000`);
    let zeroBasedRowIndex = -1;
    for (let i = 0; i < idCol.length; i++) {
      if (String(idCol[i]?.[0] ?? '').trim() === entryId) {
        zeroBasedRowIndex = i + 1; // Row 2 is index 1
        break;
      }
    }
    if (zeroBasedRowIndex < 0) return true;

    await batchUpdateSpreadsheet(cafe.googleSpreadsheetId, [
      {
        deleteDimension: {
          range: {
            sheetId: expenseTab.sheetId,
            dimension: 'ROWS',
            startIndex: zeroBasedRowIndex,
            endIndex: zeroBasedRowIndex + 1,
          },
        },
      },
    ]);
    return true;
  } catch (err) {
    console.warn('Auto-delete ledger entry from Google Sheets failed; queued for retry', err);
    enqueueSheetSyncOp(cafe.id, {
      key: `ledger:${entryId}`,
      type: 'delete_ledger',
      entryId,
      queuedAt: new Date().toISOString(),
    });
    return false;
  }
}

export async function flushSheetSyncQueue(
  cafe: Cafe
): Promise<{ flushed: number; remaining: number }> {
  if (!cafe.googleSpreadsheetId || !getGoogleSheetsAccessToken()) {
    return { flushed: 0, remaining: getPendingSheetSyncCount(cafe.id) };
  }

  const queue = getPendingSheetSyncQueue(cafe.id);
  if (queue.length === 0) return { flushed: 0, remaining: 0 };

  let flushed = 0;
  const remainingOps: SheetSyncQueueOp[] = [];

  for (const op of queue) {
    let ok = false;
    if (op.type === 'upsert_bill') {
      ok = await syncBillToSheets(cafe, op.bill);
    } else if (op.type === 'upsert_ledger') {
      ok = await syncLedgerEntryToSheets(cafe, op.entry);
    } else if (op.type === 'delete_ledger') {
      ok = await deleteLedgerEntryFromSheets(cafe, op.entryId);
    }
    if (ok) {
      flushed++;
    } else {
      remainingOps.push(op);
    }
  }

  savePendingSheetSyncQueue(cafe.id, remainingOps);
  return { flushed, remaining: remainingOps.length };
}

// ---------------------------------------------------------------------------
// Pull & Reconcile from Google Sheets -> database + LocalStorage
// ---------------------------------------------------------------------------

export async function previewPullFromSheets(
  cafe: Cafe,
  currentBills: Bill[],
  currentLedger: LedgerEntry[]
): Promise<SheetPullPreview> {
  if (!cafe.googleSpreadsheetId) {
    throw new Error('No Google Sheet is linked to this cafe yet.');
  }

  const meta = await fetchSpreadsheetMeta(cafe.googleSpreadsheetId);
  const existingTabs = new Set(meta.sheets.map((s) => s.title));

  const billMap = new Map(currentBills.map((b) => [b.id, b]));
  const ledgerMap = new Map(currentLedger.map((e) => [e.id, e]));

  const billsToCreate: Bill[] = [];
  const billsToUpdate: Bill[] = [];
  const billIdWritebacks: { rowNumber: number; id: string }[] = [];

  const ledgerToCreate: LedgerEntry[] = [];
  const ledgerToUpdate: LedgerEntry[] = [];
  const ledgerIdWritebacks: { rowNumber: number; id: string }[] = [];

  let scannedSalesRows = 0;
  let scannedExpenseRows = 0;

  if (existingTabs.has(TAB_ALL_SALES)) {
    const rows = await getValues(
      cafe.googleSpreadsheetId,
      `${quoteSheetName(TAB_ALL_SALES)}!A2:S5000`
    );
    scannedSalesRows = rows.length;

    rows.forEach((row, idx) => {
      const rowNumber = idx + 2;
      const rawId = String(row[0] ?? '').trim();
      const billNumber = String(row[1] ?? '').trim();
      const bizDateStr = parseFlexibleDateStr(String(row[2] ?? row[3] ?? ''));
      const tableOrToken = String(row[5] ?? '').trim() || 'Sheet Entry';
      const orderType = parseOrderType(String(row[6] ?? ''));
      const itemsText = String(row[7] ?? '').trim();
      const subtotal = parseNumberCell(row[8]);
      const discountAmount = parseNumberCell(row[9]);
      const taxAmount = parseNumberCell(row[10]);
      const grandTotal = parseNumberCell(row[11]);
      const paymentMode = parseBillPaymentMode(String(row[12] ?? ''));
      const cashAmt = parseNumberCell(row[13]);
      const upiAmt = parseNumberCell(row[14]);
      const cardAmt = parseNumberCell(row[15]);
      const status = parseBillStatus(String(row[16] ?? 'paid'));

      if (!rawId && !billNumber && grandTotal <= 0) return;

      const safeRawId = rawId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120);
      const existing = safeRawId ? billMap.get(safeRawId) || billMap.get(rawId) : undefined;
      if (existing) {
        const changed =
          existing.status !== status ||
          existing.paymentMode !== paymentMode ||
          Math.abs(existing.grandTotal - grandTotal) > 0.01 ||
          (tableOrToken && existing.tableOrToken !== tableOrToken);
        if (changed) {
          billsToUpdate.push({
            ...existing,
            status,
            paymentMode,
            grandTotal: grandTotal > 0 ? grandTotal : existing.grandTotal,
            subtotal: subtotal > 0 ? subtotal : existing.subtotal,
            discountAmount,
            taxAmount,
            tableOrToken: tableOrToken || existing.tableOrToken,
            splitDetails:
              paymentMode === 'split'
                ? { cash: cashAmt, upi: upiAmt, card: cardAmt }
                : existing.splitDetails,
            syncedAt: new Date().toISOString(),
            isSynced: true,
          });
        }
      } else {
        const id = safeRawId || `sheet-bill-${Date.now()}-${rowNumber}`;
        if (!rawId || safeRawId !== rawId) {
          billIdWritebacks.push({ rowNumber, id });
        }
        const parsedItems = itemsText
          ? itemsText.split(',').map((chunk, i) => {
              const trimmed = chunk.trim();
              const qtyMatch = /^(.*)\s+x(\d+)$/i.exec(trimmed);
              const name = qtyMatch ? qtyMatch[1].trim() : trimmed;
              const qty = qtyMatch ? Math.max(1, Number(qtyMatch[2])) : 1;
              return {
                menuItemId: `sheet-item-${i}`,
                name: name || 'Sheet Item',
                price: i === 0 ? grandTotal / qty : 0,
                quantity: qty,
              };
            })
          : [
              {
                menuItemId: 'sheet-item-0',
                name: 'Sheet Order',
                price: grandTotal,
                quantity: 1,
              },
            ];

        billsToCreate.push({
          id,
          cafeId: cafe.id,
          billNumber: billNumber || `#SHT-${rowNumber}`,
          items: parsedItems,
          subtotal: subtotal > 0 ? subtotal : grandTotal,
          discountPercent: 0,
          discountAmount,
          taxPercent: 0,
          taxAmount,
          grandTotal,
          paymentMode,
          splitDetails:
            paymentMode === 'split'
              ? { cash: cashAmt, upi: upiAmt, card: cardAmt }
              : undefined,
          orderType,
          tableOrToken,
          status,
          cashierId: 'sheet-sync',
          cashierName: 'Google Sheet Sync',
          createdAt: `${bizDateStr}T12:00:00.000Z`,
          syncedAt: new Date().toISOString(),
          isSynced: true,
        });
      }
    });
  }

  if (existingTabs.has(TAB_EXPENSES)) {
    const rows = await getValues(
      cafe.googleSpreadsheetId,
      `${quoteSheetName(TAB_EXPENSES)}!A2:J5000`
    );
    scannedExpenseRows = rows.length;

    rows.forEach((row, idx) => {
      const rowNumber = idx + 2;
      const rawId = String(row[0] ?? '').trim();
      const rawDate = String(row[1] ?? '').trim();
      const expenseTitle = String(row[2] ?? '').trim();
      const amount = parseNumberCell(row[3]);
      const paidBy = String(row[4] ?? '').trim() || 'Cafe';
      const rawCategory = String(row[5] ?? '').trim();
      const rawMode = String(row[6] ?? '').trim();
      const description = String(row[7] ?? '').trim() || expenseTitle;
      const rawKind = String(row[8] ?? '').trim();

      if (!expenseTitle && amount <= 0 && !description) return;
      if (amount <= 0) return;

      const dateStr = parseFlexibleDateStr(rawDate);
      const { kind, expenseType } = parseLedgerKindAndCategory(rawKind, rawCategory);
      const paymentMode = parseLedgerMode(rawMode, paidBy);

      const safeRawId = rawId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120);
      const safePaidBy = paidBy.slice(0, 60);
      const safeTitle = (expenseTitle || description || 'Expense').slice(0, 120);
      const safeNote = (description || expenseTitle || 'Sheet Entry').slice(0, 240);

      const existing = safeRawId ? ledgerMap.get(safeRawId) || ledgerMap.get(rawId) : undefined;
      if (existing) {
        const existingPaidBy =
          existing.kind === 'withdrawal'
            ? existing.person || existing.paidBy || ''
            : existing.paidBy || 'Cafe';
        const changed =
          Math.abs(existing.amount - amount) > 0.01 ||
          existing.dateStr !== dateStr ||
          existing.paymentMode !== paymentMode ||
          existing.kind !== kind ||
          (kind === 'expenditure' && existing.expenseType !== expenseType) ||
          existingPaidBy.toLowerCase() !== safePaidBy.toLowerCase() ||
          (existing.note || '') !== safeNote ||
          (existing.expenseTitle || '') !== safeTitle;

        if (changed) {
          ledgerToUpdate.push({
            ...existing,
            kind,
            amount,
            paymentMode,
            expenseType: kind === 'expenditure' ? expenseType : undefined,
            paidBy: kind === 'withdrawal' ? 'Cafe' : safePaidBy,
            person: kind === 'withdrawal' ? safePaidBy : undefined,
            expenseTitle: safeTitle,
            note: safeNote,
            dateStr,
            updatedAt: new Date().toISOString(),
          });
        }
      } else {
        const id = safeRawId || `sheet-exp-${Date.now()}-${rowNumber}`;
        if (!rawId || safeRawId !== rawId) {
          ledgerIdWritebacks.push({ rowNumber, id });
        }
        ledgerToCreate.push({
          id,
          cafeId: cafe.id,
          kind,
          amount,
          paymentMode,
          expenseType: kind === 'expenditure' ? expenseType : undefined,
          paidBy: kind === 'withdrawal' ? 'Cafe' : safePaidBy,
          person: kind === 'withdrawal' ? safePaidBy : undefined,
          expenseTitle: safeTitle,
          note: safeNote,
          dateStr,
          createdAt: `${dateStr}T12:00:00.000Z`,
          updatedAt: new Date().toISOString(),
          createdByUid: 'sheet-sync',
          createdByName: 'Google Sheet Sync',
        });
      }
    });
  }

  return {
    billsToCreate,
    billsToUpdate,
    ledgerToCreate,
    ledgerToUpdate,
    billIdWritebacks,
    ledgerIdWritebacks,
    scannedSalesRows,
    scannedExpenseRows,
  };
}

async function commitInBatches(
  cafeId: string,
  operations: { collectionName: 'bills' | 'ledger'; id: string; payload: any }[]
): Promise<void> {
  if (!auth.currentUser || !cafeId || cafeId === 'default-corner-cafe') return;
  const CHUNK_SIZE = 400;
  for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
    const chunk = operations.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((op) => {
      batch.set(
        doc(db, 'cafes', cafeId, op.collectionName, op.id),
        cleanData(op.payload),
        { merge: true }
      );
    });
    try {
      await batch.commit();
    } catch (err) {
      handleDatabaseError(
        err,
        OperationType.WRITE,
        `cafes/${cafeId}/${chunk[0]?.collectionName || 'batch'}`
      );
    }
  }
}

export async function applyPullFromSheets(
  cafe: Cafe,
  preview: SheetPullPreview,
  currentBills: Bill[],
  currentLedger: LedgerEntry[]
): Promise<{
  updatedBills: Bill[];
  updatedLedger: LedgerEntry[];
  updatedCafe: Cafe;
}> {
  const batchOps: { collectionName: 'bills' | 'ledger'; id: string; payload: any }[] = [];

  [...preview.billsToCreate, ...preview.billsToUpdate].forEach((b) => {
    batchOps.push({ collectionName: 'bills', id: b.id, payload: b });
  });
  [...preview.ledgerToCreate, ...preview.ledgerToUpdate].forEach((e) => {
    batchOps.push({ collectionName: 'ledger', id: e.id, payload: e });
  });

  if (batchOps.length > 0) {
    await commitInBatches(cafe.id, batchOps);
  }

  // Write generated IDs back to the Sheet for rows manually added by user without an ID
  if (cafe.googleSpreadsheetId && (preview.billIdWritebacks.length > 0 || preview.ledgerIdWritebacks.length > 0)) {
    const idUpdates: { range: string; values: (string | number)[][] }[] = [];
    preview.billIdWritebacks.forEach((wb) => {
      idUpdates.push({
        range: `${quoteSheetName(TAB_ALL_SALES)}!A${wb.rowNumber}`,
        values: [[wb.id]],
      });
    });
    preview.ledgerIdWritebacks.forEach((wb) => {
      idUpdates.push({
        range: `${quoteSheetName(TAB_EXPENSES)}!A${wb.rowNumber}`,
        values: [[wb.id]],
      });
    });
    await batchUpdateValues(cafe.googleSpreadsheetId, idUpdates);
  }

  // Merge locally
  const billMap = new Map(currentBills.map((b) => [b.id, b]));
  [...preview.billsToCreate, ...preview.billsToUpdate].forEach((b) => billMap.set(b.id, b));
  const updatedBills = Array.from(billMap.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
  localStorage.setItem(`billdedo_sb1_bills_${cafe.id}`, JSON.stringify(updatedBills));
  window.dispatchEvent(new CustomEvent('bills_updated'));

  const ledgerMap = new Map(currentLedger.map((e) => [e.id, e]));
  [...preview.ledgerToCreate, ...preview.ledgerToUpdate].forEach((e) => ledgerMap.set(e.id, e));
  const updatedLedger = Array.from(ledgerMap.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
  saveLocalLedger(cafe.id, updatedLedger);

  const updatedCafe = await persistCafeSheetMetadata(cafe, {
    lastSheetSyncedAt: new Date().toISOString(),
  });

  return { updatedBills, updatedLedger, updatedCafe };
}

// Helper for single database ledger upsert if needed
export async function upsertLedgerEntrydatabase(entry: LedgerEntry): Promise<void> {
  if (!auth.currentUser || !entry.cafeId || entry.cafeId === 'default-corner-cafe') return;
  const path = `cafes/${entry.cafeId}/ledger/${entry.id}`;
  try {
    await setDoc(doc(db, 'cafes', entry.cafeId, 'ledger', entry.id), cleanData(entry), {
      merge: true,
    });
  } catch (err) {
    handleDatabaseError(err, OperationType.WRITE, path);
  }
}
