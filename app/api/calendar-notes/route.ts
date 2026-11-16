import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { calendarNotes } from "../../../db/schema";
import { parseCalendarNote, pabloVacation } from "../../../lib/calendar-notes";

let initialized: Promise<void> | undefined;
function ensureNotes() {
  initialized ??= (async () => {
    const db = getDb();
    await db.execute(sql`CREATE TABLE IF NOT EXISTS calendar_notes (
      id text PRIMARY KEY, title text NOT NULL, start_date text NOT NULL, end_date text NOT NULL,
      category text NOT NULL, deleted boolean NOT NULL DEFAULT false
    )`);
    await db.insert(calendarNotes).values(pabloVacation).onConflictDoNothing();
  })().catch(error => { initialized = undefined; throw error; });
  return initialized;
}

const unavailable = () => Response.json({ error: "No se pudieron sincronizar las notas." }, { status: 500 });
const active = (id: string) => and(eq(calendarNotes.id, id), eq(calendarNotes.deleted, false));

export async function GET() {
  try {
    await ensureNotes();
    const notes = await getDb().select().from(calendarNotes).where(eq(calendarNotes.deleted, false)).orderBy(calendarNotes.start, calendarNotes.id);
    return Response.json({ notes });
  } catch { return unavailable(); }
}

async function save(request: Request, id?: string) {
  const note = parseCalendarNote(await request.json().catch(() => null));
  if (!note) return Response.json({ error: "Revisá el título, las fechas y la categoría." }, { status: 400 });
  try {
    await ensureNotes();
    const db = getDb();
    const [stored] = id
      ? await db.update(calendarNotes).set(note).where(active(id)).returning()
      : await db.insert(calendarNotes).values({ ...note, id: crypto.randomUUID() }).returning();
    return stored ? Response.json({ note: stored }, { status: id ? 200 : 201 }) : missing();
  } catch { return unavailable(); }
}

const missing = () => Response.json({ error: "La nota ya no está disponible." }, { status: 404 });
const noteId = (request: Request) => new URL(request.url).searchParams.get("id");
export const POST = (request: Request) => save(request);
export function PUT(request: Request) {
  const id = noteId(request);
  return id ? save(request, id) : missing();
}
export async function DELETE(request: Request) {
  const id = noteId(request);
  if (!id) return missing();
  try {
    await ensureNotes();
    // Keep a tombstone so initialization never recreates the original vacation note.
    const [note] = await getDb().update(calendarNotes).set({ deleted: true }).where(active(id)).returning({ id: calendarNotes.id });
    return note ? Response.json({ ok: true }) : missing();
  } catch { return unavailable(); }
}
