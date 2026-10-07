import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const { data: profile, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", data.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!profile) {
      return NextResponse.json({ error: "profile not found" }, { status: 404 });
    }
    return NextResponse.json({ user: data.user, profile });
  } catch (err) {
    console.error("me route error", err);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
