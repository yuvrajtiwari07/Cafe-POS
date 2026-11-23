import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// CRITICAL: The app will break without this line specifying firestoreDatabaseId
export const db = initializeFirestore(
  app,
  {
    ignoreUndefinedProperties: true,
  },
  firebaseConfig.firestoreDatabaseId
);
export const auth = getAuth(app);

// Persist authentication indefinitely across browser tab restarts and inactivity
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('Could not enforce browserLocalPersistence', err);
});

export const GOOGLE_SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
] as const;

export const googleProvider = new GoogleAuthProvider();
GOOGLE_SHEETS_SCOPES.forEach((scope) => googleProvider.addScope(scope));

// Strictly in-memory OAuth access token cache (never persisted in localStorage/sessionStorage)
let cachedGoogleAccessToken: string | null = null;
let tokenExpiresAtMs = 0;

function notifySheetsAuthChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('google_sheets_auth_changed', {
        detail: { connected: hasGoogleSheetsAccessToken() },
      })
    );
  }
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    cachedGoogleAccessToken = null;
    tokenExpiresAtMs = 0;
    notifySheetsAuthChange();
  }
});

export function getGoogleSheetsAccessToken(): string | null {
  if (!cachedGoogleAccessToken) return null;
  if (tokenExpiresAtMs > 0 && Date.now() >= tokenExpiresAtMs) {
    cachedGoogleAccessToken = null;
    tokenExpiresAtMs = 0;
    notifySheetsAuthChange();
    return null;
  }
  return cachedGoogleAccessToken;
}

export function hasGoogleSheetsAccessToken(): boolean {
  return Boolean(getGoogleSheetsAccessToken());
}

export function clearGoogleSheetsAccessToken(): void {
  cachedGoogleAccessToken = null;
  tokenExpiresAtMs = 0;
  notifySheetsAuthChange();
}

/**
 * Deep sanitization helper that strips undefined values recursively
 * preventing Firestore Unsupported field value: undefined errors.
 */
export function cleanFirestoreData<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => cleanFirestoreData(item)) as unknown as T;
  }
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj as Record<string, any>)) {
    if (value !== undefined) {
      if (value && typeof value === 'object' && !(value instanceof Date)) {
        result[key] = cleanFirestoreData(value);
      } else {
        result[key] = value;
      }
    }
  }
  return result as T;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test connection on boot per critical constraint
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore offline: app will use LocalStorage queue until connection is restored.');
    }
    return false;
  }
}

export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      cachedGoogleAccessToken = credential.accessToken;
      tokenExpiresAtMs = Date.now() + 50 * 60 * 1000; // Refresh comfortably before 60m expiry
      notifySheetsAuthChange();
    }
    return result;
  } catch (err) {
    console.error('Google Sign-In failed', err);
    throw err;
  }
}

export async function connectGoogleSheets(): Promise<{ user: User; accessToken: string }> {
  const sheetsProvider = new GoogleAuthProvider();
  GOOGLE_SHEETS_SCOPES.forEach((scope) => sheetsProvider.addScope(scope));
  sheetsProvider.setCustomParameters({ prompt: 'select_account' });

  const result = await signInWithPopup(auth, sheetsProvider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('Could not obtain Google Sheets access token. Please allow Sheets access and try again.');
  }
  cachedGoogleAccessToken = credential.accessToken;
  tokenExpiresAtMs = Date.now() + 50 * 60 * 1000;
  notifySheetsAuthChange();
  return { user: result.user, accessToken: credential.accessToken };
}

export async function logoutUser() {
  try {
    cachedGoogleAccessToken = null;
    tokenExpiresAtMs = 0;
    notifySheetsAuthChange();
    await signOut(auth);
  } catch (err) {
    console.error('Logout failed', err);
  }
}
