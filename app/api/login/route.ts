import { NextRequest, NextResponse } from "next/server";
import { agendaAuthToken, agendaPassword, authCookieName } from "../../../lib/auth";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { password?: string } | null;
  if (body?.password !== agendaPassword()) {
    return NextResponse.json({ error: "Clave incorrecta." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: authCookieName,
    value: await agendaAuthToken(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}

export function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({ name: authCookieName, value: "", path: "/", maxAge: 0 });
  return response;
}
