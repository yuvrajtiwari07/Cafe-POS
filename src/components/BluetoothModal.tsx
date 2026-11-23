import React, { useState } from 'react';
import {
  Printer,
  Bluetooth,
  BluetoothConnected,
  CheckCircle2,
  AlertCircle,
  X,
  FileText,
  Sliders,
  ExternalLink,
  HelpCircle,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { PrinterConfig } from '../types';
import {
  connectBluetoothPrinter,
  disconnectBluetooth,
  getBluetoothDiagnostics,
  isBluetoothConnected,
  isBluetoothSupported,
  printToBluetoothDevice,
} from '../services/escpos';
import { savePrinterConfig } from '../services/storage';

interface BluetoothModalProps {
  config: PrinterConfig;
  onConfigChange: (cfg: PrinterConfig) => void;
  onClose: () => void;
}

export const BluetoothModal: React.FC<BluetoothModalProps> = ({
  config,
  onConfigChange,
  onClose,
}) => {
  const [connecting, setConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [testSuccess, setTestSuccess] = useState<string | null>(null);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);

  const isConnected = isBluetoothConnected();
  const hasBtSupport = isBluetoothSupported();
  const diag = getBluetoothDiagnostics();

  const handleConnect = async () => {
    setConnecting(true);
    setErrorMsg(null);
    setTestSuccess(null);

    try {
      const deviceName = await connectBluetoothPrinter();
      const updated: PrinterConfig = {
        ...config,
        isSimulated: false,
        deviceName,
      };
      savePrinterConfig(updated);
      onConfigChange(updated);
      setTestSuccess(`Successfully paired with ${deviceName}!`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Bluetooth connection failed.');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await disconnectBluetooth();
    const updated: PrinterConfig = {
      ...config,
      deviceName: undefined,
      isSimulated: true,
    };
    savePrinterConfig(updated);
    onConfigChange(updated);
  };

  const handleWidthChange = (paperWidth: 58 | 80) => {
    const updated = { ...config, paperWidth };
    savePrinterConfig(updated);
    onConfigChange(updated);
  };

  const handleAutoPrintToggle = (autoPrint: boolean) => {
    const updated = { ...config, autoPrint };
    savePrinterConfig(updated);
    onConfigChange(updated);
  };

  const handleSimulatedToggle = (isSimulated: boolean) => {
    const updated = { ...config, isSimulated };
    savePrinterConfig(updated);
    onConfigChange(updated);
  };

  const handleTestPrint = async () => {
    setErrorMsg(null);
    setTestSuccess(null);

    try {
      if (!isConnected) {
        if (config.isSimulated) {
          setTestSuccess('Test print sent to Simulator successfully (Hardware Simulated mode).');
        } else {
          setErrorMsg('No physical Bluetooth printer connected. Pair a printer above or enable Simulator Mode.');
        }
      } else {
        // Minimal ESC/POS test packet
        const testData = new Uint8Array([
          0x1b, 0x40, // Init
          0x1b, 0x61, 0x01, // Center
          0x1d, 0x21, 0x11, // Double size
          ...Array.from('RESTAURANT POS\n').map((c) => c.charCodeAt(0)),
          0x1d, 0x21, 0x00,
          ...Array.from('Bluetooth Thermal OK!\n--------------------------------\n\n\n').map(
            (c) => c.charCodeAt(0)
          ),
          0x1b, 0x64, 0x03, 0x1d, 0x56, 0x42, 0x00, // Cut
        ]);
        await printToBluetoothDevice(testData);
        setTestSuccess('Test slip printed on wireless thermal printer!');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Test print failed.');
    }
  };

  const openInNewWindow = () => {
    try {
      window.open(window.location.href, '_blank');
    } catch {
      // fallback
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl border border-[#eedecb] max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="bg-[#fffbf5] p-4 border-b border-[#eedecb] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-[#ea580c]" />
            <div>
              <h3 className="font-bold text-base text-[#2b2320]">
                Thermal Printer & Bluetooth Setup
              </h3>
              <p className="text-[11px] text-[#7d6e67]">
                Connect 58mm / 80mm wireless ESC/POS thermal printers
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-[#7d6e67] hover:bg-[#f5ede0] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 text-xs overflow-y-auto flex-1">
          {/* Connection Card */}
          <div className="p-3.5 bg-[#f4ebe1] rounded-2xl border border-[#e3d3c2] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-stone-400'
                  }`}
                />
                <div>
                  <span className="font-bold text-sm text-[#2b2320] block">
                    {isConnected
                      ? config.deviceName || 'Wireless Thermal Printer'
                      : config.isSimulated
                      ? 'Hardware Simulator Active'
                      : 'No Bluetooth Printer Connected'}
                  </span>
                  <span className="text-[10px] text-[#7d6e67]">
                    {isConnected
                      ? 'GATT ESC/POS channel connected'
                      : 'Pair via Bluetooth LE or use direct system thermal print'}
                  </span>
                </div>
              </div>
            </div>

            {hasBtSupport ? (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  {isConnected ? (
                    <button
                      onClick={handleDisconnect}
                      className="flex-1 py-2.5 bg-stone-200 hover:bg-stone-300 text-[#2b2320] font-bold rounded-xl transition cursor-pointer"
                    >
                      Disconnect Printer
                    </button>
                  ) : (
                    <button
                      onClick={handleConnect}
                      disabled={connecting}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold rounded-xl transition cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      <Bluetooth className="w-4 h-4" />
                      <span>{connecting ? 'Searching Bluetooth Devices...' : 'Pair Bluetooth Printer'}</span>
                    </button>
                  )}
                </div>

                {diag.isIframe && (
                  <div className="flex items-center justify-between bg-amber-50 p-2.5 rounded-xl border border-amber-200 text-amber-900 text-[11px] gap-2">
                    <span>
                      <strong>Preview Window Note:</strong> Browser security may block Bluetooth access inside an iframe. If device chooser doesn't appear, open the app in a new tab.
                    </span>
                    <button
                      onClick={openInNewWindow}
                      className="px-2.5 py-1 bg-amber-700 hover:bg-amber-800 text-white rounded-lg font-bold shrink-0 flex items-center gap-1 cursor-pointer"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Open New Tab</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 bg-amber-50 text-amber-900 rounded-xl border border-amber-200 text-[11px] space-y-1.5">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>Web Bluetooth Not Supported on this Browser</span>
                </div>
                <p>
                  {diag.recommendation ||
                    'Web Bluetooth requires Google Chrome or Microsoft Edge on Android, Windows, Mac, or ChromeOS.'}
                </p>
                <div className="pt-1">
                  <span className="font-semibold text-amber-950">
                    💡 You can still print to your Bluetooth printer!
                  </span>{' '}
                  Use the <strong>"System Print"</strong> button on any receipt — it routes through your phone/computer OS print manager to any paired Bluetooth or USB printer.
                </div>
              </div>
            )}
          </div>

          {/* Laptop vs Mobile & Troubleshooting Accordion */}
          <div className="bg-[#fffbf5] rounded-2xl border border-[#eedecb] overflow-hidden">
            <button
              onClick={() => setShowTroubleshooting((prev) => !prev)}
              className="w-full p-3 flex items-center justify-between font-bold text-[#2b2320] hover:bg-[#fbf6ee] cursor-pointer transition text-left"
            >
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-[#ea580c]" />
                <span className="text-xs sm:text-sm">Why does it print on mobile but not on laptop Chrome?</span>
              </div>
              {showTroubleshooting ? (
                <ChevronUp className="w-4 h-4 text-[#7d6e67]" />
              ) : (
                <ChevronDown className="w-4 h-4 text-[#7d6e67]" />
              )}
            </button>

            {showTroubleshooting && (
              <div className="p-3.5 pt-0 space-y-3 text-[11px] text-[#615149] border-t border-[#eedecb]/50">
                <div className="p-2.5 bg-amber-50/80 rounded-xl border border-amber-200 space-y-1.5">
                  <div className="font-bold text-amber-950 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-600" />
                    1. Embedded Preview Iframe (Most Common):
                  </div>
                  <p className="text-amber-900 leading-relaxed">
                    If you are testing this app inside the AI Studio preview window on your laptop, Chrome blocks Web Bluetooth hardware access inside iframes.
                  </p>
                  <button
                    onClick={openInNewWindow}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#ea580c] hover:bg-[#c2410c] text-white rounded-lg font-bold text-[11px] cursor-pointer transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open in New Standalone Tab</span>
                  </button>
                </div>

                <div className="p-2.5 bg-blue-50/80 rounded-xl border border-blue-200 space-y-1">
                  <div className="font-bold text-blue-950 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-600" />
                    2. Connected via USB Cable on Laptop:
                  </div>
                  <p className="text-blue-900 leading-relaxed">
                    Desktop thermal printers are often plugged in via USB cable. Web Bluetooth only scans wireless Bluetooth devices. For USB printers, simply click <strong>"System Print"</strong> on any receipt or ticket — it uses your laptop's installed thermal printer driver directly!
                  </p>
                </div>

                <div className="p-2.5 bg-orange-50/70 rounded-xl border border-orange-200/70 space-y-1">
                  <div className="font-bold text-orange-950 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-orange-600" />
                    3. Windows Bluetooth Pairing (BLE vs Classic SPP):
                  </div>
                  <p className="text-orange-900 leading-relaxed">
                    • <strong>Windows Pairing Requirement:</strong> On Windows laptops, you must pair the printer in <em>Windows Settings &gt; Bluetooth &amp; devices &gt; Add device</em> <strong>before</strong> Chrome can discover it.<br />
                    • <strong>Classic Bluetooth (SPP):</strong> Android Chrome supports dual-mode Bluetooth (SPP &amp; BLE), whereas Windows Chrome Web Bluetooth only connects to BLE (Bluetooth Low Energy). If your printer uses Classic SPP, install its Windows driver and use <strong>"System Print"</strong>.
                  </p>
                </div>

                <div className="p-2.5 bg-stone-100 rounded-xl border border-stone-300 space-y-1">
                  <div className="font-bold text-stone-900 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-stone-600" />
                    4. macOS Bluetooth Permissions:
                  </div>
                  <p className="text-stone-800 leading-relaxed">
                    On Mac, ensure Google Chrome has Bluetooth permission enabled under <em>System Settings &gt; Privacy &amp; Security &gt; Bluetooth &gt; Google Chrome</em> (toggle ON).
                  </p>
                </div>

                <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900">
                  <strong className="block text-emerald-950 mb-0.5">💡 Best Practice for Laptops:</strong>
                  Use the <strong>"System Print"</strong> button on any bill or KOT. It is pre-configured with custom 58mm/80mm roll formatting and works 100% reliably with any USB, Wi-Fi, Network, or Windows-paired thermal printer.
                </div>
              </div>
            )}
          </div>

          {/* Paper Width Selection */}
          <div className="space-y-1.5">
            <label className="font-bold text-[#7d6e67] block">Paper Roll Format:</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleWidthChange(58)}
                className={`py-2 px-3 rounded-xl font-bold border transition cursor-pointer ${
                  config.paperWidth === 58
                    ? 'bg-[#ea580c] text-white border-[#ea580c] shadow-xs'
                    : 'bg-white text-[#2b2320] border-[#eedecb] hover:bg-[#f5ede0]'
                }`}
              >
                58mm (Pocket / Portable)
              </button>
              <button
                type="button"
                onClick={() => handleWidthChange(80)}
                className={`py-2 px-3 rounded-xl font-bold border transition cursor-pointer ${
                  config.paperWidth === 80
                    ? 'bg-[#ea580c] text-white border-[#ea580c] shadow-xs'
                    : 'bg-white text-[#2b2320] border-[#eedecb] hover:bg-[#f5ede0]'
                }`}
              >
                80mm (Standard Desktop POS)
              </button>
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-2 pt-1 border-t border-[#eedecb]">
            <label className="flex items-center justify-between p-2.5 rounded-xl bg-[#fffbf5] border border-[#eedecb] cursor-pointer">
              <div>
                <span className="font-semibold text-[#2b2320] block">
                  Auto-print receipt on order punch
                </span>
                <span className="text-[10px] text-[#7d6e67]">
                  Automatically triggers printing as soon as bill is created
                </span>
              </div>
              <input
                type="checkbox"
                checked={config.autoPrint}
                onChange={(e) => handleAutoPrintToggle(e.target.checked)}
                className="w-4 h-4 text-[#ea580c] accent-[#ea580c] cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-2.5 rounded-xl bg-[#fffbf5] border border-[#eedecb] cursor-pointer">
              <div>
                <span className="font-semibold text-[#2b2320] block">Hardware Simulator Mode</span>
                <span className="text-[10px] text-[#7d6e67]">
                  Enables paper feed animations and virtual testing without physical hardware
                </span>
              </div>
              <input
                type="checkbox"
                checked={config.isSimulated}
                onChange={(e) => handleSimulatedToggle(e.target.checked)}
                className="w-4 h-4 text-[#ea580c] accent-[#ea580c] cursor-pointer"
              />
            </label>
          </div>

          {/* Test & Status Feedback */}
          {errorMsg && (
            <div className="p-2.5 bg-rose-50 text-rose-800 rounded-xl border border-rose-200 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold">{errorMsg}</span>
                <p className="text-[10px] text-rose-700">
                  Tip: You can use the "System Print" button on any bill to print directly to your thermal printer without Web Bluetooth!
                </p>
              </div>
            </div>
          )}

          {testSuccess && (
            <div className="p-2.5 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{testSuccess}</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleTestPrint}
              className="flex-1 py-2.5 bg-[#f4ebe1] hover:bg-[#eedecb] text-[#2b2320] font-bold rounded-xl transition cursor-pointer"
            >
              Print Test Slip
            </button>
            <button
              onClick={() => window.print()}
              className="py-2.5 px-3 bg-white hover:bg-stone-100 text-[#2b2320] font-semibold rounded-xl border border-[#eedecb] transition cursor-pointer"
              title="Test system thermal print dialog"
            >
              System Print Test
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2.5 bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold rounded-xl transition cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

