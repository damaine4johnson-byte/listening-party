# listening-party

Famous Introvert Listening Rooms — MVP starter

A private, invitation-only listening-party web app starter for Famous Introvert Records.

## MVP scope
- Invite-code gated rooms
- Optional Supabase accounts; guests use a display name
- Host-authorized shared playback controls
- Live chat and listener reactions
- Browser-native HTML audio playback
- Room state and chat loaded through server-verified invite sessions
- Private audio uploads and signed playback URLs via Supabase Storage
- Shared-password/Google host console for room and playlist management

**Important:** This is a starter scaffold, not a production-secure deployed service. Before using real unreleased masters, complete the security checklist below and test with a small group.

## Stack
- Next.js App Router + TypeScript
- Supabase Auth, Postgres, Realtime, and private Storage
- HTML `<audio>` element (no OBS, no YouTube)

## 1. Create services
1. Create a Supabase project.
2. In Supabase SQL Editor, run `supabase/schema.sql`.
3. If upgrading an existing project, run `supabase/host_profiles.sql`, then `supabase/artist_tiers.sql`, `supabase/listening_party.sql`, and `supabase/developer_admin.sql`.
4. Create a **private** Storage bucket named `tracks` and set its file-size limit to at least 40 MB.
5. Create a Next.js project or use these files as the starting source.
6. Copy `.env.example` to `.env.local` and fill in values from Supabase project settings.
7. Install dependencies and run locally.

```bash
npm install
npm run dev
```

## 2. Environment variables
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase publishable/anon key
- `SUPABASE_SERVICE_ROLE_KEY`: required server-only secret for room API routes; never expose it in browser code
- `HOST_USERNAME`: username for `/host`; server-only, never use a `NEXT_PUBLIC_` prefix
- `HOST_PASSWORD`: long random password for `/host`; server-only, never use a `NEXT_PUBLIC_` prefix
- `HOST_GOOGLE_EMAILS`: optional comma-separated exact Google account email allowlist for admin host access; artist signup is self-serve
- `ADMIN_USERNAME`: developer admin username, stored server-side
- `ADMIN_PASSWORD`: strong, unique developer admin password, stored server-side; never use a `NEXT_PUBLIC_` prefix
- `ADMIN_GOOGLE_EMAILS`: optional comma-separated exact developer Google email allowlist for `/admin`; keep this separate from artist and host accounts

## 3. Host profile and room setup
Set a new, unique `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env.local` and in the Vercel environment. Do not reuse credentials shared in chat or used elsewhere. Alternatively, configure Google OAuth and set `ADMIN_GOOGLE_EMAILS` to the exact developer accounts. In Google Cloud, set the authorized redirect URI to `https://<project-ref>.supabase.co/auth/v1/callback`. In Supabase Authentication URL Configuration, allow `http://localhost:3001/signup/callback`, `http://localhost:3001/host/callback`, `http://localhost:3001/admin/callback`, and corresponding deployed URLs. The admin console uses a separate two-hour HTTP-only session. Apply rate limiting to `/api/admin/session` before public production use.

Open **Profile setup** from the host console to set the public display name, bio, and HTTPS avatar URL shown to listeners, plus a private contact email. The Google email or configured username is shown as the account identity. Contact email and sign-in identity are only returned by authenticated host APIs; room guests receive only display name, bio, and avatar URL.

The server generates a 192-bit random invite code when creating a room, stores only its SHA-256 hash, and displays the code once after creation. Copy it and share it privately; it cannot be recovered from the dashboard.

From `/host`, create a room, upload audio to its playlist, and share the one-time invite code. Uploads go directly to the private `tracks` bucket through a short-lived signed upload URL; the app stores the private object path and gives listeners short-lived signed playback URLs only after room join. The host must also join the room with its invite code to use the synchronized playback controls.

The first successful join creates the room's paused `room_state` row and a listener membership. Active listener heartbeats expire after ten minutes, and room joins are serialized against the room capacity. Room state, chat, and reactions refresh every four seconds; direct anonymous table access remains disabled.

## 4. Artist tiers
- Tier 1: free, up to 100 active listeners, ad-supported.
- Tier 2: paid, up to 1,000 active listeners, no ads.
- Tier 3: paid, up to 10,000 active listeners, no ads.

No billing provider or prices are configured yet. Selecting a paid tier records it as pending; pending accounts retain the free 100-listener cap and ad placement until a payment integration activates the subscription. The free-tier placement is currently an in-app house promotion, not a third-party ad network.

## 5. Hosting
Deploy the Next.js app to Vercel or another Node-compatible host. Add the same environment variables in the hosting dashboard. Do not commit `.env.local`.

## 6. Developer overview and settings
Open `/admin` to review aggregate platform counts, manage artist access, manually change plan status, configure the free-tier house ad, and choose the default status for new rooms. Suspended artist accounts are blocked from host sign-in and host-only operations. Manual plan activation does not collect payment; connect billing before using it as a paid subscription workflow.

## 7. Synchronization model
The host updates one `room_state` row with:
- track ID
- playback status
- current offset
- server timestamp when playback began

Listeners calculate the expected playhead from the shared timestamp and gently seek if drift exceeds a threshold. Room state, chat, and reactions are polled every four seconds. Browsers may still require a listener gesture before synchronized audio starts.

## 8. Production security checklist
- Enforce invite codes on the server, not only in the UI.
- Do not allow anonymous clients to query track storage paths or list the bucket.
- Generate short-lived signed URLs only after validating room membership.
- Ensure only the assigned host can update playback state.
- Ensure chat writes validate room membership and rate-limit messages.
- Keep the service-role key server-only.
- Protect the shared host-password endpoint with rate limiting and rotate the password if exposed.
- Add CAPTCHA or throttling to invite validation and guest joining.
- Limit uploads by file type, size, and room ownership.
- Use expiring/revocable invitations and rotate leaked codes.
- Test with 100 concurrent listeners; free tiers and provider limits may not support that load.
- Confirm rights/permissions for every track, beat, sample, and feature before playing it publicly.
- No website can fully prevent screen/audio recording by listeners.

## 9. Recommended launch sequence
1. Local smoke test with two browsers.
2. Invite-only test with 5–10 trusted people.
3. Test mobile Safari and Chrome.
4. Test reconnects, track skips, late joins, and host disconnect.
5. Load test before advertising a 100-person room.
6. Only then upload masters cleared for preview.

## Current scaffold status
This starter contains invite-verified rooms, private track upload/playback, host-authorized synchronized playback, live chat and reactions, self-serve Google artist signup, plan selection, active-listener caps, host-owned profiles, and a developer overview/settings console. Billing, third-party ad serving, invite throttling/revocation, and production-grade host identity remain incomplete.
