export const REQUIRED_DAILY_SECONDS = 28_800; // 8h
export const APP_TIMEZONE_FALLBACK = "UTC";

export function getAppTimezone(): string {
  return process.env.APP_TIMEZONE || APP_TIMEZONE_FALLBACK;
}
