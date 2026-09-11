"use client";

import { FormEvent, useMemo, useState } from "react";
import { CalendarDays, LockKeyhole } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const nextUrl = useMemo(() => {
    if (typeof window === "undefined") return "/";
    return new URLSearchParams(window.location.search).get("next") || "/";
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "No se pudo ingresar.");
      window.location.href = nextUrl.startsWith("/") ? nextUrl : "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo ingresar.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="login-shell">
    <form className="login-card" onSubmit={submit}>
      <div className="login-brand"><span><CalendarDays size={24} /></span><div><p>Congress Rental</p><h1>Agenda CCTV</h1></div></div>
      <label>Clave de acceso
        <div className="login-input"><LockKeyhole size={18} /><input autoFocus type="password" value={password} onChange={event => setPassword(event.target.value)} /></div>
      </label>
      {error && <div className="login-error" role="alert">{error}</div>}
      <button type="submit" className="primary" disabled={loading || !password.trim()}>{loading ? "Ingresando..." : "Ingresar"}</button>
    </form>
  </main>;
}
