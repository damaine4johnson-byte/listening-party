import type { NextConfig } from "next";

const supabaseUrl = process.env.APP_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.APP_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const publicEnv: Record<string, string> = {};

if (supabaseUrl) publicEnv.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
if (supabaseAnonKey) publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY = supabaseAnonKey;

const nextConfig: NextConfig = {
  env: publicEnv,
  async headers() {
    return [
      {
        // Security headers applied to every route. HTTPS itself is terminated by
        // the host (Vercel provides it automatically for the production domain).
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            // 'unsafe-inline' styles are needed for the inline --hue/--pct CSS
            // variables set from React; blob: is required for LiveKit/MediaRecorder
            // and the client-side MP3 encoder. Supabase storage URLs are
            // image-src'd for avatars and audio-src'd for signed track playback.
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.supabase.co",
              "media-src 'self' blob: https://*.supabase.co",
              "connect-src 'self' wss: https://*.supabase.co https://*.wipayfinancial.com https://api-m.paypal.com https://api-m.sandbox.paypal.com https://va.vercel-scripts.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};
export default nextConfig;
