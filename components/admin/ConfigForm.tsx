"use client";

import { useState, type FormEvent } from "react";

export interface ConfigFormValues {
  guildId: string;
  channelId: string;
  requiredHours: number;
}

interface ConfigFormProps {
  initial: ConfigFormValues;
  pending?: boolean;
  onSubmit: (values: ConfigFormValues) => void | Promise<void>;
}

export function ConfigForm({ initial, pending = false, onSubmit }: ConfigFormProps) {
  const [guildId, setGuildId] = useState(initial.guildId);
  const [channelId, setChannelId] = useState(initial.channelId);
  const [requiredHours, setRequiredHours] = useState(String(initial.requiredHours));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onSubmit({
      guildId: guildId.trim(),
      channelId: channelId.trim(),
      requiredHours: Number(requiredHours),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-6">
      <div>
        <label htmlFor="cfg-guild" className="block text-sm font-medium text-slate-700">Guild ID</label>
        <input
          id="cfg-guild"
          value={guildId}
          onChange={(e) => setGuildId(e.target.value)}
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="cfg-channel" className="block text-sm font-medium text-slate-700">Work voice channel ID</label>
        <input
          id="cfg-channel"
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="cfg-hours" className="block text-sm font-medium text-slate-700">Required hours per day</label>
        <input
          id="cfg-hours"
          type="number"
          min={0}
          max={24}
          step={0.5}
          value={requiredHours}
          onChange={(e) => setRequiredHours(e.target.value)}
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save configuration"}
      </button>
    </form>
  );
}

export default ConfigForm;
