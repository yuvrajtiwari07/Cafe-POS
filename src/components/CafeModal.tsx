import React, { useState, useEffect, useRef } from 'react';
import {
  Store,
  KeyRound,
  Plus,
  Check,
  Copy,
  X,
  AlertCircle,
  Building,
  QrCode,
  Users,
  UserCheck,
  UserX,
  Upload,
  Shield,
  Trash2,
  Clock,
} from 'lucide-react';
import { Cafe, JoinRequest, StaffMember } from '../types';
import { setActiveCafe } from '../services/storage';
import { showToast } from '../services/toast';
import {
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  requestCafeJoin,
} from '../database';
import { db, auth, loginWithGoogle, cleanData } from '../database';

interface CafeModalProps {
  currentCafe: Cafe;
  onClose: () => void;
  onCafeSelected: (cafe: Cafe) => void;
  user: any;
  isInitialSetup?: boolean;
}

export const CafeModal: React.FC<CafeModalProps> = ({
  currentCafe,
  onClose,
  onCafeSelected,
  user,
  isInitialSetup = false,
}) => {
  const joinUnsubscribe = useRef<(() => void) | null>(null);
  useEffect(() => () => joinUnsubscribe.current?.(), []);
  const isOwner = user?.uid === currentCafe.ownerId;

  const [tab, setTab] = useState<'current' | 'team' | 'qr' | 'join' | 'create'>(
    isInitialSetup ? 'create' : 'current'
  );
  const [joinCode, setJoinCode] = useState<string>('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState<boolean>(false);

  // New Cafe Form state
  const [cafeName, setCafeName] = useState<string>('');
  const [tagline, setTagline] = useState<string>('Specialty Coffee & Kitchen');
  const [phone, setPhone] = useState<string>('+91 ');
  const [address, setAddress] = useState<string>('');
  const [upiId, setUpiId] = useState<string>('merchant@upi');
  const [gstin, setGstin] = useState<string>('');
  const [uploadedQrUrl, setUploadedQrUrl] = useState<string>('');
  const [isCreating, setIsCreating] = useState<boolean>(false);

  const [copied, setCopied] = useState<boolean>(false);

  // Join Existing Cafe via Secret Code or Cafe ID with Instant Join for Secret Code & Approval Fallback
  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = joinCode.trim();
    if (!cleanCode) return;

    if (!user) {
      setJoinError('Please sign in with Google first before joining a restaurant.');
      return;
    }

    setIsJoining(true);
    setJoinError(null);
    setJoinSuccess(null);

    try {
      joinUnsubscribe.current?.();
      const targetCafe = await requestCafeJoin(cleanCode);
      const cafeDocId = targetCafe.id;

      setJoinSuccess(
        `Staff Code verified for "${targetCafe.name}"! Join request sent to the owner. Waiting for the owner to tap "Approve" on their device...`
      );

      // Listen in real-time for owner approval
      const unsub = onSnapshot(doc(db, 'cafes', cafeDocId), (liveSnap) => {
        if (liveSnap.exists()) {
          const data = { ...liveSnap.data(), id: liveSnap.id } as Cafe;
          if (data.memberUids?.includes(user.uid)) {
            unsub();
            showToast(`Approved by owner! Welcome to "${data.name}"!`, 'success');
            setActiveCafe(data);
            onCafeSelected(data);
            onClose();
          }
        }
      });
      joinUnsubscribe.current = unsub;
    } catch (err: any) {
      console.error('Error joining restaurant:', err);
      setJoinError(err.message || 'Error processing restaurant join request.');
    } finally {
      setIsJoining(false);
    }
  };

  // Create New Restaurant
  const handleCreateNewCafe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cafeName.trim()) return;
    if (!auth.currentUser) { showToast('Sign in before creating a restaurant.', 'warning'); return; }

    setIsCreating(true);

    try {
      const randomCode = `CAFE-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
      const cafeId = `cafe-${crypto.randomUUID()}`;
      const currentUser = auth.currentUser || user;
      const uid = currentUser?.uid || 'guest-owner';
      const email = currentUser?.email || 'owner@example.com';
      const displayName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Owner';

      const initialMember: StaffMember = {
        uid,
        email,
        name: displayName,
        role: 'owner',
        joinedAt: new Date().toISOString(),
      };

      const newCafe: Cafe = {
        id: cafeId,
        name: cafeName.trim(),
        tagline: tagline.trim() || 'Specialty Coffee & Kitchen',
        phone: phone.trim() || '',
        address: address.trim() || '',
        upiId: upiId.trim() || 'merchant@upi',
        paymentQrUrl: uploadedQrUrl || '',
        gstin: gstin.trim() || '',
        ownerId: uid,
        ownerEmail: email,
        secretCode: randomCode,
        memberUids: [uid],
        members: [initialMember],
        pendingRequests: [],
        openingTime: '00:00',
        closingTime: '23:59',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Save to database
      if (currentUser) {
        try {
          await setDoc(doc(db, 'cafes', cafeId), cleanData(newCafe));
          showToast(`Restaurant "${newCafe.name}" registered to ${email}!`, 'success');
        } catch (err: any) {
          console.error('Could not save cafe to database', err);
          showToast(`Could not create restaurant: ${err.message}`, 'error');
          return;
        }
      } else {
        showToast(`Restaurant "${newCafe.name}" created locally! Sign in with Google to sync to cloud.`, 'info');
      }

      setActiveCafe(newCafe);
      onCafeSelected(newCafe);
      onClose();
    } finally {
      setIsCreating(false);
    }
  };

  // Owner approves a join request
  const handleApproveStaff = async (request: JoinRequest) => {
    if (!isOwner) return;

    const newStaff: StaffMember = {
      uid: request.uid,
      email: request.email,
      name: request.name,
      role: 'staff',
      joinedAt: new Date().toISOString(),
    };

    const updatedMembers = [...(currentCafe.members || []), newStaff];
    const updatedUids = Array.from(new Set([...currentCafe.memberUids, request.uid]));
    const updatedPending = (currentCafe.pendingRequests || []).filter(
      (r) => r.uid !== request.uid
    );

    const updatedCafe: Cafe = {
      ...currentCafe,
      memberUids: updatedUids,
      members: updatedMembers,
      pendingRequests: updatedPending,
      updatedAt: new Date().toISOString(),
    };

    setActiveCafe(updatedCafe);
    onCafeSelected(updatedCafe);

    if (user) {
      try {
        await updateDoc(doc(db, 'cafes', currentCafe.id), cleanData({
          memberUids: updatedUids,
          members: updatedMembers,
          pendingRequests: updatedPending,
          updatedAt: new Date().toISOString(),
        }));
      } catch (err) {
        console.warn('Could not approve member in database', err);
      }
    }
  };

  // Owner declines a join request
  const handleDeclineStaff = async (requestUid: string) => {
    if (!isOwner) return;

    const updatedPending = (currentCafe.pendingRequests || []).filter(
      (r) => r.uid !== requestUid
    );

    const updatedCafe: Cafe = {
      ...currentCafe,
      pendingRequests: updatedPending,
      updatedAt: new Date().toISOString(),
    };

    setActiveCafe(updatedCafe);
    onCafeSelected(updatedCafe);

    if (user) {
      try {
        await updateDoc(doc(db, 'cafes', currentCafe.id), cleanData({
          pendingRequests: updatedPending,
          updatedAt: new Date().toISOString(),
        }));
      } catch (err) {
        console.warn('Could not decline request in database', err);
      }
    }
  };

  // Owner removes an existing member
  const handleRemoveMember = async (memberUid: string) => {
    if (!isOwner) return;
    if (memberUid === currentCafe.ownerId) {
      showToast('Cannot remove restaurant owner.', 'warning');
      return;
    }

    if (!confirm('Are you sure you want to remove this staff member? They will lose access immediately.')) {
      return;
    }

    const updatedMembers = (currentCafe.members || []).filter((m) => m.uid !== memberUid);
    const updatedUids = currentCafe.memberUids.filter((uid) => uid !== memberUid);

    const updatedCafe: Cafe = {
      ...currentCafe,
      memberUids: updatedUids,
      members: updatedMembers,
      updatedAt: new Date().toISOString(),
    };

    setActiveCafe(updatedCafe);
    onCafeSelected(updatedCafe);

    if (user) {
      try {
        await updateDoc(doc(db, 'cafes', currentCafe.id), cleanData({
          memberUids: updatedUids,
          members: updatedMembers,
          updatedAt: new Date().toISOString(),
        }));
      } catch (err) {
        console.warn('Could not remove member in database', err);
      }
    }
  };

  // Save Payment QR URL
  const handleSavePaymentQr = async (qrDataUrl: string) => {
    const updatedCafe: Cafe = {
      ...currentCafe,
      paymentQrUrl: qrDataUrl,
      updatedAt: new Date().toISOString(),
    };

    setActiveCafe(updatedCafe);
    onCafeSelected(updatedCafe);

    if (user) {
      try {
        await updateDoc(doc(db, 'cafes', currentCafe.id), cleanData({
          paymentQrUrl: qrDataUrl,
          updatedAt: new Date().toISOString(),
        }));
        showToast('Payment QR updated successfully! It will now appear on thermal bills when UPI is selected.', 'success');
      } catch (err) {
        console.warn('Could not save QR in database', err);
      }
    }
  };

  const handleQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setUploadedQrUrl(result);
      if (tab === 'qr') {
        handleSavePaymentQr(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(currentCafe.secretCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl border border-[#eedecb] max-h-[95vh] flex flex-col">
        {/* Modal Header */}
        <div className="bg-[#fffbf5] p-4 border-b border-[#eedecb] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-[#ea580c]" />
            <div>
              <h3 className="font-bold text-base text-[#2b2320]">
                {isInitialSetup ? 'Welcome to Bill Generator' : 'Restaurant & Team Access'}
              </h3>
              <p className="text-[11px] text-[#7d6e67]">
                {isInitialSetup
                  ? 'Choose to create a new place or join an existing restaurant'
                  : currentCafe.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-[#7d6e67] hover:bg-[#f5ede0] cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-[#eedecb] bg-[#fbf6ee] text-xs font-bold overflow-x-auto no-scrollbar">
          {(!isInitialSetup || (currentCafe && currentCafe.id !== 'default-corner-cafe')) && (
            <>
              <button
                onClick={() => setTab('current')}
                className={`px-3 py-2.5 transition whitespace-nowrap cursor-pointer ${
                  tab === 'current'
                    ? 'bg-white text-[#ea580c] border-b-2 border-[#ea580c]'
                    : 'text-[#7d6e67] hover:text-[#2b2320]'
                }`}
              >
                Place Details
              </button>
              <button
                onClick={() => setTab('team')}
                className={`px-3 py-2.5 transition whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                  tab === 'team'
                    ? 'bg-white text-[#ea580c] border-b-2 border-[#ea580c]'
                    : 'text-[#7d6e67] hover:text-[#2b2320]'
                }`}
              >
                <span>Team & Approvals</span>
                {(currentCafe.pendingRequests?.length || 0) > 0 && (
                  <span className="w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] flex items-center justify-center font-bold">
                    {currentCafe.pendingRequests?.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setTab('qr')}
                className={`px-3 py-2.5 transition whitespace-nowrap cursor-pointer ${
                  tab === 'qr'
                    ? 'bg-white text-[#ea580c] border-b-2 border-[#ea580c]'
                    : 'text-[#7d6e67] hover:text-[#2b2320]'
                }`}
              >
                Payment QR
              </button>
            </>
          )}
          <button
            onClick={() => setTab('join')}
            className={`flex-1 px-3 py-2.5 transition whitespace-nowrap cursor-pointer ${
              tab === 'join'
                ? 'bg-white text-[#ea580c] border-b-2 border-[#ea580c]'
                : 'text-[#7d6e67] hover:text-[#2b2320]'
            }`}
          >
            Join Existing Place
          </button>
          <button
            onClick={() => setTab('create')}
            className={`flex-1 px-3 py-2.5 transition whitespace-nowrap cursor-pointer ${
              tab === 'create'
                ? 'bg-white text-[#ea580c] border-b-2 border-[#ea580c]'
                : 'text-[#7d6e67] hover:text-[#2b2320]'
            }`}
          >
            + New Restaurant
          </button>
        </div>

        {/* Content */}
        <div className="p-4 text-xs overflow-y-auto flex-1">
          {/* TAB 1: Place Details */}
          {tab === 'current' && (
            <div className="space-y-3.5">
              <div className="p-3.5 bg-[#fffbf5] rounded-2xl border border-[#eedecb] space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-[#2b2320]">{currentCafe.name}</h4>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#f4ebe1] text-[#7d6e67]">
                    {isOwner ? 'Owner Account' : 'Staff Member'}
                  </span>
                </div>
                <p className="text-[#7d6e67]">{currentCafe.address || 'Address not configured'}</p>
                <div className="text-[11px] text-[#7d6e67] space-y-0.5">
                  <p>UPI ID: <strong className="text-[#2b2320]">{currentCafe.upiId}</strong></p>
                  {currentCafe.gstin && <p>GSTIN: <strong className="text-[#2b2320]">{currentCafe.gstin}</strong></p>}
                </div>
              </div>

              {/* Staff Secret Code Box */}
              <div className="p-3.5 bg-[#f4ebe1] rounded-2xl border border-[#e3d3c2] flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-[#7d6e67] block">Staff Secret Code:</span>
                  <span className="text-xl font-mono font-extrabold text-[#ea580c] tracking-wider">
                    {currentCafe.secretCode}
                  </span>
                  <span className="text-[10px] text-[#7d6e67] block mt-0.5">
                    Share with cashiers & staff to request joining on Android & Web
                  </span>
                </div>
                <button
                  onClick={copyCode}
                  className="p-2.5 bg-white rounded-xl shadow-xs text-[#2b2320] hover:text-[#ea580c] transition cursor-pointer"
                  title="Copy Code"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              <button
                onClick={onClose}
                className="w-full py-2.5 bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold rounded-xl transition cursor-pointer"
              >
                Close
              </button>
            </div>
          )}

          {/* TAB 2: Team & Approval Workflow */}
          {tab === 'team' && (
            <div className="space-y-4">
              {/* Pending Join Requests (Owner Approval) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-sm text-[#2b2320] flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-[#ea580c]" />
                    <span>Pending Join Requests</span>
                  </h4>
                  <span className="text-[10px] bg-rose-50 text-rose-800 font-bold px-2 py-0.5 rounded-full border border-rose-200">
                    {(currentCafe.pendingRequests?.length || 0)} awaiting
                  </span>
                </div>

                {(currentCafe.pendingRequests?.length || 0) === 0 ? (
                  <div className="p-3 bg-[#fbf6ee] rounded-xl border border-[#eedecb] text-center text-[#7d6e67] text-[11px]">
                    No pending join requests right now.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {currentCafe.pendingRequests?.map((req) => (
                      <div
                        key={req.uid}
                        className="p-3 bg-white rounded-xl border border-[#eedecb] shadow-xs flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-[#2b2320] block truncate">
                            {req.name}
                          </span>
                          <span className="text-[10px] text-[#7d6e67] block truncate">
                            {req.email}
                          </span>
                        </div>
                        {isOwner ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleApproveStaff(req)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] cursor-pointer"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Approve</span>
                            </button>
                            <button
                              onClick={() => handleDeclineStaff(req.uid)}
                              className="p-1 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                              title="Decline request"
                            >
                              <UserX className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-amber-700 font-medium">
                            Awaiting Owner
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Active Staff Members */}
              <div>
                <h4 className="font-bold text-sm text-[#2b2320] mb-2 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-[#ea580c]" />
                  <span>Approved Team Members</span>
                </h4>

                <div className="space-y-2">
                  {currentCafe.members?.map((member) => (
                    <div
                      key={member.uid}
                      className="p-3 bg-white rounded-xl border border-[#eedecb] shadow-xs flex items-center justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-[#2b2320] truncate">{member.name}</span>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                              member.role === 'owner'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-stone-100 text-stone-700'
                            }`}
                          >
                            {member.role}
                          </span>
                        </div>
                        <span className="text-[10px] text-[#7d6e67] block truncate">
                          {member.email}
                        </span>
                      </div>

                      {isOwner && member.role !== 'owner' && (
                        <button
                          onClick={() => handleRemoveMember(member.uid)}
                          className="flex items-center gap-1 px-2 py-1 text-rose-600 hover:bg-rose-50 rounded-lg text-[11px] font-bold transition cursor-pointer"
                          title="Remove staff member from restaurant"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Payment QR Code Upload */}
          {tab === 'qr' && (
            <div className="space-y-3.5">
              <div className="p-3.5 bg-[#fffbf5] rounded-2xl border border-[#eedecb] space-y-2">
                <h4 className="font-bold text-sm text-[#2b2320] flex items-center gap-1.5">
                  <QrCode className="w-4 h-4 text-[#ea580c]" />
                  <span>Restaurant Payment QR Code</span>
                </h4>
                <p className="text-[11px] text-[#7d6e67] leading-relaxed">
                  Upload your physical merchant standee QR (PhonePe, Google Pay, Paytm, or BHIM) or rely on dynamic UPI QR.
                  During bill generation, you can choose whether to include this QR code on the receipt.
                </p>

                {currentCafe.paymentQrUrl ? (
                  <div className="mt-2 flex flex-col items-center p-3 bg-white rounded-xl border border-[#eedecb]">
                    <img
                      src={currentCafe.paymentQrUrl}
                      alt="Merchant Payment QR"
                      className="w-36 h-36 object-contain rounded-lg border border-stone-200"
                    />
                    <button
                      onClick={() => handleSavePaymentQr('')}
                      className="mt-2 text-[11px] text-rose-600 font-bold hover:underline"
                    >
                      Remove Custom Standee Photo
                    </button>
                  </div>
                ) : (
                  <div className="p-4 bg-white rounded-xl border-2 border-dashed border-[#eedecb] text-center flex flex-col items-center">
                    <QrCode className="w-8 h-8 text-[#ea580c] opacity-60 mb-1" />
                    <span className="text-xs font-semibold text-[#2b2320]">
                      No custom QR image uploaded
                    </span>
                    <span className="text-[10px] text-[#7d6e67]">
                      Currently generating dynamic UPI QR from: <strong>{currentCafe.upiId}</strong>
                    </span>
                  </div>
                )}

                <label className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 bg-[#f4ebe1] hover:bg-[#eedecb] text-[#2b2320] font-bold rounded-xl cursor-pointer transition">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Merchant QR Standee Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleQrUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}

          {/* TAB 4: Join Existing Place */}
          {tab === 'join' && (
            <form onSubmit={handleJoinByCode} className="space-y-3">
              <div>
                <label className="font-semibold text-[#7d6e67] block mb-1">
                  Enter Restaurant Staff Secret Code
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CAFE-8821"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  className="w-full bg-[#f4ebe1] px-3.5 py-2.5 rounded-xl font-mono text-base font-bold text-[#2b2320] tracking-wider uppercase outline-hidden border border-[#eedecb]"
                  autoFocus
                />
                <p className="text-[11px] text-[#7d6e67] mt-1 leading-relaxed">
                  Ask the restaurant owner or counter cash register for their secret code. Once submitted, the owner must approve your request before access is granted.
                </p>
              </div>

              {joinError && (
                <div className="p-2.5 bg-rose-50 text-rose-800 rounded-xl border border-rose-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{joinError}</span>
                </div>
              )}

              {joinSuccess && (
                <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200 flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{joinSuccess}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isJoining}
                className="w-full py-2.5 bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                {isJoining ? 'Submitting Request...' : 'Request to Join Restaurant'}
              </button>
            </form>
          )}

          {/* TAB 5: Create New Restaurant */}
          {tab === 'create' && (
            <form onSubmit={handleCreateNewCafe} className="space-y-2.5">
              <div>
                <label className="font-semibold text-[#7d6e67] block mb-0.5">
                  Restaurant / Place Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. The Downtown Diner"
                  value={cafeName}
                  onChange={(e) => setCafeName(e.target.value)}
                  className="w-full bg-[#f4ebe1] px-3 py-1.5 rounded-xl outline-hidden border border-[#eedecb]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-[#7d6e67] block mb-0.5">Phone Number</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-[#f4ebe1] px-3 py-1.5 rounded-xl outline-hidden border border-[#eedecb]"
                  />
                </div>
                <div>
                  <label className="font-semibold text-[#7d6e67] block mb-0.5">UPI ID (VPA)</label>
                  <input
                    type="text"
                    required
                    placeholder="merchant@upi"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    className="w-full bg-[#f4ebe1] px-3 py-1.5 rounded-xl outline-hidden border border-[#eedecb]"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-[#7d6e67] block mb-0.5">Address / Landmark</label>
                <input
                  type="text"
                  placeholder="Street, City"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-[#f4ebe1] px-3 py-1.5 rounded-xl outline-hidden border border-[#eedecb]"
                />
              </div>

              <div>
                <label className="font-semibold text-[#7d6e67] block mb-0.5">GSTIN Number (Optional)</label>
                <input
                  type="text"
                  placeholder="27AAAAA0000A1Z5"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value)}
                  className="w-full bg-[#f4ebe1] px-3 py-1.5 rounded-xl outline-hidden border border-[#eedecb]"
                />
              </div>

              {/* Optional Standee QR Upload on Creation */}
              <div>
                <label className="font-semibold text-[#7d6e67] block mb-0.5">Payment Standee QR (Optional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleQrUpload}
                  className="w-full text-[11px] text-stone-600"
                />
              </div>

              <button
                type="submit"
                disabled={isCreating}
                className="w-full mt-2 py-2.5 bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold rounded-xl transition cursor-pointer"
              >
                {isCreating ? 'Creating Restaurant...' : 'Create Restaurant & Become Owner'}
              </button>
            </form>
          )}
        </div>

        {/* Modal Footer / Quick Back to POS */}
        <div className="p-3 bg-[#fffbf5] border-t border-[#eedecb] flex items-center justify-between text-xs">
          <span className="text-[#7d6e67] truncate">
            Active: <strong className="text-[#2b2320]">{currentCafe.name}</strong>
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-[#f5ede0] hover:bg-[#eedecb] text-[#2b2320] font-semibold transition cursor-pointer shrink-0"
          >
            Back to Billing POS
          </button>
        </div>
      </div>
    </div>
  );
};
