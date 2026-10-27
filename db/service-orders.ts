import { sql } from "drizzle-orm";
import { getDb } from "./index";

let initialized: Promise<unknown> | null = null;

export function ensureServiceOrderTable() {
  initialized ??= getDb().execute(sql`CREATE TABLE IF NOT EXISTS event_service_orders (
    event_id integer PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
    name text NOT NULL,
    size integer NOT NULL CHECK (size > 0 AND size <= 3145728),
    content text NOT NULL,
    updated_at text NOT NULL
  )`).catch(error => { initialized = null; throw error; });
  return initialized;
}
