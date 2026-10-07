import { requireUser } from "@/lib/auth/guards";
import { formatHm } from "@/lib/utils/format";

export default async function ReportsPage() {
  const { supabase, authUser } = await requireUser();

  // eslint-disable-next-line react-hooks/purity -- async server component: evaluated once per request
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const { data: rows } = await supabase
    .from("daily_attendance")
    .select("attendance_date, total_seconds, required_seconds, status")
    .eq("user_id", authUser.id)
    .gte("attendance_date", thirtyDaysAgo)
    .order("attendance_date", { ascending: false });

  const days = rows ?? [];
  const totalSeconds = days.reduce((sum, d) => sum + (d.total_seconds ?? 0), 0);
  const daysComplete = days.filter((d) => d.status === "COMPLETE").length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Reports</h1>
      <p className="text-sm text-gray-600 dark:text-neutral-300">Last 30 days summary.</p>

      <section aria-labelledby="totals-heading" className="grid gap-3 sm:grid-cols-3">
        <h2 id="totals-heading" className="sr-only">Totals</h2>
        <div className="rounded border border-gray-200 p-4 dark:border-neutral-800">
          <p className="text-xs text-gray-500">Days complete</p>
          <p className="mt-1 text-2xl font-bold">{daysComplete}</p>
        </div>
        <div className="rounded border border-gray-200 p-4 dark:border-neutral-800">
          <p className="text-xs text-gray-500">Total time (30d)</p>
          <p className="mt-1 font-mono text-2xl font-bold">{formatHm(totalSeconds)}</p>
        </div>
        <div className="rounded border border-gray-200 p-4 dark:border-neutral-800">
          <p className="text-xs text-gray-500">Days tracked</p>
          <p className="mt-1 text-2xl font-bold">{days.length}</p>
        </div>
      </section>

      <section aria-labelledby="table-heading">
        <h2 id="table-heading" className="font-semibold">By date</h2>
        {days.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No data in the last 30 days.</p>
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
