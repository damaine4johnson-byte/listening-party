import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const publicEnv: Record<string, string> = {};

if (supabaseUrl) publicEnv.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
if (supabaseAnonKey) publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY = supabaseAnonKey;

const nextConfig: NextConfig = { env: publicEnv };
export default nextConfig;
