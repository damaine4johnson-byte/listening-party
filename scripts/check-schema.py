#!/usr/bin/env python3
"""Diagnostics-only helper: verify whether artist_usernames exists and who holds a name.
Uses the service key against PostgREST so it needs no DB URL."""
import json, os, sys, urllib.request, pathlib

ROOT = pathlib.Path(__file__).parent.parent
ENV = {}
for line in (ROOT / ".env.local").read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        k, v = line.split("=", 1)
        ENV[k.strip()] = v.strip()

URL = ENV.get("NEXT_PUBLIC_SUPABASE_URL") or ENV.get("NEXT_PUBLIC_APP_SUPABASE_URL")
KEY = ENV.get("SUPABASE_SECRET_KEY") or ENV.get("SUPABASE_SERVICE_ROLE_KEY")
if not URL or not KEY:
    sys.exit("Missing Supabase URL/key in .env.local")

def get(path, accept_profile=None):
    req = urllib.request.Request(f"{URL}{path}", headers={
        "apikey": KEY, "Authorization": f"Bearer {KEY}",
        **({"Accept-Profile": accept_profile} if accept_profile else {}),
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def main():
    name = sys.argv[1].lower() if len(sys.argv) > 1 else None
    # 1. Full table list from the OpenAPI schema cache.
    req = urllib.request.Request(f"{URL}/rest/v1/", headers={
        "apikey": KEY, "Authorization": f"Bearer {KEY}", "Accept": "application/openapi+json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        tables = sorted(json.load(r).get("definitions", {}).keys())
    has_table = "artist_usernames" in tables
    print(f"artist_usernames visible in schema cache: {has_table}")
    if not has_table:
        print("Run supabase/artist_usernames.sql in the Supabase dashboard SQL editor, then reload the schema cache.")
        print("Tip: after creating a table in SQL editor it appears immediately; if it does not, wait ~30s or restart the API (Dashboard > Settings > API).")
        return
    rows = get("/rest/v1/artist_usernames?select=*&limit=100")
    print(f"claimed usernames ({len(rows)}):")
    for row in rows:
        print(f"  @{row['username']} -> host {row['host_id'][:12]}...")
    if name:
        match = [r for r in rows if r["username"] == name]
        print(f"'{name}' claimed: {bool(match)}")

if __name__ == "__main__":
    main()
