import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const date = url.searchParams.get("date");
    if (date && !DATE_RE.test(date)) {
      return NextResponse.json({ error: "invalid date, expected YYYY-MM-DD" }, { status: 400 });
    }
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Math.min(200, Math.max(1, parseInt(limitRaw, 10) || 30)) : 30;

    let query = supabase
      .from("daily_attendance")
      .select("*")
      .eq("user_id", data.user.id)
      .order("attendance_date", { ascending: false })
      .limit(limit);
    if (date) query = query.eq("attendance_date", date);

    const { data: rows, error } = await query;
    if (error) throw error;
    return NextResponse.json({ data: rows ?? [] });
  } catch (err) {
    console.error("me/attendance error", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
