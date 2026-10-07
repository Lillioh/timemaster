import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config.js";

let cached: SupabaseClient | null = null;

/**
 * Service-role client for the daily report job: session reads, ledger
 * writes, and retention deletes. Server-side (bot host) only — the key
 * never leaves the process and is never logged.
 */
export function getSupabase(): SupabaseClient {
  if (!cached) {
    cached = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });
  }
  return cached;
}
