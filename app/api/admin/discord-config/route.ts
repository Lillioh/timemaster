import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  guild_id: z.string().min(1).max(64),
  work_voice_channel_id: z.string().min(1).max(64),
  work_voice_channel_name: z.string().max(128).nullable().optional(),
  required_daily_seconds: z.number().int().positive().max(86400).optional(),
  active: z.boolean().optional(),
});

async function checkAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { unauthorized: true as const };
  const service = createSupabaseServiceClient();
  const { data: profile } = await service
    .from("users")
    .select("role,active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile || (profile as { role: string }).role !== "ADMIN") {
    return { forbidden: true as const };
  }
  return { service };
}

export async function GET() {
  try {
    const auth = await checkAdmin();
    if ("unauthorized" in auth) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if ("forbidden" in auth) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const { data: config, error } = await auth.service
      .from("discord_configuration")
      .select("*")
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ config: config ?? null });
  } catch (err) {
    console.error("discord-config GET error", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await checkAdmin();
    if ("unauthorized" in auth) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if ("forbidden" in auth) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((i) => `${i.path.join(".") || "body"}: ${i.message}`)
        .join("; ");
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { data: existing } = await auth.service
      .from("discord_configuration")
      .select("id")
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    let config: unknown;
    if (existing && (existing as { id: string }).id) {
      const { data, error } = await auth.service
        .from("discord_configuration")
        .update({ ...parsed.data, updated_at: new Date().toISOString() })
        .eq("id", (existing as { id: string }).id)
        .select("*")
        .single();
      if (error) throw error;
      config = data;
    } else {
      const { data, error } = await auth.service
        .from("discord_configuration")
        .insert({ ...parsed.data, active: parsed.data.active ?? true })
        .select("*")
        .single();
      if (error) throw error;
      config = data;
    }

    return NextResponse.json({ config });
  } catch (err) {
    console.error("discord-config PUT error", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
