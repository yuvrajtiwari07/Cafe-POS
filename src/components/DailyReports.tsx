import React, { useEffect, useMemo, useState } from 'react';
import {
  Printer,
  Calendar,
  Banknote,
  Award,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Search,
  Wallet,
} from 'lucide-react';
import { Bill, Cafe, LedgerEntry, PrinterConfig, WalletOpeningBalances } from '../types';
import {
  connectBluetoothPrinter,
  generateZReportBuffer,
  isBluetoothConnected,
  printToBluetoothDevice,
} from '../services/escpos';
import {
  addDaysToLocalDateStr,
  formatBusinessDayRange,
  formatHumanDate,
  getBusinessDateStr,
  getCurrentBusinessDateStr,
} from '../utils/dateUtils';
import { computeWalletSummary } from '../utils/walletBalances';

interface DailyReportsProps {
  cafe: Cafe;
  bills: Bill[];
  printerConfig: PrinterConfig;
  ledger?: LedgerEntry[];
  openingBalances?: WalletOpeningBalances;
  onOpenExpensesDrawer?: () => void;
}

export const DailyReports: React.FC<DailyReportsProps> = ({
  cafe,
  bills,
  printerConfig,
  ledger = [],
  openingBalances = { cash: 0, upi: 0, creditCard: 0 },
  onOpenExpensesDrawer,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    getCurrentBusinessDateStr(cafe.openingTime, cafe.closingTime)
  );
  const [itemSearch, setItemSearch] = useState<string>('');
  const [itemSortBy, setItemSortBy] = useState<'qty' | 'revenue' | 'name'>('qty');
  const [isPrintingZ, setIsPrintingZ] = useState<boolean>(false);
  const [zPrintStatus, setZPrintStatus] = useState<string | null>(null);

  const todayStr = getCurrentBusinessDateStr(cafe.openingTime, cafe.closingTime);

  useEffect(() => {
    setSelectedDate(getCurrentBusinessDateStr(cafe.openingTime, cafe.closingTime));
  }, [cafe.id, cafe.openingTime, cafe.closingTime]);

  const shiftWindowLabel = formatBusinessDayRange(selectedDate, cafe.openingTime, cafe.closingTime);

  // Compute daily metrics for selected business date (respecting cafe opening & closing times)
  const metrics = useMemo(() => {
    const dayBills = bills.filter(
      (b) => getBusinessDateStr(b.createdAt, cafe.openingTime, cafe.closingTime) === selectedDate && b.status === 'paid'
    );

    const totalBills = dayBills.length;
    const grossSales = dayBills.reduce((s, b) => s + b.subtotal, 0);
    const totalDiscounts = dayBills.reduce((s, b) => s + b.discountAmount, 0);
    const totalTax = dayBills.reduce((s, b) => s + b.taxAmount, 0);
    const netRevenue = dayBills.reduce((s, b) => s + b.grandTotal, 0);

    let upiSales = 0;
    let cashSales = 0;
    let cardSales = 0;
    let upiCount = 0;
    let cashCount = 0;
    let cardCount = 0;

    dayBills.forEach((b) => {
      if (b.paymentMode === 'upi') {
        upiSales += b.grandTotal;
        upiCount++;
      } else if (b.paymentMode === 'cash') {
        cashSales += b.grandTotal;
        cashCount++;
      } else if (b.paymentMode === 'card') {
        cardSales += b.grandTotal;
        cardCount++;
      } else if (b.paymentMode === 'split' && b.splitDetails) {
        if ((b.splitDetails.upi || 0) > 0) {
          upiSales += b.splitDetails.upi || 0;
          upiCount++;
        }
        if ((b.splitDetails.cash || 0) > 0) {
          cashSales += b.splitDetails.cash || 0;
          cashCount++;
        }
        if ((b.splitDetails.card || 0) > 0) {
          cardSales += b.splitDetails.card || 0;
          cardCount++;
        }
      }
    });

    const averageBill = totalBills > 0 ? netRevenue / totalBills : 0;

    // ALL sold items for the selected date (grouped by dish name)
    const itemMap: { [name: string]: { quantity: number; revenue: number } } = {};
    let totalUnitsSold = 0;

    dayBills.forEach((b) => {
      (b.items || []).forEach((item) => {
        const key = item.name || 'Item';
        const qty = item.quantity || 1;
        if (!itemMap[key]) {
          itemMap[key] = { quantity: 0, revenue: 0 };
        }
        itemMap[key].quantity += qty;
        itemMap[key].revenue += (item.price || 0) * qty;
        totalUnitsSold += qty;
      });
    });

    const allItems = Object.entries(itemMap)
      .map(([name, data]) => ({
        name,
        quantity: data.quantity,
        revenue: data.revenue,
      }))
      .sort((a, b) => b.quantity - a.quantity);

    // Staff Performance calculation
    const staffMap: { [key: string]: any } = {};
    dayBills.forEach((b) => {
      const key = b.cashierEmail || b.cashierId || b.cashierName || 'Unknown';
      if (!staffMap[key]) {
        staffMap[key] = {
          name: b.cashierName || 'Cashier',
          email: b.cashierEmail || 'No email',
          billsCount: 0,
          totalSales: 0,
          upiSales: 0,
          cashSales: 0,
          cardSales: 0,
        };
      }
      staffMap[key].billsCount++;
      staffMap[key].totalSales += b.grandTotal;
      if (b.paymentMode === 'upi') {
        staffMap[key].upiSales += b.grandTotal;
      } else if (b.paymentMode === 'cash') {
        staffMap[key].cashSales += b.grandTotal;
      } else if (b.paymentMode === 'card') {
        staffMap[key].cardSales += b.grandTotal;
      } else if (b.paymentMode === 'split' && b.splitDetails) {
        staffMap[key].cashSales += b.splitDetails.cash || 0;
        staffMap[key].upiSales += b.splitDetails.upi || 0;
        staffMap[key].cardSales += b.splitDetails.card || 0;
      }
    });

    const staffList = Object.values(staffMap).sort((a: any, b: any) => b.totalSales - a.totalSales);

    return {
      date: selectedDate,
      shiftWindow: shiftWindowLabel,
      totalBills,
      grossSales,
      totalDiscounts,
      totalTax,
      netRevenue,
      upiSales,
      upiCount,
      cashSales,
      cashCount,
      cardSales,
      cardCount,
      averageBill,
      totalUnitsSold,
      topItems: allItems,
      allItems,
      staffList,
    };
  }, [bills, selectedDate, cafe.openingTime, cafe.closingTime, shiftWindowLabel]);

  // Daily wallet / expenses breakdown for selectedDate
  const dailyWallet = useMemo(
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

  // Filtered and sorted complete items list
  const displayedItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    const list = q
      ? metrics.allItems.filter((item) => item.name.toLowerCase().includes(q))
      : [...metrics.allItems];

    if (itemSortBy === 'revenue') {
      list.sort((a, b) => b.revenue - a.revenue);
    } else if (itemSortBy === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list.sort((a, b) => b.quantity - a.quantity);
    }
    return list;
  }, [metrics.allItems, itemSearch, itemSortBy]);

  // Handle printing Day-End Z-Report
  const handlePrintZReport = async () => {
    setIsPrintingZ(true);
    setZPrintStatus(null);

    try {
      if (isBluetoothConnected()) {
        const buffer = generateZReportBuffer(metrics, cafe, printerConfig.paperWidth);
        await printToBluetoothDevice(buffer);
        setZPrintStatus('Day-End Z-Report dispatched to Bluetooth thermal printer!');
      } else if (printerConfig.isSimulated) {
        await new Promise((r) => setTimeout(r, 1200));
        setZPrintStatus('Day-End Z-Report generated and printed via Simulator.');
      } else {
        setZPrintStatus('Choose your Bluetooth thermal printer to print Z-Report...');
        await connectBluetoothPrinter();
        const buffer = generateZReportBuffer(metrics, cafe, printerConfig.paperWidth);
        await printToBluetoothDevice(buffer);
        setZPrintStatus('Day-End Z-Report dispatched to Bluetooth thermal printer!');
      }
    } catch (err: any) {
      setZPrintStatus(err.message || 'Failed to print Z-Report. Check printer connection.');
    } finally {
      setIsPrintingZ(false);
    }
  };

  const totalTender = metrics.netRevenue || 1;
  const upiPercent = Math.round((metrics.upiSales / totalTender) * 100);
  const cashPercent = Math.round((metrics.cashSales / totalTender) * 100);
  const cardPercent = Math.round((metrics.cardSales / totalTender) * 100);

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-3 sm:py-4 space-y-4">
      {/* Header with Enhanced Date Navigation & Z-Report Print */}
      <div className="bg-[#fffbf5] p-3 sm:p-4 rounded-2xl border border-[#eedecb] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[#2b2320]">
            Daily Financial Reports & Z-Report
          </h2>
          <p className="text-xs text-[#7d6e67]">
            Business Day <strong className="text-[#2b2320]">{formatHumanDate(selectedDate)}</strong> · Shift:{' '}
            <strong className="text-[#ea580c]">{shiftWindowLabel}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Date Picker with Stepper Controls */}
          <div className="flex items-center gap-1 bg-[#f4ebe1] px-2 py-1 rounded-xl border border-[#e3d3c2]">
            <button
              type="button"
              onClick={() => setSelectedDate((d) => addDaysToLocalDateStr(d, -1))}
              className="p-1 text-[#7d6e67] hover:text-[#2b2320] hover:bg-white rounded-lg transition cursor-pointer"
              title="Previous Day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <Calendar className="w-3.5 h-3.5 text-[#ea580c] ml-1 shrink-0" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value || getCurrentBusinessDateStr(cafe.openingTime, cafe.closingTime))}
              className="bg-transparent text-xs font-bold text-[#2b2320] outline-hidden cursor-pointer px-1"
              aria-label="Select report date"
            />

            <button
              type="button"
              onClick={() => setSelectedDate((d) => addDaysToLocalDateStr(d, 1))}
              className="p-1 text-[#7d6e67] hover:text-[#2b2320] hover:bg-white rounded-lg transition cursor-pointer"
              title="Next Day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {selectedDate !== todayStr && (
              <button
                type="button"
                onClick={() => setSelectedDate(todayStr)}
                className="ml-1 px-2 py-1 rounded-lg bg-white text-[#ea580c] text-[11px] font-bold hover:bg-orange-50 transition cursor-pointer"
              >
                Today
              </button>
            )}
          </div>

          {/* Print Z-Report Slip */}
          <button
            onClick={handlePrintZReport}
            disabled={isPrintingZ || metrics.totalBills === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#ea580c] hover:bg-[#c2410c] text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50 whitespace-nowrap"
            title="Prints official Day-End Z-Report roll on thermal printer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{isPrintingZ ? 'Printing Z-Slip...' : 'Print Day-End Z-Report'}</span>
          </button>
        </div>
      </div>

      {zPrintStatus && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{zPrintStatus}</span>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Net Revenue */}
        <div className="bg-[#fffbf5] p-3.5 rounded-2xl border border-[#eedecb] shadow-xs">
          <span className="text-[11px] font-semibold text-[#7d6e67] block">Net Settled Revenue</span>
          <span className="text-xl sm:text-2xl font-extrabold text-[#ea580c] mt-1 block tabular-nums">
            ₹{metrics.netRevenue.toFixed(0)}
          </span>
          <span className="text-[10px] text-[#7d6e67] mt-0.5 block tabular-nums">
            Gross: ₹{metrics.grossSales.toFixed(0)} · Tax: ₹{metrics.totalTax.toFixed(0)}
          </span>
        </div>

        {/* Total Orders */}
        <div className="bg-[#fffbf5] p-3.5 rounded-2xl border border-[#eedecb] shadow-xs">
          <span className="text-[11px] font-semibold text-[#7d6e67] block">Bills & Items Sold</span>
          <span className="text-xl sm:text-2xl font-extrabold text-[#2b2320] mt-1 block tabular-nums">
            {metrics.totalBills} bills
          </span>
          <span className="text-[10px] text-[#7d6e67] mt-0.5 block tabular-nums">
            {metrics.totalUnitsSold} total units · Disc: ₹{metrics.totalDiscounts.toFixed(0)}
          </span>
        </div>

        {/* Average Order Value */}
        <div className="bg-[#fffbf5] p-3.5 rounded-2xl border border-[#eedecb] shadow-xs">
          <span className="text-[11px] font-semibold text-[#7d6e67] block">Average Ticket Size</span>
          <span className="text-xl sm:text-2xl font-extrabold text-[#2b2320] mt-1 block tabular-nums">
            ₹{metrics.averageBill.toFixed(0)}
          </span>
          <span className="text-[10px] text-[#7d6e67] mt-0.5 block">Per customer bill</span>
        </div>

        {/* UPI Volume */}
        <div className="bg-[#fffbf5] p-3.5 rounded-2xl border border-[#eedecb] shadow-xs">
          <span className="text-[11px] font-semibold text-[#7d6e67] block">UPI Digital Share</span>
          <span className="text-xl sm:text-2xl font-extrabold text-emerald-700 mt-1 block tabular-nums">
            {upiPercent}%
          </span>
          <span className="text-[10px] text-[#7d6e67] mt-0.5 block tabular-nums">
            ₹{metrics.upiSales.toFixed(0)} via UPI
          </span>
        </div>
      </div>

      {/* Tender Reconciliation & Daily Expenses/Drawer Balancing */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tender Breakdown */}
        <div className="bg-[#fffbf5] p-4 rounded-2xl border border-[#eedecb] shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-sm text-[#2b2320] mb-3 flex items-center gap-1.5">
              <Banknote className="w-4 h-4 text-[#ea580c]" />
              <span>Tender Settlement & Sales Breakdown</span>
            </h3>

            {/* Visual Bar */}
            <div className="h-3 w-full bg-[#f4ebe1] rounded-full overflow-hidden flex mb-4">
              <div
                style={{ width: `${upiPercent}%` }}
                className="bg-emerald-500 h-full transition-all"
                title={`UPI: ${upiPercent}%`}
              />
              <div
                style={{ width: `${cashPercent}%` }}
                className="bg-amber-500 h-full transition-all"
                title={`Cash: ${cashPercent}%`}
              />
              <div
                style={{ width: `${cardPercent}%` }}
                className="bg-indigo-500 h-full transition-all"
                title={`Card: ${cardPercent}%`}
              />
            </div>

            {/* Breakdown Rows */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-[#eedecb]">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span className="font-medium text-[#2b2320]">UPI QR Payments</span>
                  <span className="text-[11px] text-[#7d6e67]">({metrics.upiCount} bills)</span>
                </div>
                <span className="font-extrabold text-[#2b2320] tabular-nums">₹{metrics.upiSales.toFixed(2)}</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-[#eedecb]">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="font-medium text-[#2b2320]">Cash Sales Collected</span>
                  <span className="text-[11px] text-[#7d6e67]">({metrics.cashCount} bills)</span>
                </div>
                <span className="font-extrabold text-[#2b2320] tabular-nums">₹{metrics.cashSales.toFixed(2)}</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-[#eedecb]">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                  <span className="font-medium text-[#2b2320]">Card POS Terminal</span>
                  <span className="text-[11px] text-[#7d6e67]">({metrics.cardCount} bills)</span>
                </div>
                <span className="font-extrabold text-[#2b2320] tabular-nums">₹{metrics.cardSales.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#eedecb] text-[11px] text-[#7d6e67]">
            Net cash from {formatHumanDate(selectedDate)} after expenses & withdrawals:{' '}
            <strong className="text-[#2b2320] tabular-nums">₹{dailyWallet.cashBalance.toFixed(2)}</strong>
          </div>
        </div>

        {/* Daily Expenditures, Withdrawals & Credit Card Summary */}
        <div className="bg-[#fffbf5] p-4 rounded-2xl border border-[#eedecb] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="font-bold text-sm text-[#2b2320] flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-[#ea580c]" />
                <span>Expenditures & Withdrawals ({formatHumanDate(selectedDate)})</span>
              </h3>
              {onOpenExpensesDrawer && (
                <button
                  type="button"
                  onClick={onOpenExpensesDrawer}
                  className="text-xs font-bold text-[#ea580c] hover:underline cursor-pointer whitespace-nowrap"
                >
                  Open Ledger Drawer →
                </button>
              )}
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-[#eedecb]">
                <div>
                  <span className="font-semibold text-[#2b2320] block">Cash Counter Outflows</span>
                  <span className="text-[11px] text-[#7d6e67] tabular-nums">
                    Expenses: ₹{dailyWallet.cashExpenses.toFixed(0)} · Withdrawals: ₹{dailyWallet.cashWithdrawals.toFixed(0)}
                  </span>
                </div>
                <span className="font-extrabold text-rose-700 tabular-nums">
                  −₹{(dailyWallet.cashExpenses + dailyWallet.cashWithdrawals).toFixed(2)}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-[#eedecb]">
                <div>
                  <span className="font-semibold text-[#2b2320] block">UPI Outflows</span>
                  <span className="text-[11px] text-[#7d6e67] tabular-nums">
                    Expenses: ₹{dailyWallet.upiExpenses.toFixed(0)} · Withdrawals: ₹{dailyWallet.upiWithdrawals.toFixed(0)}
                  </span>
                </div>
                <span className="font-extrabold text-rose-700 tabular-nums">
                  −₹{(dailyWallet.upiExpenses + dailyWallet.upiWithdrawals).toFixed(2)}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-[#eedecb]">
                <div>
                  <span className="font-semibold text-[#2b2320] block">Credit Card (Top-Up vs Expense)</span>
                  <span className="text-[11px] text-[#7d6e67] tabular-nums">
                    Running: ₹{dailyWallet.runningExpenses.toFixed(0)} · Fixed: ₹{dailyWallet.fixedExpenses.toFixed(0)}
                  </span>
                </div>
                <div className="text-right tabular-nums">
                  <span className="font-bold text-emerald-700 block">+₹{dailyWallet.ccTopUps.toFixed(0)} top-up</span>
                  <span className="font-bold text-rose-700 block">−₹{dailyWallet.ccExpenses.toFixed(0)} spent</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#eedecb] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#7d6e67]">
            <span>
              Total Expenses: <strong className="text-[#2b2320] tabular-nums">₹{dailyWallet.totalExpenses.toFixed(0)}</strong>
            </span>
            <span>
              Total Withdrawals: <strong className="text-[#2b2320] tabular-nums">₹{dailyWallet.totalWithdrawals.toFixed(0)}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* ALL Items Sold Table (Complete Itemized Count & Revenue) */}
      <div className="bg-[#fffbf5] p-4 rounded-2xl border border-[#eedecb] shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="font-bold text-sm text-[#2b2320] flex items-center gap-1.5">
              <Award className="w-4 h-4 text-[#ea580c]" />
              <span>All Items Sold on {formatHumanDate(selectedDate)} ({metrics.allItems.length} dishes · {metrics.totalUnitsSold} units)</span>
            </h3>
            <p className="text-[11px] text-[#7d6e67]">
              Complete itemized breakdown of every dish and beverage sold on this date.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#8c7a72] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Filter sold items..."
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                className="bg-[#f4ebe1] pl-8 pr-3 py-1.5 rounded-xl border border-[#e3d3c2] text-xs text-[#2b2320] outline-hidden"
              />
            </div>

            <div className="flex items-center bg-[#f4ebe1] p-0.5 rounded-xl border border-[#e3d3c2] text-[11px]">
              {(
                [
                  { id: 'qty', label: 'By Count' },
                  { id: 'revenue', label: 'By Revenue' },
                  { id: 'name', label: 'A–Z' },
                ] as const
              ).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setItemSortBy(s.id)}
                  className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                    itemSortBy === s.id
                      ? 'bg-[#ea580c] text-white shadow-xs'
                      : 'text-[#615149] hover:text-[#2b2320]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[420px] overflow-y-auto border border-[#eedecb] rounded-xl bg-white">
          <table className="w-full text-left text-xs text-[#2b2320]">
            <thead className="bg-[#f5ede0] text-[#7d6e67] font-bold text-[11px] border-b border-[#eedecb] sticky top-0">
              <tr>
                <th className="px-3.5 py-2.5 w-12">#</th>
                <th className="px-3.5 py-2.5">Item Name</th>
                <th className="px-3.5 py-2.5 text-right">Qty Sold</th>
                <th className="px-3.5 py-2.5 text-right">Unit Share</th>
                <th className="px-3.5 py-2.5 text-right">Item Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eedecb]/70 tabular-nums">
              {displayedItems.map((item, idx) => {
                const sharePct =
                  metrics.totalUnitsSold > 0
                    ? ((item.quantity / metrics.totalUnitsSold) * 100).toFixed(1)
                    : '0.0';
                return (
                  <tr key={item.name} className="hover:bg-[#fbf6ee] transition">
                    <td className="px-3.5 py-2.5 font-mono text-[#7d6e67]">{idx + 1}</td>
                    <td className="px-3.5 py-2.5 font-semibold text-[#2b2320]">{item.name}</td>
                    <td className="px-3.5 py-2.5 text-right font-extrabold text-[#ea580c]">
                      {item.quantity}
                    </td>
                    <td className="px-3.5 py-2.5 text-right text-[#7d6e67]">{sharePct}%</td>
                    <td className="px-3.5 py-2.5 text-right font-bold text-[#2b2320]">
                      ₹{item.revenue.toFixed(2)}
                    </td>
                  </tr>
                );
              })}

              {displayedItems.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-xs text-[#7d6e67]">
                    {metrics.allItems.length === 0
                      ? `No items sold on ${formatHumanDate(selectedDate)}.`
                      : `No sold items match "${itemSearch}".`}
                  </td>
                </tr>
              )}
            </tbody>
            {displayedItems.length > 0 && (
              <tfoot className="bg-[#fbf6ee] border-t border-[#eedecb] font-bold text-xs tabular-nums sticky bottom-0">
                <tr>
                  <td className="px-3.5 py-2.5" colSpan={2}>
                    Total ({displayedItems.length} items shown)
                  </td>
                  <td className="px-3.5 py-2.5 text-right text-[#ea580c]">
                    {displayedItems.reduce((s, i) => s + i.quantity, 0)}
                  </td>
                  <td className="px-3.5 py-2.5 text-right text-[#7d6e67]">100%</td>
                  <td className="px-3.5 py-2.5 text-right text-[#2b2320]">
                    ₹{displayedItems.reduce((s, i) => s + i.revenue, 0).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Staff Performance & Work Log Table */}
      <div className="bg-[#fffbf5] p-4 rounded-2xl border border-[#eedecb] shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-bold text-sm text-[#2b2320]">
              Staff Performance & Generator Work Log
            </h3>
            <p className="text-[11px] text-[#7d6e67]">
              Track which cashier or waiter generated each bill and their turnover for {formatHumanDate(selectedDate)}.
            </p>
          </div>
          <span className="text-xs text-[#7d6e67] font-semibold">
            {metrics.staffList.length} Cashiers Active
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#2b2320]">
            <thead className="bg-[#f5ede0] text-[#7d6e67] font-bold text-[11px] border-b border-[#eedecb]">
              <tr>
                <th className="px-3 py-2">Generator Name</th>
                <th className="px-3 py-2">Email ID</th>
                <th className="px-3 py-2">Bills Punched</th>
                <th className="px-3 py-2">UPI Sales</th>
                <th className="px-3 py-2">Cash Sales</th>
                <th className="px-3 py-2">Card Sales</th>
                <th className="px-3 py-2 text-right">Total Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eedecb]/70 tabular-nums">
              {metrics.staffList.map((staff: any, idx: number) => (
                <tr key={idx} className="hover:bg-[#fbf6ee] transition">
                  <td className="px-3 py-2.5 font-bold text-[#2b2320] flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#f4ebe1] text-[#ea580c] text-[10px] flex items-center justify-center font-bold">
                      {staff.name[0].toUpperCase()}
                    </span>
                    <span>{staff.name}</span>
                  </td>
                  <td className="px-3 py-2.5 text-[#7d6e67] font-mono text-[11px]">
                    {staff.email}
                  </td>
                  <td className="px-3 py-2.5 font-semibold">
                    {staff.billsCount} bills
                  </td>
                  <td className="px-3 py-2.5 text-emerald-700 font-semibold">
                    ₹{staff.upiSales.toFixed(0)}
                  </td>
                  <td className="px-3 py-2.5 text-amber-700 font-semibold">
                    ₹{staff.cashSales.toFixed(0)}
                  </td>
                  <td className="px-3 py-2.5 text-indigo-700 font-semibold">
                    ₹{staff.cardSales.toFixed(0)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-extrabold text-[#ea580c]">
                    ₹{staff.totalSales.toFixed(2)}
                  </td>
                </tr>
              ))}

              {metrics.staffList.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-[#7d6e67]">
                    No cashier work logs found for {formatHumanDate(selectedDate)}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

