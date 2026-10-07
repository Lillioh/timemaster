import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

async function updateDiscordConfig(formData: FormData) {
  "use server";
  await requireAdmin();
  const service = createSupabaseServiceClient();

  const id = String(formData.get("id") ?? "");
  const guild_id = String(formData.get("guild_id") ?? "").trim();
  const work_voice_channel_id = String(formData.get("work_voice_channel_id") ?? "").trim();
  const work_voice_channel_name = String(formData.get("work_voice_channel_name") ?? "").trim();
  const required_hours = Number(formData.get("required_hours"));
  const active = formData.get("active") === "on";

  if (!guild_id || !work_voice_channel_id) return;
  if (!Number.isFinite(required_hours) || required_hours <= 0) return;
  const required_daily_seconds = Math.round(required_hours * 3600);

  if (id) {
    await service
      .from("discord_configuration")
      .update({
        guild_id,
        work_voice_channel_id,
        work_voice_channel_name: work_voice_channel_name || null,
        required_daily_seconds,
        active,
      })
      .eq("id", id);
  } else {
    await service.from("discord_configuration").insert({
      guild_id,
      work_voice_channel_id,
      work_voice_channel_name: work_voice_channel_name || null,
      required_daily_seconds,
      active,
    });
  }
  revalidatePath("/admin/discord");
}

export default async function AdminDiscordPage() {
  await requireAdmin();
  const service = createSupabaseServiceClient();

  const { data: config, error } = await service
    .from("discord_configuration")
    .select("id, guild_id, work_voice_channel_id, work_voice_channel_name, required_daily_seconds, active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Discord configuration</h1>

      {error && (
        <p role="alert" className="text-sm text-red-600">Failed to load configuration: {error.message}</p>
      )}
      {!config && !error && (
        <p className="text-sm text-gray-500">No configuration yet — create one below.</p>
      )}

      <form action={updateDiscordConfig} className="max-w-lg space-y-4 rounded border border-gray-200 p-4 dark:border-neutral-800">
        {config && <input type="hidden" name="id" value={config.id} />}
        <div>
          <label htmlFor="guild_id" className="block text-sm font-medium">Guild ID</label>
          <input
            id="guild_id"
            name="guild_id"
            type="text"
            required
            defaultValue={config?.guild_id ?? ""}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5 text-sm font-mono dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
        <div>
          <label htmlFor="work_voice_channel_id" className="block text-sm font-medium">Work voice channel ID</label>
          <input
            id="work_voice_channel_id"
            name="work_voice_channel_id"
            type="text"
            required
            defaultValue={config?.work_voice_channel_id ?? ""}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5 text-sm font-mono dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
        <div>
          <label htmlFor="work_voice_channel_name" className="block text-sm font-medium">Work voice channel name (optional)</label>
          <input
            id="work_voice_channel_name"
            name="work_voice_channel_name"
            type="text"
            maxLength={100}
            defaultValue={config?.work_voice_channel_name ?? ""}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
        <div>
          <label htmlFor="required_hours" className="block text-sm font-medium">Required hours per day</label>
          <input
            id="required_hours"
            name="required_hours"
            type="number"
            min={0.5}
            max={24}
            step={0.5}
            required
            defaultValue={config ? (config.required_daily_seconds / 3600).toString() : "8"}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="active"
            name="active"
            type="checkbox"
            defaultChecked={config?.active ?? true}
            className="h-4 w-4"
          />
          <label htmlFor="active" className="text-sm font-medium">Active</label>
        </div>
        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          {config ? "Save configuration" : "Create configuration"}
        </button>
      </form>
    </div>
  );
}
