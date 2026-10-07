import { requireAdmin } from "@/lib/auth/guards";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const LEVELS = ["all", "info", "warn", "error"] as const;

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string }>;
}) {
  await requireAdmin();
  const service = createSupabaseServiceClient();
  const params = await searchParams;
  const level = (params.level ?? "all").toLowerCase();
  const validLevel = level === "info" || level === "warn" || level === "error" ? level : "all";

  let query = service
    .from("system_logs")
    .select("id, level, event, message, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (validLevel !== "all") query = query.eq("level", validLevel);
  const { data: logs, error } = await query;

  const rows = logs ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">System logs</h1>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="level" className="block text-sm font-medium">Level</label>
          <select
            id="level"
            name="level"
            defaultValue={validLevel}
            className="mt-1 rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>{l === "all" ? "All levels" : l}</option>
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
        <p role="alert" className="text-sm text-red-600">Failed to load logs: {error.message}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No logs found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left dark:border-neutral-800">
                <th scope="col" className="px-2 py-2 font-medium">Time</th>
                <th scope="col" className="px-2 py-2 font-medium">Level</th>
                <th scope="col" className="px-2 py-2 font-medium">Event</th>
                <th scope="col" className="px-2 py-2 font-medium">Message</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((log) => (
                <tr key={log.id} className="border-b border-gray-100 dark:border-neutral-900">
                  <td className="whitespace-nowrap px-2 py-2 text-xs">
                    {new Date(log.created_at as string).toLocaleString()}
                  </td>
                  <td className="px-2 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className={`status-dot ${
                          log.level === "error"
                            ? "status-dot-red"
                            : log.level === "warn"
                              ? "status-dot-amber"
                              : "status-dot-blue"
                        }`}
                        aria-hidden="true"
                      />
                      {log.level as string}
                    </span>
                  </td>
                  <td className="px-2 py-2 font-mono text-xs">{log.event as string}</td>
                  <td className="px-2 py-2">{log.message as string}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
