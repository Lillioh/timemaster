import { requireUser } from "@/lib/auth/guards";
import { formatClockTime, formatHm } from "@/lib/utils/format";

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { supabase, authUser } = await requireUser();
  const params = await searchParams;

  const selectedDate =
    params.date && isValidDate(params.date)
      ? params.date
      : new Date().toISOString().slice(0, 10);

  const { data: history } = await supabase
    .from("daily_attendance")
    .select("attendance_date, total_seconds, required_seconds, status")
    .eq("user_id", authUser.id)
    .order("attendance_date", { ascending: false })
    .limit(60);

  const { data: sessions } = await supabase
    .from("attendance_sessions")
    .select("id, clock_in, clock_out, duration_seconds, status, voice_channel_name")
    .eq("user_id", authUser.id)
    .eq("attendance_date", selectedDate)
    .order("clock_in", { ascending: true });

  const days = history ?? [];
  const daySessions = sessions ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Attendance</h1>

      <section aria-labelledby="picker-heading" className="rounded border border-gray-200 p-4 dark:border-neutral-800">
        <h2 id="picker-heading" className="font-semibold">Sessions by date</h2>
        <form method="get" className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="date" className="block text-sm font-medium">Date</label>
            <input
              id="date"
              name="date"
              type="date"
              defaultValue={selectedDate}
              required
              pattern="\d{4}-\d{2}-\d{2}"
              className="mt-1 rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
          </div>
          <button
            type="submit"
            className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Show sessions
          </button>
        </form>
        <div className="mt-3">
          {daySessions.length === 0 ? (
            <p className="text-sm text-gray-500">No sessions on {selectedDate}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left dark:border-neutral-800">
                    <th scope="col" className="px-2 py-2 font-medium">Clock in – out</th>
                    <th scope="col" className="px-2 py-2 font-medium">Duration</th>
                    <th scope="col" className="px-2 py-2 font-medium">Channel</th>
                    <th scope="col" className="px-2 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {daySessions.map((s) => (
                    <tr key={s.id} className="border-b border-gray-100 dark:border-neutral-900">
                      <td className="px-2 py-2">
                        {formatClockTime(s.clock_in)} – {s.clock_out ? formatClockTime(s.clock_out) : "now"}
                      </td>
                      <td className="px-2 py-2 font-mono">
                        {s.duration_seconds != null ? formatHm(s.duration_seconds) : "—"}
                      </td>
                      <td className="px-2 py-2">{s.voice_channel_name ?? "—"}</td>
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
        </div>
      </section>

      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="font-semibold">Daily history (last 60 days)</h2>
        {days.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No attendance records yet.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left dark:border-neutral-800">
                  <th scope="col" className="px-2 py-2 font-medium">Date</th>
                  <th scope="col" className="px-2 py-2 font-medium">Total</th>
                  <th scope="col" className="px-2 py-2 font-medium">Required</th>
                  <th scope="col" className="px-2 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.attendance_date} className="border-b border-gray-100 dark:border-neutral-900">
                    <td className="px-2 py-2">{d.attendance_date}</td>
                    <td className="px-2 py-2 font-mono">{formatHm(d.total_seconds)}</td>
                    <td className="px-2 py-2 font-mono">{formatHm(d.required_seconds)}</td>
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={`status-dot ${d.status === "COMPLETE" ? "status-dot-green" : "status-dot-amber"}`}
                          aria-hidden="true"
                        />
                        {d.status}
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
