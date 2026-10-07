"use client";

import type { AppUser, UserRole } from "@/types/user";
import { StatusBadge } from "@/components/ui/Badge";
import { DataTable } from "@/components/ui/DataTable";

interface UserTableProps {
  users: AppUser[];
  onToggleActive: (id: string, active: boolean) => void;
  onRoleChange: (id: string, role: UserRole) => void;
}

export function UserTable({ users, onToggleActive, onRoleChange }: UserTableProps) {
  if (users.length === 0) {
    return <p className="text-sm text-slate-500">No users found.</p>;
  }
  return (
    <DataTable caption="Users">
      <thead className="bg-slate-50">
        <tr>
          <th scope="col" className="px-4 py-2 font-medium text-slate-500">User</th>
          <th scope="col" className="px-4 py-2 font-medium text-slate-500">Role</th>
          <th scope="col" className="px-4 py-2 font-medium text-slate-500">Status</th>
          <th scope="col" className="px-4 py-2 font-medium text-slate-500">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200">
        {users.map((u) => (
          <tr key={u.id}>
            <td className="px-4 py-2">
              <p className="font-medium text-slate-900">{u.display_name ?? u.discord_username ?? u.email ?? "Unknown"}</p>
              {u.discord_user_id ? (
                <p className="text-xs text-slate-500">{u.discord_user_id}</p>
              ) : null}
            </td>
            <td className="px-4 py-2">
              <label className="sr-only" htmlFor={`role-${u.id}`}>Role for {u.display_name ?? u.id}</label>
              <select
                id={`role-${u.id}`}
                value={u.role}
                onChange={(e) => onRoleChange(u.id, e.target.value as UserRole)}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="USER">USER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </td>
            <td className="px-4 py-2">
              <StatusBadge status={u.active ? "ACTIVE" : "OFFLINE"} />
            </td>
            <td className="px-4 py-2">
              <button
                type="button"
                onClick={() => onToggleActive(u.id, !u.active)}
                className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {u.active ? "Deactivate" : "Activate"}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

export default UserTable;
