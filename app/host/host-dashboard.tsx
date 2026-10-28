"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import RoomTrackManager from "./room-track-manager";
import HostAnalytics from "./host-analytics";
import { AvatarCropper } from "./profile/avatar-cropper";
import "./host-console.css";

type Room = {
  id: string;
  title: string;
  description: string;
  slug: string;
  status: "scheduled" | "live" | "ended";
  max_listeners: number;
  entry_fee_cents: number;
  created_at: string;
  coverUrl?: string | null;
};

type PayoutStatus = {
  canChargeEntry: boolean;
  paymentsConfigured: boolean;
  paypalEmail: string | null;
  ready: boolean;
  pendingCents: number;
  paidCents: number;
  platformFeePercent: number;
  minEntryFeeCents: number;
  maxEntryFeeCents: number;
};

function formatFee(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

// Generated cover art so every room has its own look without uploaded images.
function RoomCover({ seed }: { seed: string }) {
  const hash = hashString(seed);
  const hueA = hash % 360;
  const hueB = (hueA + 60 + (hash % 80)) % 360;
  const bars = Array.from({ length: 14 }, (_, i) => 18 + ((hash >>> (i % 20)) % 5) * 12 + (i % 3) * 6);
  const id = `g${hash}`;
  return (
    <svg className="hc-cover" viewBox="0 0 120 120" role="img" aria-label="Room cover art">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={`hsl(${hueA} 85% 55%)`} />
          <stop offset="1" stopColor={`hsl(${hueB} 85% 38%)`} />
        </linearGradient>
      </defs>
      <rect width="120" height="120" fill={`url(#${id})`} />
      <circle cx="96" cy="24" r="22" fill="rgb(255 255 255 / 14%)" />
      {bars.map((h, i) => (
        <rect key={i} x={8 + i * 7.6} y={112 - h} width="4.6" height={h} rx="2.3" fill="rgb(255 255 255 / 80%)" />
      ))}
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="hc-stat">
      <span className="hc-stat-value">{value}</span>
      <span className="hc-stat-label">{label}</span>
    </div>
  );
}

export default function HostDashboard() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverCrop, setCoverCrop] = useState<{ roomId: string; file: File } | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [inviteRoomTitle, setInviteRoomTitle] = useState("");
  const [roomInvite, setRoomInvite] = useState<{ roomId: string; code: string; link: string } | null>(null);
  const [notice, setNotice] = useState("Loading rooms...");
  const [pending, setPending] = useState(false);
  const [entryFee, setEntryFee] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editFee, setEditFee] = useState("");
  const [editStatus, setEditStatus] = useState<Room["status"]>("scheduled");
  const [editBusy, setEditBusy] = useState(false);
  const [payout, setPayout] = useState<PayoutStatus | null>(null);
  const [paypalEmail, setPaypalEmail] = useState("");

  async function loadPayout() {
    try {
      const response = await fetch("/api/host/payouts", { cache: "no-store" });
      if (response.ok) {
        const result = await response.json() as PayoutStatus;
        setPayout(result);
        setPaypalEmail(result.paypalEmail ?? "");
      }
    } catch {
      setPayout(null);
    }
  }

  async function savePaypalEmail() {
    setNotice("");
    try {
      const response = await fetch("/api/host/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paypalEmail }),
      });
      const result = await response.json();
      if (!response.ok) {
        setNotice(result.error || "Could not save your PayPal email.");
        return;
      }
      setNotice("PayPal email saved.");
      await loadPayout();
    } catch {
      setNotice("Payout setup is unavailable. Try again shortly.");
    }
  }

  async function loadRooms() {
    try {
      const response = await fetch("/api/host/rooms", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) {
        setNotice(result.error || "Could not load rooms.");
        return;
      }
      setRooms(result.rooms);
      setNotice("");
    } catch {
      setNotice("Host service is unavailable. Try again shortly.");
    }
  }

  useEffect(() => {
    void loadRooms();
    void loadPayout();
  }, []);

  async function openRoom(roomId: string) {
    setNotice("");
    try {
      const response = await fetch("/api/host/rooms/enter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId }),
      });
      const result = await response.json();
      if (!response.ok) {
        setNotice(result.error || "Could not open the room.");
        return;
      }
      window.location.assign("/room");
    } catch {
      setNotice("Room service is unavailable. Try again shortly.");
    }
  }

  async function uploadCover(roomId: string, blob: Blob) {
    setCoverCrop(null);
    setNotice("Uploading room picture...");
    try {
      const response = await fetch(`/api/host/rooms/cover?roomId=${roomId}`, { method: "POST", body: blob });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not upload picture.");
      setRooms((current) => current.map((item) => (item.id === roomId ? { ...item, coverUrl: result.coverUrl } : item)));
      setNotice("Room picture updated.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not upload picture.");
    }
  }

  async function removeCover(roomId: string) {
    try {
      const response = await fetch(`/api/host/rooms/cover?roomId=${roomId}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      setRooms((current) => current.map((item) => (item.id === roomId ? { ...item, coverUrl: null } : item)));
    } catch {
      setNotice("Could not remove the picture.");
    }
  }

  async function goLive(roomId: string) {
    setNotice("");
    try {
      const response = await fetch("/api/host/rooms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, status: "live" }),
      });
      const result = await response.json();
      if (!response.ok) {
        setNotice(result.error || "Could not go live.");
        return;
      }
      setRooms((current) => current.map((item) => (item.id === roomId ? { ...item, ...result.room } : item)));
      await openRoom(roomId);
    } catch {
      setNotice("Room service is unavailable. Try again shortly.");
    }
  }

  async function deleteRoom(room: Room) {
    if (!window.confirm(`Delete "${room.title}" permanently? Its songs, chat, listener history and payment records for this room will be removed. This cannot be undone.`)) return;
    setNotice("");
    try {
      const response = await fetch("/api/host/rooms", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: room.id }),
      });
      const result = await response.json();
      if (!response.ok) {
        setNotice(result.error || "Could not delete the room.");
        return;
      }
      setRooms((current) => current.filter((item) => item.id !== room.id));
      setNotice(`Deleted "${room.title}".`);
    } catch {
      setNotice("Room service is unavailable. Try again shortly.");
    }
  }

  async function newInvite(roomId: string) {
    if (!window.confirm("Generate a new invite? The previous code for this room will stop working.")) return;
    setNotice("");
    try {
      const response = await fetch("/api/host/rooms/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId }),
      });
      const result = await response.json();
      if (!response.ok) {
        setNotice(result.error || "Could not create an invite.");
        return;
      }
      const url = new URL("/", window.location.origin);
      url.searchParams.set("invite", result.inviteCode);
      url.hash = "enter-room";
      setRoomInvite({ roomId, code: result.inviteCode, link: url.toString() });
    } catch {
      setNotice("Room service is unavailable. Try again shortly.");
    }
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${label} copied.`);
    } catch {
      setNotice(`Copy failed. Select and copy the ${label.toLowerCase()} manually.`);
    }
  }

  function startEdit(room: Room) {
    setEditingId(room.id);
    setEditTitle(room.title);
    setEditDescription(room.description ?? "");
    setEditFee(room.entry_fee_cents > 0 ? String(room.entry_fee_cents / 100) : "");
    setEditStatus(room.status);
  }

  async function saveEdit(roomId: string) {
    const feeDollars = editFee.trim() === "" ? 0 : Number(editFee);
    if (!Number.isFinite(feeDollars) || feeDollars < 0) {
      setNotice("Enter a valid entry fee.");
      return;
    }
    setEditBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/host/rooms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          title: editTitle,
          description: editDescription,
          status: editStatus,
          entryFeeCents: Math.round(feeDollars * 100),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setNotice(result.error || "Could not save the room.");
        return;
      }
      setRooms((current) => current.map((item) => (item.id === roomId ? { ...item, ...result.room } : item)));
      setEditingId("");
      setNotice("Room updated.");
    } catch {
      setNotice("Room service is unavailable. Try again shortly.");
    } finally {
      setEditBusy(false);
    }
  }

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setInviteCode("");
    setInviteLink("");
    setNotice("");

    const feeDollars = entryFee.trim() === "" ? 0 : Number(entryFee);
    const entryFeeCents = Math.round(feeDollars * 100);
    if (!Number.isFinite(feeDollars) || feeDollars < 0) {
      setNotice("Enter a valid entry fee.");
      setPending(false);
      return;
    }

    try {
      const response = await fetch("/api/host/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, entryFeeCents }),
      });
      const result = await response.json();
      if (!response.ok) {
        // The room may exist even when the response reports an error, so resync the list.
        await loadRooms();
        setNotice(result.error || "Could not create room.");
        return;
      }
      setRooms((current) => [result.room, ...current]);
      setInviteCode(result.inviteCode);
      setInviteRoomTitle(result.room.title);
      const shareUrl = new URL("/", window.location.origin);
      shareUrl.searchParams.set("invite", result.inviteCode);
      shareUrl.hash = "enter-room";
      setInviteLink(shareUrl.toString());
      setTitle("");
      setDescription("");
      setEntryFee("");
      setNotice("Room created. Share the invite code below. You can also see it again from inside the room.");
    } catch {
      setNotice("Room service is unavailable. Try again shortly.");
    } finally {
      setPending(false);
    }
  }

  async function logout() {
    await fetch("/api/host/session", { method: "DELETE" });
    window.location.reload();
  }

  async function copyInviteCode() {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setNotice("Invite code copied.");
    } catch {
      setNotice("Copy failed. Select and copy the invite code manually.");
    }
  }

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setNotice("Invite link copied.");
    } catch {
      setNotice("Copy failed. Select and copy the invite link manually.");
    }
  }

  return (
    <div className="hc">
      <div className="hc-bar">
        <span className="hc-live"><i /> Signed in as host</span>
        <div className="row">
          <Link className="btn secondary" href="/host/profile" style={{ textDecoration: "none" }}>Profile setup</Link>
          <button className="btn secondary" type="button" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </div>
      <div className="hc-stats">
        <Stat label="Rooms" value={String(rooms.length)} />
        <Stat label="Live now" value={String(rooms.filter((r) => r.status === "live").length)} />
        <Stat label="Paid rooms" value={String(rooms.filter((r) => r.entry_fee_cents > 0).length)} />
        <Stat label="Total capacity" value={rooms.reduce((sum, r) => sum + r.max_listeners, 0).toLocaleString()} />
      </div>
      <div className="hc-layout">
      <aside className="hc-side">
      {payout && (
        <section className="panel hc-payout" aria-labelledby="payout-title">
          <h2 id="payout-title">Earnings &amp; payouts</h2>
          {!payout.paymentsConfigured ? (
            <p className="small">Payments are not configured on this platform yet.</p>
          ) : (
            <>
              <p className="muted">
                Entry fees{payout.canChargeEntry ? "" : " (Tier 2+)"} and song tips are paid out to your PayPal. The platform keeps {payout.platformFeePercent}% of each payment.
              </p>
              <p className="small">
                Pending <strong>{formatFee(payout.pendingCents)}</strong> · Paid out <strong>{formatFee(payout.paidCents)}</strong>
              </p>
              <div className="field">
                <label htmlFor="paypal-email">PayPal email</label>
                <input
                  id="paypal-email"
                  type="email"
                  value={paypalEmail}
                  onChange={(event) => setPaypalEmail(event.target.value)}
                  placeholder="you@example.com"
                  maxLength={254}
                />
              </div>
              <button className="btn secondary" type="button" onClick={() => void savePaypalEmail()}>
                {payout.ready ? "Update PayPal email" : "Save PayPal email"}
              </button>
            </>
          )}
        </section>
      )}
      <section className="panel" aria-labelledby="create-room-title">
        <h2 id="create-room-title">Create a room</h2>
        <form onSubmit={createRoom}>
          <div className="field">
            <label htmlFor="room-title">Room name</label>
            <input
              id="room-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={100}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="room-description">Description</label>
            <textarea
              id="room-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              rows={3}
            />
          </div>
          {payout?.canChargeEntry && (
            <div className="field">
              <label htmlFor="room-entry-fee">Entry fee (USD, optional)</label>
              <input
                id="room-entry-fee"
                type="number"
                inputMode="decimal"
                min={payout.minEntryFeeCents / 100}
                max={payout.maxEntryFeeCents / 100}
                step="0.01"
                placeholder="Free"
                value={entryFee}
                onChange={(event) => setEntryFee(event.target.value)}
                disabled={!payout.ready}
              />
              <span className="small">
                {payout.ready
                  ? `Listeners pay before entering. Allowed: ${formatFee(payout.minEntryFeeCents)} to ${formatFee(payout.maxEntryFeeCents)}. ${payout.platformFeePercent}% platform fee applies; the rest is paid to your PayPal.`
                  : "Add your PayPal email to charge an entry fee."}
              </span>
            </div>
          )}
          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Creating..." : "Create room"}
          </button>
        </form>
        {inviteCode && (
          <div className="field">
            <strong>{inviteRoomTitle}</strong>
            <label htmlFor="new-invite-code">New invite code</label>
            <div className="row">
              <input id="new-invite-code" value={inviteCode} readOnly />
              <button className="btn secondary" type="button" onClick={() => void copyInviteCode()}>
                Copy code
              </button>
            </div>
            <label htmlFor="new-invite-link">Shareable invite link</label>
            <div className="row">
              <input id="new-invite-link" value={inviteLink} readOnly />
              <button className="btn secondary" type="button" onClick={() => void copyInviteLink()}>
                Copy link
              </button>
            </div>
          </div>
        )}
        {notice && <p role="status" className="small">{notice}</p>}
      </section>
      </aside>

      <section className="hc-main" aria-labelledby="rooms-title">
        <HostAnalytics rooms={rooms.map((room) => ({ id: room.id, title: room.title }))} />
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 id="rooms-title">Rooms</h2>
          <button className="btn secondary" type="button" onClick={() => void loadRooms()}>
            Refresh
          </button>
        </div>
        {rooms.length === 0 ? (
          <p className="muted">No rooms yet.</p>
        ) : (
          <div className="hc-rooms">
            {rooms.map((room) => (
              <article key={room.id} className="hc-room">
                {room.coverUrl ? (
                  <img className="hc-cover" src={room.coverUrl} alt={`${room.title} cover`} style={{ objectFit: "cover" }} />
                ) : (
                  <RoomCover seed={room.slug || room.title} />
                )}
                <div className="hc-room-body">
                  <div className="hc-room-head">
                    <strong>{room.title}</strong>
                    <span className={`hc-badge ${room.status}`}>{room.status}</span>
                  </div>
                  {room.description && <p className="small">{room.description}</p>}
                  <div className="hc-chips">
                    <span className="hc-chip">{room.slug}</span>
                    <span className="hc-chip">Up to {room.max_listeners.toLocaleString()} listeners</span>
                    <span className={`hc-chip ${room.entry_fee_cents > 0 ? "paid" : ""}`}>
                      {room.entry_fee_cents > 0 ? `${formatFee(room.entry_fee_cents)} entry` : "Free entry"}
                    </span>
                  </div>
                  <div className="hc-room-actions">
                    {room.status === "scheduled" && (
                      <button className="btn" type="button" onClick={() => void goLive(room.id)}>● Go live</button>
                    )}
                    {room.status === "live" && (
                      <button className="btn" type="button" onClick={() => void openRoom(room.id)}>Open room</button>
                    )}
                    {room.status === "ended" && (
                      <button className="btn" type="button" onClick={() => void goLive(room.id)}>↻ Go live again</button>
                    )}
                    <button className="btn secondary" type="button" onClick={() => (editingId === room.id ? setEditingId("") : startEdit(room))}>
                      {editingId === room.id ? "Cancel" : "Edit"}
                    </button>
                    {room.status !== "ended" && (
                      <button className="btn secondary" type="button" onClick={() => void newInvite(room.id)}>Invite code</button>
                    )}
                    <label className="btn secondary" style={{ cursor: "pointer" }}>
                      {room.coverUrl ? "Change picture" : "Add picture"}
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) setCoverCrop({ roomId: room.id, file });
                          event.target.value = "";
                        }}
                      />
                    </label>
                    {room.coverUrl && (
                      <button className="btn secondary" type="button" onClick={() => void removeCover(room.id)}>Remove picture</button>
                    )}
                    {room.status !== "live" && (
                      <button className="btn secondary" type="button" onClick={() => void deleteRoom(room)}>Delete</button>
                    )}
                  </div>
                  {roomInvite?.roomId === room.id && (
                    <div className="hc-edit">
                      <label htmlFor={`invite-code-${room.id}`}>Invite code (shown once)</label>
                      <div className="row">
                        <input id={`invite-code-${room.id}`} value={roomInvite.code} readOnly />
                        <button className="btn secondary" type="button" onClick={() => void copyText(roomInvite.code, "Invite code")}>Copy code</button>
                      </div>
                      <label htmlFor={`invite-link-${room.id}`}>Shareable invite link</label>
                      <div className="row">
                        <input id={`invite-link-${room.id}`} value={roomInvite.link} readOnly />
                        <button className="btn secondary" type="button" onClick={() => void copyText(roomInvite.link, "Invite link")}>Copy link</button>
                      </div>
                    </div>
                  )}
                  {editingId === room.id && (
                    <div className="hc-edit">
                      <label htmlFor={`edit-title-${room.id}`}>Room name</label>
                      <input id={`edit-title-${room.id}`} value={editTitle} maxLength={100} onChange={(event) => setEditTitle(event.target.value)} />
                      <label htmlFor={`edit-desc-${room.id}`}>Description</label>
                      <textarea id={`edit-desc-${room.id}`} value={editDescription} maxLength={500} rows={3} onChange={(event) => setEditDescription(event.target.value)} />
                      <label htmlFor={`edit-fee-${room.id}`}>Entry fee (USD, blank for free)</label>
                      <input id={`edit-fee-${room.id}`} inputMode="decimal" value={editFee} onChange={(event) => setEditFee(event.target.value)} />
                      <label htmlFor={`edit-status-${room.id}`}>Status</label>
                      <select id={`edit-status-${room.id}`} value={editStatus} onChange={(event) => setEditStatus(event.target.value as Room["status"])}>
                        <option value="scheduled">Scheduled</option>
                        <option value="live">Live</option>
                        <option value="ended">Ended</option>
                      </select>
                      <button className="btn" type="button" disabled={editBusy} onClick={() => void saveEdit(room.id)}>
                        {editBusy ? "Saving..." : "Save changes"}
                      </button>
                    </div>
                  )}
                  <RoomTrackManager roomId={room.id} />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      </div>
      {coverCrop && (
        <AvatarCropper
          file={coverCrop.file}
          aspect={16 / 9}
          round={false}
          title="Crop room picture"
          onCancel={() => setCoverCrop(null)}
          onDone={(blob) => void uploadCover(coverCrop.roomId, blob)}
        />
      )}
    </div>
  );
}