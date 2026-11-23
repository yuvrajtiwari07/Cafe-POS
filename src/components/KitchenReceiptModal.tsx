import React, { useState } from 'react';
import {
  Printer,
  X,
  CheckCircle2,
  AlertCircle,
  ChefHat,
  Clock,
  Layers,
  UtensilsCrossed,
} from 'lucide-react';
import { Cafe, KitchenOrderTicket, PrinterConfig } from '../types';
import {
  generateKOTEscPosBuffer,
  isBluetoothConnected,
  getConnectedDeviceName,
  printToBluetoothDevice,
  connectBluetoothPrinter,
  isBluetoothSupported,
} from '../services/escpos';
import { showToast } from '../services/toast';

interface KitchenReceiptModalProps {
  kot: KitchenOrderTicket | null;
  cafe: Cafe;
  printerConfig: PrinterConfig;
  onClose: () => void;
}

export const KitchenReceiptModal: React.FC<KitchenReceiptModalProps> = ({
  kot,
  cafe,
  printerConfig,
  onClose,
}) => {
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [printStatus, setPrintStatus] = useState<{ success?: boolean; message?: string } | null>(
    null
  );

  if (!kot) return null;

  const totalItemsCount = kot.items.reduce((sum, i) => sum + i.quantity, 0);

  const handleBluetoothPrint = async () => {
    setIsPrinting(true);
    setPrintStatus(null);

    try {
      if (isBluetoothConnected()) {
        const buffer = generateKOTEscPosBuffer(kot, cafe.name, printerConfig.paperWidth);
        await printToBluetoothDevice(buffer);
        setPrintStatus({
          success: true,
          message: `KOT ticket printed to ${getConnectedDeviceName() || 'Kitchen Printer'}!`,
        });
        showToast('Kitchen Ticket printed successfully!', 'success');
        setTimeout(() => onClose(), 1200);
      } else if (isBluetoothSupported()) {
        setPrintStatus({
          message: 'Connecting to wireless kitchen printer...',
        });
        await connectBluetoothPrinter();
        const buffer = generateKOTEscPosBuffer(kot, cafe.name, printerConfig.paperWidth);
        await printToBluetoothDevice(buffer);
        setPrintStatus({
          success: true,
          message: 'Connected & KOT ticket printed!',
        });
        showToast('KOT printed successfully!', 'success');
        setTimeout(() => onClose(), 1200);
      } else {
        window.print();
        setPrintStatus({
          success: true,
          message: 'Opened system print dialog.',
        });
      }
    } catch (err: any) {
      console.error('KOT Print Error', err);
      setPrintStatus({
        success: false,
        message: err.message || 'Failed to print KOT. Try system print.',
      });
      showToast(err.message || 'Printer error', 'error');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleSystemPrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-sm bg-[#faf6f0] rounded-3xl shadow-2xl border border-[#e8d7c3] overflow-hidden my-4 animate-in fade-in zoom-in-95 duration-150">
        {/* Header Bar */}
        <div className="bg-[#2b2320] text-amber-50 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-orange-600/30 flex items-center justify-center border border-orange-500/40">
              <ChefHat className="w-4 h-4 text-orange-400" />
            </div>
            <div>
              <h2 className="font-bold text-sm tracking-wide">Kitchen Order Ticket</h2>
              <p className="text-[10px] text-amber-200/70">KOT for Chef / Prep Station</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-amber-200/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Paper Receipt Body */}
        <div className="p-4 bg-[#fcf9f5] border-b border-[#eedecb]">
          <div
            id="kot-thermal-receipt"
            className="bg-white p-4 rounded-xl shadow-xs border border-stone-200 font-mono text-stone-900 text-xs"
          >
            {/* Table or Customer Name (No Order ID / Bill No per request) */}
            <div className="pb-2.5 border-b-2 border-stone-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-stone-800 text-xs">
                  {!kot.tableNumber.toLowerCase().startsWith('table') ? 'CUSTOMER:' : 'TABLE NO:'}
                </span>
                <span className="font-black text-lg text-[#ea580c] bg-orange-50 px-2.5 py-0.5 rounded border border-orange-200">
                  {kot.tableNumber}
                </span>
              </div>
            </div>

            {/* Items Column Header */}
            <div className="py-1.5 flex justify-between font-black text-[10px] text-stone-500 uppercase border-b border-stone-200">
              <span>QTY</span>
              <span>ITEM & SPECIAL INSTRUCTION</span>
            </div>

            {/* Items List (Strictly Kitchen Spec: NO prices!) */}
            <div className="py-2 divide-y divide-stone-100">
              {kot.items.map((item, idx) => (
                <div key={idx} className="py-1.5 flex items-start gap-2">
                  <span className="w-7 text-center font-black text-sm text-[#ea580c] bg-orange-50/80 rounded py-0.5 border border-orange-200/60 shrink-0">
                    {item.quantity}x
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[12px] leading-tight text-stone-900">
                      {item.name}
                    </p>
                    {item.notes && item.notes.trim() && (
                      <p className="text-[10px] font-semibold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded mt-1 border border-rose-200/60 inline-block">
                        ★ {item.notes.trim()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Counts */}
            <div className="border-t-2 border-stone-800 pt-2 flex items-center justify-between font-black text-xs">
              <span>TOTAL ITEMS:</span>
              <span className="text-sm bg-stone-100 px-2 py-0.5 rounded">
                {totalItemsCount} items
              </span>
            </div>

            {/* Serrated Cut Edge */}
            <div className="mt-2 flex justify-center gap-1 overflow-hidden opacity-50 print:hidden">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="w-2.5 h-2.5 rotate-45 bg-[#fcf9f5] -mb-1.5 shrink-0" />
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

        {/* Action Buttons */}
        <div className="p-3 bg-[#faf6f0] flex flex-col gap-2">
          <button
            onClick={handleBluetoothPrint}
            disabled={isPrinting}
            className="w-full bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-sm transition active:scale-[0.98] cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>
              {isPrinting
                ? 'Sending to Printer...'
                : isBluetoothConnected()
                ? `Print to ${getConnectedDeviceName() || 'Thermal Printer'}`
                : 'Print Kitchen Ticket'}
            </span>
          </button>

          <div className="flex gap-2">
            <button
              onClick={handleSystemPrint}
              className="flex-1 bg-white hover:bg-stone-50 text-stone-700 font-semibold py-2 px-3 rounded-xl border border-stone-300 text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>System Print</span>
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-[#ede4d8] hover:bg-[#e4d9cb] text-[#423730] font-semibold py-2 px-3 rounded-xl text-xs flex items-center justify-center transition cursor-pointer"
            >
              Done / Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
