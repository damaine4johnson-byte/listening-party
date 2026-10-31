"use client";

import { useState } from "react";
import Link from "next/link";
import type { PublicArtist } from "../../lib/artists-public";
import styles from "./artists.module.css";

// Listener-facing artist search by username or display name.
export default function ArtistSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicArtist[] | null>(null);
  const [pending, setPending] = useState(false);

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = query.trim();
    if (!q) { setResults(null); return; }
    setPending(true);
    try {
      const response = await fetch(`/api/artists/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const data = await response.json();
      setResults(Array.isArray(data.artists) ? data.artists : []);
    } catch {
      setResults([]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <form className={styles.searchBar} onSubmit={search} role="search">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search artists by username or name"
          aria-label="Search artists by username or name"
          maxLength={64}
        />
        <button className="btn secondary" type="submit" disabled={pending}>
          {pending ? "Searching..." : "Search"}
        </button>
        {results !== null && (
          <button className="btn secondary" type="button" onClick={() => { setResults(null); setQuery(""); }}>
            Clear
          </button>
        )}
      </form>
      {results !== null && (
        results.length === 0
          ? <p className="muted" style={{ marginTop: 12 }}>No artists matched “{query}”.</p>
          : (
            <div className={styles.grid}>
              {results.map((a) => (
                <Link key={a.handle} href={`/artists/${a.handle}`} className={styles.card}>
                  {a.avatarUrl
                    ? <img className={styles.avatar} src={a.avatarUrl} alt="" />
                    : <div className={styles.avatar}>{a.name.charAt(0).toUpperCase()}</div>}
                  <h2 className={styles.name}>{a.name}</h2>
                  <span className={styles.resultHandle}>@{a.handle}</span>
                  <span className={styles.followers}>{a.followers.toLocaleString()} {a.followers === 1 ? "follower" : "followers"}</span>
                </Link>
              ))}
            </div>
          )
      )}
    </div>
  );
}
