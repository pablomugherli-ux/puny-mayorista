"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Logo from "@/components/Logo";

export default function RestablecerPasswordPage() {
  const [listo, setListo] = useState(false);
  const [sesionValida, setSesionValida] = useState(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Supabase procesa automáticamente el token de recuperación que viene en
    // el hash de la URL (#access_token=...&type=recovery) y dispara este
    // evento cuando la sesión temporal de recuperación queda establecida.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        setSesionValida(true);
      }
      setListo(true);
    });

    // Si al cargar ya había una sesión (por ejemplo, la pestaña se recargó
    // después de procesar el hash), también la aceptamos.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSesionValida(true);
      setListo(true);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== password2) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setGuardando(true);
    const { error } = await supabase.auth.updateUser({ password });
    setGuardando(false);
    if (error) {
      setError(error.message);
      return;
    }
    setExito(true);
    setTimeout(() => router.replace("/dashboard"), 1500);
  }

  return (
    <div className="flex items-center justify-center bg-grad-navy px-4 relative overflow-hidden" style={{ minHeight: "calc(100vh - 26px)" }}>
      <div className="w-full max-w-md bg-white rounded-xl shadow-glow-lg p-8 relative animate-in">
        <div className="flex items-center gap-2 mb-1">
          <Logo variant="on-light" size="lg" />
        </div>
        <p className="text-sm text-gray-500 mt-2 mb-6">Definir nueva contraseña</p>

        {!listo && <p className="text-sm text-gray-500">Verificando enlace…</p>}

        {listo && !sesionValida && (
          <p className="text-sm text-red-600">
            Este enlace no es válido o ya expiró. Pedí un nuevo enlace desde
            &quot;¿Olvidaste tu contraseña?&quot; en la pantalla de login.
          </p>
        )}

        {listo && sesionValida && !exito && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-600">Nueva contraseña</label>
              <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={8} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">Repetir contraseña</label>
              <input className="input" value={password2} onChange={(e) => setPassword2(e.target.value)} type="password" required minLength={8} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button className="btn-tech w-full" disabled={guardando} type="submit">
              {guardando ? "Guardando…" : "Guardar contraseña"}
            </button>
          </form>
        )}

        {exito && <p className="text-sm text-green-700">Contraseña actualizada. Ingresando…</p>}
      </div>
    </div>
  );
}
