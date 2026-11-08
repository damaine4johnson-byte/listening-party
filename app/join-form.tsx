"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";
import { listenerRoomDestination } from "../lib/listener-room-return";

const ROOM_ENTRY_KEY = "fi-pending-free-room-entry";

export default function JoinForm() {
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [error, setError] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [followArtist, setFollowArtist] = useState<string | null>(null);
  const [needsFollow, setNeedsFollow] = useState(false);
  const [entryWarning, setEntryWarning] = useState("");
  const [pending, setPending] = useState(false);
  const [fee, setFee] = useState<{ cents: number; title: string } | null>(null);
  const [paymentSessionId, setPaymentSessionId] = useState("");
  const [coinBalance, setCoinBalance] = useState<number | null>(null);
  const [listenerSignedIn, setListenerSignedIn] = useState(false);
  const [auto, setAuto] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get("invite");
    if (inviteCode) setCode(inviteCode.slice(0, 128));
    const requestedRoomId = params.get("roomId") ?? "";
    if (listenerRoomDestination(requestedRoomId)) {
      setRoomId(requestedRoomId);
      setAuto(params.get("resume") !== "1");
      if (params.get("resume") === "1") {
        try {
          const saved = JSON.parse(sessionStorage.getItem(ROOM_ENTRY_KEY) ?? "null") as { roomId?: unknown; displayName?: unknown } | null;
          if (saved?.roomId === requestedRoomId && typeof saved.displayName === "string") setDisplayName(saved.displayName.slice(0, 32));
        } catch {
          setEntryWarning("Your display name could not be restored. Please enter it again.");
        }
      }
    }
    // Notification links (?invite=CODE&go=1) enter straight away; paid rooms still ask for payment.
    if (inviteCode && params.get("go") === "1" && !params.get("paid")) setAuto(true);

    const paid = params.get("paid");
    if (paid && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paid)) {
      setPaymentSessionId(paid);
      try {
        const saved = JSON.parse(sessionStorage.getItem("fi-pending-join") ?? "null") as { code?: string; displayName?: string } | null;
        if (saved?.code) setCode(saved.code.slice(0, 128));
        if (saved?.displayName) setDisplayName(saved.displayName.slice(0, 32));
      } catch {
        // Entry details can be re-entered manually.
      }
    }
    try {
      const saved = JSON.parse(sessionStorage.getItem("fi-pending-coin-entry") ?? "null") as {
        code?: unknown; displayName?: unknown; paymentSessionId?: unknown;
      } | null;
      if (
        saved && !paid && !listenerRoomDestination(requestedRoomId) && typeof saved.code === "string" && typeof saved.displayName === "string" &&
        typeof saved.paymentSessionId === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(saved.paymentSessionId)
      ) {
        setCode(saved.code.slice(0, 128));
        setDisplayName(saved.displayName.slice(0, 32));
        setPaymentSessionId(saved.paymentSessionId);
      }
    } catch {
      setEntryWarning("Saved room entry details could not be read. Please enter them again.");
    }
  }, []);

  useEffect(() => {
    if (!auto || (!code && !roomId)) return;
    void (async () => {
      let name = displayName;
      if (!name && supabase) {
        const { data } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;
        if (accessToken) {
          const response = await fetch("/api/listeners/profile", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
          const result = await response.json().catch(() => null);
          if (response.ok) name = result?.profile?.displayName || String(result?.email ?? "").split("@")[0];
        }
      }
      setAuto(false);
      if (!name) return;
      setDisplayName(name.slice(0, 32));
      setTimeout(() => formRef.current?.requestSubmit(), 60);
    })();
  }, [auto, code, displayName, roomId]);

  useEffect(() => {
    let active = true;
    async function loadCoinBalance() {
      if (!fee || !supabase) return;
      const authClient = supabase;
      if (!authClient) return;
      const { data, error: sessionError } = await authClient.auth.getSession();
      if (!active) return;
      const accessToken = data.session?.access_token;
      setListenerSignedIn(Boolean(accessToken && !sessionError));
      if (!accessToken || sessionError) {
        setCoinBalance(null);
        return;
      }
      const response = await fetch("/api/coins/balance", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const result = await response.json();
      if (active && response.ok && typeof result.balance === "number") setCoinBalance(result.balance);
    }
    void loadCoinBalance().catch(() => {
      if (active) setCoinBalance(null);
    });
    return () => { active = false; };
  }, [fee]);

  async function startCheckout() {
    sessionStorage.setItem("fi-pending-join", JSON.stringify({ code, displayName }));
    const response = await fetch("/api/rooms/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const result = await response.json();
    if (!response.ok || typeof result.url !== "string") {
      setError(result.error || "Could not start checkout.");
      return;
    }
    window.location.assign(result.url);
  }

  async function spendCoins() {
    if (!fee || !supabase) return;
    setError("");
    setPending(true);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (sessionError || !accessToken) {
        setError("Sign in with Google from the listener wallet to use coins.");
        return;
      }
      const paymentResponse = await fetch("/api/coins/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ code, displayName }),
      });
      const payment = await paymentResponse.json();
      if (!paymentResponse.ok || typeof payment.paymentSessionId !== "string") {
        setError(payment.error || "Could not spend coins for entry.");
        return;
      }
      sessionStorage.setItem("fi-pending-coin-entry", JSON.stringify({ code, displayName, paymentSessionId: payment.paymentSessionId }));
      setPaymentSessionId(payment.paymentSessionId);
      const response = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ code, displayName, paymentSessionId: payment.paymentSessionId }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Could not join this room.");
        return;
      }
      sessionStorage.removeItem("fi-pending-coin-entry");
      sessionStorage.removeItem("fi-pending-join");
      window.location.assign("/room");
    } catch {
      setError("Coin wallet is temporarily unavailable.");
    } finally {
      setPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNeedsSignIn(false);
    setNeedsFollow(false);
    setFollowArtist(null);
    setEntryWarning("");
    setPending(true);

    try {
      if (fee && !paymentSessionId && !roomId) {
        await startCheckout();
        return;
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (roomId) {
        const { data, error: sessionError } = await supabase?.auth.getSession() ?? { data: { session: null }, error: null };
        if (sessionError || !data.session?.access_token) {
          saveRoomEntry();
          setNeedsSignIn(true);
          setError("Sign in to the listener account that follows this artist.");
          return;
        }
        headers.Authorization = `Bearer ${data.session.access_token}`;
      }
      if (paymentSessionId && supabase) {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
      }
      const response = await fetch("/api/rooms/join", {
        method: "POST",
        headers,
        body: JSON.stringify(roomId
          ? { roomId, displayName }
          : { code, displayName, paymentSessionId: paymentSessionId || undefined }),
      });
      const result = await response.json();

      if (response.status === 402 && result.paymentRequired) {
        setFee({ cents: result.entryFeeCents, title: result.roomTitle });
        setPaymentSessionId("");
        setError(paymentSessionId ? result.error : "");
        return;
      }
      if (!response.ok) {
        if (roomId && response.status === 401 && result.code === "listener_sign_in_required") {
          saveRoomEntry();
          setNeedsSignIn(true);
        }
        if (roomId && response.status === 403 && result.code === "follow_required") {
          saveRoomEntry();
          setNeedsFollow(true);
          if (typeof result.artistHandle === "string" && (/^[a-z][a-z0-9_]{2,23}$/.test(result.artistHandle) || /^[a-f0-9]{16}$/.test(result.artistHandle))) setFollowArtist(result.artistHandle);
        }
        setError(result.error || "Could not join this room.");
        return;
      }

      try {
        sessionStorage.removeItem("fi-pending-join");
        sessionStorage.removeItem("fi-pending-coin-entry");
        if (roomId) {
          const saved = JSON.parse(sessionStorage.getItem(ROOM_ENTRY_KEY) ?? "null") as { roomId?: unknown } | null;
          if (saved?.roomId === roomId) sessionStorage.removeItem(ROOM_ENTRY_KEY);
        }
      } catch {
        console.warn("Could not clear saved room entry details.");
      }
      window.location.assign("/room");
    } catch {
      setError("Room service is unavailable. Try again shortly.");
    } finally {
      setPending(false);
    }
  }

  function saveRoomEntry() {
    try {
      sessionStorage.setItem(ROOM_ENTRY_KEY, JSON.stringify({ roomId, displayName: displayName.slice(0, 32) }));
      setEntryWarning("");
    } catch {
      setEntryWarning("Your display name could not be saved. You may need to enter it again.");
    }
  }

  return (
    <form ref={formRef} onSubmit={submit}>
      {roomId ? (
        <p className="small" role="status">Join this artist&apos;s free room as a follower — no invitation code needed.</p>
      ) : (
        <div className="field">
          <label htmlFor="code">Invitation code</label>
          <input
            id="code"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setFee(null);
              setPaymentSessionId("");
              setCoinBalance(null);
              sessionStorage.removeItem("fi-pending-coin-entry");
            }}
            placeholder="Enter your invite code"
            autoComplete="off"
            maxLength={128}
            required
          />
        </div>
      )}
      <div className="field">
        <label htmlFor="name">Display name</label>
        <input
          id="name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="How fans will see you"
          maxLength={32}
          required
        />
      </div>
      {fee && !paymentSessionId && (
        <>
          <p className="small" role="status">
            {fee.title} has a ${(fee.cents / 100).toFixed(2)} entry fee. Pay securely by card with WiPay, or use coins at 1 USD = 10 coins.
          </p>
          {fee.cents % 10 === 0 && (
            <div className="small">
              {listenerSignedIn ? (
                <>
                  <p>Wallet balance: {coinBalance === null ? "checking..." : `${coinBalance.toLocaleString()} coins`} · Entry: {fee.cents / 10} coins</p>
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={pending || coinBalance === null || coinBalance < fee.cents / 10}
                    onClick={() => void spendCoins()}
                  >
                    {coinBalance !== null && coinBalance < fee.cents / 10
                      ? "Not enough coins"
                      : `Use ${fee.cents / 10} coins to enter`}
                  </button>
                  <p><Link href="/wallet">Buy more coins</Link></p>
                </>
              ) : (
                <p><Link href="/wallet">Sign in to your listener wallet</Link> to pay with coins.</p>
              )}
            </div>
          )}
        </>
      )}
      {paymentSessionId && (
        <p className="small" role="status">Payment received. Confirm your details and enter the room.</p>
      )}
      <button className="btn" type="submit" disabled={pending}>
        {pending
          ? roomId ? "Joining room..." : "Checking invitation..."
          : fee && !paymentSessionId
            ? `Pay $${(fee.cents / 100).toFixed(2)} and enter →`
            : "Enter room →"}
      </button>
      {needsSignIn && <p className="small"><Link href={`/signin?roomId=${encodeURIComponent(roomId)}`} onClick={saveRoomEntry}>Sign in</Link> with the listener account that follows this artist. You&apos;ll return to this room afterward.</p>}
      {needsFollow && <p className="small"><Link href={followArtist ? `/artists/${encodeURIComponent(followArtist)}?roomId=${encodeURIComponent(roomId)}` : "/artists"} onClick={saveRoomEntry}>{followArtist ? "Follow this artist" : "Find and follow this artist"}</Link>{followArtist ? " to return to this room." : ", then return to their profile to join the room."}</p>}
      {entryWarning && <p role="status" className="small">{entryWarning}</p>}
      {error && <p role="alert" className="small">{error}</p>}
    </form>
  );
}