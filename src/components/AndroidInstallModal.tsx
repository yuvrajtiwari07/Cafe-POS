import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download, Smartphone, CheckCircle, ExternalLink, X, RefreshCw, Sparkles, ShieldCheck } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface AndroidInstallModalProps {
  onClose: () => void;
}

export const AndroidInstallModal: React.FC<AndroidInstallModalProps> = ({ onClose }) => {
  const { isInstallable, isInstalled, isAndroid, isIOS, triggerInstall } = usePWAInstall();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [installSuccess, setInstallSuccess] = useState<boolean>(false);
  const [isInstalling, setIsInstalling] = useState<boolean>(false);

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  useEffect(() => {
    if (currentUrl) {
      QRCode.toDataURL(currentUrl, {
        width: 180,
        margin: 1,
        color: {
          dark: '#2b2320',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.warn('QR code generation error:', err));
    }
  }, [currentUrl]);

  const handle1TapInstall = async () => {
    setIsInstalling(true);
    try {
      const success = await triggerInstall();
      if (success) {
        setInstallSuccess(true);
      }
    } catch (e) {
      console.warn('Install trigger error:', e);
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-[#fbf6ee] text-[#2b2320] w-full max-w-lg rounded-3xl shadow-2xl border border-stone-300 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-linear-to-r from-[#ea580c] to-[#c2410c] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/15 rounded-2xl">
              <Smartphone className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Install Android & Mobile App</h2>
              <p className="text-xs text-orange-100">Same data, same features, real-time cloud sync</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">

          {/* Already installed banner */}
          {isInstalled && (
            <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-2xl p-4 flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0" />
              <div className="text-xs">
                <p className="font-bold text-sm">App Already Installed!</p>
                <p className="text-emerald-700">You are running the standalone application with offline support and instant updates.</p>
              </div>
            </div>
          )}

          {/* 1-Tap Official Android WebAPK Install */}
          <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-xs space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <span className="inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-800 rounded-full mb-1">
                  Recommended for Android
                </span>
                <h3 className="text-base font-bold text-[#2b2320]">1-Tap Instant Installation</h3>
                <p className="text-xs text-stone-500">
                  Installs directly to your Android App Drawer without needing Google Play Store.
                </p>
              </div>
              <Sparkles className="w-5 h-5 text-orange-500 shrink-0" />
            </div>

            {installSuccess ? (
              <div className="bg-emerald-50 text-emerald-800 p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>App added to your device! Check your home screen or app drawer.</span>
              </div>
            ) : isInstallable ? (
              <button
                onClick={handle1TapInstall}
                disabled={isInstalling}
                className="w-full py-3 bg-[#ea580c] hover:bg-[#c2410c] active:scale-[0.99] text-white font-bold rounded-xl shadow-md flex items-center justify-center gap-2 transition cursor-pointer text-sm"
              >
                <Download className="w-4 h-4" />
                <span>{isInstalling ? 'Installing...' : 'Install on Android Now'}</span>
              </button>
            ) : (
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 text-xs text-stone-700 space-y-1.5">
                <p className="font-semibold text-stone-900">How to install on Android Chrome / Samsung Internet:</p>
                <ol className="list-decimal list-inside space-y-1 text-stone-600">
                  <li>Tap the <strong>three dots (⋮)</strong> in your browser's top-right corner.</li>
                  <li>Select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</li>
                  <li>Tap <strong>Install</strong>. The icon will appear in your Android app list.</li>
                </ol>
              </div>
            )}

            {/* iOS instructions if on iOS device */}
            {isIOS && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1 mt-2">
                <p className="font-semibold">Installing on iPhone / iPad:</p>
                <p className="text-amber-800">
                  Tap the <strong>Share button (square with arrow)</strong> in Safari, then scroll down and tap <strong>"Add to Home Screen"</strong>.
                </p>
              </div>
            )}
          </div>

          {/* Native Android Project & Package Download */}
          <div className="bg-white rounded-2xl p-5 border border-stone-200 shadow-xs space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <span className="inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-stone-100 text-stone-700 rounded-full mb-1">
                  Source & Android Studio
                </span>
                <h3 className="text-base font-bold text-[#2b2320]">Download Android App Package (.zip)</h3>
                <p className="text-xs text-stone-500">
                  Full Kotlin Android Studio source code with WebView, camera, Bluetooth, and offline caching.
                </p>
              </div>
              <Download className="w-5 h-5 text-stone-400 shrink-0" />
            </div>

            <a
              href="/download/corner-cafe-pos-android.zip"
              download="CornerCafePOS-Android.zip"
              className="w-full py-2.5 bg-stone-800 hover:bg-stone-900 text-white font-bold rounded-xl shadow-xs flex items-center justify-center gap-2 transition cursor-pointer text-xs"
            >
              <Download className="w-4 h-4" />
              <span>Download Android Project (.zip)</span>
            </a>
          </div>

          {/* QR Code for Phone Scanning */}
          <div className="bg-stone-100 rounded-2xl p-4 border border-stone-200 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            {qrDataUrl ? (
              <div className="p-2 bg-white rounded-xl shadow-xs border border-stone-200 shrink-0">
                <img src={qrDataUrl} alt="Scan to install on Android" className="w-28 h-28" />
              </div>
            ) : null}
            <div className="space-y-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-600">Scan with your Phone</h4>
              <p className="text-xs text-stone-700">
                Open your Android camera or QR scanner to open this POS directly on your phone and tap <strong>Install App</strong>.
              </p>
              <p className="text-[11px] text-stone-500 truncate max-w-xs">{currentUrl}</p>
            </div>
          </div>

          {/* Unified Database & Auto-Update Features */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="bg-orange-50/60 border border-orange-200/70 rounded-xl p-3 flex items-start gap-2.5 text-xs text-orange-950">
              <RefreshCw className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Instant Updates</p>
                <p className="text-[11px] text-orange-800">
                  Whenever web code is updated, your installed Android app refreshes automatically.
                </p>
              </div>
            </div>

            <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 flex items-start gap-2.5 text-xs text-stone-800">
              <ShieldCheck className="w-4 h-4 text-stone-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Unified Database</p>
                <p className="text-[11px] text-stone-600">
                  Bills, tables, and stock deduction are 100% synchronized via Supabase database.
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-stone-100 border-t border-stone-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-stone-200 hover:bg-stone-300 text-stone-800 font-bold rounded-xl transition cursor-pointer text-xs"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
