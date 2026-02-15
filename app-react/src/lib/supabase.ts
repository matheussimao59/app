import { createClient } from "@supabase/supabase-js";

const viteEnv = ((import.meta as any)?.env || {}) as Record<string, string | undefined>;
const fallbackUrl = "https://xawirlorssbucawhnxeh.supabase.co";
const fallbackAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhhd2lybG9yc3NidWNhd2hueGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NzY1NzMsImV4cCI6MjA3ODU1MjU3M30.hlJGmdarLnF6IG_L1552ZVItNKBPrBB4NLhS9DacQ7c";
const url = (viteEnv.VITE_SUPABASE_URL || fallbackUrl)?.trim();
const anonKey = (viteEnv.VITE_SUPABASE_ANON_KEY || fallbackAnonKey)?.trim();

export const hasSupabaseConfig = Boolean(url && anonKey);

export const supabase = hasSupabaseConfig
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    })
  : null;
