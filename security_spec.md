# Corner Cafe POS Security Specification

## 1. Data Invariants
1. A Cafe document cannot be created by an unauthenticated user or with an `ownerId` different from `request.auth.uid`.
2. Only the Cafe owner or authorized staff members (`request.auth.uid in cafe.memberUids`) can access or write menu items and bills.
3. Users cannot join a cafe unless they supply the cafe's valid secretCode or are explicitly added by the owner.
4. Bill numbers cannot be spoofed across different cafes.
5. Inactive/voided bills cannot have their status altered back to paid by non-owners.
6. A cashier can only issue bills under their authenticated `cashierId`.

## 2. The Dirty Dozen Payloads
1. **Unauthenticated Cafe Creation**: `{ name: "Hacked Cafe", ownerId: "anon" }` without auth token -> Denied.
2. **Owner Spoofing**: Auth UID `user123` attempts creating cafe with `ownerId: "user456"` -> Denied.
3. **Cross-Tenant Menu Injection**: User unauthorized in Cafe A attempts writing to `/cafes/cafeA/menu/item1` -> Denied.
4. **Cross-Tenant Bill Sniffing**: Unauthorized user attempts reading `/cafes/cafeA/bills` -> Denied.
5. **Bill Total Poisoning**: Bill with negative grandTotal or missing items array -> Denied.
6. **Privilege Escalation**: Non-owner member attempts overwriting `ownerId` -> Denied.
7. **Menu Price Tampering by outsider**: Unauthenticated caller alters dish price -> Denied.
8. **Malicious Document ID**: Attempting to write document ID with path traversal or >128 chars -> Denied.
9. **Ghost Field Injection**: Adding arbitrary admin flags `{ isAdmin: true }` to Cafe doc -> Denied.
10. **Void Status Bypass**: Staff modifying a voided bill's line items -> Denied.
11. **Client Delegation Query Attack**: Querying all cafes without being owner or member -> Denied.
12. **Member List Hijacking**: Non-member arbitrarily clearing `memberUids` -> Denied.
