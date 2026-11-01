import type { SupabaseClient } from "@supabase/supabase-js";

function clearOAuthResponse() {
  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.delete("code");
  url.searchParams.delete("error");
  url.searchParams.delete("error_code");
  url.searchParams.delete("error_description");
  url.searchParams.delete("error_uri");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
}

export async function getOAuthAccessToken(
  client: SupabaseClient,
  callbackUrl: URL | null,
): Promise<{ accessToken: string | null; error: string | null }> {
  const url = callbackUrl ?? new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");
  const code = url.searchParams.get("code");
  const providerError = url.searchParams.get("error") ?? fragment.get("error");

  if (providerError) {
    clearOAuthResponse();
    return { accessToken: null, error: "Google sign-in was declined or could not be completed. Return and try again." };
  }

  if (!code && !accessToken) {
    return { accessToken: null, error: "No Google sign-in response was received. Return and try again." };
  }

  try {
    if (accessToken) {
      if (refreshToken) {
        const { data: restored } = await client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (restored.session?.access_token) {
          clearOAuthResponse();
          return { accessToken: restored.session.access_token, error: null };
        }
      }
      clearOAuthResponse();
      return { accessToken, error: null };
    }

    if (code) {
      const { data: exchanged } = await client.auth.exchangeCodeForSession(code);
      if (exchanged.session?.access_token) {
        clearOAuthResponse();
        return { accessToken: exchanged.session.access_token, error: null };
      }
    }

    const { data } = await client.auth.getSession();
    if (data.session?.access_token) {
      clearOAuthResponse();
      return { accessToken: data.session.access_token, error: null };
    }
  } catch {
    if (accessToken) {
      clearOAuthResponse();
      return { accessToken, error: null };
    }
    return { accessToken: null, error: "Google sign-in could not be completed. Return and try again." };
  }

  return { accessToken: null, error: "Google sign-in could not be completed. Return and try again." };
}
