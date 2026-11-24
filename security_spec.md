# BillDedo Supabase access and deployment

The browser uses the public Supabase project URL and publishable key in `src/supabase.ts`, with optional `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` overrides. Privileged keys and database credentials must never be included in a Vite variable or client bundle.

## Database

Apply the SQL files under `supabase/migrations` in filename order, once, using a privileged database connection. The initial schema creates fresh tables and does not import Firebase data. These migrations have been applied to project `ojsbdothutpuzkkvcfqi`.

Each POS area has its own table with relational tenant/record keys and JSONB business data. Bills retain their complete line-item price snapshots. The shared `src/database.ts` module implements reads, atomic patches/batches and live subscriptions over Supabase; it has no Firebase dependency.

- Cafes can be read only by their owner or approved members.
- Only an owner can create their cafe, manage membership or change restaurant settings. Ownership is immutable.
- Staff can update Google Sheets metadata, but cannot grant access to themselves or others.
- Join requests require an exact secret code. The server supplies the requesting user's identity and returns only the cafe ID and name. Approval is required before private records become readable.
- Every tenant table enforces membership through PostgreSQL RLS. Bill/settings deletion requires ownership; inventory movements are append-only.
- Bills require valid totals/items/status. Staff cannot spoof another cashier or modify a voided bill.
- Writes and JSON merge patches are executed in database transactions. A failed batch rolls back in full.

Run `psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f supabase/tests/permissions.sql` to verify ownership, tenant isolation, staff approval/revocation, anonymous denial, bill idempotency and batch rollback. Test fixtures are rolled back.

For browser integration tests, start `npm run dev`, then run `npm run test:integration` with a server-only `SUPABASE_SECRET_KEY` in the process environment. Set `CHROME_PATH` if Chrome is installed elsewhere. The test creates temporary confirmed accounts without sending email, checks restaurant creation, staff approval, menu updates, offline bill replay and revocation, then removes its test records and users.

## Login and Google Sheets

Enable Google in Supabase Auth. Configure the Google OAuth web client's authorized redirect URI as `https://ojsbdothutpuzkkvcfqi.supabase.co/auth/v1/callback`.

Set Supabase Auth's Site URL to `https://www.billdedo.shop`. Allow these redirect URLs: `https://www.billdedo.shop/`, `https://billdedo.shop/`, and `http://localhost:3000/`. Add a specific Vercel hostname if it is used for login.

Login uses the Supabase PKCE redirect flow. Google Sheets requests its additional permission only when connecting Sheets. The application keeps its working Google access token in memory and asks users to reconnect after expiration or reload. Supabase owns session persistence and refresh. No Firebase sessions are reused.

## Fresh local data and offline behavior

Browser records now use the `billdedo_sb1_` namespace. Old Firebase-era local records and pending queues are ignored and cannot upload to Supabase. Historical expense seed rows and their import controls have been removed. No old cloud data is copied or deleted.

Billing retains the existing local pending queue. Repeated uploads use the same cafe/record key. Pending local edits are not replaced by an older live snapshot. Realtime subscriptions refetch after reconnect, with periodic reconciliation for missed events and revoked access. Other workflows retain their existing local caching behavior; this is not a general offline queue for every settings or inventory mutation.

## Vercel

Set the project root to `Cafe-POS` (or `.` when this repository is imported directly). Use npm, `npm run build`, and output directory `dist`. `package-lock.json` replaces the old Bun lockfile. `vercel.json` supplies SPA navigation and download routes; `api/health.ts` and `api/extract-menu.ts` expose the existing Express endpoints.

Set server-only `GEMINI_API_KEY` for menu scanning. Firebase admin keys are not needed. Google OAuth client secrets belong in the Supabase provider settings. SQL deployment needs privileged access only during migration.

After rollout, refresh open or installed PWA clients so they load the new application and service worker.
