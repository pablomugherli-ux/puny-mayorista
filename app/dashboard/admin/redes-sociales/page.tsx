"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";

const PLATAFORMAS = ["instagram", "facebook", "youtube", "linkedin"] as const;
type Plataforma = (typeof PLATAFORMAS)[number];

const PLATAFORMA_LABEL: Record<Plataforma, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  linkedin: "LinkedIn",
};

const PLATAFORMA_DM: Record<Plataforma, boolean> = {
  instagram: true,
  facebook: true,
  youtube: false,
  linkedin: false,
};

type Tab = "cuentas" | "bandeja" | "publicaciones" | "metricas";

export default function RedesSociales() {
  const [tab, setTab] = useState<Tab>("cuentas");
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data: perfil } = await supabase.from("profiles").select("tenant_id").eq("id", u.user?.id).single();
      setTenantId(perfil?.tenant_id || null);
    })();
  }, []);

  return (
    <div>
      <PageHeader
        title="PUNY Redes Sociales"
        subtitle="Cuentas conectadas, bandeja de mensajes (Instagram/Facebook), publicaciones y métricas de Instagram, Facebook, YouTube y LinkedIn."
      />

      <div className="card mb-6 border-l-4 border-amber-400">
        <p className="text-sm text-gray-700">
          <strong>Alcance real de cada plataforma</strong> — no todas ofrecen las mismas funciones vía API pública:
          Instagram y Facebook tienen bandeja de mensajes directos y publicación con imagen. YouTube no tiene mensajería
          comercial (se usan los comentarios de los videos como bandeja) ni publicación de texto (solo subida de video,
          fuera de este panel). LinkedIn tiene publicación de texto y métricas, pero requiere aprobación del Marketing
          Developer Platform de LinkedIn además de las credenciales básicas. Ninguna cuenta funciona hasta conectarla
          en la pestaña "Cuentas" con credenciales reales.
        </p>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {(["cuentas", "bandeja", "publicaciones", "metricas"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded text-sm font-medium ${tab === t ? "bg-navy text-white" : "bg-gray-100 text-gray-600"}`}
          >
            {t === "cuentas" ? "Cuentas" : t === "bandeja" ? "Bandeja (IG/FB)" : t === "publicaciones" ? "Publicaciones" : "Métricas"}
          </button>
        ))}
      </div>

      {tab === "cuentas" && <TabCuentas tenantId={tenantId} />}
      {tab === "bandeja" && <TabBandeja />}
      {tab === "publicaciones" && <TabPublicaciones tenantId={tenantId} />}
      {tab === "metricas" && <TabMetricas />}
    </div>
  );
}

function TabCuentas({ tenantId }: { tenantId: string | null }) {
  const [cuentas, setCuentas] = useState<Record<string, any>>({});
  const [editando, setEditando] = useState<Record<string, any>>({});
  const [guardando, setGuardando] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("redes_sociales_cuentas").select("*");
    const porPlataforma: Record<string, any> = {};
    (data || []).forEach((c) => (porPlataforma[c.plataforma] = c));
    setCuentas(porPlataforma);
  }
  useEffect(() => { load(); }, []);

  function campo(p: Plataforma, key: string, valor: string) {
    setEditando((prev) => ({ ...prev, [p]: { ...(prev[p] || cuentas[p] || {}), [key]: valor } }));
  }

  async function guardar(p: Plataforma) {
    if (!tenantId) return;
    setGuardando(p);
    const base = { ...(cuentas[p] || {}), ...(editando[p] || {}) };
    await supabase.from("redes_sociales_cuentas").upsert(
      {
        tenant_id: tenantId,
        plataforma: p,
        cuenta_externa_id: base.cuenta_externa_id || null,
        nombre_cuenta: base.nombre_cuenta || null,
        access_token: base.access_token || null,
        token_secundario: base.token_secundario || null,
        conectada: !!base.access_token && !!base.cuenta_externa_id,
        conectada_en: new Date().toISOString(),
      },
      { onConflict: "tenant_id,plataforma" },
    );
    setGuardando(null);
    setEditando((prev) => ({ ...prev, [p]: undefined }));
    load();
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {PLATAFORMAS.map((p) => {
        const c = { ...(cuentas[p] || {}), ...(editando[p] || {}) };
        return (
          <div key={p} className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-navy">{PLATAFORMA_LABEL[p]}</h3>
              <span className={`badge ${c.conectada ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {c.conectada ? "Conectada" : "No conectada"}
              </span>
            </div>
            {!PLATAFORMA_DM[p] && (
              <p className="text-xs text-amber-700 mb-2">
                {p === "youtube" ? "Sin bandeja de mensajería directa — se usan comentarios de video." : "Requiere aprobación del Marketing Developer Platform de LinkedIn."}
              </p>
            )}
            <div className="space-y-2">
              <input
                className="input w-full text-sm"
                placeholder={p === "youtube" ? "ID del canal" : p === "linkedin" ? "ID de organización" : "ID de página / cuenta"}
                value={c.cuenta_externa_id || ""}
                onChange={(e) => campo(p, "cuenta_externa_id", e.target.value)}
              />
              <input
                className="input w-full text-sm"
                placeholder="Nombre de la cuenta (referencia)"
                value={c.nombre_cuenta || ""}
                onChange={(e) => campo(p, "nombre_cuenta", e.target.value)}
              />
              <input
                className="input w-full text-sm"
                type="password"
                placeholder="Access token"
                value={c.access_token || ""}
                onChange={(e) => campo(p, "access_token", e.target.value)}
              />
              <button className="btn-primary text-sm w-full" disabled={guardando === p} onClick={() => guardar(p)}>
                {guardando === p ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TabBandeja() {
  const [conversaciones, setConversaciones] = useState<any[]>([]);
  const [seleccionada, setSeleccionada] = useState<any>(null);
  const [mensajes, setMensajes] = useState<any[]>([]);
  const [nuevoMensaje, setNuevoMensaje] = useState("");
  const [sincronizando, setSincronizando] = useState(false);

  async function load() {
    const { data } = await supabase.from("conversaciones_sociales").select("*, clientes(nombre)").order("created_at", { ascending: false });
    setConversaciones(data || []);
  }
  useEffect(() => { load(); }, []);

  async function abrir(c: any) {
    setSeleccionada(c);
    const { data } = await supabase.from("mensajes_sociales").select("*").eq("conversacion_id", c.id).order("created_at");
    setMensajes(data || []);
  }

  async function enviarManual() {
    if (!seleccionada || !nuevoMensaje.trim()) return;
    await supabase.from("mensajes_sociales").insert({ conversacion_id: seleccionada.id, direccion: "saliente", contenido: nuevoMensaje });
    setNuevoMensaje("");
    abrir(seleccionada);
  }

  async function sincronizarComentariosYouTube() {
    setSincronizando(true);
    await supabase.functions.invoke("youtube-comentarios-sync", { method: "POST" });
    setSincronizando(false);
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button className="btn-secondary text-xs" disabled={sincronizando} onClick={sincronizarComentariosYouTube}>
          {sincronizando ? "Sincronizando…" : "Sincronizar comentarios de YouTube"}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-4" style={{ minHeight: 420 }}>
        <div className="card overflow-y-auto" style={{ maxHeight: 500 }}>
          <h3 className="text-sm font-semibold text-navy mb-3">Conversaciones (Instagram / Facebook)</h3>
          <div className="space-y-1">
            {conversaciones.map((c) => (
              <button
                key={c.id}
                onClick={() => abrir(c)}
                className={`w-full text-left px-2 py-2 rounded text-sm ${seleccionada?.id === c.id ? "bg-gray-100" : "hover:bg-gray-50"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.clientes?.nombre || c.nombre_contacto || c.external_user_id}</span>
                  <span className="badge bg-gray-100 text-gray-600">{PLATAFORMA_LABEL[c.plataforma as Plataforma]}</span>
                </div>
                <div className="text-xs text-gray-400">{c.estado}</div>
              </button>
            ))}
            {conversaciones.length === 0 && <p className="text-gray-400 text-xs">Sin conversaciones todavía.</p>}
          </div>
        </div>

        <div className="card col-span-2 flex flex-col" style={{ maxHeight: 500 }}>
          {!seleccionada ? (
            <p className="text-gray-400 text-sm">Elegí una conversación para verla.</p>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-navy mb-3">{seleccionada.clientes?.nombre || seleccionada.external_user_id}</h3>
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
                <button className="btn-primary text-sm" onClick={enviarManual}>Enviar</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TabPublicaciones({ tenantId }: { tenantId: string | null }) {
  const [publicaciones, setPublicaciones] = useState<any[]>([]);
  const [contenido, setContenido] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [plataformasSel, setPlataformasSel] = useState<Plataforma[]>([]);
  const [programadaPara, setProgramadaPara] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [publicando, setPublicando] = useState(false);

  async function load() {
    const { data } = await supabase.from("publicaciones_redes").select("*").order("created_at", { ascending: false });
    setPublicaciones(data || []);
  }
  useEffect(() => { load(); }, []);

  function togglePlataforma(p: Plataforma) {
    setPlataformasSel((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function crear() {
    if (!tenantId || !contenido.trim() || plataformasSel.length === 0) return;
    setGuardando(true);
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("publicaciones_redes").insert({
      tenant_id: tenantId,
      contenido,
      media_urls: mediaUrl ? [mediaUrl] : [],
      plataformas: plataformasSel,
      estado: "programada",
      programada_para: programadaPara ? new Date(programadaPara).toISOString() : null,
      creado_por: u.user?.id,
    });
    setContenido("");
    setMediaUrl("");
    setPlataformasSel([]);
    setProgramadaPara("");
    setGuardando(false);
    load();
  }

  async function publicarPendientes() {
    setPublicando(true);
    await supabase.functions.invoke("redes-sociales-publicador", { method: "POST" });
    setPublicando(false);
    load();
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="card">
        <h3 className="text-sm font-semibold text-navy mb-3">Nueva publicación</h3>
        <textarea className="input w-full text-sm mb-2" rows={4} placeholder="Contenido…" value={contenido} onChange={(e) => setContenido(e.target.value)} />
        <input className="input w-full text-sm mb-2" placeholder="URL de imagen (requerida para Instagram)" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} />
        <div className="flex flex-wrap gap-2 mb-2">
          {PLATAFORMAS.map((p) => (
            <label key={p} className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={plataformasSel.includes(p)} onChange={() => togglePlataforma(p)} />
              {PLATAFORMA_LABEL[p]}
            </label>
          ))}
        </div>
        <input className="input w-full text-sm mb-2" type="datetime-local" value={programadaPara} onChange={(e) => setProgramadaPara(e.target.value)} />
        <button className="btn-primary text-sm w-full" disabled={guardando} onClick={crear}>
          {guardando ? "Guardando…" : "Programar / guardar"}
        </button>
      </div>

      <div className="card col-span-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-navy">Publicaciones</h3>
          <button className="btn-secondary text-xs" disabled={publicando} onClick={publicarPendientes}>
            {publicando ? "Publicando…" : "Publicar pendientes ahora"}
          </button>
        </div>
        <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 460 }}>
          {publicaciones.map((p) => (
            <div key={p.id} className="border rounded p-2 text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="badge bg-gray-100 text-gray-600">{p.estado}</span>
                <span className="text-xs text-gray-400">{(p.plataformas || []).map((x: string) => PLATAFORMA_LABEL[x as Plataforma]).join(", ")}</span>
              </div>
              <p className="text-gray-700">{p.contenido}</p>
              {p.resultado && (
                <pre className="text-[10px] text-gray-400 mt-1 whitespace-pre-wrap">{JSON.stringify(p.resultado, null, 0)}</pre>
              )}
            </div>
          ))}
          {publicaciones.length === 0 && <p className="text-gray-400 text-xs">Sin publicaciones todavía.</p>}
        </div>
      </div>
    </div>
  );
}

function TabMetricas() {
  const [metricas, setMetricas] = useState<any[]>([]);
  const [sincronizando, setSincronizando] = useState(false);

  async function load() {
    const { data } = await supabase.from("redes_sociales_metricas").select("*").order("fecha", { ascending: false }).limit(100);
    setMetricas(data || []);
  }
  useEffect(() => { load(); }, []);

  async function sincronizar() {
    setSincronizando(true);
    await supabase.functions.invoke("redes-sociales-metricas-sync", { method: "POST" });
    setSincronizando(false);
    load();
  }

  const ultimaPorPlataforma: Record<string, any> = {};
  metricas.forEach((m) => {
    if (!ultimaPorPlataforma[m.plataforma]) ultimaPorPlataforma[m.plataforma] = m;
  });

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button className="btn-secondary text-xs" disabled={sincronizando} onClick={sincronizar}>
          {sincronizando ? "Sincronizando…" : "Sincronizar métricas ahora"}
        </button>
      </div>
      <div className="grid grid-cols-4 gap-4 mb-6">
        {PLATAFORMAS.map((p) => (
          <StatCard
            key={p}
            label={`${PLATAFORMA_LABEL[p]} — seguidores`}
            value={ultimaPorPlataforma[p]?.seguidores != null ? String(ultimaPorPlataforma[p].seguidores) : "—"}
          />
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2">Fecha</th>
              <th>Plataforma</th>
              <th>Seguidores</th>
              <th>Alcance</th>
              <th>Engagement</th>
            </tr>
          </thead>
          <tbody>
            {metricas.map((m) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="py-1.5">{m.fecha}</td>
                <td>{PLATAFORMA_LABEL[m.plataforma as Plataforma]}</td>
                <td>{m.seguidores ?? "—"}</td>
                <td>{m.alcance ?? "—"}</td>
                <td>{m.engagement ?? "—"}</td>
              </tr>
            ))}
            {metricas.length === 0 && (
              <tr><td colSpan={5} className="text-gray-400 text-xs py-3">Sin métricas sincronizadas todavía.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
