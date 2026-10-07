"use client";

import { useState } from "react";

const ACTIONS = ["JOIN", "LEAVE", "RECONCILE"] as const;

export default function DevSimulatePanel() {
  const [discordUserId, setDiscordUserId] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function send(action: (typeof ACTIONS)[number]) {
    setPending(action);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/dev/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, discord_user_id: discordUserId || undefined }),
      });
      const text = await res.text();
      if (!res.ok) {
        setError(`${res.status}: ${text}`);
      } else {
        setResult(`${action}: ${text}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section aria-labelledby="dev-sim-heading" className="rounded border border-dashed border-gray-400 p-4">
      <h2 id="dev-sim-heading" className="font-semibold">Dev simulate (non-production only)</h2>
      <div className="mt-3 max-w-sm">
        <label htmlFor="dev-discord-user-id" className="block text-sm font-medium">
          Discord user ID (optional)
        </label>
        <input
          id="dev-discord-user-id"
          type="text"
          value={discordUserId}
          onChange={(e) => setDiscordUserId(e.target.value)}
          placeholder="e.g. 123456789"
          className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => send(a)}
            disabled={pending !== null}
            className="rounded bg-neutral-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {pending === a ? `${a}…` : a}
          </button>
        ))}
      </div>
      {result && (
        <p role="status" className="mt-2 text-sm text-green-700 dark:text-green-300">{result}</p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </section>
  );
}
