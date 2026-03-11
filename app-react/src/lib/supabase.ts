import { createClient } from "@supabase/supabase-js";

const viteEnv = ((import.meta as any)?.env || {}) as Record<string, string | undefined>;
const url = viteEnv.VITE_SUPABASE_URL?.trim();
const anonKey = viteEnv.VITE_SUPABASE_ANON_KEY?.trim();

export const apiBaseUrl = viteEnv.VITE_API_URL?.trim() || "";
export const hasApiConfig = Boolean(apiBaseUrl);
export const hasSupabaseConfig = Boolean(url && anonKey);

export const supabase = hasSupabaseConfig
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    })
  : null;
