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
    const date = dateParam ?? attendanceDateForInstant(new Date(), getAppTimezone());
    if (!DATE_RE.test(date)) {
      return NextResponse.json({ error: "invalid date, expected YYYY-MM-DD" }, { status: 400 });
    }

    const [{ count: totalUsers, error: uErr }, { data: daily, error: dErr }, { count: clockedIn, error: cErr }] =
      await Promise.all([
        service.from("users").select("id", { count: "exact", head: true }).eq("active", true),
        service.from("daily_attendance").select("status,total_seconds").eq("attendance_date", date),
        service.from("attendance_sessions").select("id", { count: "exact", head: true }).eq("status", "ACTIVE"),
      ]);
    if (uErr) throw uErr;
    if (dErr) throw dErr;
    if (cErr) throw cErr;

    const rows = (daily ?? []) as Array<{ status: string; total_seconds: number }>;
    const completed = rows.filter((r) => r.status === "COMPLETE").length;
    const incomplete = rows.filter((r) => r.status !== "COMPLETE").length;
    const totalSeconds = rows.reduce((acc, r) => acc + Math.max(0, r.total_seconds ?? 0), 0);

    return NextResponse.json({
      date,
      totalUsers: totalUsers ?? 0,
      clockedIn: clockedIn ?? 0,
      completed,
      incomplete,
      totalSeconds,
    });
  } catch (err) {
    console.error("admin/reports error", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
