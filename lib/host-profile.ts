import "server-only";
import { createSupabaseAdmin } from "./supabase-admin";
import { readHostSession, type HostProvider } from "./host-session";

export async function persistHostIdentity(hostId: string, provider: HostProvider, identity: string) {
  const { data, error } = await createSupabaseAdmin().from("host_accounts").upsert(
    {
      host_id: hostId,
      auth_provider: provider,
      account_identity: identity,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "host_id" },
  ).select("account_status").single();
  if (error) throw error;
  return data.account_status as "active" | "suspended";
}

export async function readActiveHostSession(token?: string) {
  const session = readHostSession(token);
  if (!session) return null;

  try {
    const { data, error } = await createSupabaseAdmin()
      .from("host_accounts")
      .select("account_status")
      .eq("host_id", session.hostId)
      .maybeSingle();
    if (error || data?.account_status !== "active") return null;
    return session;
  } catch {
    return null;
  }
}