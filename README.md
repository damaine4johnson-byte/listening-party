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
3. If upgrading an existing project, run `supabase/host_profiles.sql`, then `supabase/artist_tiers.sql`, `supabase/artist_tier_expansion.sql`, `supabase/paid_rooms.sql`, `supabase/listening_party.sql`, and `supabase/developer_admin.sql`.
4. Create a **private** Storage bucket named `tracks` and set its file-size limit to at least 200 MB (WAV files are large). Supabase also enforces a project-wide upload limit under Storage settings, which must be raised to match.
5. Create a Next.js project or use these files as the starting source.
6. Copy `.env.example` to `.env.local` and fill in values from Supabase project settings.
7. Install dependencies and run locally.

```bash
npm install
npm run dev
```

## 2. Environment variables
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `APP_SUPABASE_URL`: optional server-side URL override when the Vercel Supabase integration points to a different project; also mapped to the browser URL at build time
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase publishable/anon key
- `APP_SUPABASE_ANON_KEY`: optional publishable/anon key override when the Vercel integration points to a different project
- `APP_SUPABASE_SECRET_KEY`: optional server-only override for the app's Supabase key when an integration-provided key belongs to another project
- `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`): server-only key for room API routes; never expose it in browser code
- `WIPAY_ACCOUNT_NUMBER`, `WIPAY_API_KEY`: your verified WiPay Business account number and API key (server-only). `WIPAY_ENVIRONMENT` is `sandbox` (default) or `live`; `WIPAY_COUNTRY_CODE` defaults to `JM`. For sandbox testing use account `1234567890` and API key `123`.
- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT` (`sandbox` or `live`): PayPal REST app with Payouts enabled, used to pay artists.
- `PAYOUT_ADMIN_TOKEN`: long random secret that authorizes the platform-owner payout endpoint.
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`: optional [LiveKit](https://livekit.io) credentials that enable host live camera and screen sharing in rooms; the key and secret are server-only. Without them, rooms work as audio-only listening rooms
- `ADMIN_GOOGLE_EMAILS`: comma-separated Google emails that sign in to `/admin` as owners (separate from `HOST_GOOGLE_EMAILS`; admin and host sessions are independent). Add `https://www.exclusivelisten.com/admin/callback` (and the local URL) to the Supabase redirect allow-list. Owners can add more Google admins by email in the Admins tab
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` (min 12 chars): bootstrap owner for the admin dashboard at `/admin`; server-only. Run `supabase/admin_accounts.sql` to enable extra admin accounts (roles: viewer, admin, owner) and the audit log, which owners manage from the dashboard
- `HOST_USERNAME`: username for `/host`; server-only, never use a `NEXT_PUBLIC_` prefix
- `HOST_PASSWORD`: long random password for `/host`; server-only, never use a `NEXT_PUBLIC_` prefix
- `HOST_GOOGLE_EMAILS`: optional comma-separated exact Google account email allowlist for host console access; artist signup is self-serve
- `GEMINI_API_KEY`: server-only Google Gemini API key for the `/help` support assistant
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`: server-only Resend API key and verified sender address used only for human support escalations
- `SUPPORT_ESCALATION_EMAIL`: destination for support escalations (set to `famousintrovertrecords@gmail.com`); only used when the assistant determines human help is needed

The public `/help` page uses Gemini for product questions and sends the conversation to the configured support email via Resend only when a person is requested or the issue needs human assistance. Visitors can optionally provide an email for a reply. `/about` introduces Exclusive Listens and founder Damaine Johnson.

When deployed through the Vercel Supabase integration, the project also accepts its `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SECRET_KEY` variables. `APP_SUPABASE_URL`, `APP_SUPABASE_ANON_KEY`, and `APP_SUPABASE_SECRET_KEY`, when set, override the integration-provided project URL, public key, and server key respectively. The server secret is only used server-side; the URL and anon key are mapped for the browser client.

## 3. Host profile and room setup
Configure host sign-in with a strong, unique `HOST_USERNAME` and `HOST_PASSWORD`, or configure Google OAuth and set `HOST_GOOGLE_EMAILS` to the exact allowed host accounts. In Google Cloud, set the authorized redirect URI to `https://<project-ref>.supabase.co/auth/v1/callback`. In Supabase Authentication URL Configuration, set the Site URL to `https://www.exclusivelisten.com` and allow `https://www.exclusivelisten.com/signup/callback`, `https://www.exclusivelisten.com/host/callback`, and `https://www.exclusivelisten.com/wallet/callback`, as well as the corresponding local development URLs.

Open **Profile setup** from the host console to set the public display name, bio, and HTTPS avatar URL shown to listeners, plus a private contact email. The Google email or configured username is shown as the account identity. Contact email and sign-in identity are only returned by authenticated host APIs; room guests receive only display name, bio, and avatar URL.

The server generates a 192-bit random invite code when creating a room, stores only its SHA-256 hash, and displays the code once after creation. Copy it and share it privately; it cannot be recovered from the dashboard.

From `/host`, create a room, upload audio to its playlist, and share the one-time invite code. Uploads go directly to the private `tracks` bucket through a short-lived signed upload URL; the app stores the private object path and gives listeners short-lived signed playback URLs only after room join. The host must also join the room with its invite code to use the synchronized playback controls. When LiveKit is configured, the host also gets **Share camera** and **Share screen** buttons in the room; listeners watch the live video in the stage (the host's microphone and shared-screen audio are streamed too), and only the room's host can publish.

The first successful join creates the room's paused `room_state` row and a listener membership. Active listener heartbeats expire after ten minutes, and room joins are serialized against the room capacity. Room state, chat, and reactions refresh every four seconds; direct anonymous table access remains disabled.

## 4. Artist tiers
- Tier 1: free, up to 100 active listeners, ad-supported.
- Tier 2: paid, up to 500 active listeners, no ads.
- Tier 3: paid, up to 1,000 active listeners, no ads.
- Tier 4: paid, up to 10,000 active listeners, no ads.

No billing provider or prices are configured yet. Selecting a paid tier records it as pending; pending accounts retain the free 100-listener cap and ad placement until a payment integration activates the subscription. The free-tier placement is currently an in-app house promotion, not a third-party ad network. The one-time `artist_tier_expansion.sql` migration preserves existing paid capacities by moving previous Tier 2 profiles to Tier 3 and previous Tier 3 profiles to Tier 4.

### Paid entry rooms
Tier 2, 3, and 4 hosts (with an active subscription) can set an entry fee from $1 to $1,000 USD when creating a room, once they have saved a PayPal email in the host console.

Payments are collected by **WiPay** into the platform's account (hosted card checkout, `fee_structure=merchant_absorb`, so the listener pays exactly the listed price). Each paid order is stored in `payment_orders`; when WiPay redirects back to `/api/payments/wipay/return`, the server verifies the response hash against the stored total (`md5(transaction_id + total + WIPAY_API_KEY)`) before doing anything. A verified payment credits the host in `host_earnings` (90% to the host, 10% platform fee; `PLATFORM_FEE_PERCENT` in `lib/wipay.ts`). Entering a paid room's invite code shows the fee and redirects to WiPay; each paid order admits one listener and the claim is released if joining fails. The room's own host joins without paying. Refunds and chargebacks are handled in the WiPay dashboard and are not reflected automatically (no webhook yet).

### Song tips

Listeners see a ⚡ Boost button on each queued track when the host has saved a PayPal email. They can pay $3, $5 or $10 by card, or use 30, 50 or 100 coins. When payment is verified, that song is moved directly after the one now playing and the host is credited the same way as paid entry.

### Listener coins

Listener wallets use Google sign-in and work across devices. The rate is **1 USD = 10 coins**; packs are 50 coins for $5, 100 for $10, or 200 for $20, paid through WiPay. Coins can be spent on paid room entry or song boosts. Spending coins credits the host in USD at the same 10-coins-per-dollar rate and applies the regular platform fee. For room fees that are not exact 10-cent increments, use card checkout instead.

For existing projects, run `supabase/listener_coins.sql` after `supabase/wipay_payments.sql`. Fresh projects get the coin tables and functions from `supabase/schema.sql`. Google sign-in must be enabled in Supabase Auth and the `/wallet/callback` URL must be allowed.

### Paying artists

Earnings accumulate per host and are paid through **PayPal Payouts**. As the platform owner, run (or schedule) a payout; artists with at least $5.00 unpaid and a saved PayPal email are paid:

```bash
curl -X POST "https://YOUR_APP/api/admin/payouts?dryRun=1" -H "Authorization: Bearer $PAYOUT_ADMIN_TOKEN"   # preview
curl -X POST "https://YOUR_APP/api/admin/payouts" -H "Authorization: Bearer $PAYOUT_ADMIN_TOKEN"            # send
```

Rows are reserved under a batch id before PayPal is called so a retry cannot pay twice; if PayPal errors, check PayPal before releasing the batch. Run `supabase/paid_rooms.sql`, `supabase/wipay_payments.sql`, and `supabase/listener_coins.sql` in that order once on existing projects.

## 5. Hosting
Deploy the Next.js app to Vercel or another Node-compatible host. Add the same environment variables in the hosting dashboard. Do not commit `.env.local`.

## 6. Platform management through Supabase
There is no in-app developer admin console. Use the Supabase SQL Editor for platform settings and artist access; these tables remain server-only under row-level security. The legacy `supabase/developer_admin.sql` migration creates platform tables still used by the app.

Inspect host accounts and suspend or restore access with `account_status`:

```sql
select host_id, account_identity, account_status from public.host_accounts;
update public.host_accounts set account_status = 'suspended' where host_id = '<host-id>';
update public.host_accounts set account_status = 'active' where host_id = '<host-id>';
```

Configure defaults for new rooms and the free-tier house promotion:

```sql
update public.platform_settings
set new_room_status = 'scheduled', free_tier_ads_enabled = true
where setting_key = 'global';
```

Artist plan and subscription status can be changed in `public.host_profiles`. Manual plan activation does not collect payment; connect billing before using it as a paid subscription workflow.

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
- Protect host sign-in endpoints with rate limiting and rotate credentials if exposed.
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

## Native mobile app
The separate Expo/React Native iOS and Android client is in [`mobile/`](./mobile/). It supports listener rooms, host tools, and Apple/Google in-app coin purchases. See [`mobile/README.md`](./mobile/README.md) for setup, Supabase redirects, RevenueCat products/webhook configuration, and EAS builds. In addition to the coin-wallet migration, deploy `app/api/payments/revenuecat` and set `REVENUECAT_WEBHOOK_AUTHORIZATION` on the website server before enabling coin purchases in the native app.

## Current scaffold status
The website contains invite-verified rooms, private track upload/playback, host-authorized synchronized playback, live chat and reactions, self-serve Google artist signup, plan selection, active-listener caps, host-owned profiles, and Supabase-managed platform settings. Billing for artist subscriptions, third-party ad serving, invite throttling/revocation, and production-grade host identity remain incomplete.
