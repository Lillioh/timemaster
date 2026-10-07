import { requireUser } from "@/lib/auth/guards";
import DisplayNameForm from "./DisplayNameForm";

export default async function ProfilePage() {
  const { supabase, authUser } = await requireUser();

  const { data: profile } = await supabase
    .from("users")
    .select("discord_user_id, discord_username, display_name, email, role, active, created_at")
    .eq("id", authUser.id)
    .maybeSingle();

  if (!profile) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Profile</h1>
        <p role="alert" className="text-sm text-red-600">
          No profile row found for this account. Contact an administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Profile</h1>

      <section aria-labelledby="details-heading" className="rounded border border-gray-200 p-4 dark:border-neutral-800">
        <h2 id="details-heading" className="font-semibold">Account details</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Email</dt>
            <dd>{profile.email ?? authUser.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Discord username</dt>
            <dd>{profile.discord_username ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Display name</dt>
            <dd>{profile.display_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Discord user ID</dt>
            <dd className="font-mono text-xs">{profile.discord_user_id ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Role</dt>
            <dd>{profile.role}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Active</dt>
            <dd>
              <span className="inline-flex items-center gap-1.5">
                <span className={`status-dot ${profile.active ? "status-dot-green" : "status-dot-red"}`} aria-hidden="true" />
                {profile.active ? "Active" : "Inactive"}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Member since</dt>
            <dd>{new Date(profile.created_at).toLocaleDateString()}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="edit-heading" className="rounded border border-gray-200 p-4 dark:border-neutral-800">
        <h2 id="edit-heading" className="font-semibold">Edit display name</h2>
        <p className="mt-1 text-sm text-gray-500">Only your display name can be changed here.</p>
        <DisplayNameForm initialValue={profile.display_name ?? ""} />
      </section>
    </div>
  );
}
