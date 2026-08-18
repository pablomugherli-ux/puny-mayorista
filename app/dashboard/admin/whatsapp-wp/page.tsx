"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";

const ESTADO_BADGE: Record<string, string> = {
  abierta: "bg-amber-100 text-amber-700",
  derivada: "bg-blue-100 text-blue-700",
  cerrada: "bg-gray-100 text-gray-600",
};

export default function WhatsAppWP() {
  const [loading, setLoading] = useState(true);
  const [conversaciones, setConversaciones] = useState<any[]>([]);
  const [seleccionada, setSeleccionada] = useState<any>(null);
  const [mensajes, setMensajes] = useState<any[]>([]);
  const [nuevoMensaje, setNuevoMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [configurado, setConfigurado] = useState<boolean | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("conversaciones_whatsapp").select("*, clientes(nombre)").order("updated_at", { ascending: false });
    setConversaciones(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function abrirConversacion(c: any) {
    setSeleccionada(c);
    const { data } = await supabase.from("mensajes_whatsapp").select("*").eq("conversacion_id", c.id).order("created_at");
    setMensajes(data || []);
  }

  async function derivar(canal: "masivo" | "mayorista" | "cuentas_clave") {
    if (!seleccionada) return;
    await supabase.from("conversaciones_whatsapp").update({ estado: "derivada", canal_detectado: canal }).eq("id", seleccionada.id);
    load();
    setSeleccionada({ ...seleccionada, estado: "derivada", canal_detectado: canal });
  }

  async function enviarManual() {
    if (!seleccionada || !nuevoMensaje.trim()) return;
    setEnviando(true);
    const { data: u } = await supabase.auth.getUser();
    const { data: perfil } = await supabase.from("profiles").select("tenant_id").eq("id", u.user?.id).single();
    await supabase.from("mensajes_whatsapp").insert({
      conversacion_id: seleccionada.id, tenant_id: perfil?.tenant_id, direccion: "saliente", tipo: "texto", contenido: nuevoMensaje,
    });
    setNuevoMensaje("");
    setEnviando(false);
    abrirConversacion(seleccionada);
  }

  return (
    <div>
      <PageHeader
        title="PUNY WP — Gateway de WhatsApp"
        subtitle="Bandeja centralizada de conversaciones entrantes por WhatsApp, con derivación al canal correspondiente (Masivo, Mayorista o Cuentas Clave)."
      />

      <div className="card mb-6 border-l-4 border-amber-400">
        <p className="text-sm text-gray-700">
          La recepción real de mensajes de WhatsApp Business requiere activar el webhook con las credenciales de Meta
          (WhatsApp Business Cloud API) — es un secret a configurar del lado de Supabase, no un cambio de código. Sin esa
          configuración, esta bandeja queda vacía o solo muestra lo que se cargue manualmente para pruebas.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Conversaciones abiertas" value={String(conversaciones.filter((c) => c.estado === "abierta").length)} tech />
        <StatCard label="Derivadas" value={String(conversaciones.filter((c) => c.estado === "derivada").length)} />
        <StatCard label="Total" value={String(conversaciones.length)} />
      </div>

      <div className="grid grid-cols-3 gap-4" style={{ minHeight: 420 }}>
        <div className="card overflow-y-auto" style={{ maxHeight: 500 }}>
          <h3 className="text-sm font-semibold text-navy mb-3">Conversaciones</h3>
          {loading ? <p className="text-gray-400 text-sm">Cargando…</p> : (
            <div className="space-y-1">
              {conversaciones.map((c) => (
                <button
                  key={c.id}
                  onClick={() => abrirConversacion(c)}
                  className={`w-full text-left px-2 py-2 rounded text-sm ${seleccionada?.id === c.id ? "bg-gray-100" : "hover:bg-gray-50"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{c.clientes?.nombre || c.telefono}</span>
                    <span className={`badge ${ESTADO_BADGE[c.estado]}`}>{c.estado}</span>
                  </div>
                  <div className="text-xs text-gray-400">{c.telefono}</div>
                </button>
              ))}
              {conversaciones.length === 0 && <p className="text-gray-400 text-xs">Sin conversaciones todavía.</p>}
            </div>
          )}
        </div>

        <div className="card col-span-2 flex flex-col" style={{ maxHeight: 500 }}>
          {!seleccionada ? (
            <p className="text-gray-400 text-sm">Elegí una conversación para verla.</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-navy">{seleccionada.clientes?.nombre || seleccionada.telefono}</h3>
                <div className="flex gap-1">
                  <button className="btn-secondary text-xs" onClick={() => derivar("masivo")}>Derivar a Masivo</button>
                  <button className="btn-secondary text-xs" onClick={() => derivar("mayorista")}>Derivar a Mayorista</button>
                  <button className="btn-secondary text-xs" onClick={() => derivar("cuentas_clave")}>Derivar a Cuentas Clave</button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 mb-3">
                {mensajes.map((m) => (
                  <div key={m.id} className={`max-w-[70%] px-3 py-2 rounded text-sm ${m.direccion === "entrante" ? "bg-gray-100" : "bg-navy text-white ml-auto"}`}>
                    {m.contenido}
                    {m.agente_ia && <div className="text-[10px] opacity-70 mt-1">Respondido por agente IA</div>}
                  </div>
                ))}
                {mensajes.length === 0 && <p className="text-gray-400 text-xs">Sin mensajes.</p>}
              </div>
              <div className="flex gap-2">
                <input className="input flex-1" placeholder="Escribir respuesta manual…" value={nuevoMensaje} onChange={(e) => setNuevoMensaje(e.target.value)} />
                <button className="btn-primary text-sm" disabled={enviando} onClick={enviarManual}>Enviar</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
