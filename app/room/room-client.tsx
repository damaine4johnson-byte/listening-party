"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type RoomState = { room_id:string; track_id:string|null; status:"playing"|"paused"; position_seconds:number; started_at:string|null; updated_at:string };
type ChatMessage = { id:string; display_name:string; body:string; created_at:string };
type HostProfile = { display_name:string; bio:string; avatar_url:string };
export default function RoomClient({ displayName }: { displayName:string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [state,setState] = useState<RoomState|null>(null);
  const [messages,setMessages] = useState<ChatMessage[]>([]);
  const [body,setBody] = useState("");
  const [notice,setNotice] = useState("Connecting to room...");
  const [hostMode,setHostMode] = useState(false);
  const [trackUrl,setTrackUrl] = useState("");
  const [trackName,setTrackName] = useState("Demo track");
  const [roomTitle,setRoomTitle] = useState("First listen.");
  const [hostProfile,setHostProfile] = useState<HostProfile|null>(null);
  const [showAds,setShowAds] = useState(false);
  useEffect(() => {
    let active = true;
    async function refreshRoom() {
      try {
        const response = await fetch("/api/rooms/session", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) {
          if (active) setNotice(result.error || "Could not load room data.");
          return;
        }
        if (!active) return;
        setRoomTitle(result.room.title);
        setState(result.state);
        setMessages(result.messages);
        setHostProfile(result.hostProfile);
        setShowAds(Boolean(result.showAds));
        setNotice("Connected to the listening room.");
      } catch {
        if (active) setNotice("Room service is unavailable. Try again shortly.");
      }
    }
    void refreshRoom();
    const intervalId = window.setInterval(() => void refreshRoom(), 4000);
    return () => { active = false; window.clearInterval(intervalId); };
  },[]);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state) return;
    const expected = state.position_seconds + (state.status === "playing" && state.started_at ? Math.max(0,(Date.now()-new Date(state.started_at).getTime())/1000) : 0);
    if (Math.abs(audio.currentTime-expected) > 1.5) audio.currentTime = expected;
    if (state.status === "playing") { void audio.play().catch(() => setNotice("Tap Play/Join Audio once to allow browser playback.")); }
    else audio.pause();
  },[state]);
  async function sendChat(e:React.FormEvent) {
    e.preventDefault(); if (!body.trim()) return;
    try {
      const response = await fetch("/api/rooms/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });
      const result = await response.json();
      if (!response.ok) {
        setNotice(result.error || "Chat is temporarily unavailable.");
        return;
      }
      setMessages((current) => [...current, result.message].slice(-100));
      setBody("");
      setNotice("Connected to the listening room.");
    } catch {
      setNotice("Chat is temporarily unavailable.");
    }
  }
  async function hostCommand(command:"play"|"pause"|"seek"|"track") {
    if (!hostMode) return;
    const audio = audioRef.current; if (!audio) return;
    if (command==="play") { await audio.play().catch(()=>{}); }
    if (command==="pause") audio.pause();
    setState({room_id:state?.room_id ?? "preview",track_id:null,status:command==="pause"?"paused":"playing",position_seconds:audio.currentTime,started_at:new Date().toISOString(),updated_at:new Date().toISOString()});
    setNotice("Playback controls are a local preview; host authorization is not configured.");
  }
  return <main className="wrap">
    <header className="nav"><Link href="/" className="brand" style={{textDecoration:"none"}}><div className="mark">FI</div><div><div>FAMOUS INTROVERT</div><div className="small">LISTENING ROOMS</div></div></Link><span className="tag">INVITE-ONLY ROOM</span></header>
    <section className="hero"><div className="eyebrow">You're on the list</div><h1>{roomTitle}</h1><p>Welcome, {displayName.slice(0,32)}. The host controls playback for everyone in this room.</p>
      {hostProfile?.display_name && <div className="row" style={{marginTop:20}}>{hostProfile.avatar_url && <img src={hostProfile.avatar_url} alt="" width={56} height={56} style={{width:56,height:56,objectFit:"cover",borderRadius:"50%"}}/>}<div><strong>{hostProfile.display_name}</strong>{hostProfile.bio && <p className="muted" style={{margin:"4px 0 0"}}>{hostProfile.bio}</p>}</div></div>}
    </section>
    {showAds && <aside className="panel" aria-label="Advertisement"><div className="eyebrow">Advertisement</div><h2>Host your own first listen</h2><p className="muted">Create an artist profile and bring your listeners together in a private room.</p><Link className="btn secondary" href="/signup">Artist sign up</Link></aside>}
    <section className="grid">
      <div className="panel"><div className="row" style={{justifyContent:"space-between"}}><h2>Now playing</h2><span className="status">● {state?.status ?? "waiting"}</span></div><div className="player"><div className="eyebrow">FAMOUS INTROVERT EXCLUSIVE</div><div className="tracktitle">{trackName}</div><p className="muted">Your preview player will follow the host's playback state.</p><audio ref={audioRef} src={trackUrl || undefined} controls preload="metadata" style={{width:"100%",marginTop:10}}/><div className="row" style={{marginTop:12}}><button className="btn secondary" onClick={()=>setNotice("Browser audio is ready. Host playback sync will activate when the secured backend is configured.")}>Join audio</button><span className="small">Use headphones for the best experience.</span></div></div>
        <div className="divider"/><h2>Host controls (development preview)</h2><p className="muted">Host mode here is a UI demonstration only. Production controls must be granted by server-verified host permissions.</p><label className="small"><input type="checkbox" checked={hostMode} onChange={e=>setHostMode(e.target.checked)}/> Enable demo host controls on this device</label><div className="row" style={{marginTop:12}}><button className="btn" disabled={!hostMode} onClick={()=>void hostCommand("play")}>Play</button><button className="btn secondary" disabled={!hostMode} onClick={()=>void hostCommand("pause")}>Pause</button></div>
        <div className="field"><label htmlFor="trackUrl">Test audio URL (demo only)</label><input id="trackUrl" value={trackUrl} onChange={e=>setTrackUrl(e.target.value)} placeholder="Use a temporary test audio URL"/><button className="btn secondary" onClick={()=>setTrackName("Custom test track")}>Load test label</button></div>
      </div>
      <aside className="panel"><h2>Live chat</h2><p className="muted">Keep it respectful. The host can moderate this room.</p><div className="chatlog">{messages.length===0?<p className="muted">No messages yet. Start the conversation.</p>:messages.map(m=><div className="message" key={m.id}><strong>{m.display_name}</strong>{m.body}<div className="small">{new Date(m.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</div></div>)}</div><form onSubmit={sendChat}><div className="field"><label htmlFor="chat">Message as {displayName.slice(0,32)}</label><input id="chat" value={body} onChange={e=>setBody(e.target.value)} maxLength={500} placeholder="Share your reaction…" required/></div><button className="btn" type="submit">Send message</button></form><div className="divider"/><p className="small">{notice}</p></aside>
    </section><footer className="footer">Private previews · Please do not redistribute unreleased music.</footer>
  </main>;
}
