"use client";

import { FormEvent, ReactElement, useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import "./admin.css";

type Json = any;
type Role = "owner" | "admin" | "viewer";
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const when = (s?: string | null) => (s ? new Date(s).toLocaleString() : "—");

async function api(path: string, method = "GET", body?: unknown): Promise<Json> {
  const res = await fetch(path, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? "Request failed."), { status: res.status });
  return data;
}

export function AdminDashboard() {
  const [me, setMe] = useState<{ username: string; role: Role } | null | undefined>(undefined);
  const [tab, setTab] = useState("Analytics");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    api("/api/admin/session")
      .then((s) => setMe(s.authenticated ? { username: s.username, role: s.role } : null))
      .catch(() => setMe(null));
  }, []);

  const guard = useCallback(async (fn: () => Promise<void>, success = "") => {
    setError(""); setNote("");
    try { await fn(); setNote(success); } catch (e: any) {
      if (e.status === 401) setMe(null);
      setError(e.message);
    }
  }, []);

  if (me === undefined) return <div className="adm"><div className="wrap">Loading…</div></div>;

  if (!me) {
    const login = (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      void guard(async () => {
        const s = await api("/api/admin/session", "POST", { username: f.get("username"), password: f.get("password") });
        setMe({ username: s.username, role: s.role });
      });
    };
    const googleLogin = async () => {
      if (!supabase) return setError("Supabase is not configured.");
      const { error: e } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/admin/callback`, queryParams: { prompt: "select_account" } },
      });
      if (e) setError("Google sign-in could not be started.");
    };
    return (
      <div className="adm"><div className="wrap login">
        <h1>Admin sign in</h1>
        <form onSubmit={login}>
          <input name="username" placeholder="Username" autoComplete="username" required />
          <input name="password" type="password" placeholder="Password" autoComplete="current-password" required />
          <button className="on" type="submit">Sign in</button>
        </form>
        <button style={{ width: "100%", marginTop: 12 }} onClick={googleLogin}>Sign in with Google</button>
        {error && <p className="err" role="alert">{error}</p>}
      </div></div>
    );
  }

  const canEdit = me.role !== "viewer";
  const tabs = ["Analytics", "Artists", "Rooms", "Payments", "Listeners", "Feed", "Settings", ...(me.role === "owner" ? ["Admins", "Audit log"] : [])];

  return (
    <div className="adm"><div className="wrap">
      <header>
        <h1>Admin</h1>
        <div className="who">
          <NotificationBell />
          {me.username} <span className="badge">{me.role}</span>
          <button onClick={() => guard(async () => { await api("/api/admin/session", "DELETE"); setMe(null); })}>Sign out</button>
        </div>
      </header>
      <nav>
        {tabs.map((t) => <button key={t} className={t === tab ? "on" : ""} onClick={() => { setTab(t); setError(""); setNote(""); }}>{t}</button>)}
      </nav>
      {error && <p className="err" role="alert">{error}</p>}
      {note && <p className="note">{note}</p>}
      {!canEdit && <p className="muted">View-only access: editing is disabled for your role.</p>}

      {tab === "Analytics" && <Analytics guard={guard} />}
      {tab === "Feed" && <FeedAdmin guard={guard} canEdit={canEdit} />}
      {tab === "Artists" && <Artists guard={guard} canEdit={canEdit} />}
      {tab === "Rooms" && <Rooms guard={guard} canEdit={canEdit} />}
      {tab === "Payments" && (
        <PagedTable section="payments" guard={guard} placeholder="Search by payer name"
          head={["Date", "Type", "From", "Amount", "Status"]}
          row={(p) => [when(p.created_at), p.kind, p.display_name ?? "—", money(p.amount_cents), p.status]} rowKey={(p) => p.order_id} />
      )}
      {tab === "Listeners" && (
        <PagedTable section="listeners" guard={guard} placeholder="Search by listener name"
          head={["Joined", "Listener", "Room"]}
          row={(l) => [when(l.joined_at), l.display_name, l.room_title ?? l.room_id]} rowKey={(l) => `${l.room_id}${l.member_id}`} />
      )}
      {tab === "Settings" && <Settings guard={guard} canEdit={canEdit} />}
      {tab === "Admins" && <Admins guard={guard} />}
      {tab === "Audit log" && (
        <PagedTable path="/api/admin/audit" guard={guard}
          head={["When", "Admin", "Action", "Target", "Details"]}
          row={(a) => [when(a.created_at), a.admin_username, a.action, a.target ?? "—", a.details ? JSON.stringify(a.details) : "—"]} rowKey={(a) => a.id} />
      )}
    </div></div>
  );
}

type Guard = (fn: () => Promise<void>, success?: string) => Promise<void>;

const SEEN_KEY = "adm-notifications-seen";
const ICONS = { artist: "🎤", room: "🎧", payment: "💰" } as const;

function NotificationBell() {
  const [items, setItems] = useState<{ id: string; type: keyof typeof ICONS; text: string; at: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState(0);

  useEffect(() => {
    setSeenAt(Number(window.localStorage.getItem(SEEN_KEY)) || 0);
    let active = true;
    async function load() {
      try {
        const result = await api("/api/admin/notifications");
        if (active) setItems(result.notifications ?? []);
      } catch { /* keep the previous list */ }
    }
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const unread = items.filter((item) => new Date(item.at).getTime() > seenAt).length;
  function toggle() {
    if (!open) return setOpen(true);
    const now = Date.now();
    window.localStorage.setItem(SEEN_KEY, String(now));
    setSeenAt(now);
    setOpen(false);
  }

  return (
    <span className="bell">
      <button type="button" aria-label={`Notifications${unread ? `, ${unread} new` : ""}`} onClick={toggle}>
        🔔{unread > 0 && <span className="bell-count">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          {items.length === 0 && <p className="muted">No recent activity.</p>}
          {items.map((item) => (
            <div key={item.id} className={new Date(item.at).getTime() > seenAt ? "new" : ""}>
              <span>{ICONS[item.type]} {item.text}</span>
              <small>{when(item.at)}</small>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

function FeedAdmin({ guard, canEdit }: { guard: Guard; canEdit: boolean }) {
  const [posts, setPosts] = useState<Json[]>([]);
  const [kind, setKind] = useState("update");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [author, setAuthor] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [comments, setComments] = useState<Json[]>([]);
  const load = useCallback(() => guard(async () => {
    setPosts((await api("/api/admin/feed")).posts);
    setComments((await api("/api/admin/feed/comments")).comments ?? []);
  }), [guard]);
  useEffect(() => { void load(); }, [load]);
  return (
    <div>
      <div className="card grid" style={{ maxWidth: 640, marginBottom: 16 }}>
        <h2>Post to the Listening Room feed</h2>
        <select value={kind} disabled={!canEdit} onChange={(e) => setKind(e.target.value)}>
          <option value="update">Website update</option>
          <option value="testimonial">Testimonial</option>
          <option value="info">Information</option>
        </select>
        <input value={title} maxLength={120} disabled={!canEdit} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <textarea value={body} maxLength={1500} disabled={!canEdit} onChange={(e) => setBody(e.target.value)} placeholder="Text" />
        <label className="muted">Photo or video (optional, up to 50 MB)
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" disabled={!canEdit}
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); }} />
        </label>
        {kind === "testimonial" && <input value={author} maxLength={80} disabled={!canEdit} onChange={(e) => setAuthor(e.target.value)} placeholder="Who said it" />}
        <button disabled={!canEdit || !title.trim() || !body.trim()} onClick={() => guard(async () => {
          let mediaPath: string | null = null;
          if (file) {
            const t = await api("/api/admin/feed/upload", "POST", { type: file.type, size: file.size });
            const form = new FormData();
            form.append("cacheControl", "3600");
            form.append("", file);
            const up = await fetch(t.signedUrl, { method: "PUT", headers: { "x-upsert": "false" }, body: form });
            if (!up.ok) throw new Error("Upload failed. Try again.");
            mediaPath = t.path;
          }
          await api("/api/admin/feed", "POST", { kind, title, body, author: kind === "testimonial" ? author : "", mediaPath });
          setTitle(""); setBody(""); setAuthor(""); setFile(null);
          setPosts((await api("/api/admin/feed")).posts);
        }, "Posted to the feed.")}>Publish</button>
      </div>
      {posts.map((p) => (
        <div className="card grid" key={p.id} style={{ marginBottom: 8 }}>
          <div><strong>{p.title}</strong> <span className="muted">{p.kind} · {when(p.created_at)}</span></div>
          <div>{p.body}</div>
          {p.mediaUrl && (p.media_type === "video"
            ? <video src={p.mediaUrl} controls preload="metadata" style={{ maxWidth: "100%", maxHeight: 260 }} />
            : <img src={p.mediaUrl} alt="" style={{ maxWidth: "100%", maxHeight: 260 }} />)}
          <button className="danger" disabled={!canEdit} onClick={() => guard(async () => {
            await api("/api/admin/feed", "DELETE", { id: p.id });
            setPosts((cur) => cur.filter((x) => x.id !== p.id));
          }, "Post deleted.")}>Delete</button>
        </div>
      ))}
      <h3>Recent comments</h3>
      {comments.length === 0 && <p className="muted">No comments yet.</p>}
      {comments.map((c) => (
        <div className="card row" key={c.id} style={{ marginBottom: 8, justifyContent: "space-between" }}>
          <span><strong>{c.author_name}</strong> <span className="muted">{when(c.created_at)}</span><br />{c.body}</span>
          <button className="danger" disabled={!canEdit} onClick={() => guard(async () => {
            await api("/api/admin/feed/comments", "DELETE", { id: c.id });
            setComments((cur) => cur.filter((x) => x.id !== c.id));
          }, "Comment deleted.")}>Delete</button>
        </div>
      ))}
    </div>
  );
}

function Analytics({ guard }: { guard: Guard }) {
  const [o, setO] = useState<Json>(null);
  useEffect(() => { void guard(async () => setO(await api("/api/admin/overview"))); }, [guard]);
  if (!o) return null;
  const max = Math.max(1, ...o.daily.map((d: Json) => d.visits));
  const stats: [string, string | number][] = [
    ["Artists", o.totals.artists], ["Suspended", o.totals.suspendedArtists], ["Rooms", o.totals.rooms],
    ["Live now", o.totals.liveRooms], ["Listeners", o.totals.listeners], ["Room visits", o.totals.roomVisits],
    ["Paid orders", o.totals.paidOrders], ["Revenue (30d)", money(o.revenueLast30DaysCents)],
    ["Unpaid artist earnings", money(o.totals.unpaidArtistEarningsCents)],
  ];
  return (
    <section>
      <div className="stats">{stats.map(([k, v]) => <div key={k} className="card stat"><small>{k}</small><div>{v}</div></div>)}</div>
      <h2>Visits, last 30 days</h2>
      <div className="card">
        <div className="chart">{o.daily.map((d: Json) => <span key={d.date} title={`${d.date}: ${d.visits} visits, ${money(d.revenueCents)}`} style={{ height: `${(d.visits / max) * 100}%` }} />)}</div>
        <div className="muted">Hover a bar for visits and revenue per day.</div>
      </div>
      <h2>Revenue by type</h2>
      <div className="stats">{Object.entries(o.revenueByKind).map(([k, v]) => <div key={k} className="card stat"><small>{k}</small><div>{money(v as number)}</div></div>)}</div>
    </section>
  );
}

function Pager({ page, total, size, onPage }: { page: number; total: number; size: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="pager">
      <span>{total} total</span>
      <button disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
      <span>Page {page} of {pages}</span>
      <button disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}

function SearchBar({ placeholder, onSearch }: { placeholder: string; onSearch: (q: string) => void }) {
  const [v, setV] = useState("");
  return (
    <form className="bar" onSubmit={(e) => { e.preventDefault(); onSearch(v); }}>
      <input className="grow" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} />
      <button type="submit">Search</button>
    </form>
  );
}

function usePaged(guard: Guard, path: string, reload = 0) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [data, setData] = useState<Json>(null);
  const sep = path.includes("?") ? "&" : "?";
  useEffect(() => {
    void guard(async () => setData(await api(`${path}${sep}page=${page}&q=${encodeURIComponent(q)}`)));
  }, [guard, path, sep, page, q, reload]);
  return { data, page, setPage, search: (v: string) => { setPage(1); setQ(v); } };
}

function Table({ head, rows }: { head: string[]; rows: (string | number | ReactElement)[][] }) {
  return (
    <div className="tablewrap"><table>
      <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
    </table></div>
  );
}

function PagedTable({ section, path, guard, head, row, rowKey, placeholder }: {
  section?: string; path?: string; guard: Guard; head: string[]; placeholder?: string;
  row: (r: Json) => (string | number)[]; rowKey: (r: Json) => string;
}) {
  const { data, page, setPage, search } = usePaged(guard, path ?? `/api/admin/reports?section=${section}`);
  void rowKey;
  return (
    <section>
      {placeholder && <SearchBar placeholder={placeholder} onSearch={search} />}
      {data && <>
        <Table head={head} rows={data.rows.map(row)} />
        <Pager page={page} total={data.total} size={data.pageSize} onPage={setPage} />
      </>}
    </section>
  );
}

function Rooms({ guard, canEdit }: { guard: Guard; canEdit: boolean }) {
  const [reload, setReload] = useState(0);
  const { data, page, setPage, search } = usePaged(guard, "/api/admin/reports?section=rooms", reload);
  const setStatus = (id: string, status: string) =>
    guard(async () => { await api("/api/admin/reports", "PATCH", { roomId: id, status }); setReload((n) => n + 1); }, "Room updated.");
  return (
    <section>
      <SearchBar placeholder="Search by room title" onSearch={search} />
      {data && <>
        <Table head={["Title", "Status", "Fee", "Max", "Created", ""]} rows={data.rows.map((r: Json) => [
          r.title, r.status, money(r.entry_fee_cents), r.max_listeners, when(r.created_at),
          <span className="row" key={r.id}>
            {r.status !== "ended"
              ? <button className="danger" disabled={!canEdit} onClick={() => confirm(`End room "${r.title}"?`) && setStatus(r.id, "ended")}>End</button>
              : <button disabled={!canEdit} onClick={() => setStatus(r.id, "scheduled")}>Reopen</button>}
          </span>,
        ])} />
        <Pager page={page} total={data.total} size={data.pageSize} onPage={setPage} />
      </>}
    </section>
  );
}

function Artists({ guard, canEdit }: { guard: Guard; canEdit: boolean }) {
  const [artists, setArtists] = useState<Json[]>([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const load = useCallback(() => guard(async () => setArtists((await api("/api/admin/artists")).artists)), [guard]);
  useEffect(() => { void load(); }, [load]);
  const save = (hostId: string, change: Json) =>
    guard(async () => { await api("/api/admin/artists", "PATCH", { hostId, ...change }); await load(); }, "Artist updated.");

  const size = 10;
  const needle = q.toLowerCase();
  const list = artists.filter((a) => !needle || `${a.profile?.display_name ?? ""} ${a.account_identity}`.toLowerCase().includes(needle));
  return (
    <section>
      <div className="bar"><input className="grow" placeholder="Filter artists" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
      {list.slice((page - 1) * size, page * size).map((a) => <ArtistRow key={a.host_id} a={a} canEdit={canEdit} onSave={(c) => save(a.host_id, c)} />)}
      <Pager page={page} total={list.length} size={size} onPage={setPage} />
    </section>
  );
}

function ArtistRow({ a, canEdit, onSave }: { a: Json; canEdit: boolean; onSave: (c: Json) => void }) {
  const [name, setName] = useState<string>(a.profile?.display_name ?? "");
  const [bio, setBio] = useState<string>(a.profile?.bio ?? "");
  const off = !canEdit || !a.profile;
  return (
    <div className="card grid">
      <div><strong>{a.profile?.display_name || a.account_identity}</strong>{" "}
        <span className="muted">{a.auth_provider} · {a.roomCount} rooms · joined {new Date(a.created_at).toLocaleDateString()} · {a.account_status}</span></div>
      <input value={name} maxLength={80} disabled={off} onChange={(e) => setName(e.target.value)} placeholder="Display name" />
      <textarea value={bio} maxLength={400} disabled={off} onChange={(e) => setBio(e.target.value)} placeholder="Bio" />
      <div className="row">
        <button disabled={off} onClick={() => onSave({ displayName: name, bio })}>Save profile</button>
        <select value={a.profile?.plan_tier ?? "free"} disabled={off} onChange={(e) => onSave({ planTier: e.target.value })}>
          {["free", "tier2", "tier3", "tier4"].map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={a.profile?.subscription_status ?? "active"} disabled={off} onChange={(e) => onSave({ subscriptionStatus: e.target.value })}>
          {["active", "pending", "canceled"].map((p) => <option key={p}>{p}</option>)}
        </select>
        <button className={a.account_status === "active" ? "danger" : ""} disabled={!canEdit}
          onClick={() => onSave({ accountStatus: a.account_status === "active" ? "suspended" : "active" })}>
          {a.account_status === "active" ? "Suspend" : "Reactivate"}
        </button>
      </div>
    </div>
  );
}

function AboutPhoto({ guard, canEdit }: { guard: Guard; canEdit: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { void guard(async () => setUrl((await api("/api/admin/about-photo")).url)); }, [guard]);
  const upload = (file?: File) => {
    if (!file) return;
    void guard(async () => {
      if (file.size > 10 * 1024 * 1024) throw new Error("Image must be 10 MB or smaller.");
      const t = await api("/api/admin/about-photo", "POST", { type: file.type, size: file.size });
      const body = new FormData();
      body.append("cacheControl", "3600");
      body.append("", file);
      const up = await fetch(t.signedUrl, { method: "PUT", headers: { "x-upsert": "true" }, body });
      if (!up.ok) throw new Error("Upload failed. Try again.");
      setUrl((await api("/api/admin/about-photo", "PUT")).url);
    }, "About photo updated.");
  };
  return (
    <div className="card grid" style={{ maxWidth: 560, marginBottom: 16 }}>
      <b>About page photo</b>
      {url ? <img src={url} alt="About page founder" style={{ width: 150, aspectRatio: "4 / 5", objectFit: "cover" }} /> : <span className="muted">No photo yet.</span>}
      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={!canEdit} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
      <span className="muted">JPEG, PNG or WebP, up to 10 MB.</span>
      {url && <button type="button" disabled={!canEdit} onClick={() => void guard(async () => { await api("/api/admin/about-photo", "DELETE"); setUrl(null); }, "About photo removed.")}>Remove photo</button>}
    </div>
  );
}

function Settings({ guard, canEdit }: { guard: Guard; canEdit: boolean }) {
  const [s, setS] = useState<Json>(null);
  useEffect(() => { void guard(async () => setS((await api("/api/admin/settings")).settings)); }, [guard]);
  if (!s) return null;
  return (
    <>
    <AboutPhoto guard={guard} canEdit={canEdit} />
    <form className="card grid" style={{ maxWidth: 560 }} onSubmit={(e) => { e.preventDefault(); void guard(async () => setS((await api("/api/admin/settings", "PATCH", s)).settings), "Settings saved."); }}>
      <label><input type="checkbox" disabled={!canEdit} checked={s.free_tier_ads_enabled} onChange={(e) => setS({ ...s, free_tier_ads_enabled: e.target.checked })} /> Show ads to free-tier artists</label>
      <input value={s.free_tier_ad_title} disabled={!canEdit} maxLength={120} onChange={(e) => setS({ ...s, free_tier_ad_title: e.target.value })} placeholder="Ad title" />
      <textarea value={s.free_tier_ad_body} disabled={!canEdit} maxLength={400} onChange={(e) => setS({ ...s, free_tier_ad_body: e.target.value })} placeholder="Ad body" />
      <input value={s.free_tier_ad_href} disabled={!canEdit} maxLength={300} onChange={(e) => setS({ ...s, free_tier_ad_href: e.target.value })} placeholder="Ad link" />
      <label>New rooms start as{" "}
        <select value={s.new_room_status} disabled={!canEdit} onChange={(e) => setS({ ...s, new_room_status: e.target.value })}>
          <option value="scheduled">scheduled</option><option value="live">live</option>
        </select>
      </label>
      <button className="on" type="submit" disabled={!canEdit}>Save settings</button>
    </form>
    </>
  );
}

function Admins({ guard }: { guard: Guard }) {
  const [list, setList] = useState<Json[]>([]);
  const [boot, setBoot] = useState<string | null>(null);
  const load = useCallback(() => guard(async () => {
    const d = await api("/api/admin/admins");
    setList(d.admins); setBoot(d.bootstrapOwner);
  }), [guard]);
  useEffect(() => { void load(); }, [load]);

  const patch = (id: string, change: Json, msg: string) =>
    guard(async () => { await api("/api/admin/admins", "PATCH", { id, ...change }); await load(); }, msg);
  const create = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    void guard(async () => {
      await api("/api/admin/admins", "POST", { username: f.get("username"), password: f.get("password"), role: f.get("role") });
      form.reset(); await load();
    }, "Admin created.");
  };

  return (
    <section>
      <p className="muted">Roles: <b>viewer</b> read-only · <b>admin</b> can edit artists, rooms and settings · <b>owner</b> can also manage admins and view the audit log.{boot && <> Bootstrap owner: <b>{boot}</b> (set in environment).</>}</p>
      <form className="card row" onSubmit={create}>
        <input name="username" placeholder="Username or Google email" required minLength={3} maxLength={40} autoComplete="off" />
        <input name="password" type="password" placeholder="Password (blank for Google email)" minLength={12} autoComplete="new-password" />
        <select name="role" defaultValue="viewer"><option>viewer</option><option>admin</option><option>owner</option></select>
        <button className="on" type="submit">Add admin</button>
      </form>
      <Table head={["Username", "Role", "Status", "Last login", ""]} rows={list.map((a) => [
        a.username,
        <select key="r" value={a.role} onChange={(e) => patch(a.id, { role: e.target.value }, "Role updated.")}>
          <option>viewer</option><option>admin</option><option>owner</option>
        </select>,
        a.disabled ? "disabled" : "active",
        when(a.last_login_at),
        <span className="row" key="b">
          <button onClick={() => patch(a.id, { disabled: !a.disabled }, a.disabled ? "Admin enabled." : "Admin disabled.")}>{a.disabled ? "Enable" : "Disable"}</button>
          <button onClick={() => { const p = prompt(`New password for ${a.username} (12+ chars)`); if (p) void patch(a.id, { password: p }, "Password reset."); }}>Reset password</button>
          <button className="danger" onClick={() => {
            if (window.confirm(`Remove admin ${a.username}? They will lose all admin access.`)) {
              void guard(async () => { await api("/api/admin/admins", "DELETE", { id: a.id }); await load(); }, "Admin removed.");
            }
          }}>Remove</button>
        </span>,
      ])} />
    </section>
  );
}
