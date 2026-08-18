"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { invocarFuncion } from "@/lib/invocarFuncion";
import PageHeader from "@/components/PageHeader";

const SECRETOS_REQUERIDOS = [
  "WHATSAPP_TOKEN", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_APP_SECRET", "ANTHROPIC_API_KEY",
];

const ETIQUETA_AUTOR: Record<string, string> = { cliente: "Cliente", ia: "Agente IA", humano: "Vos (humano)" };

export default function WhatsappIAAdmin() {
  const [config, setConfig] = useState<any>(null);
  const [conversaciones, setConversaciones] = useState<any[]>([]);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<any[]>([]);
  const [respuesta, setRespuesta] = useState("");
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [envioMsg, setEnvioMsg] = useState<string | null>(null);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    const { data: perfil } = await supabase.from("profiles").select("tenant_id").eq("id", u.user?.id).single();
    let { data: cfg } = await supabase.from("whatsapp_config").select("*").eq("tenant_id", perfil?.tenant_id).maybeSingle();
    if (!cfg && perfil?.tenant_id) {
      const { data: nueva } = await supabase.from("whatsapp_config").insert({ tenant_id: perfil.tenant_id }).select().single();
      cfg = nueva;
    }
    setConfig(cfg);
    const { data: convs } = await supabase
      .from("whatsapp_conversaciones")
      .select("*, clientes(nombre)")
      .order("ultimo_mensaje_at", { ascending: false, nullsFirst: false });
    setConversaciones(convs || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function guardarConfig() {
    setGuardando(true);
    await supabase.from("whatsapp_config").update({
      agente_activo: config.agente_activo,
      instrucciones_agente: config.instrucciones_agente,
      telefono_negocio: config.telefono_negocio || null,
      mensaje_bienvenida: config.mensaje_bienvenida || null,
      updated_at: new Date().toISOString(),
    }).eq("tenant_id", config.tenant_id);
    setGuardando(false);
    load();
  }

  async function guardarCredenciales() {
    setGuardando(true);
    await supabase.from("whatsapp_config").update({
      whatsapp_token: config.whatsapp_token || null,
      whatsapp_verify_token: config.whatsapp_verify_token || null,
      whatsapp_app_secret: config.whatsapp_app_secret || null,
      waba_id: config.waba_id || null,
      creditos_disponibles: config.creditos_disponibles === "" ? null : Number(config.creditos_disponibles),
      updated_at: new Date().toISOString(),
    }).eq("tenant_id", config.tenant_id);
    setGuardando(false);
    load();
  }

  function agregarPlantilla() {
    const plantillas = [...(config.plantillas_mensaje || []), { nombre: "", contenido: "" }];
    setConfig({ ...config, plantillas_mensaje: plantillas });
  }
  function actualizarPlantilla(i: number, campo: "nombre" | "contenido", valor: string) {
    const plantillas = [...(config.plantillas_mensaje || [])];
    plantillas[i] = { ...plantillas[i], [campo]: valor };
    setConfig({ ...config, plantillas_mensaje: plantillas });
  }
  function quitarPlantilla(i: number) {
    setConfig({ ...config, plantillas_mensaje: (config.plantillas_mensaje || []).filter((_: any, idx: number) => idx !== i) });
  }
  async function guardarPlantillas() {
    setGuardando(true);
    await supabase.from("whatsapp_config").update({ plantillas_mensaje: config.plantillas_mensaje || [] }).eq("tenant_id", config.tenant_id);
    setGuardando(false);
    load();
  }

  async function abrirConversacion(id: string) {
    setSeleccionada(id);
    const { data } = await supabase.from("whatsapp_mensajes").select("*").eq("conversacion_id", id).order("created_at");
    setMensajes(data || []);
  }

  async function tomarControlYResponder() {
    if (!seleccionada || !respuesta.trim()) return;
    setEnvioMsg(null);
    const res = await invocarFuncion("whatsapp-agent", { conversacion_id: seleccionada, texto: respuesta }, { "x-manual-send": "true" });
    if (res.ok) {
      setRespuesta("");
      setEnvioMsg("Respuesta enviada.");
      abrirConversacion(seleccionada);
    } else {
      setEnvioMsg(res.motivo || "No se pudo enviar (¿está cargado WHATSAPP_TOKEN y el número de negocio configurado?).");
    }
  }

  if (loading) return <p className="text-gray-400">Cargando…</p>;

  const configurado = !!config?.telefono_negocio;

  return (
    <div>
      <PageHeader title="Agente IA de WhatsApp" subtitle="Atención automática a clientes vía WhatsApp, con supervisión humana" live />

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="card">
          <h3 className="text-sm font-semibold text-navy mb-3">Configuración del agente</h3>
          <label className="flex items-center gap-2 text-sm mb-3">
            <input type="checkbox" checked={!!config?.agente_activo} onChange={(e) => setConfig({ ...config, agente_activo: e.target.checked })} />
            Agente activo
          </label>
          <label className="text-xs text-gray-500">Número de WhatsApp Business (phone_number_id de Meta)</label>
          <input className="input mb-3" value={config?.telefono_negocio || ""} onChange={(e) => setConfig({ ...config, telefono_negocio: e.target.value })} placeholder="Se completa al configurar Meta" />
          <label className="text-xs text-gray-500">Mensaje de bienvenida (opcional)</label>
          <input className="input mb-3" value={config?.mensaje_bienvenida || ""} onChange={(e) => setConfig({ ...config, mensaje_bienvenida: e.target.value })} />
          <label className="text-xs text-gray-500">Instrucciones / personalidad del agente</label>
          <textarea className="input" rows={6} value={config?.instrucciones_agente || ""} onChange={(e) => setConfig({ ...config, instrucciones_agente: e.target.value })} />
          <button className="btn-tech mt-3 text-xs" onClick={guardarConfig} disabled={guardando}>{guardando ? "Guardando…" : "Guardar configuración"}</button>
          <span className={`badge ml-2 ${configurado ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
            {configurado ? "Número configurado" : "Falta configurar número"}
          </span>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-navy mb-1">Tus credenciales de WhatsApp Cloud API</h3>
          <p className="text-xs text-gray-500 mb-3">
            Cargá acá el token y los secretos de TU cuenta de Meta Business — quedan asociados únicamente a tu
            distribuidora, con tus propios créditos de mensajería, separados de cualquier otra. Se guardan
            protegidos: solo vos (Dueño) podés leerlos, ni siquiera el Usuario Maestro de la plataforma.
          </p>
          <label className="text-xs text-gray-500">Token de acceso (WHATSAPP_TOKEN)</label>
          <input className="input mb-3" type="password" value={config?.whatsapp_token || ""} onChange={(e) => setConfig({ ...config, whatsapp_token: e.target.value })} placeholder="EAAG..." />
          <label className="text-xs text-gray-500">Verify Token (elegido por vos, debe coincidir con el configurado en Meta)</label>
          <input className="input mb-3" value={config?.whatsapp_verify_token || ""} onChange={(e) => setConfig({ ...config, whatsapp_verify_token: e.target.value })} />
          <label className="text-xs text-gray-500">App Secret (para validar la firma de los webhooks)</label>
          <input className="input mb-3" type="password" value={config?.whatsapp_app_secret || ""} onChange={(e) => setConfig({ ...config, whatsapp_app_secret: e.target.value })} />
          <label className="text-xs text-gray-500">WABA ID (WhatsApp Business Account ID)</label>
          <input className="input mb-3" value={config?.waba_id || ""} onChange={(e) => setConfig({ ...config, waba_id: e.target.value })} />
          <label className="text-xs text-gray-500">Límite de créditos/mensajes por mes (opcional, vacío = sin límite)</label>
          <input className="input mb-3" type="number" min={0} value={config?.creditos_disponibles ?? ""} onChange={(e) => setConfig({ ...config, creditos_disponibles: e.target.value })} />
          <button className="btn-tech text-xs" onClick={guardarCredenciales} disabled={guardando}>{guardando ? "Guardando…" : "Guardar credenciales"}</button>
          <div className="text-xs text-gray-500 mt-3">
            Enviados este mes: <span className="font-semibold">{config?.mensajes_enviados_mes ?? 0}</span>
            {config?.creditos_disponibles != null && <> / {config.creditos_disponibles}</>}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Si no cargás tus propias credenciales, el sistema usa (si están configuradas) las credenciales
            generales de la plataforma como respaldo: {SECRETOS_REQUERIDOS.join(", ")}. La webhook URL a configurar
            en Meta es la misma Edge Function <code className="bg-gray-100 px-1 rounded">whatsapp-agent</code> para
            todas las distribuidoras — Meta la rutea automáticamente por el "Verify Token" y el número de negocio.
          </p>
        </div>
      </div>

      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-navy mb-1">Plantillas de mensaje</h3>
        <p className="text-xs text-gray-500 mb-3">
          Plantillas pre-aprobadas por Meta para iniciar conversaciones fuera de la ventana de 24hs (ej: aviso de
          vencimiento, confirmación de pedido). El nombre debe coincidir exactamente con el aprobado en Meta Business Manager.
        </p>
        {(config?.plantillas_mensaje || []).map((p: any, i: number) => (
          <div key={i} className="flex gap-2 mb-2">
            <input className="input" placeholder="Nombre de la plantilla" value={p.nombre} onChange={(e) => actualizarPlantilla(i, "nombre", e.target.value)} />
            <input className="input flex-1" placeholder="Contenido / variables" value={p.contenido} onChange={(e) => actualizarPlantilla(i, "contenido", e.target.value)} />
            <button className="btn-secondary shrink-0" onClick={() => quitarPlantilla(i)}>Quitar</button>
          </div>
        ))}
        <div className="flex gap-2 mt-2">
          <button className="btn-secondary text-xs" onClick={agregarPlantilla}>+ Agregar plantilla</button>
          <button className="btn-tech text-xs" onClick={guardarPlantillas} disabled={guardando}>{guardando ? "Guardando…" : "Guardar plantillas"}</button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card md:col-span-1 max-h-[520px] overflow-y-auto">
          <h3 className="text-sm font-semibold text-navy mb-3">Conversaciones</h3>
          {conversaciones.length === 0 && <p className="text-xs text-gray-400">Sin conversaciones registradas todavía.</p>}
          <div className="space-y-1">
            {conversaciones.map((c) => (
              <button key={c.id} onClick={() => abrirConversacion(c.id)}
                className={`w-full text-left px-2 py-2 rounded text-xs ${seleccionada === c.id ? "bg-navy text-white" : "hover:bg-gray-50"}`}>
                <div className="font-semibold">{c.clientes?.nombre || c.numero_telefono}</div>
                <div className={seleccionada === c.id ? "text-white/60" : "text-gray-400"}>
                  {c.agente_activo ? "IA activa" : "Control humano"}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="card md:col-span-2">
          <h3 className="text-sm font-semibold text-navy mb-3">Conversación</h3>
          {!seleccionada ? <p className="text-xs text-gray-400">Elegí una conversación de la lista.</p> : (
            <>
              <div className="space-y-2 max-h-80 overflow-y-auto mb-3">
                {mensajes.map((m) => (
                  <div key={m.id} className={`text-xs p-2 rounded max-w-[80%] ${m.autor === "cliente" ? "bg-gray-100" : m.autor === "ia" ? "bg-blue-50 ml-auto" : "bg-green-50 ml-auto"}`}>
                    <div className="font-semibold text-[10px] uppercase text-gray-400">{ETIQUETA_AUTOR[m.autor] || m.autor}</div>
                    {m.contenido}
                  </div>
                ))}
                {mensajes.length === 0 && <p className="text-xs text-gray-400">Sin mensajes.</p>}
              </div>
              <div className="flex gap-2">
                <input className="input" placeholder="Tomar el control y responder manualmente…" value={respuesta} onChange={(e) => setRespuesta(e.target.value)} />
                <button className="btn-primary text-xs shrink-0" onClick={tomarControlYResponder}>Enviar</button>
              </div>
              {envioMsg && <p className="text-xs text-gray-500 mt-2">{envioMsg}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
