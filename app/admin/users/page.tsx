import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

async function toggleActive(formData: FormData) {
  "use server";
  const { authUser } = await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const next = String(formData.get("next_active") ?? "") === "true";
  if (!userId) return;
  if (userId === authUser.id && !next) return; // prevent self-deactivation
  const service = createSupabaseServiceClient();
  await service.from("users").update({ active: next }).eq("id", userId);
  revalidatePath("/admin/users");
  revalidatePath("/admin");
}

async function toggleRole(formData: FormData) {
  "use server";
  const { authUser } = await requireAdmin();
  const userId = String(formData.get("user_id") ?? "");
  const nextRole = String(formData.get("next_role") ?? "");
  if (!userId || (nextRole !== "ADMIN" && nextRole !== "USER")) return;
  if (userId === authUser.id && nextRole !== "ADMIN") return; // prevent self-demotion
  const service = createSupabaseServiceClient();
  await service.from("users").update({ role: nextRole }).eq("id", userId);
  revalidatePath("/admin/users");
  revalidatePath("/admin");
}

export default async function AdminUsersPage() {
  const { authUser } = await requireAdmin();
  const service = createSupabaseServiceClient();

  const { data: users, error } = await service
    .from("users")
    .select("id, discord_username, display_name, email, role, active, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Users</h1>
        <p role="alert" className="text-sm text-red-600">Failed to load users: {error.message}</p>
      </div>
    );
  }

  const rows = users ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Users</h1>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No users found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left dark:border-neutral-800">
                <th scope="col" className="px-2 py-2 font-medium">User</th>
                <th scope="col" className="px-2 py-2 font-medium">Email</th>
                <th scope="col" className="px-2 py-2 font-medium">Role</th>
                <th scope="col" className="px-2 py-2 font-medium">Active</th>
                <th scope="col" className="px-2 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const isSelf = u.id === authUser.id;
                const name = u.display_name ?? u.discord_username ?? u.id;
                return (
                  <tr key={u.id} className="border-b border-gray-100 dark:border-neutral-900">
                    <td className="px-2 py-2">{name}</td>
                    <td className="px-2 py-2">{u.email ?? "—"}</td>
                    <td className="px-2 py-2">{u.role as string}</td>
                    <td className="px-2 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`status-dot ${u.active ? "status-dot-green" : "status-dot-red"}`} aria-hidden="true" />
                        {u.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-2">
                        <form action={toggleActive}>
                          <input type="hidden" name="user_id" value={u.id} />
                          <input type="hidden" name="next_active" value={String(!u.active)} />
                          <button
                            type="submit"
                            disabled={isSelf && u.active}
                            title={isSelf ? "Cannot deactivate your own account" : undefined}
                            className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
                          >
                            {u.active ? "Deactivate" : "Activate"}
                          </button>
                        </form>
                        <form action={toggleRole}>
                          <input type="hidden" name="user_id" value={u.id} />
                          <input
                            type="hidden"
                            name="next_role"
                            value={u.role === "ADMIN" ? "USER" : "ADMIN"}
                          />
                          <button
                            type="submit"
                            disabled={isSelf && u.role === "ADMIN"}
                            title={isSelf ? "Cannot demote your own account" : undefined}
                            className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
                          >
                            {u.role === "ADMIN" ? "Demote to User" : "Promote to Admin"}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
