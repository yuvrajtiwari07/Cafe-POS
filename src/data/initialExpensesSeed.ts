import { ExpenseType, LedgerEntry, LedgerPaymentMode } from "../types";

export interface HistoricalExpenseSeedRow {
  id: string;
  dateStr: string;
  expenseTitle: string;
  amount: number;
  paidBy: string;
  expenseType: ExpenseType;
  paymentMode: LedgerPaymentMode;
  note: string;
}

// Parsed directly from attached Expense_Sheet (Sep 30, 2026 - Nov 22, 2026)
// Total entries: 162 | Exact verified sum: Rs. 334811.72
export const INITIAL_EXPENSE_SEED_ROWS: HistoricalExpenseSeedRow[] = [
  {
    "id": "seed-exp-001",
    "dateStr": "2026-09-30",
    "expenseTitle": "Rent",
    "amount": 61000,
    "paidBy": "Prateek",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "Rent"
  },
  {
    "id": "seed-exp-002",
    "dateStr": "2026-10-02",
    "expenseTitle": "Sim Card",
    "amount": 400,
    "paidBy": "Prateek",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "Sim Card"
  },
  {
    "id": "seed-exp-003",
    "dateStr": "2026-10-02",
    "expenseTitle": "Sink Vavol",
    "amount": 800,
    "paidBy": "Prateek",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "Sink Vavol"
  },
  {
    "id": "seed-exp-004",
    "dateStr": "2026-10-03",
    "expenseTitle": "mahalaxmi electricity",
    "amount": 396,
    "paidBy": "Prateek",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "mahalaxmi electricity"
  },
  {
    "id": "seed-exp-005",
    "dateStr": "2026-10-03",
    "expenseTitle": "mahalaxmi electricity",
    "amount": 60,
    "paidBy": "Prateek",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "mahalaxmi electricity"
  },
  {
    "id": "seed-exp-006",
    "dateStr": "2026-10-04",
    "expenseTitle": "Carpentar",
    "amount": 13000,
    "paidBy": "Prateek",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "Carpentar"
  },
  {
    "id": "seed-exp-007",
    "dateStr": "2026-10-04",
    "expenseTitle": "Carpentar",
    "amount": 100,
    "paidBy": "Prateek",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "Sandpaper for finishing"
  },
  {
    "id": "seed-exp-008",
    "dateStr": "2026-10-04",
    "expenseTitle": "Core drill",
    "amount": 1200,
    "paidBy": "Prateek",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "Core drill"
  },
  {
    "id": "seed-exp-009",
    "dateStr": "2026-10-07",
    "expenseTitle": "AC",
    "amount": 9000,
    "paidBy": "Prateek",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "AC 3 months payments"
  },
  {
    "id": "seed-exp-010",
    "dateStr": "2026-10-08",
    "expenseTitle": "Mr DIY",
    "amount": 611,
    "paidBy": "Yash",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "cleaning cloth, bench wrap"
  },
  {
    "id": "seed-exp-011",
    "dateStr": "2026-10-08",
    "expenseTitle": "Electricity wala",
    "amount": 75,
    "paidBy": "Prateek",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "Electricity wala"
  },
  {
    "id": "seed-exp-012",
    "dateStr": "2026-10-10",
    "expenseTitle": "Veggies",
    "amount": 1000,
    "paidBy": "Ishita",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Sabjiyan"
  },
  {
    "id": "seed-exp-013",
    "dateStr": "2026-10-10",
    "expenseTitle": "stationary",
    "amount": 300,
    "paidBy": "Yash",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "menu 1st draft"
  },
  {
    "id": "seed-exp-014",
    "dateStr": "2026-10-10",
    "expenseTitle": "airtel wifi",
    "amount": 2500,
    "paidBy": "Yash",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "wifi"
  },
  {
    "id": "seed-exp-015",
    "dateStr": "2026-10-10",
    "expenseTitle": "Disposables",
    "amount": 14250,
    "paidBy": "Prateek",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "Disposables : 15490-1240"
  },
  {
    "id": "seed-exp-016",
    "dateStr": "2026-10-10",
    "expenseTitle": "Running Expense",
    "amount": 332,
    "paidBy": "Yash",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Running Expense"
  },
  {
    "id": "seed-exp-017",
    "dateStr": "2026-10-10",
    "expenseTitle": "flowers, lights, door stopper",
    "amount": 1840,
    "paidBy": "Yash",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "flowers, lights, door stopper"
  },
  {
    "id": "seed-exp-018",
    "dateStr": "2026-10-10",
    "expenseTitle": "sweets",
    "amount": 1360,
    "paidBy": "Yash",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "radhe sweets"
  },
  {
    "id": "seed-exp-019",
    "dateStr": "2026-10-10",
    "expenseTitle": "blinkit",
    "amount": 383,
    "paidBy": "Yash",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "blinkit"
  },
  {
    "id": "seed-exp-020",
    "dateStr": "2026-10-10",
    "expenseTitle": "Pepsi",
    "amount": 1200,
    "paidBy": "Prateek",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "Freeze Delivery"
  },
  {
    "id": "seed-exp-021",
    "dateStr": "2026-10-11",
    "expenseTitle": "Kirana",
    "amount": 175,
    "paidBy": "Ishita",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Magic Masala"
  },
  {
    "id": "seed-exp-022",
    "dateStr": "2026-10-11",
    "expenseTitle": "Milk",
    "amount": 217,
    "paidBy": "Ishita",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Milks"
  },
  {
    "id": "seed-exp-023",
    "dateStr": "2026-10-11",
    "expenseTitle": "Griller",
    "amount": 5500,
    "paidBy": "Ishita",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "Griller"
  },
  {
    "id": "seed-exp-024",
    "dateStr": "2026-10-11",
    "expenseTitle": "Decor",
    "amount": 2600,
    "paidBy": "Ishita",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "Plants"
  },
  {
    "id": "seed-exp-025",
    "dateStr": "2026-10-11",
    "expenseTitle": "Rajwadi",
    "amount": 75,
    "paidBy": "Prateek",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Maska Bun"
  },
  {
    "id": "seed-exp-026",
    "dateStr": "2026-10-11",
    "expenseTitle": "stationary",
    "amount": 235,
    "paidBy": "Prateek",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Stationary, Notepad, pen, tapes & other stuffs"
  },
  {
    "id": "seed-exp-027",
    "dateStr": "2026-10-11",
    "expenseTitle": "Arbuda Bakery",
    "amount": 105,
    "paidBy": "Prateek",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Milk 70+35"
  },
  {
    "id": "seed-exp-028",
    "dateStr": "2026-10-11",
    "expenseTitle": "blinkit",
    "amount": 153,
    "paidBy": "Yash",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "blinkit"
  },
  {
    "id": "seed-exp-029",
    "dateStr": "2026-10-11",
    "expenseTitle": "panditji",
    "amount": 3100,
    "paidBy": "Yash",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "panditji"
  },
  {
    "id": "seed-exp-030",
    "dateStr": "2026-10-11",
    "expenseTitle": "blinkit",
    "amount": 202,
    "paidBy": "Yash",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "blinkit"
  },
  {
    "id": "seed-exp-031",
    "dateStr": "2026-10-11",
    "expenseTitle": "divyalaxmi bakery",
    "amount": 210,
    "paidBy": "Yash",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "bakery"
  },
  {
    "id": "seed-exp-032",
    "dateStr": "2026-10-12",
    "expenseTitle": "F Minutes",
    "amount": 1504,
    "paidBy": "Ankit",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "Induction, Pizza cutter"
  },
  {
    "id": "seed-exp-033",
    "dateStr": "2026-10-12",
    "expenseTitle": "utensil",
    "amount": 180,
    "paidBy": "Ishita",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "Jug and sauce bottles"
  },
  {
    "id": "seed-exp-034",
    "dateStr": "2026-10-12",
    "expenseTitle": "Dustbins & co",
    "amount": 730,
    "paidBy": "Ishita",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "Dustbin and basket"
  },
  {
    "id": "seed-exp-035",
    "dateStr": "2026-10-12",
    "expenseTitle": "stationary",
    "amount": 10,
    "paidBy": "Ishita",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "Marker"
  },
  {
    "id": "seed-exp-036",
    "dateStr": "2026-10-12",
    "expenseTitle": "Blinkit",
    "amount": 2543,
    "paidBy": "Prateek",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "CCTV and Slipper"
  },
  {
    "id": "seed-exp-037",
    "dateStr": "2026-10-12",
    "expenseTitle": "shubhlaxmi bakery",
    "amount": 335,
    "paidBy": "Yash",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "shubhlaxmi bakery"
  },
  {
    "id": "seed-exp-038",
    "dateStr": "2026-10-12",
    "expenseTitle": "milk",
    "amount": 840,
    "paidBy": "Yash",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "milk from side"
  },
  {
    "id": "seed-exp-039",
    "dateStr": "2026-10-13",
    "expenseTitle": "Blinkit",
    "amount": 236,
    "paidBy": "Prateek",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Milk and lemon"
  },
  {
    "id": "seed-exp-040",
    "dateStr": "2026-10-13",
    "expenseTitle": "Pan Parlour",
    "amount": 20,
    "paidBy": "Prateek",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Thumbs Up"
  },
  {
    "id": "seed-exp-041",
    "dateStr": "2026-10-13",
    "expenseTitle": "Blinkit",
    "amount": 552,
    "paidBy": "Prateek",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Butter, Cheese slice, carrot, cream"
  },
  {
    "id": "seed-exp-042",
    "dateStr": "2026-10-13",
    "expenseTitle": "Dmart",
    "amount": 150,
    "paidBy": "Ishita",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Mayo"
  },
  {
    "id": "seed-exp-043",
    "dateStr": "2026-10-13",
    "expenseTitle": "Bakery",
    "amount": 190,
    "paidBy": "Ishita",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Bread"
  },
  {
    "id": "seed-exp-044",
    "dateStr": "2026-10-13",
    "expenseTitle": "utensil",
    "amount": 968,
    "paidBy": "Ishita",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "patila, chopping board"
  },
  {
    "id": "seed-exp-045",
    "dateStr": "2026-10-13",
    "expenseTitle": "Parcel box",
    "amount": 200,
    "paidBy": "Ishita",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Sandwich parcel"
  },
  {
    "id": "seed-exp-046",
    "dateStr": "2026-10-13",
    "expenseTitle": "Chandu di",
    "amount": 175,
    "paidBy": "Prateek",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Milk"
  },
  {
    "id": "seed-exp-047",
    "dateStr": "2026-10-13",
    "expenseTitle": "zepto",
    "amount": 725,
    "paidBy": "Yash",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "zepto"
  },
  {
    "id": "seed-exp-048",
    "dateStr": "2026-10-13",
    "expenseTitle": "zepto",
    "amount": 198,
    "paidBy": "Yash",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "zepto"
  },
  {
    "id": "seed-exp-049",
    "dateStr": "2026-10-14",
    "expenseTitle": "Zepto",
    "amount": 225,
    "paidBy": "Ishita",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Unsalted butter"
  },
  {
    "id": "seed-exp-050",
    "dateStr": "2026-10-14",
    "expenseTitle": "Bakery",
    "amount": 395,
    "paidBy": "Ishita",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Garlic Bread, Breads"
  },
  {
    "id": "seed-exp-051",
    "dateStr": "2026-10-14",
    "expenseTitle": "Zepto",
    "amount": 398,
    "paidBy": "Ishita",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Paneer"
  },
  {
    "id": "seed-exp-052",
    "dateStr": "2026-10-14",
    "expenseTitle": "Rajwadi",
    "amount": 75,
    "paidBy": "Prateek",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Bun Maska"
  },
  {
    "id": "seed-exp-053",
    "dateStr": "2026-10-14",
    "expenseTitle": "Rajwadi",
    "amount": 420,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "cash",
    "note": "Milk * 12"
  },
  {
    "id": "seed-exp-054",
    "dateStr": "2026-10-14",
    "expenseTitle": "milk",
    "amount": 420,
    "paidBy": "Yash",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "milk from side"
  },
  {
    "id": "seed-exp-055",
    "dateStr": "2026-10-15",
    "expenseTitle": "fresh cream",
    "amount": 75,
    "paidBy": "Yash",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "fresh cream"
  },
  {
    "id": "seed-exp-056",
    "dateStr": "2026-10-15",
    "expenseTitle": "Maska bun",
    "amount": 150,
    "paidBy": "Yash",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Maska bun"
  },
  {
    "id": "seed-exp-057",
    "dateStr": "2026-10-15",
    "expenseTitle": "Milk",
    "amount": 210,
    "paidBy": "Yash",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Milk"
  },
  {
    "id": "seed-exp-058",
    "dateStr": "2026-10-15",
    "expenseTitle": "Bakery",
    "amount": 380,
    "paidBy": "Yash",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Bread , sauce"
  },
  {
    "id": "seed-exp-059",
    "dateStr": "2026-10-15",
    "expenseTitle": "chini",
    "amount": 30,
    "paidBy": "Yash",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "chini"
  },
  {
    "id": "seed-exp-060",
    "dateStr": "2026-10-15",
    "expenseTitle": "Zepto",
    "amount": 155,
    "paidBy": "Prateek",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Garbage bag, cucumber, ginger"
  },
  {
    "id": "seed-exp-061",
    "dateStr": "2026-10-15",
    "expenseTitle": "Zepto",
    "amount": 310,
    "paidBy": "Prateek",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Garbage bag, chilly, refined"
  },
  {
    "id": "seed-exp-062",
    "dateStr": "2026-10-15",
    "expenseTitle": "Fries",
    "amount": 416,
    "paidBy": "Ishita",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "French fries"
  },
  {
    "id": "seed-exp-063",
    "dateStr": "2026-10-16",
    "expenseTitle": "Milk",
    "amount": 630,
    "paidBy": "Yash",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Milk"
  },
  {
    "id": "seed-exp-064",
    "dateStr": "2026-10-16",
    "expenseTitle": "Dmart",
    "amount": 1480,
    "paidBy": "Ishita",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Fries, Refined, garlic bread, milk"
  },
  {
    "id": "seed-exp-065",
    "dateStr": "2026-10-16",
    "expenseTitle": "Laxmi",
    "amount": 400,
    "paidBy": "Prateek",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Bread"
  },
  {
    "id": "seed-exp-066",
    "dateStr": "2026-10-16",
    "expenseTitle": "Blinkit",
    "amount": 408,
    "paidBy": "Yash",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Adrak, nimbu, miz cheese, pow sugar"
  },
  {
    "id": "seed-exp-067",
    "dateStr": "2026-10-16",
    "expenseTitle": "HyperPure",
    "amount": 6810,
    "paidBy": "Prateek",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Sauces, Fries, Premix, Coffee"
  },
  {
    "id": "seed-exp-068",
    "dateStr": "2026-10-16",
    "expenseTitle": "Dmart",
    "amount": 712,
    "paidBy": "Yash",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Sugar, Juna, Butter"
  },
  {
    "id": "seed-exp-069",
    "dateStr": "2026-10-16",
    "expenseTitle": "Laxmi Bakery",
    "amount": 292,
    "paidBy": "Yash",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Sauces"
  },
  {
    "id": "seed-exp-070",
    "dateStr": "2026-10-16",
    "expenseTitle": "zepto",
    "amount": 58,
    "paidBy": "Yash",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "cucumber, mint leaves"
  },
  {
    "id": "seed-exp-071",
    "dateStr": "2026-10-17",
    "expenseTitle": "Rajwadi",
    "amount": 355,
    "paidBy": "Prateek",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Milk , Maska bun"
  },
  {
    "id": "seed-exp-072",
    "dateStr": "2026-10-17",
    "expenseTitle": "Disposables",
    "amount": 1730,
    "paidBy": "Prateek",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Square plate, ripple cup, spoon and forks"
  },
  {
    "id": "seed-exp-073",
    "dateStr": "2026-10-17",
    "expenseTitle": "blinkit",
    "amount": 336,
    "paidBy": "Prateek",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Onion, Capsicum, ginger, cabbage"
  },
  {
    "id": "seed-exp-074",
    "dateStr": "2026-10-17",
    "expenseTitle": "Cash",
    "amount": 388,
    "paidBy": "Yuvraj",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "Added coins into the counter"
  },
  {
    "id": "seed-exp-075",
    "dateStr": "2026-10-17",
    "expenseTitle": "amazon Pay",
    "amount": 303,
    "paidBy": "Prateek",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Bru instant"
  },
  {
    "id": "seed-exp-076",
    "dateStr": "2026-10-17",
    "expenseTitle": "Stationary",
    "amount": 145,
    "paidBy": "Prateek",
    "expenseType": "initial",
    "paymentMode": "personal",
    "note": "Tape cutter"
  },
  {
    "id": "seed-exp-077",
    "dateStr": "2026-10-17",
    "expenseTitle": "Blinkit",
    "amount": 345,
    "paidBy": "Prateek",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Amul Butter"
  },
  {
    "id": "seed-exp-078",
    "dateStr": "2026-10-17",
    "expenseTitle": "Bakery",
    "amount": 95,
    "paidBy": "Yuvraj",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Bread"
  },
  {
    "id": "seed-exp-079",
    "dateStr": "2026-10-17",
    "expenseTitle": "dwarkesh",
    "amount": 560,
    "paidBy": "Ishita",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Milk"
  },
  {
    "id": "seed-exp-080",
    "dateStr": "2026-10-17",
    "expenseTitle": "Big basket",
    "amount": 239,
    "paidBy": "Prateek",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Lemon Iced Tea, Cucumber, tomato, ginger"
  },
  {
    "id": "seed-exp-081",
    "dateStr": "2026-10-18",
    "expenseTitle": "Blinkit",
    "amount": 180,
    "paidBy": "Prateek",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Garlic Bread, Mozz cheese"
  },
  {
    "id": "seed-exp-082",
    "dateStr": "2026-10-18",
    "expenseTitle": "Rajwadi",
    "amount": 420,
    "paidBy": "Prateek",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Milk"
  },
  {
    "id": "seed-exp-083",
    "dateStr": "2026-10-18",
    "expenseTitle": "zepto",
    "amount": 412,
    "paidBy": "Prateek",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Garlic Bread, Milk, capsicum, chilly, coriander"
  },
  {
    "id": "seed-exp-084",
    "dateStr": "2026-10-18",
    "expenseTitle": "amazon now",
    "amount": 760,
    "paidBy": "Yash",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Butter x2 and something"
  },
  {
    "id": "seed-exp-085",
    "dateStr": "2026-10-18",
    "expenseTitle": "patel disposable",
    "amount": 5200,
    "paidBy": "Yash",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "cold coffee cups and rectangular plates"
  },
  {
    "id": "seed-exp-086",
    "dateStr": "2026-10-18",
    "expenseTitle": "shubhlaxmi bakery",
    "amount": 285,
    "paidBy": "Yash",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "bread"
  },
  {
    "id": "seed-exp-087",
    "dateStr": "2026-10-18",
    "expenseTitle": "d mart",
    "amount": 150,
    "paidBy": "Yash",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "sugar"
  },
  {
    "id": "seed-exp-088",
    "dateStr": "2026-10-19",
    "expenseTitle": "divyalaxmi bakery",
    "amount": 300,
    "paidBy": "Yash",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "bread"
  },
  {
    "id": "seed-exp-089",
    "dateStr": "2026-10-19",
    "expenseTitle": "Zepto",
    "amount": 670,
    "paidBy": "Yash",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Butter and Milk"
  },
  {
    "id": "seed-exp-090",
    "dateStr": "2026-10-20",
    "expenseTitle": "Amazon now",
    "amount": 300,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "subzi and maggie"
  },
  {
    "id": "seed-exp-091",
    "dateStr": "2026-10-20",
    "expenseTitle": "Katori",
    "amount": 200,
    "paidBy": "Cafe",
    "expenseType": "initial",
    "paymentMode": "cash",
    "note": "Katori"
  },
  {
    "id": "seed-exp-092",
    "dateStr": "2026-10-20",
    "expenseTitle": "Milk",
    "amount": 420,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "cash",
    "note": "Milk"
  },
  {
    "id": "seed-exp-093",
    "dateStr": "2026-10-20",
    "expenseTitle": "zepto",
    "amount": 427,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "milk and ginger"
  },
  {
    "id": "seed-exp-094",
    "dateStr": "2026-10-21",
    "expenseTitle": "divyalaxmi bakery",
    "amount": 300,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "bread"
  },
  {
    "id": "seed-exp-095",
    "dateStr": "2026-10-21",
    "expenseTitle": "d mart",
    "amount": 519,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "maggi, butter"
  },
  {
    "id": "seed-exp-096",
    "dateStr": "2026-10-21",
    "expenseTitle": "electrical",
    "amount": 880,
    "paidBy": "Cafe",
    "expenseType": "initial",
    "paymentMode": "upi",
    "note": "outside light pipe"
  },
  {
    "id": "seed-exp-097",
    "dateStr": "2026-10-21",
    "expenseTitle": "Cash",
    "amount": 266,
    "paidBy": "Prateek",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Added some cash to the counter"
  },
  {
    "id": "seed-exp-098",
    "dateStr": "2026-10-21",
    "expenseTitle": "Milk",
    "amount": 420,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "cash",
    "note": "Milk"
  },
  {
    "id": "seed-exp-099",
    "dateStr": "2026-10-22",
    "expenseTitle": "Amazon now",
    "amount": 100,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "adrak and lemon"
  },
  {
    "id": "seed-exp-100",
    "dateStr": "2026-10-22",
    "expenseTitle": "hyperpure",
    "amount": 3572,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "credit_card",
    "note": "Order ID. 31481891"
  },
  {
    "id": "seed-exp-101",
    "dateStr": "2026-10-22",
    "expenseTitle": "blinkit",
    "amount": 1245,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "credit_card",
    "note": "Butter , unsalted butter , corn"
  },
  {
    "id": "seed-exp-102",
    "dateStr": "2026-10-22",
    "expenseTitle": "zepto",
    "amount": 124,
    "paidBy": "Ishita",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "ginger"
  },
  {
    "id": "seed-exp-103",
    "dateStr": "2026-10-22",
    "expenseTitle": "rajwadi",
    "amount": 510,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "cash",
    "note": "milk and bun"
  },
  {
    "id": "seed-exp-104",
    "dateStr": "2026-10-23",
    "expenseTitle": "rajwadi",
    "amount": 560,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "cash",
    "note": "Milk"
  },
  {
    "id": "seed-exp-105",
    "dateStr": "2026-10-23",
    "expenseTitle": "Laxmi",
    "amount": 190,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "cash",
    "note": "Bread"
  },
  {
    "id": "seed-exp-106",
    "dateStr": "2026-10-23",
    "expenseTitle": "Zepto",
    "amount": 198,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "cash",
    "note": "Cucumber, capsicum, onion"
  },
  {
    "id": "seed-exp-107",
    "dateStr": "2026-10-23",
    "expenseTitle": "Zepto",
    "amount": 253,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "cash",
    "note": "Garbage Bags"
  },
  {
    "id": "seed-exp-108",
    "dateStr": "2026-10-24",
    "expenseTitle": "zepto",
    "amount": 158,
    "paidBy": "Yash",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "ice cubes"
  },
  {
    "id": "seed-exp-109",
    "dateStr": "2026-10-24",
    "expenseTitle": "DMart",
    "amount": 2761.5,
    "paidBy": "Prateek",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Sunrise, Safolla, maggi, garlic bread, diet coke, coke, pepsi"
  },
  {
    "id": "seed-exp-110",
    "dateStr": "2026-10-24",
    "expenseTitle": "DMart",
    "amount": 241,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "Nuggets extra"
  },
  {
    "id": "seed-exp-111",
    "dateStr": "2026-10-24",
    "expenseTitle": "Blinkit",
    "amount": 860,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "credit_card",
    "note": "Lemon Ice tea, Rice, ice, corn, falafel"
  },
  {
    "id": "seed-exp-112",
    "dateStr": "2026-10-24",
    "expenseTitle": "rajwadi",
    "amount": 630,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "cash",
    "note": "rajwadi"
  },
  {
    "id": "seed-exp-113",
    "dateStr": "2026-10-24",
    "expenseTitle": "Milk",
    "amount": 210,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "cash",
    "note": "Milk 6 packets"
  },
  {
    "id": "seed-exp-114",
    "dateStr": "2026-10-25",
    "expenseTitle": "d mart",
    "amount": 824,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "sugar and cheese (1 kg)"
  },
  {
    "id": "seed-exp-115",
    "dateStr": "2026-10-25",
    "expenseTitle": "laxmi",
    "amount": 285,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "cash",
    "note": "bread 3 packets"
  },
  {
    "id": "seed-exp-116",
    "dateStr": "2026-10-25",
    "expenseTitle": "Blinkit",
    "amount": 639,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "credit_card",
    "note": "Prateek's -> Milk, cucumber, cabbage, garlic"
  },
  {
    "id": "seed-exp-117",
    "dateStr": "2026-10-25",
    "expenseTitle": "hyperpure",
    "amount": 3018.12,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "credit_card",
    "note": "Order no. 31583461"
  },
  {
    "id": "seed-exp-118",
    "dateStr": "2026-10-25",
    "expenseTitle": "hyperpure",
    "amount": 836.1,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "credit_card",
    "note": "Order no. 31585090"
  },
  {
    "id": "seed-exp-119",
    "dateStr": "2026-10-25",
    "expenseTitle": "capsicum , khari",
    "amount": 150,
    "paidBy": "Ishita",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "capsicum , khari"
  },
  {
    "id": "seed-exp-120",
    "dateStr": "2026-10-25",
    "expenseTitle": "Table",
    "amount": 1500,
    "paidBy": "Ishita",
    "expenseType": "initial",
    "paymentMode": "cash",
    "note": "Table"
  },
  {
    "id": "seed-exp-121",
    "dateStr": "2026-10-10",
    "expenseTitle": "Blessings ( kinar )",
    "amount": 11000,
    "paidBy": "Ishita",
    "expenseType": "initial",
    "paymentMode": "cash",
    "note": "Blessings ( kinar )"
  },
  {
    "id": "seed-exp-122",
    "dateStr": "2026-10-10",
    "expenseTitle": "deposit",
    "amount": 55000,
    "paidBy": "Ishita",
    "expenseType": "initial",
    "paymentMode": "cash",
    "note": "Deposit"
  },
  {
    "id": "seed-exp-123",
    "dateStr": "2026-10-25",
    "expenseTitle": "Adrak",
    "amount": 60,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "cash",
    "note": "Adrak"
  },
  {
    "id": "seed-exp-124",
    "dateStr": "2026-10-08",
    "expenseTitle": "deposit + agreement",
    "amount": 50100,
    "paidBy": "Ishita",
    "expenseType": "initial",
    "paymentMode": "upi",
    "note": "Deposit + agreement"
  },
  {
    "id": "seed-exp-125",
    "dateStr": "2026-10-10",
    "expenseTitle": "v mart",
    "amount": 95,
    "paidBy": "Ishita",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "Glass cleaner ( kolin)"
  },
  {
    "id": "seed-exp-126",
    "dateStr": "2026-10-10",
    "expenseTitle": "city square mart",
    "amount": 480,
    "paidBy": "Ishita",
    "expenseType": "initial",
    "paymentMode": "upi",
    "note": "container , utensil , remaining dmart saman"
  },
  {
    "id": "seed-exp-127",
    "dateStr": "2026-10-26",
    "expenseTitle": "bread",
    "amount": 500,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "cash",
    "note": "bread and garlic"
  },
  {
    "id": "seed-exp-128",
    "dateStr": "2026-10-26",
    "expenseTitle": "dispossals",
    "amount": 215,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "dispossals"
  },
  {
    "id": "seed-exp-129",
    "dateStr": "2026-10-26",
    "expenseTitle": "DMart",
    "amount": 507,
    "paidBy": "Ishita",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "Maggi, Mozz cheese"
  },
  {
    "id": "seed-exp-130",
    "dateStr": "2026-10-26",
    "expenseTitle": "Veg",
    "amount": 60,
    "paidBy": "Ishita",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "Capsicum"
  },
  {
    "id": "seed-exp-131",
    "dateStr": "2026-10-26",
    "expenseTitle": "Dwarkesh",
    "amount": 280,
    "paidBy": "Yash",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "Dwarkesh"
  },
  {
    "id": "seed-exp-132",
    "dateStr": "2026-10-26",
    "expenseTitle": "Blinkit",
    "amount": 174,
    "paidBy": "Ishita",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "Ginger, milk, tomato, mint"
  },
  {
    "id": "seed-exp-133",
    "dateStr": "2026-10-26",
    "expenseTitle": "Petrol",
    "amount": 600,
    "paidBy": "Prateek",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Pulsar -> 200*3"
  },
  {
    "id": "seed-exp-134",
    "dateStr": "2026-10-27",
    "expenseTitle": "rajvadi",
    "amount": 635,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "cash",
    "note": "16 milk, 5 maska bun"
  },
  {
    "id": "seed-exp-135",
    "dateStr": "2026-10-27",
    "expenseTitle": "stationary",
    "amount": 50,
    "paidBy": "Yash",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "diary"
  },
  {
    "id": "seed-exp-136",
    "dateStr": "2026-10-27",
    "expenseTitle": "zepto",
    "amount": 191,
    "paidBy": "Yash",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "adrak, diary, paneer"
  },
  {
    "id": "seed-exp-137",
    "dateStr": "2026-10-27",
    "expenseTitle": "pan parlour",
    "amount": 350,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "cash",
    "note": "10 milk packets"
  },
  {
    "id": "seed-exp-138",
    "dateStr": "2026-10-27",
    "expenseTitle": "zepto",
    "amount": 215,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "lemon, capsicum, cucumber, garlic bread"
  },
  {
    "id": "seed-exp-139",
    "dateStr": "2026-10-28",
    "expenseTitle": "laxmi bakery",
    "amount": 190,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "bread"
  },
  {
    "id": "seed-exp-140",
    "dateStr": "2026-10-28",
    "expenseTitle": "disposal",
    "amount": 2640,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "400 cofee and 2000 tea cups"
  },
  {
    "id": "seed-exp-141",
    "dateStr": "2026-10-28",
    "expenseTitle": "dmart",
    "amount": 1310,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "Paneer , garlic bread , spoons , cheeze , corn"
  },
  {
    "id": "seed-exp-142",
    "dateStr": "2026-10-28",
    "expenseTitle": "rajwadi",
    "amount": 495,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "cash",
    "note": "milk (12)  And 5 maska bun"
  },
  {
    "id": "seed-exp-143",
    "dateStr": "2026-10-27",
    "expenseTitle": "rajeev bhaiya",
    "amount": 2000,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "rajeev bhaiya ticket"
  },
  {
    "id": "seed-exp-144",
    "dateStr": "2026-10-29",
    "expenseTitle": "rajwadi",
    "amount": 460,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "cash",
    "note": "12 milk and 3 maska bun"
  },
  {
    "id": "seed-exp-145",
    "dateStr": "2026-10-29",
    "expenseTitle": "zepto",
    "amount": 323,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "cucmber, tomato, onion, ginger"
  },
  {
    "id": "seed-exp-146",
    "dateStr": "2026-10-29",
    "expenseTitle": "hyperpure",
    "amount": 3380,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "credit_card",
    "note": "hyperpure"
  },
  {
    "id": "seed-exp-147",
    "dateStr": "2026-10-30",
    "expenseTitle": "rajwadi",
    "amount": 495,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "cash",
    "note": "12 mil and 5 buns"
  },
  {
    "id": "seed-exp-148",
    "dateStr": "2026-10-30",
    "expenseTitle": "dmart",
    "amount": 1450,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "cabbage abd dmart"
  },
  {
    "id": "seed-exp-149",
    "dateStr": "2026-10-30",
    "expenseTitle": "laxmi bakery",
    "amount": 380,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "cash",
    "note": "4 bread"
  },
  {
    "id": "seed-exp-150",
    "dateStr": "2026-10-31",
    "expenseTitle": "laxmi dispossals",
    "amount": 430,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "strawa and bowls"
  },
  {
    "id": "seed-exp-151",
    "dateStr": "2026-10-31",
    "expenseTitle": "essentials",
    "amount": 377,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "vanila ice cream , ginger , milk"
  },
  {
    "id": "seed-exp-152",
    "dateStr": "2026-10-31",
    "expenseTitle": "zepto",
    "amount": 243,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "vim , vegetables"
  },
  {
    "id": "seed-exp-153",
    "dateStr": "2026-10-31",
    "expenseTitle": "Laxmi bakery",
    "amount": 55,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "garlic bread"
  },
  {
    "id": "seed-exp-154",
    "dateStr": "2026-10-31",
    "expenseTitle": "rajwadi",
    "amount": 560,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "cash",
    "note": "16 packet milk"
  },
  {
    "id": "seed-exp-155",
    "dateStr": "2026-11-01",
    "expenseTitle": "rajwadi",
    "amount": 525,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "cash",
    "note": "12 milk and 7 bun"
  },
  {
    "id": "seed-exp-156",
    "dateStr": "2026-11-01",
    "expenseTitle": "D mart",
    "amount": 3210,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "kuch kuch to aaya hai"
  },
  {
    "id": "seed-exp-157",
    "dateStr": "2026-11-01",
    "expenseTitle": "dwarkesh",
    "amount": 350,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "milk *10"
  },
  {
    "id": "seed-exp-158",
    "dateStr": "2026-11-03",
    "expenseTitle": "cream",
    "amount": 100,
    "paidBy": "Ishita",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "cream"
  },
  {
    "id": "seed-exp-159",
    "dateStr": "2026-11-02",
    "expenseTitle": "hyperpure",
    "amount": 4263,
    "paidBy": "Ishita",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "hyperpure"
  },
  {
    "id": "seed-exp-160",
    "dateStr": "2026-11-10",
    "expenseTitle": "Cafe Staff",
    "amount": 5000,
    "paidBy": "Cafe",
    "expenseType": "running",
    "paymentMode": "upi",
    "note": "Paid to Rajeev Bhai (on Manish bhai's UPI)"
  },
  {
    "id": "seed-exp-161",
    "dateStr": "2026-11-21",
    "expenseTitle": "Hyperpure",
    "amount": 2632,
    "paidBy": "Prateek",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Hyperpure"
  },
  {
    "id": "seed-exp-162",
    "dateStr": "2026-11-22",
    "expenseTitle": "Hyperpure",
    "amount": 1578,
    "paidBy": "Prateek",
    "expenseType": "running",
    "paymentMode": "personal",
    "note": "Hyperpure"
  }
];

export function buildInitialSeedLedgerEntries(cafeId: string): LedgerEntry[] {
  return INITIAL_EXPENSE_SEED_ROWS.map((row, idx) => ({
    id: row.id,
    cafeId,
    kind: "expenditure",
    amount: row.amount,
    paymentMode: row.paymentMode,
    expenseType: row.expenseType,
    paidBy: row.paidBy,
    expenseTitle: row.expenseTitle,
    note: row.note,
    dateStr: row.dateStr,
    createdAt: `${row.dateStr}T12:${String(Math.floor(idx / 60)).padStart(2, "0")}:${String(idx % 60).padStart(2, "0")}.000Z`,
    createdByUid: "seed-import",
    createdByName: "Expense Sheet Import",
  }));
}
