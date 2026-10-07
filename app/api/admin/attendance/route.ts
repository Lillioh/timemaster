import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { attendanceDateForInstant } from "@/lib/attendance/calculate-duration";
import { getAppTimezone } from "@/lib/attendance/constants";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
    const dateParam = url.searchParams.get("date");
    const userId = url.searchParams.get("userId");
    const date = dateParam ?? attendanceDateForInstant(new Date(), getAppTimezone());
    if (!DATE_RE.test(date)) {
      return NextResponse.json({ error: "invalid date, expected YYYY-MM-DD" }, { status: 400 });
    }

    let sessionsQuery = service
      .from("attendance_sessions")
      .select("*")
      .eq("attendance_date", date)
      .order("clock_in", { ascending: false })
      .limit(200);
    let dailyQuery = service
      .from("daily_attendance")
      .select("*")
      .eq("attendance_date", date)
      .limit(200);
    if (userId) {
      sessionsQuery = sessionsQuery.eq("user_id", userId);
      dailyQuery = dailyQuery.eq("user_id", userId);
    }

    const [{ data: sessions, error: sErr }, { data: daily, error: dErr }] = await Promise.all([
      sessionsQuery,
      dailyQuery,
    ]);
    if (sErr) throw sErr;
    if (dErr) throw dErr;

    return NextResponse.json({ date, sessions: sessions ?? [], daily: daily ?? [] });
  } catch (err) {
    console.error("admin/attendance error", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
