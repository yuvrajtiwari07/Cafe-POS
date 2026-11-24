import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Database,
  ExternalLink,
  FileSpreadsheet,
  Link2,
  Loader2,
  PlusCircle,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  connectGoogleSheets,
  hasGoogleSheetsAccessToken,
} from '../database';
import {
  applyPullFromSheets,
  createCafeBackupWorkbook,
  flushSheetSyncQueue,
  getPendingSheetSyncCount,
  linkExistingSpreadsheet,
  previewPullFromSheets,
  pushFullBackupToSheets,
  SheetPullPreview,
} from '../services/googleSheetsSync';
import { showToast } from '../services/toast';
import { Bill, Cafe, LedgerEntry } from '../types';

interface GoogleSheetsSyncPanelProps {
  cafe: Cafe;
  bills: Bill[];
  ledger: LedgerEntry[];
  onCafeUpdated: (updated: Cafe) => void;
  onBillsUpdated: (updated: Bill[]) => void;
  onLedgerUpdated: (updated: LedgerEntry[]) => void;
}

type ConfirmModalKind =
  | { type: 'create_sheet' }
  | { type: 'push_full' }
  | { type: 'pull_reconcile'; preview: SheetPullPreview };

function GoogleLogoSvg() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
      />
    </svg>
  );
}

