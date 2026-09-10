import { asc } from "drizzle-orm";
import { getDb } from "../../../db";
import { events } from "../../../db/schema";

type Assignment = {
  salon?: string;
  serviceType?: string;
  director?: string;
  cameras?: string;
  wp?: boolean;
  volante?: string;
  vmix?: string;
  vmixType?: string;
  status?: string;
};

type EventPayload = {
  orderNumber?: string;
  eventName?: string;
  location?: string;
  setupDate?: string;
  startDate?: string;
  endDate?: string;
  phase?: string;
  color?: string;
  assignments?: Assignment[];
};

function normalize(payload: EventPayload) {
  const orderNumber = payload.orderNumber?.trim();
  const eventName = payload.eventName?.trim();
  const location = payload.location?.trim();
  const startDate = payload.startDate?.trim();
  const endDate = payload.endDate?.trim();

  if (!orderNumber || !eventName || !location || !startDate || !endDate) {
    throw new Error("Faltan datos obligatorios del evento.");
  }

  return {
    orderNumber,
    eventName,
    location,
    setupDate: payload.setupDate?.trim() || startDate,
    startDate,
    endDate,
    phase: payload.phase || "EVENTO",
    color: payload.color || "#69a0e8",
    assignments: JSON.stringify(payload.assignments?.length ? payload.assignments : []),
    updatedAt: new Date().toISOString(),
  };
}

function parseEvent(row: typeof events.$inferSelect) {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    eventName: row.eventName,
    location: row.location,
    setupDate: row.setupDate,
    startDate: row.startDate,
    endDate: row.endDate,
    phase: row.phase,
    color: row.color,
    assignments: JSON.parse(row.assignments) as Assignment[],
  };
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Error inesperado.";
  const status = message.includes("Faltan datos") ? 400 : 500;
  return Response.json({ error: message }, { status });
}

export async function GET() {
  try {
    const db = getDb();
    const rows = await db.select().from(events).orderBy(asc(events.startDate), asc(events.orderNumber));
    return Response.json({ events: rows.map(parseEvent) });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = normalize((await request.json()) as EventPayload);
    const db = getDb();
    const [event] = await db.insert(events).values(payload).returning();
    return Response.json({ event: parseEvent(event) }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
