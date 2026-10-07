"use client";

import { useState } from "react";

interface SimulatePanelProps {
  enabled?: boolean;
}

const SCENARIOS = [
  { id: "join", label: "Simulate join" },
  { id: "leave", label: "Simulate leave" },
  { id: "reconcile", label: "Simulate reconcile" },
] as const;

export function SimulatePanel({ enabled = false }: SimulatePanelProps) {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!enabled) return null;

  async function runScenario(scenario: string) {
    setLoading(scenario);
    setError(null);
    try {
      const res = await fetch("/api/dev/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario }),
      });
      const json = await res.json();
      setResult(JSON.stringify(json, null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <section aria-label="Dev simulation panel" className="rounded-lg border border-dashed border-slate-300 p-4">
      <h3 className="text-sm font-semibold text-slate-900">Dev simulation (non-production only)</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={loading !== null}
            onClick={() => runScenario(s.id)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loading === s.id ? "Running…" : s.label}
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>
      ) : null}
      {result ? (
        <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
          {result}
        </pre>
      ) : null}
    </section>
  );
}

export default SimulatePanel;
