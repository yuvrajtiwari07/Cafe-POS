import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  Unsubscribe,
} from '../database';
import { db, auth, cleanData } from '../database';
import { Bill, MenuItem } from '../types';
import {
  getPendingQueue,
  markBillSyncedLocally,
  saveBillLocally,
  saveLocalMenu,
} from './storage';

class SyncEngine {
  private isOnlineStatus: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private isSyncing: boolean = false;
  private intervalId: any = null;
  private billsUnsubscribe: Unsubscribe | null = null;
  private menuUnsubscribe: Unsubscribe | null = null;
  private currentCafeId: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnlineStatus = true;
        this.notifyStatusChange();
        this.flushPendingQueue();
      });

      window.addEventListener('offline', () => {
        this.isOnlineStatus = false;
        this.notifyStatusChange();
      });

      // Periodic check every 12 seconds
      this.intervalId = setInterval(() => {
        if (this.isOnlineStatus && !this.isSyncing && this.currentCafeId) {
          this.flushPendingQueue();
        }
      }, 12000);
    }
  }

  public isOnline(): boolean {
    return this.isOnlineStatus;
  }

  public getSyncState(): { isOnline: boolean; isSyncing: boolean } {
    return {
      isOnline: this.isOnlineStatus,
      isSyncing: this.isSyncing,
    };
  }

  private notifyStatusChange() {
    window.dispatchEvent(
      new CustomEvent('sync_status_changed', {
        detail: { isOnline: this.isOnlineStatus, isSyncing: this.isSyncing },
      })
    );
  }

  public setCafe(cafeId: string | null) {
    if (this.currentCafeId === cafeId) return;

    // Clean previous subscriptions
    if (this.billsUnsubscribe) {
      this.billsUnsubscribe();
      this.billsUnsubscribe = null;
    }
    if (this.menuUnsubscribe) {
      this.menuUnsubscribe();
      this.menuUnsubscribe = null;
    }

    this.currentCafeId = cafeId;

    if (cafeId) {
      this.flushPendingQueue();
      this.subscribeToCafe(cafeId);
    }
  }

  // Push pending bills from local queue to database
  public async flushPendingQueue(): Promise<number> {
    if (!this.currentCafeId || !this.isOnlineStatus || this.isSyncing) return 0;
    const cafeId = this.currentCafeId;
    const queue = getPendingQueue(cafeId);
    if (queue.length === 0) return 0;

    // Check if user is signed in to write to database
    if (!auth.currentUser) {
      return 0;
    }

    this.isSyncing = true;
    this.notifyStatusChange();
    let syncedCount = 0;

    try {
      for (const bill of queue) {
        const path = `cafes/${cafeId}/bills/${bill.id}`;
        try {
          const docRef = doc(db, 'cafes', cafeId, 'bills', bill.id);
          const sanitizedBill = {
            ...bill,
            cafeId,
            isSynced: true,
            syncedAt: new Date().toISOString(),
          };
          await setDoc(docRef, cleanData(sanitizedBill), { merge: true });
          markBillSyncedLocally(cafeId, bill.id);
          syncedCount++;
        } catch (err) {
          console.warn(`Failed to sync bill ${bill.id}`, err);
          // Don't crash full sync loop on individual bill issue
        }
      }
    } finally {
      this.isSyncing = false;
      this.notifyStatusChange();
    }

    return syncedCount;
  }

  // Real-time synchronization listeners for multi-device collaboration
  private subscribeToCafe(cafeId: string) {
    if (!auth.currentUser) {
      // Listen for auth state then attach
      const authUnsub = auth.onAuthStateChanged((user) => {
        if (user && this.currentCafeId === cafeId) {
          authUnsub();
          this.subscribeToCafe(cafeId);
        }
      });
      return;
    }

    const billsPath = `cafes/${cafeId}/bills`;
    try {
      const billsQuery = query(
        collection(db, 'cafes', cafeId, 'bills'),
        orderBy('createdAt', 'desc'),
        limit(150)
      );

      this.billsUnsubscribe = onSnapshot(
        billsQuery,
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            const billData = change.doc.data() as Bill;
            if ((change.type === 'added' || change.type === 'modified') &&
                !getPendingQueue(cafeId).some(b => b.id === change.doc.id)) {
              saveBillLocally({
                ...billData,
                id: change.doc.id,
                isSynced: true,
              });
            }
          });
        },
        (error) => {
          console.warn('Bills subscription failed', error);
        }
      );
    } catch (err) {
      console.warn('Could not establish bills live listener', err);
    }

    const menuPath = `cafes/${cafeId}/menu`;
    try {
      const menuQuery = collection(db, 'cafes', cafeId, 'menu');
      this.menuUnsubscribe = onSnapshot(
        menuQuery,
        (snapshot) => {
          {
            const items: MenuItem[] = [];
            snapshot.forEach((docSnap) => {
              items.push({ ...(docSnap.data() as MenuItem), id: docSnap.id, cafeId });
            });
            saveLocalMenu(cafeId, items);
          }
        },
        (error) => {
          console.warn('Menu subscription failed', error);
        }
      );
    } catch (err) {
      console.warn('Could not establish menu live listener', err);
    }
  }

  public destroy() {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.billsUnsubscribe) this.billsUnsubscribe();
    if (this.menuUnsubscribe) this.menuUnsubscribe();
  }
}

export const syncEngine = new SyncEngine();
