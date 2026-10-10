/** Read-only preview: SELECT attendance + fetch Discord profiles; never send. */
import { Client } from "discord.js";
import { config } from "../config.js";
import { buildDailyReportMessages } from "./report.js";
import { fetchSessionsForDate, resolveHumans } from "./sessions.js";
import { getSupabase } from "./supabase.js";

const targetDate = process.argv[2];
if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate) ||
  !Number.isFinite(Date.parse(`${targetDate}T00:00:00Z`)) ||
  new Date(`${targetDate}T00:00:00Z`).toISOString().slice(0, 10) !== targetDate) {
  throw new Error("Usage: npm run report:preview -- YYYY-MM-DD");
}
const client = new Client({ intents: [] });
client.rest.setToken(config.botToken);
try {
  const rows = await fetchSessionsForDate(getSupabase(), targetDate, config.appTimezone);
  const users = await resolveHumans(client, rows);
  const messages = buildDailyReportMessages(targetDate, users, config.appTimezone);
  process.stdout.write(messages.join("\n\n---\n\n") + "\n");
} finally {
  client.destroy();
}
