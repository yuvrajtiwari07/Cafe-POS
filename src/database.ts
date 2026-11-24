import { supabase } from './supabase';
export { auth, loginWithGoogle, logoutUser, connectGoogleSheets, getGoogleSheetsAccessToken,
  hasGoogleSheetsAccessToken, clearGoogleSheetsAccessToken } from './auth';

// App records retain their existing shape in JSONB. PostgreSQL owns tenant keys,
// atomic writes, validation and access control; no Firebase SDK is involved.
export const db = supabase;
export type Unsubscribe = () => void;
const tables: Record<string, string> = {
  menu: 'menu_items', bills: 'bills', ledger: 'ledger_entries', settings: 'cafe_settings',
  tables: 'active_tables', inventory: 'inventory_items', recipes: 'recipes', inventoryMovements: 'inventory_movements',
};
type Constraint = { kind: 'where'; field: string; op: string; value: any }
  | { kind: 'order'; field: string; direction: 'asc' | 'desc' } | { kind: 'limit'; count: number };
export interface RecordRef { table: string; cafeId?: string; id?: string; constraints: Constraint[] }
export interface RecordSnapshot { id: string; exists(): boolean; data(): any }
export interface CollectionSnapshot {
  docs: RecordSnapshot[]; empty: boolean; size: number;
  forEach(callback: (doc: RecordSnapshot) => void): void;
  docChanges(): { type: 'added' | 'modified' | 'removed'; doc: RecordSnapshot }[];
}
export function collection(_db: typeof db, ...parts: string[]): RecordRef {
  if (parts.length === 1 && parts[0] === 'cafes') return { table: 'cafes', constraints: [] };
  if (parts.length === 3 && parts[0] === 'cafes' && tables[parts[2]])
    return { table: tables[parts[2]], cafeId: parts[1], constraints: [] };
  throw new Error(`Unsupported collection: ${parts.join('/')}`);
}
export function doc(database: typeof db, ...parts: string[]): RecordRef {
  const id = parts.pop();
  if (!id) throw new Error('A record ID is required');
  return { ...collection(database, ...parts), id };
}
export const where = (field: string, op: string, value: any): Constraint => ({ kind: 'where', field, op, value });
export const orderBy = (field: string, direction: 'asc' | 'desc' = 'asc'): Constraint => ({ kind: 'order', field, direction });
export const limit = (count: number): Constraint => ({ kind: 'limit', count });
export const query = (ref: RecordRef, ...constraints: Constraint[]): RecordRef => ({ ...ref, constraints: [...ref.constraints, ...constraints] });
function snapshot(row: any, missingId = ''): RecordSnapshot {
  return { id: row?.id || missingId, exists: () => Boolean(row), data: () => row ? { ...row.data, id: row.id } : undefined };
}
function buildQuery(ref: RecordRef) {
  let request = supabase.from(ref.table).select('id,data');
  if (ref.cafeId) request = request.eq('cafe_id', ref.cafeId);
  if (ref.id) request = request.eq('id', ref.id);
  for (const c of ref.constraints) {
    if (c.kind === 'where') {
      if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(c.field)) throw new Error('Invalid query field');
      if (c.op === '==') request = request.eq(`data->>${c.field}`, c.value);
      else if (c.op === 'array-contains') request = request.contains('data', { [c.field]: [c.value] });
      else throw new Error(`Unsupported query operator: ${c.op}`);
    } else if (c.kind === 'order') request = request.order(`data->>${c.field}`, { ascending: c.direction === 'asc' });
  }
  // Stable order is required to page beyond PostgREST's default 1,000 rows.
  return request.order('id');
}
export async function getDoc(ref: RecordRef): Promise<RecordSnapshot> {
  const { data, error } = await buildQuery(ref).maybeSingle();
  if (error) throw error;
  return snapshot(data, ref.id);
}
export async function getDocs(ref: RecordRef): Promise<CollectionSnapshot> {
  const max = ref.constraints.find(c => c.kind === 'limit') as { count: number } | undefined;
  const docs: RecordSnapshot[] = [];
  for (let offset = 0; offset < (max?.count ?? Infinity); offset += 500) {
    const count = Math.min(500, (max?.count ?? Infinity) - offset);
    const { data, error } = await buildQuery(ref).range(offset, offset + count - 1);
    if (error) throw error;
    docs.push(...data.map(row => snapshot(row)));
    if (data.length < count) break;
  }
  return { docs, empty: docs.length === 0, size: docs.length, forEach: cb => docs.forEach(cb),
    docChanges: () => docs.map(doc => ({ type: 'added', doc })) };
}
function operation(ref: RecordRef, data: any, merge: boolean, action = 'set') {
  if (!ref.id) throw new Error('A record ID is required for writes');
  return { table: ref.table, cafe_id: ref.cafeId || null, id: ref.id, data: cleanData(data), merge, action };
}
async function commit(operations: any[]) {
  const { error } = await supabase.rpc('write_records', { operations });
  if (error) throw error;
  window.dispatchEvent(new Event('database_changed'));
}
export const setDoc = (ref: RecordRef, data: any, options?: { merge?: boolean }) => commit([operation(ref, data, Boolean(options?.merge))]);
export const updateDoc = (ref: RecordRef, data: any) => commit([operation(ref, data, true, 'update')]);
export const deleteDoc = (ref: RecordRef) => commit([operation(ref, {}, false, 'delete')]);
export function writeBatch(_db: typeof db) {
  const operations: any[] = [];
  return { set(ref: RecordRef, data: any, options?: { merge?: boolean }) {
    operations.push(operation(ref, data, Boolean(options?.merge)));
  }, commit: () => commit(operations) };
}
export function onSnapshot(ref: RecordRef, callback: (value: CollectionSnapshot & RecordSnapshot) => void, onError = (error: any) => console.warn('Live update failed', error)): Unsubscribe {
  let active = true;
  let busy = false;
  let dirty = false;
  let previous = new Map<string, RecordSnapshot>();
  let lastResult: string | undefined;
  const refresh = async () => {
    if (!active) return;
    if (busy) { dirty = true; return; }
    busy = true;
    try {
      const result = ref.id ? await getDoc(ref) : await getDocs(ref);
      if (!active) return;
      const docs = ref.id ? [(result as RecordSnapshot)].filter(d => d.exists()) : (result as CollectionSnapshot).docs;
      const signature = JSON.stringify(docs.map(d => [d.id, d.data()]));
      if (signature !== lastResult) {
        const next = new Map(docs.map(d => [d.id, d]));
        if (!ref.id) {
          const changes: ReturnType<CollectionSnapshot['docChanges']> = [];
          for (const d of docs) {
            const old = previous.get(d.id);
            if (!old || JSON.stringify(old.data()) !== JSON.stringify(d.data()))
              changes.push({ type: old ? 'modified' : 'added', doc: d });
          }
          for (const [id, d] of previous) if (!next.has(id)) changes.push({ type: 'removed', doc: d });
          (result as CollectionSnapshot).docChanges = () => changes;
        }
        previous = next;
        lastResult = signature;
        callback(result as CollectionSnapshot & RecordSnapshot);
      }
    } catch (error) { if (active) onError(error); }
    finally { busy = false; if (dirty && active) { dirty = false; void refresh(); } }
  };
  const channel = supabase.channel(`pos-${crypto.randomUUID()}`).on('postgres_changes', {
    event: '*', schema: 'public', table: ref.table,
    ...(ref.cafeId ? { filter: `cafe_id=eq.${ref.cafeId}` } : ref.id ? { filter: `id=eq.${ref.id}` } : {}),
  }, () => void refresh()).subscribe(status => { if (status === 'SUBSCRIBED') void refresh(); });
  // Reconcile deletions, revoked access and missed events after network outages.
  const timer = setInterval(refresh, 15000);
  window.addEventListener('online', refresh);
  window.addEventListener('database_changed', refresh);
  void refresh();
  return () => { active = false; clearInterval(timer); void supabase.removeChannel(channel);
    window.removeEventListener('online', refresh); window.removeEventListener('database_changed', refresh); };
}
export function cleanData<T>(obj: T): T { return JSON.parse(JSON.stringify(obj)); }
export enum OperationType { CREATE = 'create', UPDATE = 'update', DELETE = 'delete', LIST = 'list', GET = 'get', WRITE = 'write' }
export function handleDatabaseError(error: any, operation: OperationType, path: string | null): never {
  console.error('Database error', { operation, path, message: error?.message });
  throw new Error(error?.message || String(error));
}
export async function testConnection() {
  const { error } = await supabase.from('cafes').select('id').limit(1);
  return !error;
}
export async function requestCafeJoin(code: string): Promise<{ id: string; name: string }> {
  const { data, error } = await supabase.rpc('request_cafe_join', { code });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}
