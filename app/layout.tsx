import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";

export const metadata: Metadata = {
  title: "TimeMaster — Discord Voice Attendance",
  description: "Discord voice attendance and time tracking system.",
};

async function getNavUser() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) return null;
    const { data: profile } = await supabase
      .from("users")
      .select("role, display_name, discord_username")
      .eq("id", data.user.id)
      .maybeSingle();
    return { id: data.user.id, role: (profile?.role as string | undefined) ?? "USER" };
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const navUser = await getNavUser();
  const isAdmin = navUser?.role === "ADMIN";

  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to main content
        </a>
        <header className="border-b border-gray-200 dark:border-neutral-800">
          <nav aria-label="Primary" className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight">
              TimeMaster
            </Link>
            {navUser ? (
              <>
                <Link href="/dashboard" className="rounded px-1 py-1 text-sm hover:underline">
                  Dashboard
                </Link>
                <Link href="/attendance" className="rounded px-1 py-1 text-sm hover:underline">
                  Attendance
                </Link>
                <Link href="/reports" className="rounded px-1 py-1 text-sm hover:underline">
                  Reports
                </Link>
                <Link href="/profile" className="rounded px-1 py-1 text-sm hover:underline">
                  Profile
                </Link>
                {isAdmin && (
                  <Link href="/admin" className="rounded px-1 py-1 text-sm font-medium hover:underline">
                    Admin
                  </Link>
                )}
                <span className="ms-auto">
                  <SignOutButton />
                </span>
              </>
            ) : (
              <Link href="/login" className="ms-auto rounded px-1 py-1 text-sm hover:underline">
                Log in
              </Link>
            )}
          </nav>
          {isAdmin && (
            <nav aria-label="Admin" className="border-t border-gray-100 dark:border-neutral-900">
              <div className="mx-auto flex max-w-6xl flex-wrap gap-x-5 gap-y-1 px-4 py-2 text-sm">
                <Link href="/admin" className="hover:underline">Overview</Link>
                <Link href="/admin/users" className="hover:underline">Users</Link>
                <Link href="/admin/attendance" className="hover:underline">Attendance</Link>
                <Link href="/admin/reports" className="hover:underline">Reports</Link>
                <Link href="/admin/discord" className="hover:underline">Discord</Link>
                <Link href="/admin/logs" className="hover:underline">Logs</Link>
              </div>
            </nav>
          )}
        </header>
        <main id="main-content" className="mx-auto w-full max-w-6xl px-4 py-6">
          {children}
        </main>
        <footer className="border-t border-gray-200 py-4 text-center text-xs text-gray-500 dark:border-neutral-800 dark:text-neutral-400">
          TimeMaster — Discord voice attendance tracking
        </footer>
      </body>
    </html>
  );
}
