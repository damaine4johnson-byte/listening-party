import "server-only";
import { createSupabaseAdmin } from "./supabase-admin";
import type { HostProvider } from "./host-session";

export async function persistHostIdentity(hostId: string, provider: HostProvider, identity: string) {
  const { error } = await createSupabaseAdmin().from("host_accounts").upsert(
    {
      host_id: hostId,
      auth_provider: provider,
      account_identity: identity,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "host_id" },
  );
  if (error) throw error;
}