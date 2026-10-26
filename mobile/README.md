# Native mobile app

This is a separate Expo/React Native client for iOS and Android. It uses the existing Next.js APIs for room access, audio, chat, hosting, and artist payouts.

## Local setup

1. Install the latest Node.js LTS and run `npm install` from this directory.
2. Copy `.env.example` to `.env` and set:
   - `EXPO_PUBLIC_API_URL` to the public website origin (for a physical-device local test, use the computer's LAN IP, not `localhost`).
   - `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to the same Supabase project as the website.
   - RevenueCat's **public SDK keys** for iOS and Android.
3. Add `listeningparty://auth/callback` to Supabase Auth's allowed redirect URLs, enable Google sign-in, and use the same Google OAuth project as the website.
4. Apply `supabase/listener_coins.sql` after `supabase/wipay_payments.sql` if the database has not already been migrated.
5. Run `npx expo install --fix`, then `npm run start`.

RevenueCat products use these consumable product identifiers:

| Product ID | Coins |
|---|---:|
| `coins_50` | 50 |
| `coins_100` | 100 |
| `coins_200` | 200 |

Create these as consumable in-app products in App Store Connect and Google Play Console, then add them to RevenueCat. Store prices are configured in each store; the wallet shows the returned local price and the coin conversion is 10 coins per USD.

Configure a RevenueCat webhook pointing to `https://YOUR_APP/api/payments/revenuecat`. Set its Authorization header to a strong secret and set the same value as `REVENUECAT_WEBHOOK_AUTHORIZATION` in the website's server environment. The webhook verifies purchases and credits coins idempotently; never grant coins directly based on a client purchase result.

## Build setup

The app icon is in `assets/icon.png`. The development-simulator profile produces an iOS Simulator build and an Android APK; these are useful for UI and API testing but do not support real App Store or Play Store purchases.

1. Sign in to Expo and link this project to your Expo account:

   ```bash
   npx eas-cli login
   npx eas-cli init
   ```

   `eas init` replaces the placeholder project ID in `app.json`.
2. Set `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in the Expo dashboard for the development, preview, and production environments. Set the public RevenueCat iOS and Android SDK keys there after configuring the store products. These `EXPO_PUBLIC_` values are included in the app binary; do not put server secrets in them.
3. Build simulator and Android test packages:

   ```bash
   npx eas-cli build --profile development-simulator --platform all
   ```

## Store builds

RevenueCat and native audio need a development build; Expo Go is not sufficient for store purchase testing. For device development builds and store submission, enroll in the Apple Developer Program and Google Play Console, create the app records, and configure signing credentials in EAS. Store builds use:

```bash
npx eas-cli build --profile development --platform all
npx eas-cli build --profile production --platform all
```

For production, set up the iOS app in App Store Connect and the Android app in Play Console, and complete their privacy, age-rating, content, pricing, and store-listing forms. The public API URL must be HTTPS and reachable outside your local network. Test purchase products through the stores' sandbox/test tracks before release.

For a local simulator, use `npm run ios` or `npm run android` after installing the required native platform toolchain.

## Current app surfaces

- Listeners: Google sign-in, invite-code room entry, synchronized audio, chat, reactions, and coin tips.
- Wallet: balance, Apple/Google consumable purchases, and server-verified coin delivery.
- Hosts: password or Google sign-in, room creation and status management, playlist audio uploads, profile, PayPal payout settings, analytics, and host room playback.

Paid room entry in the native app is supported with listener coins. Web card checkout remains on the website.
