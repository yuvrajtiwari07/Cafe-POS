import { createClient } from '@supabase/supabase-js';

// Public browser configuration only. Never add a secret/service-role key here.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://ojsbdothutpuzkkvcfqi.supabase.co';
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_cHmnMzUrLXwp1-vYocHqxg_8QBV9jpq';
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});
