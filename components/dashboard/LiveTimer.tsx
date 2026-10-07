"use client";

import { useEffect, useState } from "react";
import { formatHms } from "@/lib/utils/format";

interface LiveTimerProps {
  clockInIso: string | null;
  serverNowIso: string;
}

function computeElapsed(clockInIso: string, serverNowIso: string, mountedAt: number): number {
  const clockInMs = new Date(clockInIso).getTime();
  const serverNowMs = new Date(serverNowIso).getTime();
  if (Number.isNaN(clockInMs) || Number.isNaN(serverNowMs)) return 0;
  const offset = serverNowMs - mountedAt;
  return Math.max(0, Math.floor((Date.now() + offset - clockInMs) / 1000));
}

export function LiveTimer({ clockInIso, serverNowIso }: LiveTimerProps) {
  const [elapsed, setElapsed] = useState<number>(() => {
    if (!clockInIso) return 0;
    return computeElapsed(clockInIso, serverNowIso, Date.now());
  });

  useEffect(() => {
    if (!clockInIso) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset display when clocked out
      setElapsed(0);
      return;
    }
    const mountedAt = Date.now();
    setElapsed(computeElapsed(clockInIso, serverNowIso, mountedAt));
    const id = setInterval(() => {
      setElapsed(computeElapsed(clockInIso, serverNowIso, mountedAt));
    }, 1000);
    return () => clearInterval(id);
  }, [clockInIso, serverNowIso]);

  if (!clockInIso) {
    return (
      <div>
        <p className="text-2xl font-semibold tabular-nums text-slate-900">—</p>
        <p className="mt-1 text-xs text-slate-500">Display only — authoritative time is server-side</p>
      </div>
    );
  }

  return (
    <div>
      <p aria-live="off" className="text-2xl font-semibold tabular-nums text-slate-900">
        {formatHms(elapsed)}
      </p>
      <p className="mt-1 text-xs text-slate-500">Display only — authoritative time is server-side</p>
    </div>
  );
}

export default LiveTimer;