export const GoogleSheetsSyncPanel: React.FC<GoogleSheetsSyncPanelProps> = ({
  cafe,
  bills,
  ledger,
  onCafeUpdated,
  onBillsUpdated,
  onLedgerUpdated,
}) => {
  const [sheetsConnected, setSheetsConnected] = useState<boolean>(hasGoogleSheetsAccessToken());
  const [pendingQueueCount, setPendingQueueCount] = useState<number>(
    getPendingSheetSyncCount(cafe.id)
  );
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [linkInput, setLinkInput] = useState('');
  const [showLinkBox, setShowLinkBox] = useState(false);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalKind | null>(null);

  useEffect(() => {
    const syncAuth = () => setSheetsConnected(hasGoogleSheetsAccessToken());
    const syncQueue = () => setPendingQueueCount(getPendingSheetSyncCount(cafe.id));
    window.addEventListener('google_sheets_auth_changed', syncAuth);
    window.addEventListener('sheets_queue_updated', syncQueue);
    syncAuth();
    syncQueue();
    return () => {
      window.removeEventListener('google_sheets_auth_changed', syncAuth);
      window.removeEventListener('sheets_queue_updated', syncQueue);
    };
  }, [cafe.id]);

  const handleConnectGoogle = async () => {
    setBusyAction('connect');
    try {
      await connectGoogleSheets();
      setSheetsConnected(true);
      showToast('Google Sheets connected for this session', 'success');
      if (cafe.googleSpreadsheetId && getPendingSheetSyncCount(cafe.id) > 0) {
        const res = await flushSheetSyncQueue(cafe);
        setPendingQueueCount(res.remaining);
        if (res.flushed > 0) {
          showToast(`Synced ${res.flushed} queued POS updates to Google Sheets`, 'info');
        }
      }
    } catch (err: any) {
      showToast(err?.message || 'Could not connect Google Sheets', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleLinkExisting = async () => {
    if (!linkInput.trim()) {
      showToast('Paste a Google Sheet URL or Spreadsheet ID first', 'warning');
      return;
    }
    if (!sheetsConnected) {
      showToast('Connect Google Sheets first to verify and link this spreadsheet', 'info');
      return;
    }
    setBusyAction('link');
    try {
      const { updatedCafe, meta } = await linkExistingSpreadsheet(cafe, linkInput);
      onCafeUpdated(updatedCafe);
      setLinkInput('');
      setShowLinkBox(false);
      showToast(`Linked Google Sheet "${meta.title}"`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to link spreadsheet', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleStartPullPreview = async () => {
    if (!cafe.googleSpreadsheetId) return;
    if (!sheetsConnected) {
      showToast('Connect Google Sheets first to pull updates', 'info');
      return;
    }
    setBusyAction('preview_pull');
    try {
      const preview = await previewPullFromSheets(cafe, bills, ledger);
      const totalChanges =
        preview.billsToCreate.length +
        preview.billsToUpdate.length +
        preview.ledgerToCreate.length +
        preview.ledgerToUpdate.length;
      if (totalChanges === 0) {
        showToast(
          `Already in sync! Checked ${preview.scannedSalesRows} sales & ${preview.scannedExpenseRows} expense rows.`,
          'success'
        );
        return;
      }
      setConfirmModal({ type: 'pull_reconcile', preview });
    } catch (err: any) {
      showToast(err?.message || 'Could not read Google Sheet', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleFlushQueue = async () => {
    if (!sheetsConnected) {
      showToast('Connect Google Sheets first to flush pending updates', 'info');
      return;
    }
    setBusyAction('flush');
    try {
      const res = await flushSheetSyncQueue(cafe);
      setPendingQueueCount(res.remaining);
      if (res.flushed > 0) {
        showToast(
          `Synced ${res.flushed} queued item${res.flushed === 1 ? '' : 's'} to Google Sheets`,
          'success'
        );
      } else {
        showToast('No pending items left to sync', 'info');
      }
    } catch (err: any) {
      showToast(err?.message || 'Could not flush queue', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const executeConfirmedAction = async () => {
    if (!confirmModal) return;
    const action = confirmModal;
    setConfirmModal(null);

    if (action.type === 'create_sheet') {
      setBusyAction('create_sheet');
      try {
        const { updatedCafe, meta } = await createCafeBackupWorkbook(cafe, bills, ledger);
        onCafeUpdated(updatedCafe);
        setPendingQueueCount(0);
        showToast(`Created "${meta.title}" with All Sales, Daily Tabs & Expenses`, 'success');
      } catch (err: any) {
        showToast(err?.message || 'Failed to create Google Sheet', 'error');
      } finally {
        setBusyAction(null);
      }
      return;
    }

    if (action.type === 'push_full') {
      setBusyAction('push_full');
      try {
        const res = await pushFullBackupToSheets(cafe, bills, ledger);
        onCafeUpdated(res.updatedCafe);
        setPendingQueueCount(0);
        showToast(
          `Backed up ${res.salesCount} sales, ${res.dailyTabsSynced} daily tabs & ${res.expensesCount} expenses to Google Sheets`,
          'success'
        );
      } catch (err: any) {
        showToast(err?.message || 'Full backup push failed', 'error');
      } finally {
        setBusyAction(null);
      }
      return;
    }

    if (action.type === 'pull_reconcile') {
      setBusyAction('apply_pull');
      try {
        const res = await applyPullFromSheets(cafe, action.preview, bills, ledger);
        onBillsUpdated(res.updatedBills);
        onLedgerUpdated(res.updatedLedger);
        onCafeUpdated(res.updatedCafe);
        showToast('Reconciled Google Sheet changes into POS database', 'success');
      } catch (err: any) {
        showToast(err?.message || 'Could not apply changes from Google Sheet', 'error');
      } finally {
        setBusyAction(null);
      }
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-stone-200/80 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-stone-50/70 border-b border-stone-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200/70 flex items-center justify-center text-emerald-700">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-stone-900">
              Google Sheets Live Backup &amp; Two-Way Sync
            </h3>
            <p className="text-xs text-stone-500">
              Unified workbook with All Sales, per-business-day Daily Sales tabs &amp; Expenses &amp; Withdrawals
            </p>
          </div>
        </div>

        {/* Official Google Sign-In / Connect Button */}
        {!sheetsConnected ? (
          <button
            type="button"
            onClick={handleConnectGoogle}
            disabled={busyAction !== null}
            className="inline-flex items-center gap-2.5 px-4 py-2 rounded-lg bg-white border border-stone-300 text-stone-700 font-semibold text-sm shadow-xs hover:bg-stone-50 hover:border-stone-400 active:scale-[0.99] transition-all disabled:opacity-50"
          >
            {busyAction === 'connect' ? (
              <Loader2 className="w-4 h-4 animate-spin text-stone-600" />
            ) : (
              <GoogleLogoSvg />
            )}
            <span>Connect Google Sheets</span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Sheets Session Active
            </span>
            <button
              type="button"
              onClick={handleConnectGoogle}
              disabled={busyAction !== null}
              className="text-xs font-semibold text-stone-500 hover:text-stone-800 underline underline-offset-2 px-1"
            >
              Switch Account
            </button>
          </div>
        )}
      </div>

      <div className="p-6 space-y-5">
        {/* Workbook Status Card */}
        {cafe.googleSpreadsheetId ? (
          <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-stone-900 truncate">
                  {cafe.googleSheetTitle || 'Cafe POS Backup Workbook'}
                </span>
                <span className="text-[11px] font-mono text-stone-500 bg-white px-2 py-0.5 rounded border border-stone-200">
                  ID: {cafe.googleSpreadsheetId.slice(0, 12)}…
                </span>
              </div>
              <div className="text-xs text-stone-500 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>
                  Last synced:{' '}
                  <strong className="text-stone-700">
                    {cafe.lastSheetSyncedAt
                      ? new Date(cafe.lastSheetSyncedAt).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Not yet'}
                  </strong>
                </span>
                <span>
                  POS Records:{' '}
                  <strong className="text-stone-700 tabular-nums">
                    {bills.length} sales · {ledger.length} ledger rows
                  </strong>
                </span>
                {pendingQueueCount > 0 && (
                  <span className="text-amber-700 font-semibold">
                    {pendingQueueCount} queued for sync
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {cafe.googleSpreadsheetUrl && (
                <a
                  href={cafe.googleSpreadsheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Sheet
                </a>
              )}
              <button
                type="button"
                onClick={() => setShowLinkBox((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-200 bg-white text-stone-700 text-xs font-semibold hover:bg-stone-100 transition-colors"
              >
                <Link2 className="w-3.5 h-3.5" />
                Change Sheet
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50/50 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-stone-900">
                No Google Sheet connected to {cafe.name} yet
              </h4>
              <p className="text-xs text-stone-500 max-w-xl">
                Create a brand-new formatted workbook in your Google account with{' '}
                <strong>All Sales</strong>, auto-created <strong>Daily Sales Tabs</strong> (using your cafe shift timings), and{' '}
                <strong>Expenses &amp; Withdrawals</strong> with live summary formulas.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={!sheetsConnected || busyAction !== null}
                onClick={() => setConfirmModal({ type: 'create_sheet' })}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 disabled:opacity-40 transition-colors"
              >
                {busyAction === 'create_sheet' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <PlusCircle className="w-4 h-4" />
                )}
                Create Cafe Backup Sheet
              </button>
              <button
                type="button"
                onClick={() => setShowLinkBox((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-stone-200 bg-white text-stone-700 text-xs font-semibold hover:bg-stone-100 transition-colors"
              >
                <Link2 className="w-3.5 h-3.5" />
                Link Existing ID
              </button>
            </div>
          </div>
        )}

        {/* Link Existing Sheet Input */}
        {showLinkBox && (
          <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-2.5">
            <label className="block text-xs font-bold text-stone-700">
              Paste Existing Google Sheet URL or Spreadsheet ID
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                className="flex-1 px-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
              />
              <button
                type="button"
                disabled={busyAction !== null || !sheetsConnected}
                onClick={handleLinkExisting}
                className="px-4 py-2 rounded-xl bg-stone-900 text-white text-xs font-bold hover:bg-stone-800 disabled:opacity-40 transition-colors"
              >
                {busyAction === 'link' ? 'Linking...' : 'Verify & Link'}
              </button>
            </div>
          </div>
        )}

        {/* Sync Controls */}
        {cafe.googleSpreadsheetId && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              disabled={!sheetsConnected || busyAction !== null}
              onClick={() => setConfirmModal({ type: 'push_full' })}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-800 text-xs font-bold transition-colors disabled:opacity-40"
            >
              {busyAction === 'push_full' ? (
                <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
              ) : (
                <ArrowUpFromLine className="w-4 h-4 text-amber-600" />
              )}
              Push Full Backup to Sheet
            </button>

            <button
              type="button"
              disabled={!sheetsConnected || busyAction !== null}
              onClick={handleStartPullPreview}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-800 text-xs font-bold transition-colors disabled:opacity-40"
            >
              {busyAction === 'preview_pull' || busyAction === 'apply_pull' ? (
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              ) : (
                <ArrowDownToLine className="w-4 h-4 text-blue-600" />
              )}
              Pull &amp; Reconcile from Sheet
            </button>

            <button
              type="button"
              disabled={!sheetsConnected || busyAction !== null || pendingQueueCount === 0}
              onClick={handleFlushQueue}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-800 text-xs font-bold transition-colors disabled:opacity-40"
            >
              {busyAction === 'flush' ? (
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
              ) : (
                <RefreshCw className="w-4 h-4 text-emerald-600" />
              )}
              Sync Queued ({pendingQueueCount})
            </button>
          </div>
        )}

        <div className="flex items-start gap-2 text-[11px] text-stone-500 pt-1">
          <ShieldCheck className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
          <p>
            New bills, voided bills, and expense/withdrawal edits automatically sync to your linked Google Sheet while connected. Your Google OAuth token is kept strictly in memory for this tab session and is never written to browser storage.
          </p>
        </div>
      </div>

      {/* Explicit Confirmation Modal for all mutating/bulk actions */}
      {confirmModal && (
        <div className="fixed inset-0 z-[70] bg-stone-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between bg-stone-50">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h4 className="text-sm font-bold text-stone-900">
                  {confirmModal.type === 'create_sheet' && 'Create New Google Sheets Backup Workbook?'}
                  {confirmModal.type === 'push_full' && 'Overwrite Google Sheet with POS Database?'}
                  {confirmModal.type === 'pull_reconcile' && 'Apply Google Sheet Changes to POS Database?'}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs text-stone-600">
              {confirmModal.type === 'create_sheet' && (
                <>
                  <p>
                    This will create a new Google Spreadsheet in your Google Drive titled{' '}
                    <strong className="text-stone-900">
                      {cafe.name} — POS Sales &amp; Expenses Backup
                    </strong>{' '}
                    and populate it with:
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-stone-700">
                    <li>
                      <strong>All Sales</strong> tab ({bills.length} current POS bills)
                    </li>
                    <li>
                      <strong>Daily Sales Tabs</strong> grouped by your cafe shift hours ({cafe.openingTime || '00:00'} – {cafe.closingTime || '23:59'}) with live Cash/UPI/Card/NET TOTAL formulas
                    </li>
                    <li>
                      <strong>Expenses &amp; Withdrawals</strong> tab ({ledger.length} current entries) with live Payee &amp; Category SUMIFS tables
                    </li>
                  </ul>

                </>
              )}

              {confirmModal.type === 'push_full' && (
                <p>
                  This will rebuild <strong>All Sales</strong> ({bills.length} rows), your recent{' '}
                  <strong>Daily Sales Tabs</strong>, and <strong>Expenses &amp; Withdrawals</strong> ({ledger.length} rows) in{' '}
                  <strong className="text-stone-900">{cafe.googleSheetTitle || 'your linked sheet'}</strong> from the POS database while keeping all live right-side summary formulas intact. Any unsaved manual edits in those sheet ranges will be replaced by POS database values.
                </p>
              )}

              {confirmModal.type === 'pull_reconcile' && (
                <>
                  <p>
                    Scanned <strong>{confirmModal.preview.scannedSalesRows}</strong> sales rows and{' '}
                    <strong>{confirmModal.preview.scannedExpenseRows}</strong> expense rows from your Google Sheet. Confirming will apply these changes to database:
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl border border-stone-200 p-3 bg-stone-50">
                      <div className="text-[11px] font-semibold text-stone-500 uppercase">Sales Tab</div>
                      <div className="mt-1 text-sm font-bold text-stone-900 tabular-nums">
                        +{confirmModal.preview.billsToCreate.length} new · ~{confirmModal.preview.billsToUpdate.length} updated
                      </div>
                    </div>
                    <div className="rounded-xl border border-stone-200 p-3 bg-stone-50">
                      <div className="text-[11px] font-semibold text-stone-500 uppercase">Expenses Tab</div>
                      <div className="mt-1 text-sm font-bold text-stone-900 tabular-nums">
                        +{confirmModal.preview.ledgerToCreate.length} new · ~{confirmModal.preview.ledgerToUpdate.length} updated
                      </div>
                    </div>
                  </div>
                  {(confirmModal.preview.billIdWritebacks.length > 0 ||
                    confirmModal.preview.ledgerIdWritebacks.length > 0) && (
                    <p className="text-[11px] text-stone-500">
                      Generated tracking IDs will also be written back into column A for{' '}
                      {confirmModal.preview.billIdWritebacks.length +
                        confirmModal.preview.ledgerIdWritebacks.length}{' '}
                      manually added sheet row(s) to prevent duplicates on future syncs.
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="px-5 py-3.5 bg-stone-50 border-t border-stone-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 rounded-xl border border-stone-200 bg-white text-stone-700 text-xs font-bold hover:bg-stone-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeConfirmedAction}
                className="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700"
              >
                Confirm &amp; Proceed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
