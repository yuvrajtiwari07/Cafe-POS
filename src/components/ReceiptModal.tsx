import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Printer,
  X,
  Share2,
  CheckCircle2,
  AlertCircle,
  Copy,
  Smartphone,
  Download,
  Bluetooth,
  BluetoothConnected,
  Settings,
} from 'lucide-react';
import { Bill, Cafe, PrinterConfig } from '../types';
import {
  connectBluetoothPrinter,
  generateEscPosBuffer,
  getBluetoothDiagnostics,
  getConnectedDeviceName,
  isBluetoothConnected,
  isBluetoothSupported,
  printToBluetoothDevice,
} from '../services/escpos';
import { showToast } from '../services/toast';

interface ReceiptModalProps {
  bill: Bill | null;
  cafe: Cafe;
  printerConfig: PrinterConfig;
  onClose: () => void;
  onOpenPrinterSettings: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  bill,
  cafe,
  printerConfig,
  onClose,
  onOpenPrinterSettings,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [printStatus, setPrintStatus] = useState<{ success?: boolean; message?: string } | null>(
    null
  );
  const [isSimulatingFeed, setIsSimulatingFeed] = useState<boolean>(false);
  const [connectedName, setConnectedName] = useState<string | null>(getConnectedDeviceName());

  const hasConnected = isBluetoothConnected();
  const hasBtSupport = isBluetoothSupported();
  const diag = getBluetoothDiagnostics();

  useEffect(() => {
    const handlePrinterStateChange = () => {
      setConnectedName(getConnectedDeviceName());
    };
    window.addEventListener('printer_connection_changed', handlePrinterStateChange);
    return () => window.removeEventListener('printer_connection_changed', handlePrinterStateChange);
  }, []);

