import { StatusBadge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";

interface StatusCardProps {
  clockedIn: boolean;
  channelName: string | null;
  clockInLabel: string | null;
  sessionElapsed: string;
  todayTotal: string;
  required: string;
  remaining: string;
  complete: boolean;
  todaySeconds?: number;
  requiredSeconds?: number;
}

export function StatusCard({
  clockedIn,
  channelName,
  clockInLabel,
  sessionElapsed,
  todayTotal,
  required,
  remaining,
  complete,
  todaySeconds,
  requiredSeconds,
}: StatusCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Current status</CardTitle>
          <StatusBadge status={clockedIn ? "CLOCKED IN" : "CLOCKED OUT"} />
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-500">Channel</dt>
            <dd className="font-medium text-slate-900">{channelName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Clocked in at</dt>
            <dd className="font-medium text-slate-900">{clockInLabel ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Session elapsed</dt>
            <dd className="font-medium tabular-nums text-slate-900">{sessionElapsed}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Today total</dt>
            <dd className="font-medium tabular-nums text-slate-900">{todayTotal}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Required</dt>
            <dd className="font-medium tabular-nums text-slate-900">{required}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Remaining</dt>
            <dd className="font-medium tabular-nums text-slate-900">{remaining}</dd>
          </div>
        </dl>
        <div className="mt-4 flex items-center gap-3">
          <StatusBadge status={complete ? "COMPLETE" : "INCOMPLETE"} />
          {typeof todaySeconds === "number" && typeof requiredSeconds === "number" ? (
            <div className="flex-1">
              <ProgressBar value={todaySeconds} max={requiredSeconds} label="Daily progress" />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default StatusCard;
