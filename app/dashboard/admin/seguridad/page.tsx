"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import Vigilancia from "./Vigilancia";

const ACCION_LABEL: Record<string, string> = {
  crear_pedido: "Pedido creado",
  cambiar_estado_pedido: "Cambio de estado de pedido",
  crear_comprobante: "Comprobante emitido",
  crear_movimiento_proveedor: "Movimiento de proveedor",
  crear_asiento_contable: "Asiento contable generado",
};
const ENTIDAD_LABEL: Record<string, string> = {
  pedidos: "Pedidos",
  comprobantes: "Comprobantes",
  proveedor_movimientos: "Proveedores",
  asientos_contables: "Contabilidad",
};

export default function SeguridadAdmin() {
  const [tab, setTab] = useState<"auditoria" | "vigilancia">("auditoria");
  const [loading, setLoading] = useState(true);
  const [eventos, setEventos] = useState<any[]>([]);
  const [filtroEntidad, setFiltroEntidad] = useState("");
  const [totalHoy, setTotalHoy] = useState(0);
  const [totalAgentesIA, setTotalAgentesIA] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t === "vigilancia") setTab("vigilancia");
  }, []);

  async function load() {
    setLoading(true);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    let q = supabase.from("auditoria_seguridad").select("*, profiles(nombre,email)").order("created_at", { ascending: false }).limit(100);
    if (filtroEntidad) q = q.eq("entidad", filtroEntidad);
    const [{ data: ev }, { count: cHoy }, { count: cAgentes }] = await Promise.all([
      q,
      supabase.from("auditoria_seguridad").select("id", { count: "exact", head: true }).gte("created_at", hoy.toISOString()),
      supabase.from("auditoria_seguridad").select("id", { count: "exact", head: true }).eq("actor_tipo", "sistema"),
    ]);
    setEventos(ev || []);
    setTotalHoy(cHoy || 0);
    setTotalAgentesIA(cAgentes || 0);
    setLoading(false);
  }
  useEffect(() => { load(); }, [filtroEntidad]);

  return (
    <div>
      <PageHeader
        title="PUNY Seguridad"
        subtitle="Auditoría centralizada de acciones sensibles y estado de las guardas de seguridad del sistema. Solo lectura: nadie puede editar ni borrar el registro desde acá."
      />

      <div className="flex gap-2 mb-5 border-b border-gray-200">
        <button onClick={() => setTab("auditoria")} className={`text-sm px-3 py-2 border-b-2 ${tab === "auditoria" ? "border-navy text-navy font-semibold" : "border-transparent text-gray-500"}`}>
          Auditoría
        </button>
        <button onClick={() => setTab("vigilancia")} className={`text-sm px-3 py-2 border-b-2 ${tab === "vigilancia" ? "border-navy text-navy font-semibold" : "border-transparent text-gray-500"}`}>
          Vigilancia (vigiladores/serenos)
        </button>
      </div>

      {tab === "vigilancia" && <Vigilancia />}

      {tab === "auditoria" && (
      <>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Eventos auditados hoy" value={String(totalHoy)} tech />
        <StatCard label="Eventos totales (últimos 100 mostrados)" value={String(eventos.length)} />
        <StatCard label="Generados por agentes/sistema" value={String(totalAgentesIA)} />
      </div>

      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Estado de las guardas de seguridad</h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            <span>RLS multi-tenant en todas las tablas de negocio</span>
            <span className="badge bg-green-100 text-green-700">Activo</span>
          </div>
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            <span>Guardas explícitas anti-bypass en funciones SECURITY DEFINER (auth.uid() is null)</span>
            <span className="badge bg-green-100 text-green-700">Auditado</span>
          </div>
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            <span>Auditoría centralizada de acciones sensibles (pedidos, comprobantes, pagos, asientos)</span>
            <span className="badge bg-green-100 text-green-700">Activo</span>
          </div>
          <div className="flex items-center justify-between border-b border-gray-100 pb-2">
            <span>Autenticación multifactor (MFA)</span>
            <span className="badge bg-amber-100 text-amber-700">Pendiente de activar</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Agente de monitoreo en tiempo real (alertas automáticas de patrones anómalos)</span>
            <span className="badge bg-amber-100 text-amber-700">No implementado todavía</span>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">
          MFA se activa en Supabase Auth (Project Settings → Authentication → Multi-Factor Authentication) — es
          configuración, no requiere cambios de código. El agente de monitoreo está planificado como Fase 7 del roadmap
          de PUNY ECOSYSTEM.
        </p>
      </div>

      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-navy">Registro de auditoría</h3>
          <select className="input max-w-xs" value={filtroEntidad} onChange={(e) => setFiltroEntidad(e.target.value)}>
            <option value="">Todas las entidades</option>
            {Object.entries(ENTIDAD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead><tr><th>Fecha</th><th>Actor</th><th>Acción</th><th>Entidad</th></tr></thead>
            <tbody>
              {eventos.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.created_at).toLocaleString("es-AR")}</td>
                  <td>{e.actor_tipo === "usuario" ? (e.profiles?.nombre || e.profiles?.email || "Usuario") : e.actor_tipo === "agente_ia" ? "Agente IA" : "Sistema"}</td>
                  <td>{ACCION_LABEL[e.accion] || e.accion}</td>
                  <td>{ENTIDAD_LABEL[e.entidad] || e.entidad}</td>
                </tr>
              ))}
              {eventos.length === 0 && <tr><td colSpan={4} className="text-gray-400">Sin eventos registrados todavía.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      </>
      )}
    </div>
  );
}
