import React, { useEffect, useState } from 'react';
import {
  Settings,
  Store,
  CreditCard,
  Receipt,
  Boxes,
  AlertOctagon,
  Save,
  AlertTriangle,
  Smartphone,
  Download,
  Clock,
} from 'lucide-react';
import { Bill, Cafe, InventoryMode, LedgerEntry, PrinterConfig } from '../types';
import { db, cleanFirestoreData } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { showToast } from '../services/toast';
import { GoogleSheetsSyncPanel } from './GoogleSheetsSyncPanel';
import {
  DEFAULT_CLOSING_TIME,
  DEFAULT_OPENING_TIME,
  formatBusinessDayRange,
  formatHumanDate,
  formatTime12h,
  getCurrentBusinessDateStr,
  isOvernightShift,
} from '../utils/dateUtils';

interface SettingsManagerProps {
  cafe: Cafe;
  bills: Bill[];
  ledger: LedgerEntry[];
  printerConfig: PrinterConfig;
  onCafeUpdated: (updated: Cafe) => void;
  onBillsUpdated: (updated: Bill[]) => void;
  onLedgerUpdated: (updated: LedgerEntry[]) => void;
  onPrinterConfigUpdated: (cfg: PrinterConfig) => void;
  onClearMenu?: () => void;
  onOpenAndroidInstallModal?: () => void;
}

