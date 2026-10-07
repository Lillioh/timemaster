import type { ReactNode } from "react";

interface DataTableProps {
  children: ReactNode;
  caption?: string;
  className?: string;
}

export function DataTable({ children, caption, className = "" }: DataTableProps) {
  return (
    <div className={`overflow-x-auto rounded-lg border border-slate-200 ${className}`}>
      <table className="w-full border-collapse text-left text-sm text-slate-700">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export default DataTable;
