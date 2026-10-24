import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import RoomClient from "./room-client";
import { readRoomSessionToken, ROOM_SESSION_COOKIE } from "../../lib/room-session";

export default async function RoomPage() {
  const cookieStore = await cookies();
  const session = readRoomSessionToken(cookieStore.get(ROOM_SESSION_COOKIE)?.value);
  if (!session) redirect("/");

  return <RoomClient displayName={session.displayName} />;
}