export const SettingsManager: React.FC<SettingsManagerProps> = ({
  cafe,
  bills,
  ledger,
  printerConfig,
  onCafeUpdated,
  onBillsUpdated,
  onLedgerUpdated,
  onPrinterConfigUpdated,
  onClearMenu,
  onOpenAndroidInstallModal,
}) => {
  // General
  const [name, setName] = useState(cafe.name);
  const [tagline, setTagline] = useState(cafe.tagline || '');
  const [phone, setPhone] = useState(cafe.phone);
  const [address, setAddress] = useState(cafe.address);
  const [gstin, setGstin] = useState(cafe.gstin || '');
  const [fssai, setFssai] = useState(cafe.fssai || '');

  // Payments
  const [upiId, setUpiId] = useState(cafe.upiId);
  const [paymentQrUrl, setPaymentQrUrl] = useState(cafe.paymentQrUrl || '');

  // Receipt & Printer
  const [receiptHeader, setReceiptHeader] = useState(cafe.receiptHeader || '');
  const [receiptFooter, setReceiptFooter] = useState(cafe.receiptFooter || '*** THANK YOU! VISIT AGAIN ***');
  const [receiptPrefix, setReceiptPrefix] = useState(cafe.receiptPrefix || 'POS');
  const [showCashier, setShowCashier] = useState(cafe.showCashierOnReceipt !== false);
  const [showGst, setShowGst] = useState(cafe.showGstOnReceipt !== false);
  const [paperWidth, setPaperWidth] = useState<58 | 80>(printerConfig.paperWidth || 58);

  // Inventory
  const [inventoryMode, setInventoryMode] = useState<InventoryMode>(cafe.inventoryMode || 'TRACK_ONLY');

  // Business Day & Operating Hours
  const [openingTime, setOpeningTime] = useState<string>(cafe.openingTime || DEFAULT_OPENING_TIME);
  const [closingTime, setClosingTime] = useState<string>(cafe.closingTime || DEFAULT_CLOSING_TIME);

  // Sync local form state when switching cafes or receiving updated hours from Firestore
  useEffect(() => {
    setName(cafe.name);
    setTagline(cafe.tagline || '');
    setPhone(cafe.phone);
    setAddress(cafe.address);
    setGstin(cafe.gstin || '');
    setFssai(cafe.fssai || '');
    setUpiId(cafe.upiId);
    setPaymentQrUrl(cafe.paymentQrUrl || '');
    setReceiptHeader(cafe.receiptHeader || '');
    setReceiptFooter(cafe.receiptFooter || '*** THANK YOU! VISIT AGAIN ***');
    setReceiptPrefix(cafe.receiptPrefix || 'POS');
    setShowCashier(cafe.showCashierOnReceipt !== false);
    setShowGst(cafe.showGstOnReceipt !== false);
    setInventoryMode(cafe.inventoryMode || 'TRACK_ONLY');
    setOpeningTime(cafe.openingTime || DEFAULT_OPENING_TIME);
    setClosingTime(cafe.closingTime || DEFAULT_CLOSING_TIME);
  }, [cafe.id, cafe.openingTime, cafe.closingTime]);

  // Danger Zone
  const [showClearMenuConfirm, setShowClearMenuConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const currentBizDate = getCurrentBusinessDateStr(openingTime, closingTime);
  const isOvernight = isOvernightShift(openingTime, closingTime);
  const sampleRange = formatBusinessDayRange(currentBizDate, openingTime, closingTime);

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const updatedCafe: Cafe = {
        ...cafe,
        name: name.trim(),
        tagline: tagline.trim(),
        phone: phone.trim(),
        address: address.trim(),
        gstin: gstin.trim(),
        fssai: fssai.trim(),
        upiId: upiId.trim(),
        paymentQrUrl: paymentQrUrl.trim(),
        receiptHeader: receiptHeader.trim(),
        receiptFooter: receiptFooter.trim(),
        receiptPrefix: receiptPrefix.trim().toUpperCase(),
        showCashierOnReceipt: showCashier,
        showGstOnReceipt: showGst,
        inventoryMode,
        openingTime: openingTime || DEFAULT_OPENING_TIME,
        closingTime: closingTime || DEFAULT_CLOSING_TIME,
        updatedAt: new Date().toISOString(),
      };

      onCafeUpdated(updatedCafe);

      // Update printer config
      const updatedPrinter: PrinterConfig = {
        ...printerConfig,
        paperWidth,
      };
      onPrinterConfigUpdated(updatedPrinter);

      if (cafe.id && cafe.id !== 'default-corner-cafe') {
        await setDoc(doc(db, 'cafes', cafe.id), cleanFirestoreData(updatedCafe), { merge: true });
      }

      showToast('Restaurant settings & business hours saved to cafe database!', 'success');
    } catch (err: any) {
      console.error('Error saving cafe settings:', err);
      showToast(err?.message ? `Saved locally. Cloud error: ${err.message}` : 'Error saving settings to cloud', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExecuteClearMenu = () => {
    onClearMenu?.();
    setShowClearMenuConfirm(false);
    showToast('Menu items cleared.', 'info');
  };

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 space-y-5">
      <div className="bg-[#fffbf5] p-4 rounded-2xl border border-[#eedecb] shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-orange-100 text-[#ea580c] flex items-center justify-center">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-base text-[#2b2320]">Restaurant Settings</h2>
            <p className="text-xs text-[#7d6e67]">General branding, taxes, custom receipts, and inventory control</p>
          </div>
        </div>

        <button
          onClick={handleSaveAll}
          disabled={isSaving}
          className="bg-[#ea580c] hover:bg-[#c2410c] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
        </button>
      </div>

      {/* GOOGLE SHEETS LIVE BACKUP & TWO-WAY SYNC */}
      <GoogleSheetsSyncPanel
        cafe={cafe}
        bills={bills}
        ledger={ledger}
        onCafeUpdated={onCafeUpdated}
        onBillsUpdated={onBillsUpdated}
        onLedgerUpdated={onLedgerUpdated}
      />

      <form onSubmit={handleSaveAll} className="space-y-4">
        {/* SECTION 1: GENERAL BRANDING */}
        <div className="bg-white p-4 rounded-2xl border border-[#eedecb] shadow-xs space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-[#eedecb]">
            <Store className="w-4 h-4 text-[#ea580c]" />
            <h3 className="font-bold text-sm text-[#2b2320]">General Restaurant Profile</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-[11px] font-bold text-stone-700 block mb-1">Restaurant Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#faf6f0] px-3 py-1.5 rounded-xl border border-[#eedecb] font-semibold text-[#2b2320] outline-hidden focus:border-[#ea580c]"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-stone-700 block mb-1">Tagline / Motto</label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className="w-full bg-[#faf6f0] px-3 py-1.5 rounded-xl border border-[#eedecb] font-medium text-[#2b2320] outline-hidden"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-stone-700 block mb-1">Phone Number *</label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-[#faf6f0] px-3 py-1.5 rounded-xl border border-[#eedecb] font-semibold text-[#2b2320] outline-hidden"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-stone-700 block mb-1">Address / Location</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full bg-[#faf6f0] px-3 py-1.5 rounded-xl border border-[#eedecb] font-medium text-[#2b2320] outline-hidden"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-stone-700 block mb-1">GSTIN Number (Optional)</label>
              <input
                type="text"
                placeholder="27AABCC1234F1Z8"
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
                className="w-full bg-[#faf6f0] px-3 py-1.5 rounded-xl border border-[#eedecb] font-mono text-xs outline-hidden"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-stone-700 block mb-1">FSSAI License No. (Optional)</label>
              <input
                type="text"
                placeholder="10012345678901"
                value={fssai}
                onChange={(e) => setFssai(e.target.value)}
                className="w-full bg-[#faf6f0] px-3 py-1.5 rounded-xl border border-[#eedecb] font-mono text-xs outline-hidden"
              />
            </div>
          </div>
        </div>

        {/* SECTION 1B: BUSINESS DAY & OPERATING HOURS */}
        <div className="bg-white p-4 rounded-2xl border border-[#eedecb] shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#eedecb]">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#ea580c]" />
              <h3 className="font-bold text-sm text-[#2b2320]">Business Day & Operating Hours</h3>
            </div>
            <span className="text-[11px] font-semibold text-[#7d6e67]">
              Saved per cafe · Controls Daily Reports, Z-Report & Transactions logs
            </span>
          </div>

          <p className="text-xs text-[#6d5e56] leading-relaxed">
            Set your cafe&apos;s opening and closing times. If you operate past midnight (for example <strong className="text-[#2b2320]">4:00 PM to 6:00 AM next day</strong>), all overnight transactions stay grouped under the same business day instead of splitting at midnight.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-[11px] font-bold text-stone-700 block mb-1">Opening Time</label>
              <input
                type="time"
                value={openingTime}
                onChange={(e) => setOpeningTime(e.target.value || DEFAULT_OPENING_TIME)}
                className="w-full bg-[#faf6f0] px-3 py-2 rounded-xl border border-[#eedecb] font-bold font-mono tabular-nums text-[#2b2320] outline-hidden focus:border-[#ea580c]"
              />
              <span className="text-[10px] text-[#7d6e67] mt-1 block">
                Starts at <strong className="text-[#2b2320]">{formatTime12h(openingTime)}</strong>
              </span>
            </div>

            <div>
              <label className="text-[11px] font-bold text-stone-700 block mb-1">Closing Time</label>
              <input
                type="time"
                value={closingTime}
                onChange={(e) => setClosingTime(e.target.value || DEFAULT_CLOSING_TIME)}
                className="w-full bg-[#faf6f0] px-3 py-2 rounded-xl border border-[#eedecb] font-bold font-mono tabular-nums text-[#2b2320] outline-hidden focus:border-[#ea580c]"
              />
              <span className="text-[10px] text-[#7d6e67] mt-1 block">
                Ends at <strong className="text-[#2b2320]">{formatTime12h(closingTime)}</strong>
                {isOvernight ? ' (next morning)' : ' (same day)'}
              </span>
            </div>
          </div>

          {/* Quick Schedule Presets */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] font-semibold text-[#7d6e67] mr-1">Quick Presets:</span>
            {[
              { label: '4:00 PM – 6:00 AM (Night Cafe)', open: '16:00', close: '06:00' },
              { label: '11:00 AM – 2:00 AM', open: '11:00', close: '02:00' },
              { label: '9:00 AM – 11:00 PM', open: '09:00', close: '23:00' },
              { label: 'Standard Calendar Day (12 AM – 11:59 PM)', open: '00:00', close: '23:59' },
            ].map((preset) => {
              const isSelected = openingTime === preset.open && closingTime === preset.close;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setOpeningTime(preset.open);
                    setClosingTime(preset.close);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'bg-[#ea580c] text-white border-[#ea580c] shadow-xs'
                      : 'bg-[#faf6f0] text-[#615149] border-[#eedecb] hover:bg-[#f4ebe1]'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Live Shift Window Preview */}
          <div className="p-3 rounded-xl bg-[#fbf6ee] border border-[#eedecb] text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="font-bold text-[#2b2320] block">
                {isOvernight ? 'Overnight Shift Mode Active' : 'Same-Day Shift Mode'}
              </span>
              <span className="text-[11px] text-[#7d6e67]">
                Active Business Day ({formatHumanDate(currentBizDate)}):{' '}
                <strong className="text-[#ea580c]">{sampleRange}</strong>
              </span>
            </div>
            <span className="text-[11px] font-mono font-bold text-[#2b2320] tabular-nums">
              {openingTime} → {closingTime}{isOvernight ? ' (+1d)' : ''}
            </span>
          </div>
        </div>

        {/* SECTION 2: PAYMENTS & UPI */}
        <div className="bg-white p-4 rounded-2xl border border-[#eedecb] shadow-xs space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-[#eedecb]">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            <h3 className="font-bold text-sm text-[#2b2320]">Payments & Digital UPI</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-[11px] font-bold text-stone-700 block mb-1">Merchant UPI VPA ID *</label>
              <input
                type="text"
                required
                placeholder="e.g. cafe@okhdfcbank"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                className="w-full bg-[#faf6f0] px-3 py-1.5 rounded-xl border border-[#eedecb] font-mono font-semibold text-emerald-800 outline-hidden"
              />
              <p className="text-[10px] text-stone-500 mt-1">
                Used to dynamically generate bill-specific QR codes with exact amounts.
              </p>
            </div>

            <div>
              <label className="text-[11px] font-bold text-stone-700 block mb-1">Custom Standee QR Image URL</label>
              <input
                type="url"
                placeholder="https://..."
                value={paymentQrUrl}
                onChange={(e) => setPaymentQrUrl(e.target.value)}
                className="w-full bg-[#faf6f0] px-3 py-1.5 rounded-xl border border-[#eedecb] text-xs outline-hidden"
              />
            </div>
          </div>
        </div>

        {/* SECTION 3: THERMAL RECEIPT CUSTOMIZATION */}
        <div className="bg-white p-4 rounded-2xl border border-[#eedecb] shadow-xs space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-[#eedecb]">
            <Receipt className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-sm text-[#2b2320]">Thermal Receipt Customization</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-[11px] font-bold text-stone-700 block mb-1">Printer Paper Width</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaperWidth(58)}
                  className={`py-1.5 rounded-xl font-bold border transition ${
                    paperWidth === 58
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-stone-50 text-stone-700 border-stone-200'
                  }`}
                >
                  58mm (Standard Mobile)
                </button>
                <button
                  type="button"
                  onClick={() => setPaperWidth(80)}
                  className={`py-1.5 rounded-xl font-bold border transition ${
                    paperWidth === 80
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-stone-50 text-stone-700 border-stone-200'
                  }`}
                >
                  80mm (Wide Desktop)
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-stone-700 block mb-1">Receipt Prefix</label>
              <input
                type="text"
                placeholder="POS"
                value={receiptPrefix}
                onChange={(e) => setReceiptPrefix(e.target.value)}
                className="w-full bg-[#faf6f0] px-3 py-1.5 rounded-xl border border-[#eedecb] font-mono font-bold uppercase text-stone-900 outline-hidden"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-[11px] font-bold text-stone-700 block mb-1">Receipt Footer Note</label>
              <input
                type="text"
                placeholder="*** THANK YOU! VISIT AGAIN ***"
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
                className="w-full bg-[#faf6f0] px-3 py-1.5 rounded-xl border border-[#eedecb] font-medium text-stone-800 outline-hidden"
              />
            </div>

            <div className="flex items-center gap-4 pt-1 sm:col-span-2">
              <label className="flex items-center gap-1.5 cursor-pointer font-bold text-stone-700">
                <input
                  type="checkbox"
                  checked={showCashier}
                  onChange={(e) => setShowCashier(e.target.checked)}
                  className="rounded text-[#ea580c]"
                />
                <span>Print Cashier Name on Receipt</span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer font-bold text-stone-700">
                <input
                  type="checkbox"
                  checked={showGst}
                  onChange={(e) => setShowGst(e.target.checked)}
                  className="rounded text-[#ea580c]"
                />
                <span>Print GSTIN on Receipt</span>
              </label>
            </div>
          </div>
        </div>

        {/* SECTION 4: INVENTORY MODE */}
        <div className="bg-white p-4 rounded-2xl border border-[#eedecb] shadow-xs space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-[#eedecb]">
            <Boxes className="w-4 h-4 text-[#ea580c]" />
            <h3 className="font-bold text-sm text-[#2b2320]">Inventory Enforcement Mode</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <button
              type="button"
              onClick={() => setInventoryMode('STRICT')}
              className={`p-3 rounded-xl border text-left transition ${
                inventoryMode === 'STRICT'
                  ? 'bg-rose-50 border-rose-500 shadow-xs'
                  : 'bg-[#faf6f0] border-[#eedecb] hover:bg-stone-50'
              }`}
            >
              <h4 className="font-bold text-stone-900 mb-0.5">STRICT</h4>
              <p className="text-[11px] text-stone-600">
                Blocks checkout completely if any ingredient stock is insufficient.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setInventoryMode('WARNING')}
              className={`p-3 rounded-xl border text-left transition ${
                inventoryMode === 'WARNING'
                  ? 'bg-amber-50 border-amber-500 shadow-xs'
                  : 'bg-[#faf6f0] border-[#eedecb] hover:bg-stone-50'
              }`}
            >
              <h4 className="font-bold text-stone-900 mb-0.5">WARNING</h4>
              <p className="text-[11px] text-stone-600">
                Warns cashier if ingredients are low, but allows them to proceed.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setInventoryMode('TRACK_ONLY')}
              className={`p-3 rounded-xl border text-left transition ${
                inventoryMode === 'TRACK_ONLY'
                  ? 'bg-emerald-50 border-emerald-500 shadow-xs'
                  : 'bg-[#faf6f0] border-[#eedecb] hover:bg-stone-50'
              }`}
            >
              <h4 className="font-bold text-stone-900 mb-0.5">TRACK ONLY</h4>
              <p className="text-[11px] text-stone-600">
                Silently deducts stock and records movement history without blocking POS.
              </p>
            </button>
          </div>
        </div>

        {/* SECTION: ANDROID & MOBILE APP */}
        <div className="bg-orange-50/50 p-4 rounded-2xl border border-orange-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-orange-200">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-[#ea580c]" />
              <h3 className="font-bold text-sm text-[#2b2320]">Android App & Multi-Device Setup</h3>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-[#ea580c] px-2 py-0.5 rounded-full">
              Unified Cloud DB
            </span>
          </div>

          <p className="text-xs text-stone-600 leading-relaxed">
            Run Corner Cafe POS on Android phones and tablets. Real-time Firebase Firestore synchronization keeps all your cafes, tables, menu items, bills, and stock deductions identical everywhere.
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onOpenAndroidInstallModal}
              className="px-4 py-2 bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-xs transition cursor-pointer"
            >
              <Smartphone className="w-4 h-4" />
              <span>Install / Download Android App</span>
            </button>

            <a
              href="/download/corner-cafe-pos-android.zip"
              download="CornerCafePOS-Android.zip"
              className="px-4 py-2 bg-white hover:bg-stone-50 border border-stone-300 text-stone-800 font-bold rounded-xl text-xs flex items-center gap-2 shadow-xs transition cursor-pointer"
            >
              <Download className="w-4 h-4 text-stone-600" />
              <span>Download Android Studio Project (.zip)</span>
            </a>
          </div>
        </div>

        {/* SECTION 5: DANGER ZONE (Section 38: DANGER ZONE - Clear Menu) */}
        <div className="bg-rose-50/50 p-4 rounded-2xl border border-rose-200 shadow-xs space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-rose-200">
            <AlertOctagon className="w-4 h-4 text-rose-600" />
            <h3 className="font-bold text-sm text-rose-900">Danger Zone</h3>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div>
              <h4 className="font-bold text-stone-900">Clear Menu Items</h4>
              <p className="text-[11px] text-stone-600">
                Removes all menu dishes. Useful if uploading a completely fresh seasonal menu.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowClearMenuConfirm(true)}
              className="px-3 py-1.5 rounded-xl bg-white border border-rose-300 text-rose-700 hover:bg-rose-600 hover:text-white font-bold transition shadow-xs cursor-pointer shrink-0"
            >
              Clear Menu Dishes
            </button>
          </div>
        </div>
      </form>

      {/* CONFIRMATION: CLEAR MENU MODAL */}
      {showClearMenuConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl border border-rose-300 space-y-3 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Clear All Menu Items?</span>
            </div>

            <p className="text-xs text-stone-700">
              This will remove all menu dishes from this restaurant. Existing bills and past sales reports will remain intact.
            </p>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClearMenuConfirm(false)}
                className="flex-1 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteClearMenu}
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs cursor-pointer"
              >
                Yes, Clear Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
