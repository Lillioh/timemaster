import { requireAdmin } from "@/lib/auth/guards";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { formatHm } from "@/lib/utils/format";

export default async function AdminReportsPage() {
  await requireAdmin();
  const service = createSupabaseServiceClient();

  const today = new Date().toISOString().slice(0, 10);
  // eslint-disable-next-line react-hooks/purity -- async server component: evaluated once per request
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const { data: users } = await service.from("users").select("id").eq("active", true);
  const { data: activeSessions } = await service
    .from("attendance_sessions")
    .select("id")
    .eq("status", "ACTIVE");
  const { data: todayRows } = await service
    .from("daily_attendance")
    .select("user_id, status")
    .eq("attendance_date", today);
  const { data: monthRows } = await service
    .from("daily_attendance")
    .select("total_seconds, status")
    .gte("attendance_date", thirtyDaysAgo);

  const activeUsers = (users ?? []).length;
  const clockedIn = (activeSessions ?? []).length;
  const completedToday = (todayRows ?? []).filter((d) => d.status === "COMPLETE").length;
  const monthTotal = (monthRows ?? []).reduce((s, d) => s + (d.total_seconds ?? 0), 0);
  const monthComplete = (monthRows ?? []).filter((d) => d.status === "COMPLETE").length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reports</h1>
      <section aria-labelledby="summary-heading" className="grid gap-3 sm:grid-cols-3">
        <h2 id="summary-heading" className="sr-only">Summary</h2>
        <div className="rounded border border-gray-200 p-4 dark:border-neutral-800">
          <p className="text-xs text-gray-500">Active users</p>
          <p className="mt-1 text-2xl font-bold">{activeUsers}</p>
        </div>
        <div className="rounded border border-gray-200 p-4 dark:border-neutral-800">
          <p className="text-xs text-gray-500">Clocked in now</p>
          <p className="mt-1 text-2xl font-bold">{clockedIn}</p>
        </div>
        <div className="rounded border border-gray-200 p-4 dark:border-neutral-800">
          <p className="text-xs text-gray-500">Completed today</p>
          <p className="mt-1 text-2xl font-bold">{completedToday}</p>
        </div>
        <div className="rounded border border-gray-200 p-4 dark:border-neutral-800">
          <p className="text-xs text-gray-500">Total tracked (30d)</p>
          <p className="mt-1 font-mono text-2xl font-bold">{formatHm(monthTotal)}</p>
        </div>
        <div className="rounded border border-gray-200 p-4 dark:border-neutral-800">
          <p className="text-xs text-gray-500">Complete days (30d)</p>
          <p className="mt-1 text-2xl font-bold">{monthComplete}</p>
        </div>
        <div className="rounded border border-gray-200 p-4 dark:border-neutral-800">
          <p className="text-xs text-gray-500">Incomplete today</p>
          <p className="mt-1 text-2xl font-bold">{Math.max(0, activeUsers - completedToday)}</p>
        </div>
      </section>
      {(monthRows ?? []).length === 0 && (
        <p className="text-sm text-gray-500">No attendance data in the last 30 days.</p>
      )}
    </div>
  );
}
