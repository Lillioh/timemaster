import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function HomePage() {
  let loggedIn = false;
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    loggedIn = !!data.user;
  } catch {
    loggedIn = false;
  }

  return (
    <div className="space-y-10">
      <section aria-labelledby="hero-heading" className="py-8 text-center">
        <h1 id="hero-heading" className="text-3xl font-bold tracking-tight sm:text-4xl">
          Discord Voice Attendance, Automatically Tracked
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-gray-600 dark:text-neutral-300">
          TimeMaster clocks you in when you join the work voice channel and clocks you out
          when you leave. Complete the{" "}
          <strong>8-hour daily requirement</strong> to stay on track.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          {loggedIn ? (
            <Link
              href="/dashboard"
              className="rounded bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Go to dashboard
            </Link>
          ) : (
            <Link
              href="/login"
              className="rounded bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Log in to get started
            </Link>
          )}
          <Link
            href="/dashboard"
            className="rounded border border-gray-300 px-5 py-2.5 text-sm font-medium hover:bg-gray-100 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            View my time
          </Link>
        </div>
      </section>

      <section aria-labelledby="how-heading" className="grid gap-4 sm:grid-cols-3">
        <h2 id="how-heading" className="sr-only">How it works</h2>
        <div className="rounded border border-gray-200 p-4 dark:border-neutral-800">
          <h3 className="font-semibold">1. Join voice</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-neutral-300">
            Join the configured work voice channel in Discord to clock in automatically.
          </p>
        </div>
        <div className="rounded border border-gray-200 p-4 dark:border-neutral-800">
          <h3 className="font-semibold">2. Stay &amp; accumulate</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-neutral-300">
            Every session adds to your daily total toward the 8-hour requirement.
          </p>
        </div>
        <div className="rounded border border-gray-200 p-4 dark:border-neutral-800">
          <h3 className="font-semibold">3. Leave to clock out</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-neutral-300">
            Leaving the channel closes the session and updates your daily attendance.
          </p>
        </div>
      </section>

      <section aria-labelledby="legend-heading" className="rounded border border-gray-200 p-4 dark:border-neutral-800">
        <h2 id="legend-heading" className="font-semibold">Status badges legend</h2>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <li className="flex items-center gap-2">
            <span className="status-dot status-dot-green" aria-hidden="true" />
            <span><strong>CLOCKED IN</strong> — you have an active voice session.</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="status-dot status-dot-gray" aria-hidden="true" />
            <span><strong>CLOCKED OUT</strong> — no active session right now.</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="status-dot status-dot-green" aria-hidden="true" />
            <span><strong>COMPLETE</strong> — daily requirement met (≥ 8h).</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="status-dot status-dot-amber" aria-hidden="true" />
            <span><strong>INCOMPLETE</strong> — daily requirement not yet met.</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
