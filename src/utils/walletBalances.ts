import { Bill, LedgerEntry, WalletOpeningBalances } from '../types';
import { getBusinessDateStr } from './dateUtils';

export interface PartnerSpendBreakdown {
  total: number;
  initial: number;
  running: number;
  fixed: number;
}

export interface WalletMetricsSummary {
  // Sales inflows
  cashSales: number;
  upiSales: number;
  cardPosSales: number;

  // Cafe-paid expenditures by payment mode (ONLY paidBy === 'Cafe' or unset)
  cashExpenses: number;
  upiExpenses: number;
  ccExpenses: number;

  // Cafe-paid expenditures by classification
  runningExpenses: number;
  fixedExpenses: number;
  initialExpenses: number;
  totalExpenses: number;

  // Partner-paid expenditures (tracked separately from Cafe Cash/UPI/CC wallets)
  partnerSpendsTotal: number;
  partnerInitialTotal: number;
  partnerRunningTotal: number;
  partnerFixedTotal: number;
  partnerSpendsByPerson: Record<string, PartnerSpendBreakdown>;

  // Combined all expenses (Cafe + Partners)
  allExpensesTotal: number;

  // Withdrawals by payment mode & person (from Cafe Cash Counter / Cafe UPI)
  cashWithdrawals: number;
  upiWithdrawals: number;
  totalWithdrawals: number;
  withdrawalsByPerson: Record<string, number>;

  // Credit Card Top-ups
  ccTopUps: number;

  // Net Cafe Wallet Balances (including opening balances if cumulative)
  cashBalance: number;
  upiBalance: number;
  ccBalanceLeft: number;
}

export function isCafePaidExpense(entry: LedgerEntry): boolean {
  const paidBy = (entry.paidBy || 'Cafe').trim().toLowerCase();
  return paidBy === '' || paidBy === 'cafe';
}

export function computeWalletSummary(
  bills: Bill[],
  ledger: LedgerEntry[],
  openingBalances: WalletOpeningBalances,
  dateFilter?: string, // If provided (YYYY-MM-DD), calculates daily activity for that business date without opening balance; if omitted, calculates full cumulative running balances with opening balance
  openingTime?: string,
  closingTime?: string
): WalletMetricsSummary {
  const isDaily = Boolean(dateFilter);

  const relevantBills = bills.filter((b) => {
    if (b.status !== 'paid') return false;
    if (!dateFilter) return true;
    return getBusinessDateStr(b.createdAt, openingTime, closingTime) === dateFilter;
  });

  const relevantLedger = ledger.filter((entry) => {
    if (!dateFilter) return true;
    const entryDate = entry.dateStr || getBusinessDateStr(entry.createdAt, openingTime, closingTime);
    return entryDate === dateFilter;
  });

  let cashSales = 0;
  let upiSales = 0;
  let cardPosSales = 0;

  relevantBills.forEach((b) => {
    if (b.paymentMode === 'cash') {
      cashSales += b.grandTotal || 0;
    } else if (b.paymentMode === 'upi') {
      upiSales += b.grandTotal || 0;
    } else if (b.paymentMode === 'card') {
      cardPosSales += b.grandTotal || 0;
    } else if (b.paymentMode === 'split' && b.splitDetails) {
      cashSales += b.splitDetails.cash || 0;
      upiSales += b.splitDetails.upi || 0;
      cardPosSales += b.splitDetails.card || 0;
    }
  });

  let cashExpenses = 0;
  let upiExpenses = 0;
  let ccExpenses = 0;
  let runningExpenses = 0;
  let fixedExpenses = 0;
  let initialExpenses = 0;

  let partnerSpendsTotal = 0;
  let partnerInitialTotal = 0;
  let partnerRunningTotal = 0;
  let partnerFixedTotal = 0;
  const partnerSpendsByPerson: Record<string, PartnerSpendBreakdown> = {};

  let cashWithdrawals = 0;
  let upiWithdrawals = 0;
  const withdrawalsByPerson: Record<string, number> = {};

  let ccTopUps = 0;

  relevantLedger.forEach((entry) => {
    const amt = Number(entry.amount) || 0;
    if (entry.kind === 'expenditure') {
      if (isCafePaidExpense(entry)) {
        if (entry.paymentMode === 'cash') cashExpenses += amt;
        else if (entry.paymentMode === 'upi') upiExpenses += amt;
        else if (entry.paymentMode === 'credit_card') ccExpenses += amt;

        if (entry.expenseType === 'fixed') fixedExpenses += amt;
        else if (entry.expenseType === 'initial') initialExpenses += amt;
        else runningExpenses += amt;
      } else {
        const partnerName = (entry.paidBy || 'Partner').trim() || 'Partner';
        if (!partnerSpendsByPerson[partnerName]) {
          partnerSpendsByPerson[partnerName] = { total: 0, initial: 0, running: 0, fixed: 0 };
        }
        partnerSpendsByPerson[partnerName].total += amt;
        partnerSpendsTotal += amt;

        if (entry.expenseType === 'initial') {
          partnerSpendsByPerson[partnerName].initial += amt;
          partnerInitialTotal += amt;
        } else if (entry.expenseType === 'fixed') {
          partnerSpendsByPerson[partnerName].fixed += amt;
          partnerFixedTotal += amt;
        } else {
          partnerSpendsByPerson[partnerName].running += amt;
          partnerRunningTotal += amt;
        }
      }
    } else if (entry.kind === 'withdrawal') {
      if (entry.paymentMode === 'upi') upiWithdrawals += amt;
      else cashWithdrawals += amt;

      const person = (entry.person || 'Staff').trim() || 'Staff';
      withdrawalsByPerson[person] = (withdrawalsByPerson[person] || 0) + amt;
    } else if (entry.kind === 'cc_topup') {
      ccTopUps += amt;
    }
  });

  const openCash = isDaily ? 0 : Number(openingBalances.cash) || 0;
  const openUpi = isDaily ? 0 : Number(openingBalances.upi) || 0;
  const openCc = isDaily ? 0 : Number(openingBalances.creditCard) || 0;
  const totalCafeExpenses = cashExpenses + upiExpenses + ccExpenses;

  return {
    cashSales,
    upiSales,
    cardPosSales,
    cashExpenses,
    upiExpenses,
    ccExpenses,
    runningExpenses,
    fixedExpenses,
    initialExpenses,
    totalExpenses: totalCafeExpenses,
    partnerSpendsTotal,
    partnerInitialTotal,
    partnerRunningTotal,
    partnerFixedTotal,
    partnerSpendsByPerson,
    allExpensesTotal: totalCafeExpenses + partnerSpendsTotal,
    cashWithdrawals,
    upiWithdrawals,
    totalWithdrawals: cashWithdrawals + upiWithdrawals,
    withdrawalsByPerson,
    ccTopUps,
    cashBalance: openCash + cashSales - cashExpenses - cashWithdrawals,
    upiBalance: openUpi + upiSales - upiExpenses - upiWithdrawals,
    ccBalanceLeft: openCc + ccTopUps - ccExpenses,
  };
}
