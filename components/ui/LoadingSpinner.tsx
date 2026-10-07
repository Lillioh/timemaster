interface LoadingSpinnerProps {
  label?: string;
  className?: string;
}

export function LoadingSpinner({ label = "Loading…", className = "" }: LoadingSpinnerProps) {
  return (
    <div role="status" aria-label={label} className={`flex items-center justify-center gap-2 py-8 ${className}`}>
      <span
        aria-hidden="true"
        className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700"
      />
      <span className="text-sm text-slate-600">{label}</span>
    </div>
  );
}

export default LoadingSpinner;
