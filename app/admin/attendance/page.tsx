import { requireAdmin } from "@/lib/auth/guards";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { formatClockTime, formatHm } from "@/lib/utils/format";

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; user?: string }>;
}) {
  await requireAdmin();
  const service = createSupabaseServiceClient();
  const params = await searchParams;

  const selectedDate =
    params.date && isValidDate(params.date)
      ? params.date
      : new Date().toISOString().slice(0, 10);
  const userFilter = (params.user ?? "").trim();

  const { data: users } = await service
    .from("users")
    .select("id, discord_username, display_name, email")
    .order("created_at", { ascending: true });

  let sessionQuery = service
    .from("attendance_sessions")
    .select("id, user_id, clock_in, clock_out, duration_seconds, status, voice_channel_name")
    .eq("attendance_date", selectedDate)
    .order("clock_in", { ascending: true });
  if (userFilter) sessionQuery = sessionQuery.eq("user_id", userFilter);
  const { data: sessions, error } = await sessionQuery;

  const nameById = new Map(
    (users ?? []).map((u) => [
      u.id as string,
      (u.display_name ?? u.discord_username ?? u.email ?? u.id) as string,
    ]),
  );

  const rows = sessions ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Attendance</h1>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded border border-gray-200 p-4 dark:border-neutral-800">
        <div>
          <label htmlFor="date" className="block text-sm font-medium">Date</label>
          <input
            id="date"
            name="date"
            type="date"
            defaultValue={selectedDate}
            required
            className="mt-1 rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
        <div>
          <label htmlFor="user" className="block text-sm font-medium">User</label>
          <select
            id="user"
            name="user"
            defaultValue={userFilter}
            className="mt-1 rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="">All users</option>
            {(users ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {nameById.get(u.id as string)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Filter
        </button>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-red-600">Failed to load sessions: {error.message}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No sessions on {selectedDate}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left dark:border-neutral-800">
                <th scope="col" className="px-2 py-2 font-medium">User</th>
                <th scope="col" className="px-2 py-2 font-medium">Clock in – out</th>
                <th scope="col" className="px-2 py-2 font-medium">Duration</th>
                <th scope="col" className="px-2 py-2 font-medium">Channel</th>
                <th scope="col" className="px-2 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-gray-100 dark:border-neutral-900">
                  <td className="px-2 py-2">{nameById.get(s.user_id as string) ?? s.user_id}</td>
                  <td className="px-2 py-2">
                    {formatClockTime(s.clock_in as string)} –{" "}
                    {s.clock_out ? formatClockTime(s.clock_out as string) : "now"}
                  </td>
                  <td className="px-2 py-2 font-mono">
                    {s.duration_seconds != null ? formatHm(s.duration_seconds as number) : "—"}
                  </td>
                  <td className="px-2 py-2">{(s.voice_channel_name as string | null) ?? "—"}</td>
                  <td className="px-2 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className={`status-dot ${s.status === "ACTIVE" ? "status-dot-green" : s.status === "COMPLETED" ? "status-dot-blue" : "status-dot-gray"}`}
                        aria-hidden="true"
                      />
                      {s.status as string}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
