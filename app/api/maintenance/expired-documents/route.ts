import { purgeExpiredDocuments } from "../../../../db/documents";

export const runtime = "nodejs";
export async function GET(request: Request) {
  if (process.env.CRON_SECRET && request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return Response.json({ error: "No autorizado." }, { status: 401 });
  try {
    // This idempotent endpoint only removes expired files and never returns private metadata.
    await purgeExpiredDocuments();
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Expired document cleanup failed", error);
    return Response.json({ error: "No se pudo completar la limpieza." }, { status: 500 });
  }
}
