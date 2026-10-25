import Link from "next/link";
import { notFound } from "next/navigation";
import RoomClient from "../../room/room-client";
import PreviewMocks from "../preview-mocks";

export default async function RoomPreviewPage({ searchParams }: { searchParams: Promise<{ host?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const hostView = (await searchParams).host === "1";

  return (
    <PreviewMocks>
      <p className="small" style={{ textAlign: "center", margin: "0 0 8px" }}>
        View as: <Link href="/dev-preview/room">Listener</Link> · <Link href="/dev-preview/room?host=1">Host</Link>
      </p>
      <RoomClient displayName="Preview Listener" previewVideoControls={hostView} />
    </PreviewMocks>
  );
}
