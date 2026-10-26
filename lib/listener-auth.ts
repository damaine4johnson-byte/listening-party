import "server-only";
import { createClient, type User } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export async function getListenerUser(request: NextRequest): Promise<User | null> {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const url = process.env.APP_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.APP_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!token || token.length > 8192 || !url || !anonKey) return null;

  const supabase = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  const user = data.user;
  if (error || !user || user.app_metadata.provider !== "google" || !user.email_confirmed_at) return null;
  return user;
}
