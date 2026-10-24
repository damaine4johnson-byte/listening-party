"use client";

import { FormEvent, useEffect, useState } from "react";

type Settings = {
  free_tier_ads_enabled: boolean;
  free_tier_ad_title: string;
  free_tier_ad_body: string;
  free_tier_ad_href: string;
  new_room_status: "scheduled" | "live";
};

const defaultSettings: Settings = {
  free_tier_ads_enabled: true,
  free_tier_ad_title: "Host your own first listen",
  free_tier_ad_body: "Create an artist profile and bring your listeners together in a private room.",
  free_tier_ad_href: "/signup",
  new_room_status: "scheduled",
};

export default function AdminPlatformSettings() {
  const [settings, setSettings] = useState(defaultSettings);
  const [notice, setNotice] = useState("Loading platform settings...");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/settings", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load settings.");
        if (!active) return;
        setSettings(result.settings);
        setNotice("");
      })
      .catch((error: unknown) => {
        if (active) setNotice(error instanceof Error ? error.message : "Could not load settings.");
      });
    return () => { active = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freeTierAdsEnabled: settings.free_tier_ads_enabled,
          freeTierAdTitle: settings.free_tier_ad_title,
          freeTierAdBody: settings.free_tier_ad_body,
          freeTierAdHref: settings.free_tier_ad_href,
          newRoomStatus: settings.new_room_status,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save settings.");
      setNotice("Platform settings saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save settings.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="platform-settings-heading">
      <h2 id="platform-settings-heading">Platform settings</h2>
      <form className="panel" onSubmit={save}>
        <div className="field">
          <label>
            <input type="checkbox" checked={settings.free_tier_ads_enabled} onChange={(event) => setSettings((current) => ({ ...current, free_tier_ads_enabled: event.target.checked }))} />
            Enable free-tier house ad
          </label>
        </div>
        <div className="field">
          <label htmlFor="house-ad-title">Ad title</label>
          <input id="house-ad-title" maxLength={100} value={settings.free_tier_ad_title} onChange={(event) => setSettings((current) => ({ ...current, free_tier_ad_title: event.target.value }))} required />
        </div>
        <div className="field">
          <label htmlFor="house-ad-body">Ad copy</label>
          <textarea id="house-ad-body" rows={3} maxLength={400} value={settings.free_tier_ad_body} onChange={(event) => setSettings((current) => ({ ...current, free_tier_ad_body: event.target.value }))} required />
        </div>
        <div className="field">
          <label htmlFor="house-ad-href">Internal link</label>
          <input id="house-ad-href" value={settings.free_tier_ad_href} onChange={(event) => setSettings((current) => ({ ...current, free_tier_ad_href: event.target.value }))} placeholder="/signup" required />
        </div>
        <div className="field">
          <label htmlFor="new-room-status">New room status</label>
          <select id="new-room-status" value={settings.new_room_status} onChange={(event) => setSettings((current) => ({ ...current, new_room_status: event.target.value as Settings["new_room_status"] }))}>
            <option value="scheduled">Scheduled</option>
            <option value="live">Live</option>
          </select>
        </div>
        <button className="btn" type="submit" disabled={pending}>{pending ? "Saving..." : "Save settings"}</button>
        {notice && <p className="small" role="status">{notice}</p>}
      </form>
    </section>
  );
}