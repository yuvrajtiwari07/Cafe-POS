import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { showToast } from './services/toast';

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}
const listeners = new Set<(user: User | null) => void>();
let initialized = false;
let cachedGoogleAccessToken: string | null = null;
let tokenExpiresAtMs = 0;
let previousUserId: string | null | undefined;

function mapUser(user: SupabaseUser): User {
  return { uid: user.id, email: user.email || null,
    displayName: user.user_metadata.full_name || user.user_metadata.name || null,
    photoURL: user.user_metadata.avatar_url || null };
}
function notifySheetsAuthChange() {
  window.dispatchEvent(new CustomEvent('google_sheets_auth_changed', {
    detail: { connected: Boolean(cachedGoogleAccessToken) },
  }));
}
function acceptSession(session: Session | null) {
  auth.currentUser = session ? mapUser(session.user) : null;
  if (!session || previousUserId !== session.user.id) {
    cachedGoogleAccessToken = null;
    tokenExpiresAtMs = 0;
  }
  // Only use a Google token from the explicit Sheets consent flow.
  if (session?.provider_token && sessionStorage.getItem('billdedo-sheets-consent') === 'pending') {
    cachedGoogleAccessToken = session.provider_token;
    tokenExpiresAtMs = Date.now() + 50 * 60 * 1000;
    sessionStorage.removeItem('billdedo-sheets-consent');
  }
  notifySheetsAuthChange();
  if (!initialized || previousUserId !== (session?.user.id ?? null)) {
    initialized = true;
    previousUserId = session?.user.id ?? null;
    // Do not make Supabase calls inside its synchronous auth callback/lock.
    for (const listener of listeners) setTimeout(() => {
      if (listeners.has(listener)) listener(auth.currentUser);
    }, 0);
  }
}
export const auth = {
  currentUser: null as User | null,
  onAuthStateChanged(callback: (user: User | null) => void) {
    listeners.add(callback);
    if (initialized) queueMicrotask(() => { if (listeners.has(callback)) callback(auth.currentUser); });
    return () => { listeners.delete(callback); };
  },
};
export function onAuthStateChanged(_auth: typeof auth, callback: (user: User | null) => void) {
  return auth.onAuthStateChanged(callback);
}
supabase.auth.onAuthStateChange((_event, session) => acceptSession(session));
supabase.auth.getSession().then(({ data, error }) => {
  if (error) showToast(error.message, 'error');
  if (!initialized) acceptSession(data.session);
});

export function getGoogleSheetsAccessToken(): string | null {
  if (cachedGoogleAccessToken && Date.now() >= tokenExpiresAtMs) clearGoogleSheetsAccessToken();
  return cachedGoogleAccessToken;
}
export function hasGoogleSheetsAccessToken() { return Boolean(getGoogleSheetsAccessToken()); }
export function clearGoogleSheetsAccessToken() {
  cachedGoogleAccessToken = null;
  tokenExpiresAtMs = 0;
  notifySheetsAuthChange();
}
async function startGoogleLogin(sheets: boolean) {
  if (sheets) sessionStorage.setItem('billdedo-sheets-consent', 'pending');
  else sessionStorage.removeItem('billdedo-sheets-consent');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + '/',
      skipBrowserRedirect: true,
      scopes: sheets ? 'https://www.googleapis.com/auth/spreadsheets' : undefined,
      queryParams: { prompt: sheets ? 'consent' : 'select_account' },
    },
  });
  if (error) { sessionStorage.removeItem('billdedo-sheets-consent'); throw error; }
  if (!data.url) throw new Error('Google login did not return a redirect URL.');
  window.location.assign(data.url);
  // The page is about to unload; do not report a successful connection yet.
  return new Promise<void>(() => {});
}
export async function loginWithGoogle() {
  try { await startGoogleLogin(false); }
  catch (error) { showToast(error instanceof Error ? error.message : 'Google login failed', 'error'); }
}
export async function connectGoogleSheets(): Promise<void> { await startGoogleLogin(true); }
export async function logoutUser() {
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) { showToast(error.message, 'error'); return; }
  clearGoogleSheetsAccessToken();
}
