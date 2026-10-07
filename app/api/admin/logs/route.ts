import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const service = createSupabaseServiceClient();
    const { data: profile } = await service
      .from("users")
      .select("role,active")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profile || (profile as { role: string }).role !== "ADMIN") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Math.min(500, Math.max(1, parseInt(limitRaw, 10) || 100)) : 100;

    const { data: logs, error } = await service
      .from("system_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    return NextResponse.json({ logs: logs ?? [] });
  } catch (err) {
    console.error("admin/logs error", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
