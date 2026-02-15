import { createClient } from "@supabase/supabase-js";

const viteEnv = ((import.meta as any)?.env || {}) as Record<string, string | undefined>;
const url = viteEnv.VITE_SUPABASE_URL;
const anonKey = viteEnv.VITE_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = Boolean(url && anonKey);

export const supabase = hasSupabaseConfig
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    })
  : null;
