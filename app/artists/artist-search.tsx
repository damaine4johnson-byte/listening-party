"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { PublicArtist } from "../../lib/artists-public";
import styles from "./artists.module.css";

// Listener-facing artist search by username or display name.
export default function ArtistSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Pick<PublicArtist, "handle" | "name" | "avatarUrl" | "followers">[] | null>(null);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const requestId = useRef(0);

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = query.trim();
    if (!q || pending) return;
    const id = ++requestId.current;
    setResults(null);
    setError("");
    setSearchedQuery(q);
    setPending(true);
    try {
      const response = await fetch(`/api/artists/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Artist search is temporarily unavailable. Please try again.");
      const data = await response.json();
      if (!Array.isArray(data.artists)) throw new Error("Artist search is temporarily unavailable. Please try again.");
      if (requestId.current === id) setResults(data.artists);
    } catch {
      if (requestId.current === id) setError("Artist search is temporarily unavailable. Please try again.");
    } finally {
      if (requestId.current === id) setPending(false);
    }
  }

  function clearSearch() {
    requestId.current++;
    setResults(null);
    setError("");
    setSearchedQuery("");
    setQuery("");
    setPending(false);
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
        {(query || results !== null || error) && (
          <button className="btn secondary" type="button" onClick={clearSearch}>
            Clear
          </button>
        )}
      </form>
      <div aria-live="polite">
        {error && <p role="alert" className={styles.searchMessage}>{error}</p>}
        {results !== null && (
          results.length === 0
            ? <p className={styles.searchMessage}>No artists matched “{searchedQuery}”. Try another name or username.</p>
            : (
              <>
              <p className={styles.searchMessage}>Results for “{searchedQuery}”</p>
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
              </>
          )
        )}
      </div>
    </div>
  );
}
