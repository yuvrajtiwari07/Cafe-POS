import React, { useState } from 'react';
import {
  Users,
  UserCheck,
  UserX,
  Shield,
  Clock,
  Copy,
  Check,
  RefreshCw,
  AlertTriangle,
  Mail,
  Calendar,
  Lock,
} from 'lucide-react';
import { Cafe, StaffMember, StaffRole, JoinRequest } from '../types';
import { db, cleanFirestoreData } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { showToast } from '../services/toast';

interface StaffManagerProps {
  cafe: Cafe;
  user: any;
  onCafeUpdated?: (updated: Cafe) => void;
}

export const StaffManager: React.FC<StaffManagerProps> = ({ cafe, user, onCafeUpdated }) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [isRegeneratingCode, setIsRegeneratingCode] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

  // Selected role when approving pending request
  const [approvalRoles, setApprovalRoles] = useState<Record<string, StaffRole>>({});

  // Staff Removal Confirmation
  const [staffToRemove, setStaffToRemove] = useState<StaffMember | null>(null);

  const isOwner = user?.uid === cafe.ownerId;
  const pendingRequests = cafe.pendingRequests || [];
  const activeMembers = cafe.members || [];

  const copyCode = () => {
    navigator.clipboard.writeText(cafe.secretCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Regenerate Join Code
  const handleRegenerateCode = async () => {
    setIsRegeneratingCode(true);
    try {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let newCode = 'CAFE-';
      for (let i = 0; i < 4; i++) {
        newCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      const updatedCafe: Cafe = {
        ...cafe,
        secretCode: newCode,
        updatedAt: new Date().toISOString(),
      };

      if (cafe.id && cafe.id !== 'default-corner-cafe') {
        await setDoc(doc(db, 'cafes', cafe.id), cleanFirestoreData(updatedCafe), { merge: true });
      }

      onCafeUpdated?.(updatedCafe);
      showToast(`New Staff Join Code: ${newCode}`, 'success');
      setShowRegenerateConfirm(false);
    } catch (e: any) {
      showToast('Error regenerating code', 'error');
    } finally {
      setIsRegeneratingCode(false);
    }
  };

  // Approve Pending Request
  const handleApproveRequest = async (request: JoinRequest) => {
    const assignedRole = approvalRoles[request.uid] || 'cashier';

    const newMember: StaffMember = {
      uid: request.uid,
      email: request.email,
      name: request.name,
      role: assignedRole,
      joinedAt: new Date().toISOString(),
    };

    const remainingPending = pendingRequests.filter((r) => r.uid !== request.uid);
    const existingMembers = activeMembers.filter((m) => m.uid !== request.uid);
    const updatedMembers = [...existingMembers, newMember];
    const updatedUids = Array.from(new Set([...cafe.memberUids, request.uid]));

    const updatedCafe: Cafe = {
      ...cafe,
      members: updatedMembers,
      memberUids: updatedUids,
      pendingRequests: remainingPending,
      updatedAt: new Date().toISOString(),
    };

    if (cafe.id && cafe.id !== 'default-corner-cafe') {
      try {
        await setDoc(doc(db, 'cafes', cafe.id), cleanFirestoreData(updatedCafe), { merge: true });
      } catch (e: any) {
        showToast('Firestore update error', 'error');
        return;
      }
    }

    onCafeUpdated?.(updatedCafe);
    showToast(`Approved ${request.name} as ${assignedRole.toUpperCase()}!`, 'success');
  };

  // Decline Pending Request
  const handleDeclineRequest = async (request: JoinRequest) => {
    const remainingPending = pendingRequests.filter((r) => r.uid !== request.uid);

    const updatedCafe: Cafe = {
      ...cafe,
      pendingRequests: remainingPending,
      updatedAt: new Date().toISOString(),
    };

    if (cafe.id && cafe.id !== 'default-corner-cafe') {
      try {
        await setDoc(doc(db, 'cafes', cafe.id), cleanFirestoreData(updatedCafe), { merge: true });
      } catch (e) {
        // ignore
      }
    }

    onCafeUpdated?.(updatedCafe);
    showToast(`Declined request from ${request.name}`, 'info');
  };

  // Change Active Staff Role
  const handleChangeRole = async (uid: string, newRole: StaffRole) => {
    if (uid === cafe.ownerId) {
      showToast('Cannot change owner role', 'warning');
      return;
    }

    const updatedMembers = activeMembers.map((m) => (m.uid === uid ? { ...m, role: newRole } : m));

    const updatedCafe: Cafe = {
      ...cafe,
      members: updatedMembers,
      updatedAt: new Date().toISOString(),
    };

    if (cafe.id && cafe.id !== 'default-corner-cafe') {
      try {
        await setDoc(doc(db, 'cafes', cafe.id), cleanFirestoreData(updatedCafe), { merge: true });
      } catch (e) {
        showToast('Role update failed', 'error');
        return;
      }
    }

    onCafeUpdated?.(updatedCafe);
    showToast(`Role updated to ${newRole.toUpperCase()}`, 'success');
  };

  // Remove Staff Member
  const handleRemoveStaff = async () => {
    if (!staffToRemove) return;

    if (staffToRemove.uid === cafe.ownerId) {
      showToast('Owner cannot be removed from restaurant', 'error');
      setStaffToRemove(null);
      return;
    }

    const remainingMembers = activeMembers.filter((m) => m.uid !== staffToRemove.uid);
    const remainingUids = cafe.memberUids.filter((uid) => uid !== staffToRemove.uid);

    const updatedCafe: Cafe = {
      ...cafe,
      members: remainingMembers,
      memberUids: remainingUids,
      updatedAt: new Date().toISOString(),
    };

    if (cafe.id && cafe.id !== 'default-corner-cafe') {
      try {
        await setDoc(doc(db, 'cafes', cafe.id), cleanFirestoreData(updatedCafe), { merge: true });
      } catch (e: any) {
        showToast('Removal error', 'error');
        return;
      }
    }

    onCafeUpdated?.(updatedCafe);
    showToast(`${staffToRemove.name} removed from restaurant.`, 'info');
    setStaffToRemove(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 space-y-4">
      {/* Header Card */}
      <div className="bg-[#fffbf5] p-4 rounded-2xl border border-[#eedecb] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-orange-100 text-[#ea580c] flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-base text-[#2b2320]">Staff & Permissions</h2>
            <p className="text-xs text-[#7d6e67]">
              Manage cashiers, managers, approvals, and secure join codes
            </p>
          </div>
        </div>

        {/* Join Code Display with Regenerate Action */}
        <div className="bg-white p-2.5 rounded-xl border border-[#eedecb] flex items-center gap-2">
          <div>
            <span className="text-[10px] font-bold text-[#7d6e67] block">Staff Join Code</span>
            <span className="font-mono font-black text-sm text-[#ea580c]">{cafe.secretCode}</span>
          </div>
          <button
            onClick={copyCode}
            className="p-1.5 rounded-lg bg-[#f5ede0] hover:bg-[#ebdccb] text-[#2b2320] transition cursor-pointer"
            title="Copy Code"
          >
            {copiedCode ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          </button>
          {isOwner && (
            <button
              onClick={() => setShowRegenerateConfirm(true)}
              className="p-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-[#ea580c] transition cursor-pointer"
              title="Regenerate Code"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Non-Owner Notice if applicable */}
      {!isOwner && (
        <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-center gap-2 text-xs text-amber-900">
          <Lock className="w-4 h-4 text-amber-700 shrink-0" />
          <span>Only the restaurant owner can approve or remove staff members.</span>
        </div>
      )}

      {/* SECTION 1: PENDING REQUESTS */}
      <div className="bg-white p-4 rounded-2xl border border-[#eedecb] shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600" />
            <h3 className="font-bold text-sm text-[#2b2320]">
              Pending Join Requests ({pendingRequests.length})
            </h3>
          </div>
          <span className="text-[11px] text-[#7d6e67]">Staff waiting for owner approval</span>
        </div>

        {pendingRequests.length === 0 ? (
          <div className="py-6 text-center text-[#8c7a72] bg-[#faf6f0] rounded-xl border border-dashed border-[#eedecb]">
            <UserCheck className="w-8 h-8 text-[#eedecb] mx-auto mb-1" />
            <p className="text-xs font-semibold">No pending staff join requests</p>
            <p className="text-[11px] text-[#9a8981] mt-0.5">
              Share code <strong className="text-[#ea580c] font-mono">{cafe.secretCode}</strong> with staff to join.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pendingRequests.map((req) => (
              <div
                key={req.uid}
                className="bg-[#fffbf5] p-3.5 rounded-xl border border-amber-200 shadow-xs flex flex-col justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#ea580c] text-white flex items-center justify-center font-bold text-sm shrink-0">
                    {(req.name || req.email || 'U')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-xs sm:text-sm text-[#2b2320] truncate">{req.name}</h4>
                    <p className="text-[11px] text-[#7d6e67] flex items-center gap-1 truncate">
                      <Mail className="w-3 h-3 shrink-0" /> {req.email}
                    </p>
                    <p className="text-[10px] text-stone-500 mt-0.5">
                      Requested: {new Date(req.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {new Date(req.requestedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {isOwner && (
                  <div className="pt-2 border-t border-[#eedecb]/70 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-stone-700">Role:</span>
                      <select
                        value={approvalRoles[req.uid] || 'cashier'}
                        onChange={(e) =>
                          setApprovalRoles((prev) => ({ ...prev, [req.uid]: e.target.value as StaffRole }))
                        }
                        className="bg-white border border-[#eedecb] px-2 py-1 rounded-lg text-xs font-semibold outline-hidden"
                      >
                        <option value="cashier">Cashier</option>
                        <option value="manager">Manager</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleDeclineRequest(req)}
                        className="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition cursor-pointer"
                      >
                        Decline
                      </button>
                      <button
                        onClick={() => handleApproveRequest(req)}
                        className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
                      >
                        Approve
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 2: ACTIVE STAFF MEMBERS */}
      <div className="bg-white p-4 rounded-2xl border border-[#eedecb] shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-600" />
            <h3 className="font-bold text-sm text-[#2b2320]">
              Active Restaurant Staff ({activeMembers.length})
            </h3>
          </div>
          <span className="text-[11px] text-[#7d6e67]">Authorized team members</span>
        </div>

        <div className="divide-y divide-[#eedecb]/70 border border-[#eedecb] rounded-xl overflow-hidden">
          {activeMembers.map((member) => {
            const isSelf = member.uid === user?.uid;
            const isMemberOwner = member.role === 'owner' || member.uid === cafe.ownerId;
            return (
              <div
                key={member.uid}
                className="p-3 bg-white hover:bg-[#faf6f0] transition flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white shrink-0 ${
                      isMemberOwner ? 'bg-orange-600' : 'bg-stone-700'
                    }`}
                  >
                    {(member.name || member.email || 'S')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-bold text-xs sm:text-sm text-[#2b2320] truncate">
                        {member.name}
                      </h4>
                      {isSelf && (
                        <span className="text-[9px] bg-stone-100 text-stone-600 px-1.5 py-0.2 rounded font-bold">
                          You
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#7d6e67] truncate">{member.email}</p>
                    <span className="text-[10px] text-stone-400">
                      Joined: {new Date(member.joinedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Role & Actions */}
                <div className="flex items-center justify-between sm:justify-end gap-2 pt-1 sm:pt-0">
                  {isOwner && !isMemberOwner ? (
                    <select
                      value={member.role}
                      onChange={(e) => handleChangeRole(member.uid, e.target.value as StaffRole)}
                      className="bg-white border border-[#eedecb] px-2 py-1 rounded-lg text-xs font-semibold outline-hidden cursor-pointer"
                    >
                      <option value="cashier">Cashier</option>
                      <option value="manager">Manager</option>
                      <option value="staff">Staff</option>
                    </select>
                  ) : (
                    <span
                      className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                        isMemberOwner
                          ? 'bg-orange-100 text-[#ea580c]'
                          : member.role === 'manager'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {member.role}
                    </span>
                  )}

                  {isOwner && !isMemberOwner && (
                    <button
                      onClick={() => setStaffToRemove(member)}
                      className="p-1 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                      title="Remove Staff"
                    >
                      <UserX className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CONFIRMATION: REMOVE STAFF (Section 34 & 55) */}
      {staffToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl border border-rose-300 space-y-3 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>Remove {staffToRemove.name}?</span>
            </div>

            <p className="text-xs text-stone-700">
              <strong className="text-stone-900">{staffToRemove.name}</strong> ({staffToRemove.email}) will immediately lose access to this restaurant.
            </p>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setStaffToRemove(null)}
                className="flex-1 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveStaff}
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs cursor-pointer"
              >
                Remove Staff
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION: REGENERATE JOIN CODE */}
      {showRegenerateConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl border border-[#eedecb] space-y-3 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2 text-[#ea580c] font-bold text-sm">
              <RefreshCw className="w-5 h-5 shrink-0" />
              <span>Regenerate Staff Join Code?</span>
            </div>

            <p className="text-xs text-stone-700">
              The existing code <strong className="font-mono text-stone-900">{cafe.secretCode}</strong> will immediately stop working. Existing staff will remain active, but new staff will need the new code.
            </p>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowRegenerateConfirm(false)}
                className="flex-1 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleRegenerateCode}
                disabled={isRegeneratingCode}
                className="flex-1 py-2 rounded-xl bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold text-xs cursor-pointer"
              >
                {isRegeneratingCode ? 'Generating...' : 'Confirm & Regenerate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
