import { createClient } from "@supabase/supabase-js";

const viteEnv = import.meta.env;
const url = viteEnv.VITE_SUPABASE_URL?.trim() || "";
const anonKey = viteEnv.VITE_SUPABASE_ANON_KEY?.trim() || "";

export const hasSupabaseConfig = Boolean(url && anonKey);
export const supabaseConfigDebug = {
  hasUrl: Boolean(url),
  hasAnonKey: Boolean(anonKey),
  urlPreview: url ? `${url.slice(0, 32)}...` : "",
};

export const supabase = hasSupabaseConfig
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    })
  : null;
