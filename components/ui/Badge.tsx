interface StatusBadgeProps {
  status: string;
  className?: string;
}

function getColorClasses(status: string): string {
  const s = status.trim().toUpperCase();
  if (s === "CLOCKED IN" || s === "COMPLETE" || s === "ACTIVE" || s === "COMPLETED") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-600/20 [&>span]:bg-emerald-500";
  }
  if (s === "CLOCKED OUT" || s === "INCOMPLETE") {
    return "bg-amber-50 text-amber-700 ring-amber-600/20 [&>span]:bg-amber-500";
  }
  if (s === "ERROR" || s === "CANCELLED" || s === "FAILED") {
    return "bg-red-50 text-red-700 ring-red-600/20 [&>span]:bg-red-500";
  }
  return "bg-slate-100 text-slate-700 ring-slate-500/20 [&>span]:bg-slate-400";
}

export function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  return (
    <span
      aria-label={`Status: ${status}`}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${getColorClasses(status)} ${className}`}
    >
      <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" />
      {status}
    </span>
  );
}

export default StatusBadge;
