import { createClient } from '@supabase/supabase-js';

export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Set Supabase URL and anon key in .env.local');
  return createClient(url, key);
}
