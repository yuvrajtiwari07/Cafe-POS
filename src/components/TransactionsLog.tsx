import React, { useEffect, useState, useMemo } from 'react';
import {
  Search,
  Printer,
  Download,
  Ban,
  CheckCircle2,
  Clock,
  Calendar,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { Bill, Cafe } from '../types';
import { updateLocalBillStatus } from '../services/storage';
import { reverseInventoryForOrder } from '../services/inventoryEngine';
import { syncBillToSheets } from '../services/googleSheetsSync';
import {
  addDaysToLocalDateStr,
  formatBusinessDayRange,
  formatHumanDate,
  getBusinessDateStr,
  getCurrentBusinessDateStr,
  getLocalDateStr,
  isOvernightShift,
} from '../utils/dateUtils';
import { showToast } from '../services/toast';

interface TransactionsLogProps {
  cafe: Cafe;
  bills: Bill[];
  onSelectBillToReprint: (bill: Bill) => void;
}

export const TransactionsLog: React.FC<TransactionsLogProps> = ({
  cafe,
  bills,
  onSelectBillToReprint,
}) => {
  const currentBizToday = getCurrentBusinessDateStr(cafe.openingTime, cafe.closingTime);

  const [search, setSearch] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | 'week' | 'all' | 'custom'>('today');
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    getCurrentBusinessDateStr(cafe.openingTime, cafe.closingTime)
  );
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    const bizToday = getCurrentBusinessDateStr(cafe.openingTime, cafe.closingTime);
    if (dateFilter === 'today') {
      setSelectedDate(bizToday);
    } else if (dateFilter === 'yesterday') {
      setSelectedDate(addDaysToLocalDateStr(bizToday, -1));
    }
  }, [cafe.id, cafe.openingTime, cafe.closingTime, dateFilter]);

  // Filter bills using cafe business-day boundaries (openingTime -> closingTime)
  const filteredBills = useMemo(() => {
    const todayStr = getCurrentBusinessDateStr(cafe.openingTime, cafe.closingTime);
    const yesterdayStr = addDaysToLocalDateStr(todayStr, -1);
    const weekStartStr = addDaysToLocalDateStr(todayStr, -6);

    return bills.filter((b) => {
      const billBizDateStr = getBusinessDateStr(b.createdAt, cafe.openingTime, cafe.closingTime);

      if (dateFilter === 'today' && billBizDateStr !== todayStr) return false;
      if (dateFilter === 'yesterday' && billBizDateStr !== yesterdayStr) return false;
      if (dateFilter === 'custom' && billBizDateStr !== selectedDate) return false;
      if (dateFilter === 'week' && (billBizDateStr < weekStartStr || billBizDateStr > todayStr)) return false;

      // Payment filter
      if (paymentFilter !== 'all' && b.paymentMode !== paymentFilter) return false;

      // Status filter
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;

      // Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesBillNo = (b.billNumber || '').toLowerCase().includes(q);
        const matchesTable = (b.tableOrToken || '').toLowerCase().includes(q);
        const matchesMobile = (b.customerMobile || '').toLowerCase().includes(q);
        const matchesItem = (b.items || []).some((i) => (i.name || '').toLowerCase().includes(q));
        if (!matchesBillNo && !matchesTable && !matchesMobile && !matchesItem) {
          return false;
        }
      }

      return true;
    });
  }, [bills, dateFilter, selectedDate, paymentFilter, statusFilter, search, cafe.openingTime, cafe.closingTime]);

  const totalFilteredAmount = useMemo(() => {
    return filteredBills
      .filter((b) => b.status === 'paid')
      .reduce((sum, b) => sum + b.grandTotal, 0);
  }, [filteredBills]);

  // Robust CSV cell escaping conforming to RFC 4180
  const escapeCsvCell = (val: any): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const formatNum = (num: number | undefined | null): string => {
    if (num === null || num === undefined || isNaN(num)) return '0.00';
    return num.toFixed(2);
  };

  // Full spreadsheet export using Blob + UTF-8 BOM so all rows download cleanly in Excel/Sheets without truncation
  const exportBillsToCSV = (targetBills: Bill[], filterLabel: string) => {
    if (!targetBills || targetBills.length === 0) {
      showToast('No bills found for the selected export.', 'warning');
      return;
    }

    const headers = [
      'Bill Number',
      'Business Date',
      'Calendar Date',
      'Time',
      'Table / Customer',
      'Order Type',
      'Payment Mode',
      'Split Details',
      'Items Ordered (Detailed Summary)',
      'Total Items Qty',
      'Subtotal',
      'Discount',
      'Tax',
      'Grand Total',
      'Customer Mobile',
      'Payment Status',
      'Cloud Sync Status',
    ];

    const rows = targetBills.map((b) => {
      const d = new Date(b.createdAt);
      const isValidDate = !isNaN(d.getTime());
      const bizDateFormatted = isValidDate
        ? getBusinessDateStr(d, cafe.openingTime, cafe.closingTime)
        : (b.createdAt || '').slice(0, 10);
      const dateFormatted = isValidDate
        ? getLocalDateStr(d)
        : (b.createdAt || '').slice(0, 10);
      const timeFormatted = isValidDate
        ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
        : '';

      const itemsSummary = (b.items || [])
        .map((i) => `${i.quantity || 1}x ${i.name || 'Item'}${i.price ? ` (@₹${i.price})` : ''}`)
        .join('; ');

      const totalQty = (b.items || []).reduce((sum, i) => sum + (i.quantity || 1), 0);

      let splitText = '-';
      if (b.paymentMode === 'split' && b.splitDetails) {
        const parts: string[] = [];
        if (b.splitDetails.cash) parts.push(`Cash: ₹${b.splitDetails.cash}`);
        if (b.splitDetails.upi) parts.push(`UPI: ₹${b.splitDetails.upi}`);
        if (b.splitDetails.card) parts.push(`Card: ₹${b.splitDetails.card}`);
        splitText = parts.join(' | ') || '-';
      }

      return [
        escapeCsvCell(b.billNumber || ''),
        escapeCsvCell(bizDateFormatted),
        escapeCsvCell(dateFormatted),
        escapeCsvCell(timeFormatted),
        escapeCsvCell(b.tableOrToken || 'Counter'),
        escapeCsvCell((b.orderType || 'Dine-In').toUpperCase()),
        escapeCsvCell((b.paymentMode || 'Cash').toUpperCase()),
        escapeCsvCell(splitText),
        escapeCsvCell(itemsSummary),
        totalQty,
        formatNum(b.subtotal),
        formatNum(b.discountAmount),
        formatNum(b.taxAmount),
        formatNum(b.grandTotal),
        escapeCsvCell(b.customerMobile || '-'),
        escapeCsvCell((b.status || 'paid').toUpperCase()),
        escapeCsvCell(b.isSynced ? 'SYNCED' : 'PENDING'),
      ].join(',');
    });

    // Prepend UTF-8 BOM (\uFEFF) and join rows with \r\n for universal Excel & Google Sheets compatibility
    const csvContent = '\uFEFF' + [headers.map(escapeCsvCell).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const cleanCafeName = (cafe.name || 'Cafe').replace(/[^a-zA-Z0-9_-]/g, '_');
    const timestampStr = getCurrentBusinessDateStr(cafe.openingTime, cafe.closingTime);
    link.setAttribute('download', `${cleanCafeName}_Transactions_${filterLabel}_${timestampStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2500);

    showToast(`Exported ${targetBills.length} transactions to CSV spreadsheet!`, 'success');
  };

  const handleVoidBill = async (bill: Bill) => {
    if (confirm(`Are you sure you want to VOID bill ${bill.billNumber}? This will mark it as void and automatically restore any deducted inventory.`)) {
      updateLocalBillStatus(cafe.id, bill.id, 'void');
      syncBillToSheets(cafe, { ...bill, status: 'void' }).catch(() => {});
      await reverseInventoryForOrder(
        cafe.id,
        bill.items,
        bill.id,
        bill.billNumber,
        'Staff',
        undefined
      );
    }
  };

  const activeWindowDate =
    dateFilter === 'yesterday'
      ? addDaysToLocalDateStr(currentBizToday, -1)
      : dateFilter === 'custom'
      ? selectedDate
      : currentBizToday;
  const activeWindowLabel = formatBusinessDayRange(activeWindowDate, cafe.openingTime, cafe.closingTime);

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-3 sm:py-4 space-y-4">
      {/* Top Header & Summary Stats */}
      <div className="bg-[#fffbf5] p-3 sm:p-4 rounded-2xl border border-[#eedecb] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[#2b2320]">
            Transactions & Audit Ledger
          </h2>
          <p className="text-xs text-[#7d6e67]">
            {dateFilter === 'today' || dateFilter === 'yesterday' || dateFilter === 'custom' ? (
              <>
                Business Day <strong className="text-[#2b2320]">{formatHumanDate(activeWindowDate)}</strong> · Shift window:{' '}
                <strong className="text-[#ea580c]">{activeWindowLabel}</strong>
              </>
            ) : (
              'Complete historical billing records, tax & tender ledger, and reprint thermal slips.'
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-[#f5ede0] px-3 py-1.5 rounded-xl border border-[#eedecb] text-right">
            <span className="text-[11px] text-[#7d6e67] block">
              {dateFilter === 'custom'
                ? `Turnover (${formatHumanDate(selectedDate)})`
                : dateFilter === 'today'
                ? `Today (${formatHumanDate(currentBizToday)})`
                : 'Selected Turnover'}
            </span>
            <span className="font-extrabold text-base text-[#ea580c] tabular-nums">
              ₹{totalFilteredAmount.toFixed(2)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {cafe.googleSpreadsheetUrl && (
              <a
                href={cafe.googleSpreadsheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition shadow-xs"
                title="Open synced Google Sheets Sales & Expenses workbook"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Sheet</span>
              </a>
            )}
            <button
              onClick={() => exportBillsToCSV(filteredBills, dateFilter === 'custom' ? selectedDate : dateFilter)}
              disabled={filteredBills.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              title={`Export ${filteredBills.length} filtered transactions to full CSV sheet`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export CSV ({filteredBills.length})</span>
            </button>

            {filteredBills.length !== bills.length && bills.length > 0 && (
              <button
                onClick={() => exportBillsToCSV(bills, 'all')}
                className="flex items-center gap-1.5 px-2.5 py-2 bg-[#f4ebe1] hover:bg-[#eedecb] text-[#2b2320] rounded-xl text-xs font-semibold border border-[#eedecb] transition shadow-xs cursor-pointer"
                title={`Export all ${bills.length} total historical transactions`}
              >
                <Download className="w-3.5 h-3.5 text-[#ea580c]" />
                <span className="hidden sm:inline">Export All</span>
                <span>({bills.length})</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#fffbf5] p-3 rounded-2xl border border-[#eedecb] shadow-xs flex flex-col lg:flex-row gap-2.5 items-stretch lg:items-center justify-between">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-[#8c7a72] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by Bill #, table/customer, phone, dish..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#f4ebe1] pl-9 pr-3 py-1.5 rounded-xl text-xs sm:text-sm text-[#2b2320] placeholder-[#9a8981] outline-hidden border border-[#e3d3c2]"
          />
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Date Presets */}
          <div className="flex items-center bg-[#f4ebe1] p-0.5 rounded-xl border border-[#e3d3c2]">
            {(['today', 'yesterday', 'week', 'all'] as const).map((d) => (
              <button
                key={d}
                onClick={() => {
                  setDateFilter(d);
                  const bizToday = getCurrentBusinessDateStr(cafe.openingTime, cafe.closingTime);
                  if (d === 'today') setSelectedDate(bizToday);
                  if (d === 'yesterday') setSelectedDate(addDaysToLocalDateStr(bizToday, -1));
                }}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg capitalize transition cursor-pointer whitespace-nowrap ${
                  dateFilter === d
                    ? 'bg-[#ea580c] text-white shadow-xs'
                    : 'text-[#615149] hover:bg-white/50'
                }`}
              >
                {d === 'week' ? '7 Days' : d}
              </button>
            ))}
          </div>

          {/* Direct Jump to Any Date */}
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-xl border transition ${
              dateFilter === 'custom'
                ? 'bg-orange-50 border-[#ea580c] ring-1 ring-[#ea580c]/30'
                : 'bg-[#f4ebe1] border-[#e3d3c2]'
            }`}
            title="Jump directly to any calendar date"
          >
            <button
              type="button"
              onClick={() => {
                const next = addDaysToLocalDateStr(selectedDate, -1);
                setSelectedDate(next);
                setDateFilter('custom');
              }}
              className="p-0.5 text-[#7d6e67] hover:text-[#2b2320] rounded hover:bg-white cursor-pointer"
              title="Previous Day"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <Calendar className="w-3.5 h-3.5 text-[#ea580c] shrink-0" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                const val = e.target.value;
                if (val) {
                  setSelectedDate(val);
                  setDateFilter('custom');
                }
              }}
              className="bg-transparent text-xs font-bold text-[#2b2320] outline-hidden cursor-pointer"
              aria-label="Jump to date"
            />
            <button
              type="button"
              onClick={() => {
                const next = addDaysToLocalDateStr(selectedDate, 1);
                setSelectedDate(next);
                setDateFilter('custom');
              }}
              className="p-0.5 text-[#7d6e67] hover:text-[#2b2320] rounded hover:bg-white cursor-pointer"
              title="Next Day"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Payment Method Selector */}
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="bg-[#f4ebe1] text-[#2b2320] text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-[#e3d3c2] outline-hidden cursor-pointer"
          >
            <option value="all">All Modes</option>
            <option value="upi">UPI QR</option>
            <option value="cash">Cash</option>
            <option value="card">Card POS</option>
            <option value="split">Split (Cash + UPI)</option>
          </select>

          {/* Status Selector */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#f4ebe1] text-[#2b2320] text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-[#e3d3c2] outline-hidden cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </select>
        </div>
      </div>

      {/* Bills Ledger Table */}
      <div className="bg-[#fffbf5] rounded-2xl border border-[#eedecb] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#2b2320]">
            <thead className="bg-[#f5ede0] text-[#7d6e67] uppercase font-bold text-[10px] tracking-wider border-b border-[#eedecb]">
              <tr>
                <th className="px-3.5 py-2.5">Bill #</th>
                <th className="px-3.5 py-2.5">Date & Time</th>
                <th className="px-3.5 py-2.5">Table / Customer</th>
                <th className="px-3.5 py-2.5">Order Type & Info</th>
                <th className="px-3.5 py-2.5">Items Summary</th>
                <th className="px-3.5 py-2.5">Tender</th>
                <th className="px-3.5 py-2.5">Grand Total</th>
                <th className="px-3.5 py-2.5">Sync Status</th>
                <th className="px-3.5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eedecb]/70">
              {filteredBills.map((bill) => (
                <tr
                  key={bill.id}
                  className={`hover:bg-[#fbf6ee] transition ${
                    bill.status === 'void' ? 'opacity-60 bg-rose-50/20' : ''
                  }`}
                >
                  {/* Bill Number */}
                  <td className="px-3.5 py-3 font-mono font-bold text-[#ea580c]">
                    {bill.billNumber}
                  </td>

                  {/* Date & Time */}
                  <td className="px-3.5 py-3 text-[#7d6e67] whitespace-nowrap">
                    <div className="font-medium text-[#2b2320]">
                      {new Date(bill.createdAt).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </div>
                    <div className="text-[10px]">
                      {new Date(bill.createdAt).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                    {isOvernightShift(cafe.openingTime, cafe.closingTime) &&
                      getBusinessDateStr(bill.createdAt, cafe.openingTime, cafe.closingTime) !==
                        getLocalDateStr(bill.createdAt) && (
                        <div className="text-[10px] font-semibold text-[#ea580c]">
                          Biz Day: {formatHumanDate(getBusinessDateStr(bill.createdAt, cafe.openingTime, cafe.closingTime))}
                        </div>
                      )}
                  </td>

                  {/* Table / Customer Name */}
                  <td className="px-3.5 py-3">
                    <span className="font-bold text-[#2b2320] block">
                      {bill.tableOrToken}
                    </span>
                    {bill.customerMobile && (
                      <span className="text-[10px] text-[#7d6e67] block">
                        📞 {bill.customerMobile}
                      </span>
                    )}
                  </td>

                  {/* Order Type & Count */}
                  <td className="px-3.5 py-3">
                    <span className="font-semibold text-xs text-[#2b2320] capitalize block">
                      {bill.orderType || 'Dine-In'}
                    </span>
                    <span className="text-[10px] text-[#7d6e67] block">
                      {bill.items.reduce((s, i) => s + (i.quantity || 1), 0)} items ordered
                    </span>
                  </td>

                  {/* Items summary */}
                  <td className="px-3.5 py-3 max-w-[200px]">
                    <div className="truncate font-medium text-xs text-[#2b2320]" title={bill.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}>
                      {bill.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                    </div>
                    <span className="text-[10px] text-[#7d6e67]">
                      {bill.items.reduce((s, i) => s + i.quantity, 0)} items total
                    </span>
                  </td>

                  {/* Payment Mode */}
                  <td className="px-3.5 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-md font-bold text-[10px] uppercase ${
                        bill.paymentMode === 'upi'
                          ? 'bg-emerald-100 text-emerald-800'
                          : bill.paymentMode === 'cash'
                          ? 'bg-amber-100 text-amber-800'
                          : bill.paymentMode === 'split'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-indigo-100 text-indigo-800'
                      }`}
                    >
                      {bill.paymentMode}
                    </span>
                    {bill.paymentMode === 'split' && bill.splitDetails && (
                      <span className="text-[9px] text-purple-700 block font-mono">
                        C:₹{bill.splitDetails.cash || 0} | U:₹{bill.splitDetails.upi || 0}
                      </span>
                    )}
                    {bill.includeQr && (
                      <span className="text-[9px] text-emerald-700 block font-semibold">
                        + QR Printed
                      </span>
                    )}
                  </td>

                  {/* Grand Total */}
                  <td className="px-3.5 py-3 font-extrabold text-sm text-[#2b2320]">
                    ₹{bill.grandTotal.toFixed(0)}
                  </td>

                  {/* Sync status */}
                  <td className="px-3.5 py-3">
                    {bill.isSynced ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Synced
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                        <Clock className="w-3 h-3 text-amber-600" /> Offline Queued
                      </span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-3.5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Reprint Thermal Slip (Section 32: Watermarked *** DUPLICATE ***) */}
                      <button
                        onClick={() => onSelectBillToReprint({ ...bill, isReprint: true })}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#f4ebe1] hover:bg-[#ea580c] hover:text-white text-[#2b2320] font-semibold text-xs transition cursor-pointer"
                        title="Reprint thermal receipt"
                      >
                        <Printer className="w-3 h-3" />
                        <span>Reprint</span>
                      </button>

                      {/* Void action */}
                      {bill.status === 'paid' && (
                        <button
                          onClick={() => handleVoidBill(bill)}
                          className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                          title="Void bill"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {filteredBills.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-[#7d6e67]">
                    {dateFilter === 'custom'
                      ? `No transactions found for ${formatHumanDate(selectedDate)}.`
                      : 'No transactions found for the selected filter.'}
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