  useEffect(() => {
    if (!bill) return;

    // Determine UPI amount (either full bill for UPI mode, or UPI split portion)
    const upiAmount =
      bill.paymentMode === 'upi'
        ? bill.grandTotal
        : bill.paymentMode === 'split' && (bill.splitDetails?.upi || 0) > 0
        ? bill.splitDetails!.upi!
        : 0;

    if (upiAmount > 0 && cafe.upiId) {
      const upiUri = `upi://pay?pa=${cafe.upiId}&pn=${encodeURIComponent(
        cafe.name
      )}&am=${upiAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(bill.billNumber)}`;

      QRCode.toDataURL(upiUri, {
        width: 180,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('QR code error', err));
    } else {
      setQrDataUrl('');
    }

    // Auto-print if enabled and printer is connected
    if (printerConfig.autoPrint) {
      handleBluetoothPrint();
    }
  }, [bill, cafe]);

  if (!bill) return null;

  const handleBluetoothPrint = async () => {
    setIsPrinting(true);
    setPrintStatus(null);

    try {
      if (isBluetoothConnected()) {
        // Physical printer connected -> send ESC/POS binary stream
        const buffer = generateEscPosBuffer(bill, cafe, printerConfig.paperWidth);
        await printToBluetoothDevice(buffer);
        setPrintStatus({
          success: true,
          message: `ESC/POS receipt dispatched to ${getConnectedDeviceName() || 'wireless thermal printer'}!`,
        });
        showToast('Receipt printed to Bluetooth printer!', 'success');
      } else if (printerConfig.isSimulated) {
        // Explicit Simulator mode
        setIsSimulatingFeed(true);
        await new Promise((resolve) => setTimeout(resolve, 1400));
        setIsSimulatingFeed(false);
        setPrintStatus({
          success: true,
          message: 'Receipt previewed via Simulator (Enable physical printer in settings to pair).',
        });
      } else if (hasBtSupport) {
        // Not connected yet, but browser supports Bluetooth -> trigger pairing dialog directly!
        setPrintStatus({
          message: 'Select your wireless thermal printer from the browser Bluetooth popup...',
        });
        const pairedName = await connectBluetoothPrinter();
        setConnectedName(pairedName);
        const buffer = generateEscPosBuffer(bill, cafe, printerConfig.paperWidth);
        await printToBluetoothDevice(buffer);
        setPrintStatus({
          success: true,
          message: `Paired and printed receipt to ${pairedName}!`,
        });
        showToast(`Printed to ${pairedName}!`, 'success');
      } else {
        // Browser does not support Web Bluetooth (e.g. iOS Safari, preview iframe, or non-Chrome)
        setPrintStatus({
          success: false,
          message:
            diag.recommendation ||
            'Web Bluetooth is not supported on this browser. Click "System Print" below to print via OS driver.',
        });
        // Prompt system print automatically
        window.print();
      }
    } catch (err: any) {
      setPrintStatus({
        success: false,
        message: err.message || 'Failed to print. Use "System Print" or check printer Bluetooth.',
      });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleSystemPrint = () => {
    window.print();
  };

  const copyBillDetails = () => {
    const text = `Bill ${bill.billNumber} - ${cafe.name}\nTotal: ₹${bill.grandTotal}\nPayment: ${bill.paymentMode.toUpperCase()}\nStatus: ${bill.status.toUpperCase()}`;
    navigator.clipboard.writeText(text);
    showToast('Bill summary copied to clipboard!', 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] border border-[#eedecb]">
        {/* Modal Header */}
        <div className="bg-[#fffbf5] px-4 py-3 border-b border-[#eedecb] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="font-bold text-sm sm:text-base text-[#2b2320]">
              Thermal Invoice {bill.billNumber}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-[#7d6e67] hover:bg-[#f5ede0] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Paper Simulation Area */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#f2ebe1] flex flex-col items-center">
          {/* Authentic Thermal Receipt Paper */}
          <div
            id="thermal-receipt-print-area"
            className={`w-[290px] sm:w-[320px] bg-white text-black p-4 font-mono text-[11px] leading-tight shadow-md rounded-t-sm transition-transform duration-700 select-text ${
              isSimulatingFeed ? 'animate-bounce' : ''
            }`}
            style={{
              boxShadow: '0 4px 15px rgba(0,0,0,0.08)',
            }}
          >
            {/* Cafe Header */}
            <div className="text-center pb-2">
              <h2 className="text-lg sm:text-xl font-black tracking-wide uppercase">{cafe.name}</h2>
              {cafe.tagline && <p className="text-[10px] text-stone-600">{cafe.tagline}</p>}
              {cafe.address && <p className="text-[10px] text-stone-600">{cafe.address}</p>}
              {cafe.phone && <p className="text-[10px] text-stone-600">Ph: {cafe.phone}</p>}
              {cafe.gstin && <p className="text-[10px] text-stone-600">GSTIN: {cafe.gstin}</p>}
              <div className="border-b-2 border-dashed border-black my-2" />
            </div>

            {/* DUPLICATE / REPRINT WATERMARK (Section 32) */}
            {bill.isReprint && (
              <div className="my-2 py-1 bg-stone-100 border border-dashed border-stone-800 text-center rounded">
                <span className="font-black text-xs tracking-widest text-stone-900 block">
                  *** DUPLICATE ***
                </span>
                <span className="text-[9px] text-stone-600 block">REPRINT - HISTORICAL SNAPSHOT</span>
              </div>
            )}

            {/* Bill Meta */}
            <div className="space-y-0.5 text-[10px]">
              <div className="flex justify-between">
                <span>BILL: <strong>{bill.billNumber}</strong></span>
                <span>{bill.orderType.toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span>
                  {new Date(bill.createdAt).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}{' '}
                  {new Date(bill.createdAt).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="font-bold">
                  {!bill.tableOrToken.toLowerCase().startsWith('table')
                    ? `Customer: ${bill.tableOrToken}`
                    : bill.tableOrToken}
                </span>
              </div>
            </div>

            <div className="border-b border-dashed border-black my-2" />

            {/* Items Table */}
            <div className="space-y-1">
              <div className="flex justify-between font-bold border-b border-stone-300 pb-0.5 text-[10px]">
                <span className="w-1/2">ITEM</span>
                <span className="w-12 text-center">QTY</span>
                <span className="w-16 text-right">TOTAL</span>
              </div>

              {bill.items.map((item, idx) => (
                <div key={idx} className="flex flex-col text-[10.5px]">
                  <div className="flex justify-between">
                    <span className="w-1/2 truncate font-medium">{item.name}</span>
                    <span className="w-12 text-center">x{item.quantity}</span>
                    <span className="w-16 text-right font-semibold">
                      ₹{(item.price * item.quantity).toFixed(0)}
                    </span>
                  </div>
                  {item.notes && (
                    <span className="text-[9.5px] text-stone-500 italic pl-1">
                      * {item.notes}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="border-b border-dashed border-black my-2" />

            {/* Totals */}
            <div className="space-y-0.5 text-[10.5px]">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>₹{bill.subtotal.toFixed(2)}</span>
              </div>
              {bill.discountAmount > 0 && (
                <div className="flex justify-between">
                  <span>Discount ({bill.discountPercent}%):</span>
                  <span>-₹{bill.discountAmount.toFixed(2)}</span>
                </div>
              )}
              {bill.taxAmount > 0 && (
                <div className="flex justify-between">
                  <span>Taxes ({bill.taxPercent}%):</span>
                  <span>+₹{bill.taxAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="border-b-2 border-black my-1" />
              <div className="flex justify-between font-extrabold text-sm py-0.5">
                <span>GRAND TOTAL:</span>
                <span>₹{bill.grandTotal.toFixed(2)}</span>
              </div>
              <div className="border-b-2 border-black my-1" />
            </div>

            {/* Payment Mode */}
            {bill.paymentMode === 'split' ? (
              <div className="my-1.5 p-1.5 rounded bg-stone-50 border border-stone-300 text-[10px]">
                <div className="flex justify-between font-bold text-stone-900 border-b border-stone-200 pb-0.5 mb-1">
                  <span>TENDER: SPLIT (CASH + UPI)</span>
                  <span>STATUS: {bill.status.toUpperCase()}</span>
                </div>
                {bill.splitDetails && (
                  <div className="space-y-0.5 text-[9.5px] font-mono text-stone-800">
                    {(bill.splitDetails.cash || 0) > 0 && (
                      <div className="flex justify-between">
                        <span>• Cash Tendered:</span>
                        <span>₹{(bill.splitDetails.cash || 0).toFixed(2)}</span>
                      </div>
                    )}
                    {(bill.splitDetails.upi || 0) > 0 && (
                      <div className="flex justify-between font-bold text-orange-900">
                        <span>• UPI Transferred:</span>
                        <span>₹{(bill.splitDetails.upi || 0).toFixed(2)}</span>
                      </div>
                    )}
                    {(bill.splitDetails.card || 0) > 0 && (
                      <div className="flex justify-between">
                        <span>• Card POS:</span>
                        <span>₹{(bill.splitDetails.card || 0).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex justify-between text-[10px] my-1 font-semibold">
                <span>TENDER: {bill.paymentMode.toUpperCase()}</span>
                <span>STATUS: {bill.status.toUpperCase()}</span>
              </div>
            )}

            {/* Dynamic / Custom UPI QR Code (for UPI mode OR split mode with UPI portion) */}
            {(bill.paymentMode === 'upi' || (bill.paymentMode === 'split' && (bill.splitDetails?.upi || 0) > 0)) &&
              bill.includeQr !== false &&
              (cafe.paymentQrUrl || qrDataUrl) && (
                <div className="text-center my-3 flex flex-col items-center">
                  <p className="font-bold text-[10px] mb-1">
                    {bill.paymentMode === 'split' ? 'SCAN TO PAY REMAINING UPI' : 'SCAN TO PAY VIA UPI'}
                  </p>
                  <img
                    src={cafe.paymentQrUrl || qrDataUrl}
                    alt="UPI QR Code"
                    className="w-28 h-28 border border-black p-1 bg-white object-contain"
                  />
                  <p className="text-[9px] mt-1 text-stone-600 font-mono">
                    UPI Amount:{' '}
                    ₹{bill.paymentMode === 'split' ? (bill.splitDetails?.upi || 0).toFixed(2) : bill.grandTotal.toFixed(2)}
                  </p>
                  <p className="text-[9px] text-stone-600">{cafe.upiId}</p>
                  <p className="text-[9px] text-stone-600">Scan via GPay / PhonePe / Paytm / BHIM</p>
                </div>
              )}

            {/* Footer */}
            <div className="text-center pt-2 text-[9.5px] text-stone-700">
              <p className="font-bold">*** THANK YOU! VISIT AGAIN ***</p>
              {cafe.phone && <p className="text-[8.5px] text-stone-500 mt-0.5">For Orders: {cafe.phone}</p>}
              <div className="h-4" /> {/* 1 extra blank line at the bottom */}
            </div>

            {/* Jagged / Serrated paper bottom edge */}
            <div className="mt-3 flex justify-center gap-1 overflow-hidden opacity-60 print:hidden">
              {Array.from({ length: 24 }).map((_, i) => (
                <div
                  key={i}
                  className="w-2.5 h-2.5 rotate-45 bg-[#f2ebe1] -mb-1.5 shrink-0"
                />
              ))}
            </div>
          </div>
        </div>

        {/* Status Message */}
        {printStatus && (
          <div
            className={`px-4 py-2 text-xs flex items-center gap-1.5 ${
              printStatus.success
                ? 'bg-emerald-50 text-emerald-800 border-t border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-t border-rose-200'
            }`}
          >
            {printStatus.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{printStatus.message}</span>
          </div>
        )}

        {/* Printer Status Strip */}
        <div className="bg-[#f5ede0] px-4 py-2 border-t border-[#eedecb] flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5 truncate">
            {isBluetoothConnected() ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="font-bold text-emerald-900 truncate">
                  BT: {connectedName || 'Wireless Thermal Printer'} ({printerConfig.paperWidth}mm)
                </span>
              </>
            ) : printerConfig.isSimulated ? (
              <>
                <span className="w-2 h-2 rounded-full bg-stone-400 shrink-0" />
                <span className="text-[#615149]">Simulator Mode ({printerConfig.paperWidth}mm)</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                <span className="text-[#615149]">No Bluetooth printer connected</span>
              </>
            )}
          </div>

          <button
            onClick={onOpenPrinterSettings}
            className="flex items-center gap-1 text-[#ea580c] hover:text-[#c2410c] font-bold text-[11px] underline cursor-pointer shrink-0 ml-2"
          >
            <Settings className="w-3 h-3" />
            <span>Setup & Help</span>
          </button>
        </div>

        {/* Modal Actions Footer */}
        <div className="bg-[#fffbf5] p-3 sm:p-4 border-t border-[#eedecb] flex flex-col sm:flex-row gap-2">
          {/* Bluetooth Print Button */}
          <button
            onClick={handleBluetoothPrint}
            disabled={isPrinting}
            className="flex-1 flex items-center justify-center gap-2 bg-[#ea580c] hover:bg-[#c2410c] text-white py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold shadow-xs transition active:scale-[0.99] cursor-pointer disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span>
              {isPrinting
                ? 'Processing...'
                : isBluetoothConnected()
                ? 'Print Bluetooth Thermal'
                : 'Pair & Print Bluetooth'}
            </span>
          </button>

          {/* System Print (USB / PDF / OS Print) */}
          <button
            onClick={handleSystemPrint}
            className="flex items-center justify-center gap-1.5 bg-[#f4ebe1] hover:bg-[#eedecb] text-[#2b2320] py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer"
            title="Open system print dialog for USB, Bluetooth Classic, or AirPrint"
          >
            <Download className="w-4 h-4" />
            <span>System Print</span>
          </button>

          {/* Copy Summary */}
          <button
            onClick={copyBillDetails}
            className="p-2.5 rounded-xl bg-[#f4ebe1] hover:bg-[#eedecb] text-[#7d6e67] hover:text-[#2b2320] transition cursor-pointer"
            title="Copy bill text"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
