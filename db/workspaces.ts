import { sql } from "drizzle-orm";
import { getDb } from "./index";
let initialized: Promise<unknown> | null = null;
export function ensureWorkspaces() {
  initialized ??= getDb().execute(sql`CREATE TABLE IF NOT EXISTS event_workspaces (
    event_id integer PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    state text NOT NULL, updated_at text NOT NULL
  )`).catch(error => { initialized = null; throw error; });
  return initialized;
}
