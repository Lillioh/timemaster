import type { AttendanceSession } from "@/types/attendance";
import { formatClockTime, formatHms } from "@/lib/utils/format";
import { StatusBadge } from "@/components/ui/Badge";

interface SessionListProps {
  sessions: AttendanceSession[];
}

export function SessionList({ sessions }: SessionListProps) {
  if (sessions.length === 0) {
    return <p className="text-sm text-slate-500">No sessions recorded.</p>;
  }
  return (
    <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
      {sessions.map((s) => (
        <li key={s.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">
              {s.voice_channel_name ?? s.voice_channel_id}
            </p>
            <p className="text-xs text-slate-500">
              In: {formatClockTime(s.clock_in)}
              {s.clock_out ? ` · Out: ${formatClockTime(s.clock_out)}` : " · Ongoing"}
              {typeof s.duration_seconds === "number" ? ` · ${formatHms(s.duration_seconds)}` : ""}
            </p>
          </div>
          <StatusBadge status={s.status} />
        </li>
      ))}
    </ul>
  );
}

export default SessionList;
