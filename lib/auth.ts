export const authCookieName = "agenda_cctv_auth";

export function agendaPassword() {
  return process.env.AGENDA_PASSWORD || "cr2026";
}

export async function agendaAuthToken() {
  const input = new TextEncoder().encode(`agenda-cctv:${agendaPassword()}`);
  const hash = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}
