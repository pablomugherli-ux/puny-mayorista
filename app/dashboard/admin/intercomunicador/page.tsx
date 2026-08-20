"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";
import { ROLE_LABEL, type UserRole } from "@/lib/types";

const fmtHora = (s: string) => new Date(s).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
const fmtFecha = (s: string) => new Date(s).toLocaleDateString("es-AR");

type Usuario = { id: string; nombre: string; role: UserRole };
type Mensaje = { id: string; emisor_id: string; destinatario_id: string; texto: string; leido: boolean; created_at: string };

// Intercomunicador (Fase G, agosto 2026) — chat interno corporativo 1:1
// entre usuarios de la misma distribuidora. Distinto de PUNY WP, que es
// WhatsApp con clientes externos. Ver PUNY_Especificacion_Maestro_Dueno.docx,
// sección 4.4.d.
export default function Intercomunicador() {
  const { profile } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [noLeidosPorUsuario, setNoLeidosPorUsuario] = useState<Record<string, number>>({});
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  async function cargarUsuarios() {
    if (!profile) return;
    const { data } = await supabase.from("profiles").select("id, nombre, role").neq("id", profile.id).eq("activo", true).order("nombre");
    setUsuarios((data as Usuario[]) || []);

    const { data: pendientes } = await supabase.from("mensajes_internos").select("emisor_id").eq("destinatario_id", profile.id).eq("leido", false);
    const conteo: Record<string, number> = {};
    (pendientes || []).forEach((m: any) => { conteo[m.emisor_id] = (conteo[m.emisor_id] || 0) + 1; });
    setNoLeidosPorUsuario(conteo);
  }
  useEffect(() => { cargarUsuarios(); }, [profile?.id]);

  async function cargarConversacion(otroId: string) {
    if (!profile) return;
    const { data } = await supabase
      .from("mensajes_internos")
      .select("*")
      .or(`and(emisor_id.eq.${profile.id},destinatario_id.eq.${otroId}),and(emisor_id.eq.${otroId},destinatario_id.eq.${profile.id})`)
      .order("created_at", { ascending: true });
    setMensajes((data as Mensaje[]) || []);

    const sinLeer = (data || []).filter((m: any) => m.destinatario_id === profile.id && !m.leido);
    if (sinLeer.length > 0) {
      await supabase.from("mensajes_internos").update({ leido: true }).in("id", sinLeer.map((m: any) => m.id));
      setNoLeidosPorUsuario((prev) => ({ ...prev, [otroId]: 0 }));
    }
    setTimeout(() => finRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  function elegir(id: string) {
    setSeleccionado(id);
    cargarConversacion(id);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !seleccionado || !texto.trim()) return;
    setEnviando(true);
    const { data: u } = await supabase.auth.getUser();
    const { data: p } = await supabase.from("profiles").select("tenant_id").eq("id", u.user?.id).single();
    await supabase.from("mensajes_internos").insert({
      tenant_id: p?.tenant_id, emisor_id: profile.id, destinatario_id: seleccionado, texto: texto.trim(),
    });
    setTexto("");
    await cargarConversacion(seleccionado);
    setEnviando(false);
  }

  const usuarioSel = usuarios.find((u) => u.id === seleccionado);
  const totalNoLeidos = Object.values(noLeidosPorUsuario).reduce((a, b) => a + b, 0);

  return (
    <div>
      <PageHeader title="Intercomunicador" subtitle="Chat interno con el resto del equipo de la distribuidora — no es visible para clientes." />
      {totalNoLeidos > 0 && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">{totalNoLeidos} mensaje{totalNoLeidos === 1 ? "" : "s"} sin leer.</p>}

      <div className="grid md:grid-cols-3 gap-4" style={{ minHeight: 420 }}>
        <div className="card overflow-y-auto" style={{ maxHeight: 520 }}>
          <h3 className="text-sm font-semibold text-navy mb-2">Equipo</h3>
          <ul className="space-y-1">
            {usuarios.map((u) => (
              <li key={u.id}>
                <button
                  className={`w-full text-left px-2 py-2 rounded text-sm flex items-center justify-between ${seleccionado === u.id ? "bg-navy text-white" : "hover:bg-gray-100"}`}
                  onClick={() => elegir(u.id)}
                >
                  <span>
                    {u.nombre}
                    <span className={`block text-[10px] ${seleccionado === u.id ? "text-white/70" : "text-gray-400"}`}>{ROLE_LABEL[u.role]}</span>
                  </span>
                  {noLeidosPorUsuario[u.id] > 0 && (
                    <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5">{noLeidosPorUsuario[u.id]}</span>
                  )}
                </button>
              </li>
            ))}
            {usuarios.length === 0 && <p className="text-xs text-gray-400">Sin otros usuarios activos en la distribuidora.</p>}
          </ul>
        </div>

        <div className="card md:col-span-2 flex flex-col" style={{ maxHeight: 520 }}>
          {!usuarioSel ? (
            <p className="text-gray-400 m-auto">Elegí a alguien del equipo para empezar a chatear.</p>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-navy mb-3 border-b border-gray-100 pb-2">{usuarioSel.nombre}</h3>
              <div className="flex-1 overflow-y-auto space-y-2 mb-3">
                {mensajes.map((m) => (
                  <div key={m.id} className={`flex ${m.emisor_id === profile?.id ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${m.emisor_id === profile?.id ? "bg-navy text-white" : "bg-gray-100 text-gray-800"}`}>
                      <div>{m.texto}</div>
                      <div className={`text-[10px] mt-1 ${m.emisor_id === profile?.id ? "text-white/60" : "text-gray-400"}`}>{fmtFecha(m.created_at)} {fmtHora(m.created_at)}</div>
                    </div>
                  </div>
                ))}
                {mensajes.length === 0 && <p className="text-xs text-gray-400">Todavía no hay mensajes con {usuarioSel.nombre}.</p>}
                <div ref={finRef} />
              </div>
              <form onSubmit={enviar} className="flex gap-2">
                <input className="input flex-1" placeholder="Escribir un mensaje…" value={texto} onChange={(e) => setTexto(e.target.value)} />
                <button className="btn-primary shrink-0" disabled={enviando || !texto.trim()}>Enviar</button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
