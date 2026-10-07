"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface HeaderProps {
  role?: string | null;
  email?: string | null;
}

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/attendance", label: "Attendance" },
  { href: "/reports", label: "Reports" },
  { href: "/profile", label: "Profile" },
];

export function Header({ role, email }: HeaderProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const links =
    role === "ADMIN"
      ? [...NAV_LINKS, { href: "/admin", label: "Admin" }]
      : NAV_LINKS;

  return (
    <header className="border-b border-slate-200 bg-white">
      <nav aria-label="Main navigation" className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/dashboard" className="text-lg font-semibold text-slate-900">
          TimeMaster
        </Link>
        <div className="hidden items-center gap-4 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm text-slate-600 hover:text-slate-900">
              {l.label}
            </Link>
          ))}
          {email ? (
            <span className="text-sm text-slate-500">{email}</span>
          ) : null}
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
        <button
          type="button"
          className="rounded-md p-2 text-slate-700 hover:bg-slate-100 md:hidden"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          <span aria-hidden="true" className="block h-5 w-5">
            {open ? "✕" : "☰"}
          </span>
        </button>
      </nav>
      {open ? (
        <div className="border-t border-slate-200 px-4 py-3 md:hidden">
          <ul className="flex flex-col gap-2">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="block rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-100"
                  onClick={() => setOpen(false)}
                >
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={handleSignOut}
                className="block w-full rounded-md border border-slate-300 px-2 py-2 text-left text-sm font-medium text-slate-700"
              >
                Sign out
              </button>
            </li>
          </ul>
        </div>
      ) : null}
    </header>
  );
}

export default Header;
