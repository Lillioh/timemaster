import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`[config] Missing required env var: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

export const config = {
  botToken: required("DISCORD_BOT_TOKEN"),
  guildId: required("DISCORD_GUILD_ID"),
  workChannelId: required("DISCORD_WORK_CHANNEL_ID"),
  attendanceApiUrl: required("ATTENDANCE_API_URL"),
  webhookSecret: required("DISCORD_WEBHOOK_SECRET"),
  reportChannelId: required("DISCORD_ATTENDANCE_LOG_CHANNEL_ID"),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  appTimezone: optional("APP_TIMEZONE", "Asia/Manila"),
  nodeEnv: optional("NODE_ENV", "development"),
  heartbeatIntervalMs: Number(optional("HEARTBEAT_INTERVAL_MS", "300000")),
  logLevel: optional("LOG_LEVEL", "info"),
};

export type BotConfig = typeof config;
