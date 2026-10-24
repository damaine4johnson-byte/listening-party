"use client";

import { FormEvent, useState } from "react";

export default function JoinForm() {
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    try {
      const response = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, displayName }),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error || "Could not join this room.");
        return;
      }

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
          onChange={(event) => setCode(event.target.value)}
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
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Checking invitation..." : "Enter room →"}
      </button>
      {error && <p role="alert" className="small">{error}</p>}
    </form>
  );
}