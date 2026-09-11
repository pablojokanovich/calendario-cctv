import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Falta DATABASE_URL. Creá una base Neon/Postgres y cargá esa variable en Vercel.");
  }
  db ??= drizzle(neon(databaseUrl), { schema });
  return db;
}
