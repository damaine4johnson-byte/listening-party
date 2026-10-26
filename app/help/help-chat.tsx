"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import styles from "./help-chat.module.css";

type ChatMessage = { role: "user" | "assistant"; content: string };

const WELCOME: ChatMessage = {
  role: "assistant",
  content: "Hi! I can help with listening rooms, artist accounts, and listener coins. What can I help you with?",
};

export default function HelpChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [contactEmail, setContactEmail] = useState("");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [error, setError] = useState("");
  const conversationId = useRef(crypto.randomUUID());
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || sending || escalated) return;

    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setError("");

    try {
      const response = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId.current,
          messages: nextMessages.slice(1).slice(-12),
          contactEmail: contactEmail.trim(),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "Support is temporarily unavailable. Please try again.");
        return;
      }
      setMessages((current) => [...current, { role: "assistant", content: result.reply }]);
      if (result.escalated) setEscalated(true);
    } catch {
      setError("Could not reach support. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className={styles.chat} aria-label="AI support chat">
      <div className={styles.chatHeader}>
        <div>
          <h2>Exclusive Listens Assistant</h2>
          <p>Instant help, with human follow-up only when needed.</p>
        </div>
        <span className={styles.live}><i /> LIVE</span>
      </div>
      <div className={styles.contact}>
        <label htmlFor="support-email">Your email <span>(optional, for follow-up)</span></label>
        <input
          id="support-email"
          type="email"
          autoComplete="email"
          maxLength={320}
          placeholder="you@example.com"
          value={contactEmail}
          onChange={(event) => setContactEmail(event.target.value)}
          disabled={sending || escalated}
        />
        <p>We’ll share this with support only if your conversation needs a person.</p>
      </div>
      <div className={styles.transcript} role="log" aria-live="polite" aria-relevant="additions text">
        {messages.map((message, index) => (
          <div
            key={`${index}-${message.role}`}
            className={`${styles.bubble} ${message.role === "user" ? styles.user : styles.assistant}`}
          >
            <span>{message.role === "user" ? "You" : "Assistant"}</span>
            <p>{message.content}</p>
          </div>
        ))}
        {sending && <p className={styles.thinking}>Assistant is replying…</p>}
        <div ref={messagesEnd} />
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {escalated && <p className={styles.success} role="status">Your conversation has been sent to the support team. You can close this page.</p>}
      <form className={styles.form} onSubmit={sendMessage}>
        <label className={styles.srOnly} htmlFor="support-message">Your message</label>
        <textarea
          id="support-message"
          rows={2}
          maxLength={1200}
          placeholder={escalated ? "Support has been notified." : "Type your question…"}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={sending || escalated}
          required
        />
        <button type="submit" disabled={sending || escalated || !input.trim()}>
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
      <p className={styles.privacy}>Messages are sent to the AI provider to generate replies. A support email is sent only if human help is needed.</p>
    </section>
  );
}
