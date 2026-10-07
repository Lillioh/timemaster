export type SessionStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";
export type DailyStatus = "INCOMPLETE" | "COMPLETE";

export interface AttendanceSession {
  id: string;
  user_id: string;
  discord_user_id: string;
  guild_id: string;
  voice_channel_id: string;
  voice_channel_name: string | null;
  clock_in: string;
  clock_out: string | null;
  duration_seconds: number | null;
  attendance_date: string; // YYYY-MM-DD in APP_TIMEZONE
  status: SessionStatus;
  created_at: string;
  updated_at: string;
}

export interface DailyAttendance {
  id: string;
  user_id: string;
  attendance_date: string;
  total_seconds: number;
  required_seconds: number;
  status: DailyStatus;
  created_at: string;
  updated_at: string;
}

export interface DiscordConfiguration {
  id: string;
  guild_id: string;
  work_voice_channel_id: string;
  work_voice_channel_name: string | null;
  required_daily_seconds: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebhookEventRow {
  id: string;
  event_id: string;
  event_type: string;
  discord_user_id: string | null;
  guild_id: string | null;
  channel_id: string | null;
  payload: unknown;
  processed: boolean;
  created_at: string;
}
