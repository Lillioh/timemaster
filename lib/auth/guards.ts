import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return { supabase, authUser: data.user };
}

export async function requireAdmin() {
  const { supabase, authUser } = await requireUser();
  const { data: profile } = await supabase
    .from("users")
    .select("role,active")
    .eq("id", authUser.id)
    .maybeSingle();
  if (!profile || profile.role !== "ADMIN" || profile.active === false) {
    redirect("/dashboard");
  }
  return { supabase, authUser, profile };
}
