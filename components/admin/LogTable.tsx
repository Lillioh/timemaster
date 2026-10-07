import type { WebhookEventRow } from "@/types/attendance";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/Badge";

interface LogTableProps {
  logs: WebhookEventRow[];
}

export function LogTable({ logs }: LogTableProps) {
  if (logs.length === 0) {
    return <p className="text-sm text-slate-500">No webhook events logged.</p>;
  }
  return (
    <DataTable caption="Webhook event log">
      <thead className="bg-slate-50">
        <tr>
          <th scope="col" className="px-4 py-2 font-medium text-slate-500">Event</th>
          <th scope="col" className="px-4 py-2 font-medium text-slate-500">User</th>
          <th scope="col" className="px-4 py-2 font-medium text-slate-500">Channel</th>
          <th scope="col" className="px-4 py-2 font-medium text-slate-500">Processed</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200">
        {logs.map((l) => (
          <tr key={l.id}>
            <td className="px-4 py-2 font-mono text-xs text-slate-900">{l.event_type}</td>
            <td className="px-4 py-2 font-mono text-xs">{l.discord_user_id ?? "—"}</td>
            <td className="px-4 py-2 font-mono text-xs">{l.channel_id ?? "—"}</td>
            <td className="px-4 py-2">
              <StatusBadge status={l.processed ? "COMPLETE" : "INCOMPLETE"} />
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

export default LogTable;
