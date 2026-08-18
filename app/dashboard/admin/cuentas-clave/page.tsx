"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import Link from "next/link";

const PRIORIDAD_BADGE: Record<string, string> = {
  alta: "bg-red-100 text-red-700",
  media: "bg-amber-100 text-amber-700",
  baja: "bg-gray-100 text-gray-600",
};

const fmt = (n: number) => Number(n || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" });

export default function CuentasClaveCRM() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [cuentas, setCuentas] = useState<any[]>([]);
  const [clientesDisponibles, setClientesDisponibles] = useState<any[]>([]);
  const [nuevaCuenta, setNuevaCuenta] = useState({ cliente_id: "", prioridad: "media", proxima_accion: "", fecha_proxima_accion: "" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!profile) return;
    setLoading(true);
    const esDueno = profile.role === "dueno";
    let q = supabase.from("cuentas_clave").select("*, clientes(id, nombre, telefono, limite_credito)").order("fecha_proxima_accion", { ascending: true, nullsFirst: false });
    if (!esDueno) q = q.eq("asesor_id", profile.id);
    const [{ data: cta }, { data: clis }] = await Promise.all([
      q,
      supabase.from("clientes").select("id, nombre").eq("activo", true).order("nombre"),
    ]);
    setCuentas(cta || []);
    setClientesDisponibles(clis || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [profile?.id]);

  async function agregarCuenta(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !nuevaCuenta.cliente_id) return;
    setGuardando(true);
    setError(null);
    const { error: err } = await supabase.from("cuentas_clave").insert({
      tenant_id: profile.tenant_id,
      cliente_id: nuevaCuenta.cliente_id,
      asesor_id: profile.id,
      prioridad: nuevaCuenta.prioridad,
      proxima_accion: nuevaCuenta.proxima_accion || null,
      fecha_proxima_accion: nuevaCuenta.fecha_proxima_accion || null,
    });
    if (err) setError(err.message);
    else setNuevaCuenta({ cliente_id: "", prioridad: "media", proxima_accion: "", fecha_proxima_accion: "" });
    setGuardando(false);
    load();
  }

  async function actualizarCuenta(id: string, campo: string, valor: any) {
    await supabase.from("cuentas_clave").update({ [campo]: valor }).eq("id", id);
    load();
  }

  const vencenHoy = cuentas.filter((c) => c.fecha_proxima_accion && new Date(c.fecha_proxima_accion) <= new Date());

  return (
    <div>
      <PageHeader
        title="Cuentas Clave"
        subtitle="CRM táctico para el seguimiento comercial especializado de cuentas clave, sobre la misma ficha de cliente ya existente."
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Cuentas clave en seguimiento" value={String(cuentas.length)} tech />
        <StatCard label="Prioridad alta" value={String(cuentas.filter((c) => c.prioridad === "alta").length)} />
        <StatCard label="Acciones vencidas o de hoy" value={String(vencenHoy.length)} />
      </div>

      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Agregar cuenta clave</h3>
        <form onSubmit={agregarCuenta} className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <select className="input col-span-2" value={nuevaCuenta.cliente_id} onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, cliente_id: e.target.value })} required>
            <option value="">Elegir cliente…</option>
            {clientesDisponibles.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select className="input" value={nuevaCuenta.prioridad} onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, prioridad: e.target.value })}>
            <option value="alta">Prioridad alta</option>
            <option value="media">Prioridad media</option>
            <option value="baja">Prioridad baja</option>
          </select>
          <input className="input" type="date" value={nuevaCuenta.fecha_proxima_accion} onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, fecha_proxima_accion: e.target.value })} />
          <input className="input col-span-2 md:col-span-3" placeholder="Próxima acción (ej. llamar para renovar acuerdo anual)" value={nuevaCuenta.proxima_accion} onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, proxima_accion: e.target.value })} />
          <button className="btn-primary">Agregar</button>
        </form>
        {error && <p className="text-danger text-xs mt-2">{error}</p>}
      </div>

      <div className="card overflow-x-auto">
        <h3 className="text-sm font-semibold text-navy mb-3">Mi agenda de cuentas clave</h3>
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead><tr><th>Cliente</th><th>Prioridad</th><th>Próxima acción</th><th>Fecha</th><th>Límite de crédito</th><th></th></tr></thead>
            <tbody>
              {cuentas.map((c) => (
                <tr key={c.id}>
                  <td>{c.clientes?.nombre}</td>
                  <td>
                    <select className={`badge border-0 ${PRIORIDAD_BADGE[c.prioridad]}`} value={c.prioridad} onChange={(e) => actualizarCuenta(c.id, "prioridad", e.target.value)}>
                      <option value="alta">Alta</option>
                      <option value="media">Media</option>
                      <option value="baja">Baja</option>
                    </select>
                  </td>
                  <td>{c.proxima_accion || "—"}</td>
                  <td className={c.fecha_proxima_accion && new Date(c.fecha_proxima_accion) <= new Date() ? "text-danger font-medium" : ""}>
                    {c.fecha_proxima_accion ? new Date(c.fecha_proxima_accion).toLocaleDateString("es-AR") : "—"}
                  </td>
                  <td>{c.clientes?.limite_credito ? fmt(c.clientes.limite_credito) : "—"}</td>
                  <td><Link href={`/dashboard/campo/vendedor/cliente?id=${c.clientes?.id}`} className="text-navy text-xs underline">Ver ficha</Link></td>
                </tr>
              ))}
              {cuentas.length === 0 && <tr><td colSpan={6} className="text-gray-400">Sin cuentas clave cargadas todavía.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
