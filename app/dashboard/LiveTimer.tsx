"use client";

import { useEffect, useState } from "react";
import { formatHm, formatHms } from "@/lib/utils/format";

interface LiveTimerProps {
  clockInIso: string | null;
  todayTotalSeconds: number;
  requiredSeconds: number;
}

function elapsedSince(iso: string): number {
  const diff = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diff / 1000));
}

export default function LiveTimer({ clockInIso, todayTotalSeconds, requiredSeconds }: LiveTimerProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!clockInIso) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [clockInIso]);

  void now;

  const sessionElapsed = clockInIso ? elapsedSince(clockInIso) : 0;
  const liveTotal = todayTotalSeconds + sessionElapsed;
  const remaining = Math.max(0, requiredSeconds - liveTotal);

  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      <div className="rounded border border-gray-200 p-3 dark:border-neutral-800">
        <dt className="text-xs text-gray-500">Current session elapsed</dt>
        <dd className="mt-1 font-mono text-lg font-semibold" aria-live="off">
          {clockInIso ? formatHms(sessionElapsed) : "—"}
        </dd>
      </div>
      <div className="rounded border border-gray-200 p-3 dark:border-neutral-800">
        <dt className="text-xs text-gray-500">Today total (live)</dt>
        <dd className="mt-1 font-mono text-lg font-semibold">
          {formatHm(liveTotal)} <span className="text-sm font-normal">/ {formatHm(requiredSeconds)}</span>
        </dd>
      </div>
      <div className="rounded border border-gray-200 p-3 dark:border-neutral-800">
        <dt className="text-xs text-gray-500">Remaining</dt>
        <dd className="mt-1 font-mono text-lg font-semibold">{formatHm(remaining)}</dd>
      </div>
    </dl>
  );
}
