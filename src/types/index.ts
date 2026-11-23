export type TabType = 'pos' | 'history' | 'reports' | 'menu' | 'inventory' | 'staff' | 'settings';
export type OrderType = 'dine-in' | 'takeaway' | 'delivery';
export type PaymentMode = 'upi' | 'cash' | 'card' | 'split';
export type BillStatus = 'paid' | 'void';
export type StaffRole = 'owner' | 'manager' | 'cashier' | 'staff';
export type InventoryUnit = 'ml' | 'L' | 'g' | 'kg' | 'piece' | 'packet';
export type InventoryMode = 'STRICT' | 'WARNING' | 'TRACK_ONLY';

export interface StaffMember {
  uid: string;
  email: string;
  name: string;
  role: StaffRole;
  joinedAt: string;
  lastActive?: string;
}

export interface JoinRequest {
  uid: string;
  email: string;
  name: string;
  requestedAt: string;
}

export interface Cafe {
  id: string;
  name: string;
  tagline: string;
  phone: string;
  address: string;
  upiId: string;
  paymentQrUrl?: string; // Custom uploaded standee photo or merchant QR
  gstin?: string;
  fssai?: string; // FSSAI License Number
  ownerId: string;
  ownerEmail?: string;
  secretCode: string; // e.g. CAFE-8821
  memberUids: string[];
  members?: StaffMember[];
  pendingRequests?: JoinRequest[];
  inventoryMode?: InventoryMode;
  receiptHeader?: string;
  receiptFooter?: string;
  showCashierOnReceipt?: boolean;
  showGstOnReceipt?: boolean;
  receiptPrefix?: string;
  openingTime?: string; // 24h HH:mm, e.g. "16:00" (4:00 PM)
  closingTime?: string; // 24h HH:mm, e.g. "06:00" (6:00 AM next day)
  googleSpreadsheetId?: string;
  googleSpreadsheetUrl?: string;
  googleSheetTitle?: string;
  lastSheetSyncedAt?: string;
  initialExpensesSeededAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MenuItem {
  id: string;
  cafeId: string;
  name: string;
  category: string;
  price: number;
  description?: string;
  isVeg: boolean;
  isAvailable: boolean;
  popular?: boolean;
  imageEmoji?: string;
  updatedAt?: string;
}

export interface OrderItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  isVeg?: boolean;
  isCustom?: boolean; // For custom items / surcharges like extra cheese
  isBilled?: boolean; // Whether this item was already billed/charged in an earlier receipt
  billedBillNumber?: string;
}

export interface TableOrder {
  id: string;
  tableNumber: string;
  orderType: OrderType;
  items: OrderItem[];
  customerMobile?: string;
  discountPercent?: number;
  taxPercent?: number;
  notes?: string;
  subtotal: number;
  grandTotal: number;
  updatedAt: string;
  updatedBy?: string;
  orderNumber?: string;
  isCustomTable?: boolean; // Whether this is a custom named table instead of a fixed numbered table
  customerName?: string; // Custom customer name displayed in place of table number
}

export interface SplitPaymentDetail {
  cash?: number;
  upi?: number;
  card?: number;
}

export interface KitchenOrderTicket {
  orderId?: string;
  tableNumber: string;
  items: OrderItem[];
  serverName?: string;
  orderType?: OrderType;
  createdAt: string;
  notes?: string;
  isCustomCustomer?: boolean;
}

export interface Bill {
  id: string;
  cafeId: string;
  billNumber: string; // e.g. POS-1024
  items: OrderItem[];
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  grandTotal: number;
  paymentMode: PaymentMode;
  splitDetails?: SplitPaymentDetail;
  includeQr?: boolean; // toggle whether to print QR on bill
  orderType: OrderType;
  tableOrToken: string; // e.g. Table 4 or Token #12
  customerMobile?: string;
  status: BillStatus;
  cashierId: string;
  cashierName: string;
  cashierEmail?: string; // email of the generator for work log & performance
  createdAt: string;
  syncedAt?: string;
  isSynced: boolean; // false when queued offline
  isReprint?: boolean; // Watermarks receipt with *** DUPLICATE ***
  idempotencyKey?: string;
}

// Inventory & Recipe / BOM Types
export interface InventoryItem {
  id: string;
  cafeId: string;
  name: string;
  unit: InventoryUnit;
  currentStock: number;
  minimumStock: number;
  costPerUnit: number;
  category: string;
  updatedAt: string;
}

export interface RecipeComponent {
  inventoryItemId: string;
  quantity: number;
  unit: InventoryUnit;
}

export interface Recipe {
  menuItemId: string;
  cafeId: string;
  components: RecipeComponent[];
  updatedAt?: string;
}

export type MovementType =
  | 'SALE_CONSUMPTION'
  | 'MANUAL_ADJUSTMENT'
  | 'WASTAGE'
  | 'RESTOCK'
  | 'REFUND_REVERSAL';

export interface InventoryMovement {
  id: string;
  cafeId: string;
  inventoryItemId: string;
  inventoryItemName: string;
  type: MovementType;
  quantity: number; // positive = added, negative = deducted
  unit: string;
  relatedOrderId?: string;
  relatedBillNumber?: string;
  actorName: string;
  actorEmail?: string;
  note?: string;
  timestamp: string;
}

export interface PrinterConfig {
  paperWidth: 58 | 80;
  autoPrint: boolean;
  deviceName?: string;
  isSimulated: boolean;
}

export interface DailySummary {
  date: string;
  totalBills: number;
  grossSales: number;
  totalDiscounts: number;
  netRevenue: number;
  upiSales: number;
  cashSales: number;
  cardSales: number;
  averageBill: number;
  topItems: { name: string; quantity: number; revenue: number }[];
}

export interface StaffPerformance {
  uid: string;
  name: string;
  email: string;
  billsCount: number;
  totalSales: number;
  upiSales: number;
  cashSales: number;
  cardSales: number;
  averageTicket: number;
}

export type LedgerEntryKind = 'expenditure' | 'withdrawal' | 'cc_topup';
export type LedgerPaymentMode = 'cash' | 'upi' | 'credit_card' | 'personal';
export type ExpenseType = 'running' | 'fixed' | 'initial';

export interface LedgerEntry {
  id: string;
  cafeId: string;
  kind: LedgerEntryKind;
  amount: number;
  paymentMode: LedgerPaymentMode;
  expenseType?: ExpenseType; // For expenditures: 'running' | 'fixed' | 'initial'
  paidBy?: string; // 'Cafe' (affects cafe wallets) or Partner name (Prateek, Ishita, Yash, Yuvraj, Ankit, etc.)
  expenseTitle?: string; // Short vendor / expense label (e.g. "Milk", "Hyperpure", "Rent")
  person?: string; // For withdrawals: 'Yuvraj' | 'Prateek' | 'Yash' | 'Ishita' | custom
  note: string;
  dateStr: string; // Business Date YYYY-MM-DD
  createdAt: string; // ISO timestamp
  updatedAt?: string; // ISO timestamp for CRUD updates
  createdByUid?: string;
  createdByName?: string;
}

export interface WalletOpeningBalances {
  cash: number;
  upi: number;
  creditCard: number;
  updatedAt?: string;
}

