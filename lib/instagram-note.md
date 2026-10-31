// Instagram note — why this is a picker, not a live import.
//
// Meta shut down the Instagram Basic Display API on Dec 4, 2024, so there is no
// supported way for an app to read another person's Instagram photos anymore.
// The Instagram Graph API only works for Instagram *Business* accounts and
// requires an approved Facebook app + business verification.
//
// So the gallery feature (app/host/profile/gallery-editor.tsx) lets artists:
//   1. pick photos from their device (including ones they saved from Instagram),
//   2. or paste a direct Instagram post URL when Meta approves a future oEmbed
//      integration — the API route (app/api/host/gallery/route.ts) already
//      validates and stores what it can.
