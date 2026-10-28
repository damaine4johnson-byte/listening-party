"use client";

import { useEffect, useState } from "react";
import type { HostProfile, RoomTrack } from "./room-types";
import { formatTime, hashString } from "./room-types";

type PlaylistProps = {
  tracks: RoomTrack[];
  activeTrackId: string | null;
  isPlaying: boolean;
  isHost: boolean;
  pending: boolean;
  roomTitle: string;
  upNextTrack: RoomTrack | null;
  reordering: boolean;
  dragIndex: number | null;
  setDragIndex: (index: number | null) => void;
  tipTrackId: string | null;
  tipBusy: boolean;
  coinSignedIn: boolean;
  coinBalance: number | null;
  onSelectTrack: (track: RoomTrack) => void;
  onMoveTrack: (from: number, to: number) => void;
  onToggleTipMenu: (trackId: string) => void;
  onStartCardTip: (track: RoomTrack, cents: number) => void;
  onStartCoinTip: (track: RoomTrack, coins: number) => void;
};

// The shared playlist panel: shows up-next, lets hosts drag to reorder, and lets
// listeners open the per-track tip menu with card or coin options.
export function Playlist({
  tracks, activeTrackId, isPlaying, isHost, pending, roomTitle, upNextTrack,
  reordering, dragIndex, setDragIndex, tipTrackId, tipBusy, coinSignedIn, coinBalance,
  onSelectTrack, onMoveTrack, onToggleTipMenu, onStartCardTip, onStartCoinTip,
}: PlaylistProps) {
  return (
    <section className="rm-playlist" aria-labelledby="playlist-title">
      <h2 id="playlist-title">Up next <span className="small">{tracks.length} tracks</span></h2>
      {upNextTrack && <p className="small" aria-live="polite">Next: <strong>{upNextTrack.title}</strong></p>}
      {isHost && tracks.length > 1 && <p className="small">Drag tracks or use the arrows to reorder the playlist while live.</p>}
      {tracks.length === 0 ? (
        <p className="muted">No audio has been added to this room yet.</p>
      ) : (
        <ol>
          {tracks.map((track, index) => {
            const current = activeTrackId === track.id;
            return (
              <li
                key={track.id}
                className={dragIndex === index ? "dragging" : ""}
                draggable={isHost && !reordering}
                onDragStart={(event) => { event.dataTransfer.setData("text/plain", String(index)); setDragIndex(index); }}
                onDragOver={(event) => { if (dragIndex !== null) event.preventDefault(); }}
                onDrop={(event) => {
                  event.preventDefault();
                  const from = Number(event.dataTransfer.getData("text/plain"));
                  if (Number.isInteger(from) && from !== index) onMoveTrack(from, index);
                  setDragIndex(null);
                }}
                onDragEnd={() => setDragIndex(null)}
              >
                <PlaylistRow
                  track={track}
                  index={index}
                  current={current}
                  isPlaying={isPlaying}
                  isHost={isHost}
                  pending={pending}
                  reordering={reordering}
          tipOpen={tipTrackId === track.id}
                  tipBusy={tipBusy}
                  coinSignedIn={coinSignedIn}
                  coinBalance={coinBalance}
                  onSelectTrack={onSelectTrack}
                  onMoveTrack={onMoveTrack}
                  onToggleTipMenu={onToggleTipMenu}
                  onStartCardTip={onStartCardTip}
                  onStartCoinTip={onStartCoinTip}
                />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

type PlaylistRowProps = {
  track: RoomTrack;
  index: number;
  current: boolean;
  isPlaying: boolean;
  isHost: boolean;
  pending: boolean;
  reordering: boolean;
  tipOpen: boolean;
  tipBusy: boolean;
  coinSignedIn: boolean;
  coinBalance: number | null;
  onSelectTrack: (track: RoomTrack) => void;
  onMoveTrack: (from: number, to: number) => void;
  onToggleTipMenu: (trackId: string) => void;
  onStartCardTip: (track: RoomTrack, cents: number) => void;
  onStartCoinTip: (track: RoomTrack, coins: number) => void;
};

function PlaylistRow(props: PlaylistRowProps) {
  const { track, index, current, isPlaying, isHost, pending, reordering, tipOpen, tipBusy, coinSignedIn, coinBalance } = props;
  const setDragSource = (event: React.DragEvent<HTMLLIElement>) => event.dataTransfer.setData("text/plain", String(index));

  return (
    <>
      <button
        type="button"
        className={`rm-select ${current ? "current" : ""}`}
        aria-current={current ? "true" : undefined}
        disabled={!isHost || pending}
        onClick={() => props.onSelectTrack(track)}
      >
        <span className="rm-thumb" style={{ ["--hue" as string]: (hashString(track.title) % 360) }}>
          {current && isPlaying ? "♪" : String(index + 1).padStart(2, "0")}
        </span>
        <span className="rm-track-title">{track.title}</span>
        <span className="small">{track.durationSeconds ? formatTime(track.durationSeconds) : "Audio"}</span>
      </button>
      {!isHost && !current && (
        <button type="button" className="rm-boost" disabled={tipBusy} onClick={() => props.onToggleTipMenu(track.id)}>
          ⚡ Boost
        </button>
      )}
      {tipOpen && !isHost && (
        <TipMenu
          track={track}
          coinSignedIn={coinSignedIn}
          coinBalance={coinBalance}
          tipBusy={tipBusy}
          onStartCardTip={props.onStartCardTip}
          onStartCoinTip={props.onStartCoinTip}
        />
      )}
      {isHost && (
        <span className="rm-reorder">
          <button type="button" aria-label={`Move ${track.title} up`} disabled={reordering || index === 0} onClick={() => props.onMoveTrack(index, index - 1)}>▲</button>
          <button type="button" aria-label={`Move ${track.title} down`} disabled={reordering} onClick={() => props.onMoveTrack(index, index + 1)}>▼</button>
        </span>
      )}
    </>
  );
}

function TipMenu({ track, coinSignedIn, coinBalance, tipBusy, onStartCardTip, onStartCoinTip }: {
  track: RoomTrack;
  coinSignedIn: boolean;
  coinBalance: number | null;
  tipBusy: boolean;
  onStartCardTip: (track: RoomTrack, cents: number) => void;
  onStartCoinTip: (track: RoomTrack, coins: number) => void;
}) {
  return (
    <span className="rm-tip-menu" role="group" aria-label={`Tip to boost ${track.title}`}>
      <span className="small">Tip to play next:</span>
      {[300, 500, 1000].map((cents) => (
        <button key={cents} type="button" disabled={tipBusy} onClick={() => onStartCardTip(track, cents)}>
          ${cents / 100} card
        </button>
      ))}
      <span className="small">
        {coinSignedIn
          ? `Wallet: ${coinBalance === null ? "checking..." : `${coinBalance.toLocaleString()} coins`}`
          : "Sign in for coins"}
      </span>
      {[30, 50, 100].map((coins) => (
        <button
          key={coins}
          type="button"
          disabled={tipBusy || !coinSignedIn || coinBalance === null || coinBalance < coins}
          onClick={() => onStartCoinTip(track, coins)}
        >
          {coins} coins
        </button>
      ))}
    </span>
  );
}

// Keeps the chat log pinned to the newest message and renders the avatar fallback chain.
export function ChatAvatar({ name, version }: { name: string; version: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [name, version]);
  return (
    <span className="rm-msg-avatar" style={{ ["--hue" as string]: (hashString(name) % 360) }}>
      {failed
        ? name.charAt(0).toUpperCase()
        : <img src={`/api/rooms/avatar?name=${encodeURIComponent(name)}&v=${version}`} alt="" onError={() => setFailed(true)} />}
    </span>
  );
}

export type ChatMessageView = { id: string; display_name: string; body: string; created_at: string };

export function ChatLog({ messages, hostProfile, avatarVersion }: {
  messages: ChatMessageView[];
  hostProfile: HostProfile | null;
  avatarVersion: number;
}) {
  return (
    <div className="rm-chatlog" aria-live="polite">
      {messages.length === 0
        ? <p className="muted">No messages yet. Start the conversation.</p>
        : messages.map((message) => {
          const fromHost = message.display_name === hostProfile?.display_name;
          return (
            <div className={`rm-msg ${fromHost ? "host" : ""}`} key={message.id}>
              {fromHost && hostProfile?.avatar_url
                ? <span className="rm-msg-avatar"><img src={hostProfile.avatar_url} alt="" /></span>
                : <ChatAvatar name={message.display_name} version={avatarVersion} />}
              <div>
                <strong>{message.display_name}</strong>
                {fromHost && <span className="rm-verified">HOST</span>}
                <span className="rm-msg-time">{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                <p>{message.body}</p>
              </div>
            </div>
          );
        })}
    </div>
  );
}
