import "server-only";
import type { User } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "./supabase-admin";

// Usernames live in the auth user's app_metadata, so no extra database table or migration is needed.
export async function findUserByUsername(username: string): Promise<User | null> {
  const admin = createSupabaseAdmin();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((u) => (u.app_metadata as { listener_username?: string }).listener_username === username);
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
  return null;
}

export function usernameOf(user: User) {
  return (user.app_metadata as { listener_username?: string }).listener_username ?? null;
}
