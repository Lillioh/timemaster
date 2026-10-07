import { requireUser } from "@/lib/auth/guards";
import { formatClockTime, formatHm } from "@/lib/utils/format";
import LiveTimer from "./LiveTimer";

function todayDateStr(): string {
  const tz = process.env.NEXT_PUBLIC_APP_TIMEZONE || process.env.APP_TIMEZONE || "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    return parts; // YYYY-MM-DD
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export default async function DashboardPage() {
  const { supabase, authUser } = await requireUser();
  const today = todayDateStr();

  const { data: profile } = await supabase
    .from("users")
    .select("id, display_name, discord_username, required_override, active")
    .eq("id", authUser.id)
    .maybeSingle();

  const { data: daily } = await supabase
    .from("daily_attendance")
    .select("total_seconds, required_seconds, status")
    .eq("user_id", authUser.id)
    .eq("attendance_date", today)
    .maybeSingle();

  const { data: activeSession } = await supabase
    .from("attendance_sessions")
    .select("id, clock_in, voice_channel_name, attendance_date")
    .eq("user_id", authUser.id)
    .eq("status", "ACTIVE")
    .maybeSingle();

  const { data: recent } = await supabase
    .from("attendance_sessions")
    .select("id, clock_in, clock_out, duration_seconds, status, attendance_date, voice_channel_name")
    .eq("user_id", authUser.id)
    .order("clock_in", { ascending: false })
    .limit(5);

  const todayTotal = daily?.total_seconds ?? 0;
  const required = daily?.required_seconds ?? 28800;
  const isComplete = (daily?.status ?? "") === "COMPLETE" || todayTotal >= required;
  const clockedIn = !!activeSession;
  const pct = required > 0 ? Math.min(100, Math.round((todayTotal / required) * 100)) : 0;
  const sessions = recent ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <span
          className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-3 py-1 text-xs font-semibold dark:border-neutral-700"
          aria-label={clockedIn ? "Status: clocked in" : "Status: clocked out"}
        >
          <span className={`status-dot ${clockedIn ? "status-dot-green" : "status-dot-gray"}`} aria-hidden="true" />
          {clockedIn ? "CLOCKED IN" : "CLOCKED OUT"}
        </span>
        <span className="text-sm text-gray-500">
          {profile?.display_name ?? profile?.discord_username ?? authUser.email} · {today}
        </span>
      </div>

      {isComplete && (
        <div role="status" className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-100">
          Daily requirement complete — {formatHm(todayTotal)} / {formatHm(required)}. Nice work.
        </div>
      )}

      <section aria-labelledby="today-heading" className="space-y-3">
        <h2 id="today-heading" className="font-semibold">Today&apos;s progress</h2>
        <LiveTimer
          clockInIso={activeSession?.clock_in ?? null}
          todayTotalSeconds={todayTotal}
          requiredSeconds={required}
        />
        <div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>{formatHm(todayTotal)} of {formatHm(required)}</span>
            <span>{pct}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Today's progress toward 8 hour requirement"
            className="mt-1 h-2.5 w-full overflow-hidden rounded bg-gray-200 dark:bg-neutral-800"
          >
            <div className="h-full bg-blue-600" style={{ width: `${pct}%` }} />
          </div>
        </div>
        {activeSession && (
          <p className="text-sm text-gray-600 dark:text-neutral-300">
            Clocked in at {formatClockTime(activeSession.clock_in)}
            {activeSession.voice_channel_name ? ` in ${activeSession.voice_channel_name}` : ""}.
          </p>
        )}
      </section>

      <section aria-labelledby="recent-heading">
        <h2 id="recent-heading" className="font-semibold">Recent sessions</h2>
        {sessions.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No sessions yet. Join the work voice channel to clock in.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left dark:border-neutral-800">
                  <th scope="col" className="px-2 py-2 font-medium">Date</th>
                  <th scope="col" className="px-2 py-2 font-medium">Clock in – out</th>
                  <th scope="col" className="px-2 py-2 font-medium">Duration</th>
                  <th scope="col" className="px-2 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 dark:border-neutral-900">
                    <td className="px-2 py-2">{s.attendance_date}</td>
                    <td className="px-2 py-2">
                      {formatClockTime(s.clock_in)} – {s.clock_out ? formatClockTime(s.clock_out) : "now"}
                    </td>
                    <td className="px-2 py-2 font-mono">
                      {s.duration_seconds != null ? formatHm(s.duration_seconds) : "—"}
                    </td>
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={`status-dot ${s.status === "ACTIVE" ? "status-dot-green" : s.status === "COMPLETED" ? "status-dot-blue" : "status-dot-gray"}`}
                          aria-hidden="true"
                        />
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
