import type { SupabaseClient } from "@supabase/supabase-js";

export async function writeLog(
  db: SupabaseClient,
  level: "info" | "warn" | "error",
  event: string,
  message: string,
  meta?: Record<string, unknown>,
) {
  try {
    await db.from("system_logs").insert({ level, event, message, meta: meta ?? {} });
  } catch {
    // Logging must never break attendance processing.
  }
}
