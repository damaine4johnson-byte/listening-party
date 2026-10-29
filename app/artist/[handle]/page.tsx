import { redirect } from "next/navigation";

export default async function ArtistAlias({ params }: { params: Promise<{ handle: string }> }) {
  redirect(`/artists/${encodeURIComponent((await params).handle)}`);
}
