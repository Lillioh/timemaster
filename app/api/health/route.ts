import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

export async function GET() {
  let db: "up" | "down" = "down";
  try {
    const svc = createSupabaseServiceClient();
    const { error } = await svc
      .from("users")
      .select("id", { count: "exact", head: true });
    if (!error) db = "up";
  } catch {
    db = "down";
  }
  // Never throw 500 when the DB is down — still report status ok.
  return NextResponse.json({
    status: "ok",
    time: new Date().toISOString(),
    version: "1.0.0",
    db,
  });
}
