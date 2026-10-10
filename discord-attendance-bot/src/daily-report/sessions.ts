import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client } from "discord.js";
import { dayBoundsUtc } from "./dates.js";
import type { ReportUserInput } from "./report.js";

interface Profile {
  display_name: string | null;
  discord_username: string | null;
}

export interface SessionRow {
  id: string;
  clock_in: string;
  clock_out: string | null;
  duration_seconds: number | null;
  status: string;
  attendance_date: string;
  discord_user_id: string;
  users: Profile | null;
}

interface RawSessionRow extends Omit<SessionRow, "users"> {
  users: Profile | Profile[] | null;
}

/** Include overnight presence even before an ACTIVE session has been split. */
export async function fetchSessionsForDate(
  db: SupabaseClient, targetDate: string, timeZone: string,
): Promise<SessionRow[]> {
  const { startUtc, endUtc } = dayBoundsUtc(targetDate, timeZone);
  const rows: SessionRow[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db.from("attendance_sessions")
      .select("id,clock_in,clock_out,duration_seconds,status,attendance_date,discord_user_id,users(display_name,discord_username)")
      .lt("clock_in", endUtc.toISOString())
      .or(`clock_out.gt.${startUtc.toISOString()},and(status.eq.ACTIVE,clock_out.is.null),attendance_date.eq.${targetDate}`)
      .order("clock_in", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as RawSessionRow[];
    rows.push(...page.map((r) => ({ ...r, users: Array.isArray(r.users) ? (r.users[0] ?? null) : r.users })));
    if (page.length < pageSize) return rows;
  }
}

/** Use Discord's bot flag; profile active=false can also describe a human. */
export async function resolveHumans(client: Client, rows: SessionRow[]): Promise<ReportUserInput[]> {
  const byDiscord = new Map<string, SessionRow[]>();
  for (const row of rows) {
    const list = byDiscord.get(row.discord_user_id) ?? [];
    list.push(row);
    byDiscord.set(row.discord_user_id, list);
  }
  const users: ReportUserInput[] = [];
  for (const [discordId, sessions] of byDiscord) {
    const discordUser = await client.users.fetch(discordId).catch(() => null);
    if (discordUser?.bot) continue;
    if (!discordUser) console.warn(`[daily-report] user fetch failed, including sessions anyway user=${discordId}`);
    const profile = sessions[0]?.users;
    users.push({
      displayName: profile?.display_name ?? profile?.discord_username ?? discordId,
      sessions: sessions.map((s) => ({
        clockIn: s.clock_in, clockOut: s.clock_out, durationSeconds: s.duration_seconds, status: s.status,
      })),
    });
  }
  return users;
}
