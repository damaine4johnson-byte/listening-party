"use client";

import { FormEvent, useEffect, useState } from "react";

export default function JoinForm() {
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [fee, setFee] = useState<{ cents: number; title: string } | null>(null);
  const [paymentSessionId, setPaymentSessionId] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get("invite");
    if (inviteCode) setCode(inviteCode.slice(0, 128));

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
  }, []);

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    try {
      if (fee && !paymentSessionId) {
        await startCheckout();
        return;
      }

      const response = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, displayName, paymentSessionId: paymentSessionId || undefined }),
      });
      const result = await response.json();

      if (response.status === 402 && result.paymentRequired) {
        setFee({ cents: result.entryFeeCents, title: result.roomTitle });
        setPaymentSessionId("");
        setError(paymentSessionId ? result.error : "");
        return;
      }
      if (!response.ok) {
        setError(result.error || "Could not join this room.");
        return;
      }

      sessionStorage.removeItem("fi-pending-join");
      window.location.assign("/room");
    } catch {
      setError("Room service is unavailable. Try again shortly.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label htmlFor="code">Invitation code</label>
        <input
          id="code"
          value={code}
          onChange={(event) => { setCode(event.target.value); setFee(null); }}
          placeholder="Enter your invite code"
          autoComplete="off"
          maxLength={128}
          required
        />
      </div>
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
        <p className="small" role="status">
          {fee.title} has a ${(fee.cents / 100).toFixed(2)} entry fee. You will pay securely by card with WiPay, then return here to enter.
        </p>
      )}
      {paymentSessionId && (
        <p className="small" role="status">Payment received. Confirm your details and enter the room.</p>
      )}
      <button className="btn" type="submit" disabled={pending}>
        {pending
          ? "Checking invitation..."
          : fee && !paymentSessionId
            ? `Pay $${(fee.cents / 100).toFixed(2)} and enter →`
            : "Enter room →"}
      </button>
      {error && <p role="alert" className="small">{error}</p>}
    </form>
  );
}