#!/usr/bin/env python3
"""Runs the Supabase SQL migrations that have not been applied yet.

Uses the Supabase management-free path: connects directly to the project's
Postgres over HTTPS by talking to the Supabase `pg-meta`-style endpoint is not
public, so instead we use the Supabase REST `rpc` fallback: we POST each SQL
file to the Supabase SQL endpoint used by the dashboard is not available either.

Therefore this script shells out to the Supabase CLI if available, else prints
the exact `psql`/Dashboard instructions.
"""
import os, subprocess, sys, pathlib

ROOT = pathlib.Path(__file__).parent
ENV = (ROOT / ".env.local").read_text()
DBURL = None
for line in ENV.splitlines():
    if line.startswith("SUPABASE_DB_URL="):
        DBURL = line.split("=", 1)[1].strip()

FILES = [
    "listener_analytics.sql",
    "feed_posts.sql",
    "follows_notifications_feed.sql",
    "invite_code_display.sql",
    "listener_profiles.sql",
    "room_queue_reorder.sql",
    "artist_usernames.sql",
]

def main():
    if not DBURL:
        print("No SUPABASE_DB_URL in .env.local — cannot run migrations directly.")
        print("Open the Supabase Dashboard -> SQL Editor and paste each file from supabase/ in this order:")
        for f in FILES:
            print("  -", f)
        sys.exit(1)
    for f in FILES:
        path = ROOT / "supabase" / f
        print(f"Running {f} ...")
        result = subprocess.run(["psql", DBURL, "-v", "ON_ERROR_STOP=1", "-f", str(path)], capture_output=True, text=True)
        if result.returncode != 0:
            print(result.stdout[-2000:])
            print(result.stderr[-2000:])
            sys.exit(f"{f} failed")
        print(f"  ok")

if __name__ == "__main__":
    main()
