import { sql } from "drizzle-orm";
import { getDb } from "./index";

let initialized: Promise<unknown> | null = null;
export function ensureEventMeals() {
  initialized ??= getDb().execute(sql`ALTER TABLE events
    ADD COLUMN IF NOT EXISTS meal_dates text NOT NULL DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS meal_sheet_loaded boolean NOT NULL DEFAULT false
  `).catch(error => { initialized = null; throw error; });
  return initialized;
}
