import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { attendanceDateForInstant } from "@/lib/attendance/calculate-duration";
import { getAppTimezone } from "@/lib/attendance/constants";

export const dynamic = "force-dynamic";

export async function GET() {
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

    const today = attendanceDateForInstant(new Date(), getAppTimezone());
    const { data: users, error: usersError } = await service
      .from("users")
      .select("*")
      .order("created_at", { ascending: true });
    if (usersError) throw usersError;

    const { data: daily, error: dailyError } = await service
      .from("daily_attendance")
      .select("*")
      .eq("attendance_date", today);
    if (dailyError) throw dailyError;

    const byUser = new Map(
      ((daily ?? []) as Array<{ user_id: string } & Record<string, unknown>>).map((d) => [d.user_id, d]),
    );
    const rows = ((users ?? []) as Array<{ id: string } & Record<string, unknown>>).map((u) => ({
      ...u,
      today: byUser.get(u.id) ?? null,
    }));

    return NextResponse.json({ date: today, users: rows });
  } catch (err) {
    console.error("admin/users error", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
