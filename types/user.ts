export type UserRole = "ADMIN" | "USER";

export interface AppUser {
  id: string;
  discord_user_id: string | null;
  discord_username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  role: UserRole;
  active: boolean;
  created_at: string;
  updated_at: string;
}
