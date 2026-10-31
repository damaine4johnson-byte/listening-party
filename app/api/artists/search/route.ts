import { NextRequest, NextResponse } from "next/server";
import { searchPublicArtists } from "../../../../lib/artists-public";

export const dynamic = "force-dynamic";

// Listener-facing artist search: GET /api/artists/search?q=<username or name>
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 64);
  if (!q.trim()) return NextResponse.json({ artists: [] });
  try {
    const artists = await searchPublicArtists(q);
    return NextResponse.json({
      artists: artists.map((a) => ({ handle: a.handle, name: a.name, bio: a.bio, avatarUrl: a.avatarUrl, followers: a.followers })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Search is temporarily unavailable." }, { status: 503 });
  }
}
