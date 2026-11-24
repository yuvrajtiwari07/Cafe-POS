import React, { useState } from 'react';
import {
  Coffee,
  Printer,
  Wifi,
  WifiOff,
  RefreshCw,
  Copy,
  Check,
  Download,
  Store,
  LogOut,
  LogIn,
  SlidersHorizontal,
  ChevronDown,
  Wallet,
} from 'lucide-react';
import { Cafe, TabType } from '../types';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { auth, loginWithGoogle, logoutUser } from '../database';

interface HeaderProps {
  cafe: Cafe;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  onManualSync: () => void;
  onOpenCafeModal: () => void;
  onOpenPrinterModal: () => void;
  isPrinterConnected: boolean;
  printerDeviceName?: string;
  user: any;
  onOpenAndroidInstallModal: () => void;
  onOpenExpensesDrawer: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  cafe,
  activeTab,
  setActiveTab,
  isOnline,
  isSyncing,
  pendingCount,
  onManualSync,
  onOpenCafeModal,
  onOpenPrinterModal,
  isPrinterConnected,
  printerDeviceName,
  user,
  onOpenAndroidInstallModal,
  onOpenExpensesDrawer,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [copiedCode, setCopiedCode] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);

  const isOwner = user?.uid === cafe.ownerId;
  const pendingRequestsCount = cafe.pendingRequests?.length || 0;

  const copySecretCode = () => {
    navigator.clipboard.writeText(cafe.secretCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <header className="sticky top-0 z-40 bg-[#fffbf5] border-b border-[#eedecb] shadow-xs select-none">
      {/* Top Branding & Status Row */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between gap-2">
        {/* Left: Brand & Cafe Selector */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-linear-to-br from-[#ea580c] to-[#c2410c] text-white flex items-center justify-center shadow-sm shrink-0">
            <Coffee className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#ea580c] bg-orange-100/80 px-1.5 py-0.2 rounded-md">
                Bill Generator
              </span>
              {isOwner && pendingRequestsCount > 0 && (
                <button
                  onClick={onOpenCafeModal}
                  className="text-[10px] font-bold text-white bg-rose-600 px-1.5 py-0.2 rounded-full animate-pulse cursor-pointer"
                  title="Pending team join requests awaiting approval"
                >
                  {pendingRequestsCount} Request(s)
                </button>
              )}
            </div>
            <button
              onClick={onOpenCafeModal}
              className="group flex items-center gap-1.5 text-left font-bold text-base sm:text-lg text-[#2b2320] hover:text-[#ea580c] transition truncate cursor-pointer"
            >
              <span className="truncate">{cafe.name}</span>
              <ChevronDown className="w-4 h-4 text-[#8c7a72] group-hover:text-[#ea580c] shrink-0" />
            </button>
            <p className="text-xs text-[#7d6e67] truncate hidden sm:block">
              {cafe.address || cafe.tagline || 'Multi-Platform Cloud POS'}
            </p>
          </div>
        </div>

        {/* Center: Secret Staff Code Pill */}
        <div className="hidden md:flex items-center gap-2 bg-[#f4ebe1] px-3 py-1.5 rounded-lg border border-[#e3d3c2]">
          <span className="text-xs text-[#7d6e67] font-medium">Staff Code:</span>
          <span className="font-mono font-bold text-xs text-[#ea580c] tracking-wider">
            {cafe.secretCode}
          </span>
          <button
            onClick={copySecretCode}
            title="Copy Staff Code to share with cashiers / waiters on Android"
            className="p-1 text-[#7d6e67] hover:text-[#ea580c] transition rounded hover:bg-white cursor-pointer"
          >
            {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Right Action Badges */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Sync Engine Status Pill */}
          <button
            onClick={onManualSync}
            disabled={isSyncing}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
              !isOnline
                ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                : pendingCount > 0
                ? 'bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}
            title="Real-time database Database Status (Click to flush queue)"
          >
            {isSyncing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#ea580c]" />
            ) : !isOnline ? (
              <WifiOff className="w-3.5 h-3.5 text-amber-600" />
            ) : (
              <Wifi className="w-3.5 h-3.5 text-emerald-600" />
            )}
            <span className="hidden sm:inline">
              {!isOnline
                ? `Offline (${pendingCount} queued)`
                : pendingCount > 0
                ? `Syncing (${pendingCount})`
                : 'Live Synced'}
            </span>
          </button>

          {/* Cash Counter, Expenses & Withdrawals Drawer Button */}
          <button
            onClick={onOpenExpensesDrawer}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border bg-[#f5ede0] text-[#2b2320] border-[#e3d3c2] hover:border-[#ea580c] hover:bg-[#f2e6d7] transition whitespace-nowrap shrink-0 cursor-pointer"
            title="Open Cash Counter, UPI, Credit Card Top-Up & Expenses Drawer"
          >
            <Wallet className="w-3.5 h-3.5 text-[#ea580c] shrink-0" />
            <span className="hidden sm:inline">Cash & Expenses</span>
            <span className="sm:hidden">Expenses</span>
          </button>

          {/* Bluetooth Thermal Printer Pill */}
          <button
            onClick={onOpenPrinterModal}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition whitespace-nowrap shrink-0 cursor-pointer ${
              isPrinterConnected
                ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                : 'bg-[#f5ede0] text-[#6d5e56] border-[#eedecb] hover:bg-[#ebdccb]'
            }`}
            title="Bluetooth ESC/POS Printer settings"
          >
            <Printer className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden md:inline">
              {isPrinterConnected ? (printerDeviceName ? `BT: ${printerDeviceName.slice(0, 10)}` : 'BT Connected') : 'Thermal Printer'}
            </span>
          </button>

          {/* Download & Install Android App Button */}
          <button
            onClick={onOpenAndroidInstallModal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#ea580c] hover:bg-[#c2410c] active:scale-95 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
            title="Download & Install Android App on your phone / tablet"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Install Android App</span>
            <span className="sm:hidden">App</span>
          </button>

          {/* User Sign-In / Account Avatar */}
          {user ? (
            <div className="flex items-center gap-1.5 pl-1">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-7 h-7 rounded-full border border-[#eedecb]"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[#ea580c] text-white text-xs flex items-center justify-center font-bold">
                  {(user.displayName || user.email || 'U')[0].toUpperCase()}
                </div>
              )}
              <button
                onClick={logoutUser}
                title={`Signed in as ${user.email} (Click to sign out)`}
                className="p-1 text-[#8c7a72] hover:text-rose-600 transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={loginWithGoogle}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-[#eedecb] hover:border-[#ea580c] text-[#2b2320] text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5 text-[#ea580c]" />
              <span className="hidden sm:inline">Google Sign-In</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="border-t border-[#eedecb] bg-[#fbf6ee]">
        <div className="max-w-7xl mx-auto px-2 sm:px-4 flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar py-1">
          <button
            onClick={() => setActiveTab('pos')}
            className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition whitespace-nowrap cursor-pointer ${
              activeTab === 'pos'
                ? 'bg-[#ea580c] text-white shadow-xs'
                : 'text-[#615149] hover:bg-[#f2e6d7] hover:text-[#2b2320]'
            }`}
          >
            Tables & POS
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition whitespace-nowrap cursor-pointer ${
              activeTab === 'history'
                ? 'bg-[#ea580c] text-white shadow-xs'
                : 'text-[#615149] hover:bg-[#f2e6d7] hover:text-[#2b2320]'
            }`}
          >
            Transactions & Reprint
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition whitespace-nowrap cursor-pointer ${
              activeTab === 'reports'
                ? 'bg-[#ea580c] text-white shadow-xs'
                : 'text-[#615149] hover:bg-[#f2e6d7] hover:text-[#2b2320]'
            }`}
          >
            Daily Reports & Z-Report
          </button>
          <button
            onClick={() => setActiveTab('menu')}
            className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition whitespace-nowrap cursor-pointer ${
              activeTab === 'menu'
                ? 'bg-[#ea580c] text-white shadow-xs'
                : 'text-[#615149] hover:bg-[#f2e6d7] hover:text-[#2b2320]'
            }`}
          >
            Menu Manager
          </button>
          <button
            onClick={() => setActiveTab('inventory')}
            className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition whitespace-nowrap cursor-pointer ${
              activeTab === 'inventory'
                ? 'bg-[#ea580c] text-white shadow-xs'
                : 'text-[#615149] hover:bg-[#f2e6d7] hover:text-[#2b2320]'
            }`}
          >
            Inventory & Stock
          </button>
          <button
            onClick={() => setActiveTab('staff')}
            className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'staff'
                ? 'bg-[#ea580c] text-white shadow-xs'
                : 'text-[#615149] hover:bg-[#f2e6d7] hover:text-[#2b2320]'
            }`}
          >
            <span>Staff</span>
            {pendingRequestsCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-rose-600 text-white text-[9px] flex items-center justify-center font-bold">
                {pendingRequestsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition whitespace-nowrap cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-[#ea580c] text-white shadow-xs'
                : 'text-[#615149] hover:bg-[#f2e6d7] hover:text-[#2b2320]'
            }`}
          >
            Settings
          </button>

          {/* Quick Secret Code trigger on mobile */}
          <button
            onClick={copySecretCode}
            className="md:hidden ml-auto flex items-center gap-1 px-2 py-1 rounded bg-[#f4ebe1] text-[#7d6e67] text-[11px] font-mono border border-[#eedecb]"
          >
            <span>{cafe.secretCode}</span>
            {copiedCode ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* iOS Safari Installation Guide Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-[#eedecb]">
            <h3 className="text-base font-bold text-[#2b2320]">Install on iPhone / iPad</h3>
            <p className="mt-2 text-xs text-[#7d6e67] leading-relaxed">
              1. Tap the <strong className="text-[#2b2320]">Share button</strong> at the bottom of Safari.<br />
              2. Scroll down and choose <strong className="text-[#ea580c]">Add to Home Screen</strong>.<br />
              3. Bill Generator will run like a native offline-ready app!
            </p>
            <button
              onClick={() => setShowIOSModal(false)}
              className="mt-4 w-full rounded-xl bg-[#ea580c] py-2 text-xs font-bold text-white hover:bg-[#c2410c] transition cursor-pointer"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
