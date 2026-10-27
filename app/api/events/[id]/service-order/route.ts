import { documentResponse, existingEventId, findDocument, listDocuments } from "../../../../../db/documents";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const id = await existingEventId(context);
    if (!id) return Response.json({ error: "Evento no encontrado." }, { status: 404 });
    const [document] = await listDocuments(id);
    if (new URL(request.url).searchParams.has("download")) {
      const row = document ? await findDocument(id, document.id) : null;
      return row ? documentResponse(row) : Response.json({ error: "El PDF no existe o venció." }, { status: 404 });
    }
    return Response.json({ document: document ? { ...document, updatedAt: document.uploadedAt } : null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Unable to read legacy document", error);
    return Response.json({ error: "No se pudo abrir el documento." }, { status: 500 });
  }
}
export async function PUT() { return Response.json({ error: "Actualizá la página para usar la nueva sección de documentos." }, { status: 409 }); }
export async function DELETE() { return Response.json({ error: "Actualizá la página para administrar los documentos de la ficha." }, { status: 409 }); }
