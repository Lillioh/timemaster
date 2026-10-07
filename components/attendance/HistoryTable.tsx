import type { DailyAttendance } from "@/types/attendance";
import { formatDateLabel, formatHm } from "@/lib/utils/format";
import { StatusBadge } from "@/components/ui/Badge";
import { DataTable } from "@/components/ui/DataTable";

interface HistoryTableProps {
  daily: DailyAttendance[];
}

export function HistoryTable({ daily }: HistoryTableProps) {
  if (daily.length === 0) {
    return <p className="text-sm text-slate-500">No attendance history yet.</p>;
  }
  return (
    <DataTable caption="Daily attendance history">
      <thead className="bg-slate-50">
        <tr>
          <th scope="col" className="px-4 py-2 font-medium text-slate-500">Date</th>
          <th scope="col" className="px-4 py-2 font-medium text-slate-500">Total</th>
          <th scope="col" className="px-4 py-2 font-medium text-slate-500">Required</th>
          <th scope="col" className="px-4 py-2 font-medium text-slate-500">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200">
        {daily.map((d) => (
          <tr key={d.id}>
            <td className="px-4 py-2 text-slate-900">{formatDateLabel(d.attendance_date)}</td>
            <td className="px-4 py-2 tabular-nums">{formatHm(d.total_seconds)}</td>
            <td className="px-4 py-2 tabular-nums">{formatHm(d.required_seconds)}</td>
            <td className="px-4 py-2">
              <StatusBadge status={d.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

export default HistoryTable;
