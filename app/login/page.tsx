"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Logo from "@/components/Logo";

const DEMO_USERS = [
  { email: "master@puny.demo", label: "Usuario Maestro (plataforma)" },
  { email: "admin@puny.demo", label: "Dueño (distribuidora)" },
  { email: "supervisor@puny.demo", label: "Supervisor (Informes)" },
  { email: "vendedor@puny.demo", label: "Vendedor" },
  { email: "repartidor@puny.demo", label: "Entrega (logística)" },
  { email: "cobrador@puny.demo", label: "Cobrador" },
  { email: "cliente@puny.demo", label: "Cliente B2B" },
  { email: "masivo@puny.demo", label: "Vendedor Masivo (POS)" },
  { email: "cuentasclave@puny.demo", label: "Asesor de Cuentas Clave" },
  { email: "operadorwp@puny.demo", label: "Operador WhatsApp (WP)" },
  { email: "vigilador@puny.demo", label: "Vigilador / Sereno" },
  { email: "administrador@puny.demo", label: "Administrador / Gerencia" },
  { email: "tesorero@puny.demo", label: "Tesorero" },
  { email: "jefepersonal@puny.demo", label: "Jefe de Personal" },
  { email: "encargadocaja@puny.demo", label: "Encargado de Caja" },
  { email: "cajero@puny.demo", label: "Cajero" },
  { email: "encargadodepositos@puny.demo", label: "Encargado de Depósitos" },
  { email: "encargadologistica@puny.demo", label: "Encargado de Logística" },
  { email: "proveedor@puny.demo", label: "Proveedor (portal)" },
];

export default function LoginPage() {
  const [email, setEmail] = useState("admin@puny.demo");
  const [password, setPassword] = useState("Puny2026!");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const [modoRecuperar, setModoRecuperar] = useState(false);
  const [emailRecuperar, setEmailRecuperar] = useState("");
  const [recuperarEnviado, setRecuperarEnviado] = useState(false);
  const [recuperarError, setRecuperarError] = useState<string | null>(null);
  const [recuperarLoading, setRecuperarLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace("/dashboard");
  }

  async function handleRecuperar(e: React.FormEvent) {
    e.preventDefault();
    setRecuperarError(null);
    setRecuperarLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(emailRecuperar, {
      redirectTo: typeof window !== "undefined" ? `${window.location.origin}/restablecer-password` : undefined,
    });
    setRecuperarLoading(false);
    if (error) {
      setRecuperarError(error.message);
      return;
    }
    setRecuperarEnviado(true);
  }

  if (modoRecuperar) {
    return (
      <div className="flex items-center justify-center bg-grad-navy px-4 relative overflow-hidden" style={{ minHeight: "calc(100vh - 26px)" }}>
        <div className="w-full max-w-md bg-white rounded-xl shadow-glow-lg p-8 relative animate-in">
          <div className="flex items-center gap-2 mb-1">
            <Logo variant="on-light" size="lg" />
          </div>
          <p className="text-sm text-gray-500 mt-2 mb-6">Recuperar contraseña</p>

          {recuperarEnviado ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-700">
                Si el email <strong>{emailRecuperar}</strong> tiene una cuenta, te enviamos un
                enlace para definir una nueva contraseña. Revisá tu bandeja de entrada (y spam).
              </p>
              <button className="btn-tech w-full" type="button" onClick={() => { setModoRecuperar(false); setRecuperarEnviado(false); }}>
                Volver al login
              </button>
            </div>
          ) : (
            <form onSubmit={handleRecuperar} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600">Email</label>
                <input className="input" value={emailRecuperar} onChange={(e) => setEmailRecuperar(e.target.value)} type="email" required />
              </div>
              {recuperarError && <p className="text-sm text-red-600">{recuperarError}</p>}
              <button className="btn-tech w-full" disabled={recuperarLoading} type="submit">
                {recuperarLoading ? "Enviando…" : "Enviar enlace de recuperación"}
              </button>
              <button className="text-xs text-gray-500 w-full text-center" type="button" onClick={() => setModoRecuperar(false)}>
                Volver al login
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center bg-grad-navy px-4 relative overflow-hidden" style={{ minHeight: "calc(100vh - 26px)" }}>
      <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.07) 1px, transparent 1px)", backgroundSize: "36px 36px" }} />
      <div className="w-full max-w-md bg-white rounded-xl shadow-glow-lg p-8 relative animate-in">
        <div className="flex items-center gap-2 mb-1">
          <Logo variant="on-light" size="lg" />
          <span className="live-dot ml-1" />
        </div>
        <p className="text-sm text-gray-500 mt-2 mb-6">Panel de acceso — Backoffice / App de Campo / Portal B2B</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-600">Email</label>
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Contraseña</label>
            <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn-tech w-full" disabled={loading} type="submit">
            {loading ? "Ingresando…" : "Ingresar"}
          </button>
          <button
            className="text-xs text-gray-500 w-full text-center"
            type="button"
            onClick={() => { setModoRecuperar(true); setEmailRecuperar(email); }}
          >
            ¿Olvidaste tu contraseña?
          </button>
        </form>

        <div className="mt-6 border-t pt-4">
          <p className="text-xs text-gray-500 mb-2">Usuarios demo (contraseña: Puny2026!)</p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_USERS.map((u) => (
              <button
                key={u.email}
                className="text-xs text-left border rounded px-2 py-1.5 hover:bg-gray-50"
                onClick={() => {
                  setEmail(u.email);
                  setPassword("Puny2026!");
                }}
                type="button"
              >
                <div className="font-semibold text-navy">{u.label}</div>
                <div className="text-gray-400">{u.email}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
