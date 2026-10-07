import { requireAdmin } from "@/lib/auth/guards";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { formatClockTime, formatHm } from "@/lib/utils/format";
import DevSimulatePanel from "./DevSimulatePanel";

function todayDateStr(): string {
  const tz = process.env.NEXT_PUBLIC_APP_TIMEZONE || process.env.APP_TIMEZONE || "UTC";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export default async function AdminOverviewPage() {
  await requireAdmin();
  const service = createSupabaseServiceClient();
  const today = todayDateStr();

  const { data: users } = await service
    .from("users")
    .select("id, discord_username, display_name, email, role, active")
    .order("created_at", { ascending: true });

  const { data: activeSessions } = await service
    .from("attendance_sessions")
    .select("user_id, clock_in")
    .eq("status", "ACTIVE");

  const { data: todayRows } = await service
    .from("daily_attendance")
    .select("user_id, total_seconds, required_seconds, status")
    .eq("attendance_date", today);

  const allUsers = users ?? [];
  const activeByUser = new Map((activeSessions ?? []).map((s) => [s.user_id as string, s]));
  const dailyByUser = new Map((todayRows ?? []).map((d) => [d.user_id as string, d]));

  const totalUsers = allUsers.length;
  const clockedIn = (activeSessions ?? []).length;
  const completedToday = (todayRows ?? []).filter((d) => d.status === "COMPLETE").length;
  const incompleteToday = Math.max(0, totalUsers - completedToday);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin overview</h1>
      <p className="text-sm text-gray-500">Today: {today}</p>

      <section aria-labelledby="stats-heading" className="grid gap-3 sm:grid-cols-4">
        <h2 id="stats-heading" className="sr-only">Statistics</h2>
        <div className="rounded border border-gray-200 p-4 dark:border-neutral-800">
          <p className="text-xs text-gray-500">Total Users</p>
          <p className="mt-1 text-2xl font-bold">{totalUsers}</p>
        </div>
        <div className="rounded border border-gray-200 p-4 dark:border-neutral-800">
          <p className="text-xs text-gray-500">Clocked In</p>
          <p className="mt-1 text-2xl font-bold">{clockedIn}</p>
        </div>
        <div className="rounded border border-gray-200 p-4 dark:border-neutral-800">
          <p className="text-xs text-gray-500">Completed Today</p>
          <p className="mt-1 text-2xl font-bold">{completedToday}</p>
        </div>
        <div className="rounded border border-gray-200 p-4 dark:border-neutral-800">
          <p className="text-xs text-gray-500">Incomplete Today</p>
          <p className="mt-1 text-2xl font-bold">{incompleteToday}</p>
        </div>
      </section>

      <section aria-labelledby="users-heading">
        <h2 id="users-heading" className="font-semibold">Users today</h2>
        {allUsers.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No users found.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left dark:border-neutral-800">
                  <th scope="col" className="px-2 py-2 font-medium">User</th>
                  <th scope="col" className="px-2 py-2 font-medium">Status</th>
                  <th scope="col" className="px-2 py-2 font-medium">Today Total</th>
                  <th scope="col" className="px-2 py-2 font-medium">Clock-In</th>
                  <th scope="col" className="px-2 py-2 font-medium">Daily Status</th>
                </tr>
              </thead>
              <tbody>
                {allUsers.map((u) => {
                  const session = activeByUser.get(u.id);
                  const daily = dailyByUser.get(u.id);
                  const name = u.display_name ?? u.discord_username ?? u.email ?? u.id;
                  return (
                    <tr key={u.id} className="border-b border-gray-100 dark:border-neutral-900">
                      <td className="px-2 py-2">{name}</td>
                      <td className="px-2 py-2">
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`status-dot ${session ? "status-dot-green" : "status-dot-gray"}`} aria-hidden="true" />
                          {session ? "CLOCKED IN" : "CLOCKED OUT"}
                        </span>
                      </td>
                      <td className="px-2 py-2 font-mono">
                        {daily ? `${formatHm(daily.total_seconds)} / ${formatHm(daily.required_seconds)}` : "—"}
                      </td>
                      <td className="px-2 py-2">
                        {session ? formatClockTime(session.clock_in as string) : "—"}
                      </td>
                      <td className="px-2 py-2">
                        {daily ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`status-dot ${daily.status === "COMPLETE" ? "status-dot-green" : "status-dot-amber"}`} aria-hidden="true" />
                            {daily.status as string}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {process.env.NODE_ENV !== "production" && <DevSimulatePanel />}
    </div>
  );
}
