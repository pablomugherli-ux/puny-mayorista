"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import StatCard from "@/components/StatCard";
import { exportarPDF, exportarExcel } from "@/lib/reportes";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

const fmtMoneda = (n: number) => Number(n || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" });

const KPI_LABEL: Record<string, string> = {
  facturacion_mes: "Facturación del mes",
  cobranza_mes: "Cobranza del mes",
  stock_critico: "Stock crítico (bajo mínimo)",
  pedidos_pendientes: "Pedidos pendientes",
  ticket_promedio: "Ticket promedio",
};
const KPIS_TODOS = Object.keys(KPI_LABEL);

async function tenantId() {
  const { data: u } = await supabase.auth.getUser();
  const { data: p } = await supabase.from("profiles").select("tenant_id").eq("id", u.user?.id).single();
  return p?.tenant_id as string;
}

function rangoMes(fechaRef: Date) {
  const inicio = new Date(fechaRef.getFullYear(), fechaRef.getMonth(), 1);
  const fin = new Date(fechaRef.getFullYear(), fechaRef.getMonth() + 1, 0, 23, 59, 59);
  return { inicio: inicio.toISOString(), fin: fin.toISOString(), label: inicio.toLocaleDateString("es-AR", { month: "long", year: "numeric" }) };
}

export default function DashboardEjecutivo() {
  const [canal, setCanal] = useState("");
  const [mesRef, setMesRef] = useState(new Date().toISOString().slice(0, 7));
  const [kpis, setKpis] = useState<Record<string, number>>({});
  const [comparativa, setComparativa] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [kpisVisibles, setKpisVisibles] = useState<string[]>(KPIS_TODOS);
  const [editandoKpis, setEditandoKpis] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setUserId(u.user?.id || null);
      if (u.user?.id) {
        const { data: pref } = await supabase.from("preferencias_dashboard").select("kpis_visibles").eq("profile_id", u.user.id).maybeSingle();
        if (pref?.kpis_visibles?.length) setKpisVisibles(pref.kpis_visibles);
      }
    })();
  }, []);

  async function cargar() {
    setLoading(true);
    const [y, m] = mesRef.split("-").map(Number);
    const fechaRef = new Date(y, m - 1, 1);
    const rMesActual = rangoMes(fechaRef);
    const rMesAnterior = rangoMes(new Date(y, m - 2, 1));
    const rMesAnioAnterior = rangoMes(new Date(y - 1, m - 1, 1));

    async function facturacionEntre(inicio: string, fin: string) {
      let q = supabase.from("pedidos").select("total, canal_venta").gte("fecha", inicio).lte("fecha", fin);
      if (canal) q = q.eq("canal_venta", canal);
      const { data } = await q;
      return (data || []).reduce((s: number, p: any) => s + Number(p.total || 0), 0);
    }

    const [facturacionMes, facturacionMesAnterior, facturacionAnioAnterior] = await Promise.all([
      facturacionEntre(rMesActual.inicio, rMesActual.fin),
      facturacionEntre(rMesAnterior.inicio, rMesAnterior.fin),
      facturacionEntre(rMesAnioAnterior.inicio, rMesAnioAnterior.fin),
    ]);

    const { data: cobrosMes } = await supabase.from("cobros").select("monto").gte("fecha", rMesActual.inicio).lte("fecha", rMesActual.fin);
    const cobranzaMes = (cobrosMes || []).reduce((s: number, c: any) => s + Number(c.monto || 0), 0);

    const { data: productos } = await supabase.from("productos").select("stock, stock_minimo");
    const stockCritico = (productos || []).filter((p: any) => p.stock_minimo > 0 && Number(p.stock) <= Number(p.stock_minimo)).length;

    const { count: pedidosPendientes } = await supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("estado", "pendiente");

    let qPedidosMes = supabase.from("pedidos").select("total").gte("fecha", rMesActual.inicio).lte("fecha", rMesActual.fin);
    if (canal) qPedidosMes = qPedidosMes.eq("canal_venta", canal);
    const { data: pedidosMesData } = await qPedidosMes;
    const ticketPromedio = pedidosMesData && pedidosMesData.length > 0 ? facturacionMes / pedidosMesData.length : 0;

    setKpis({
      facturacion_mes: facturacionMes,
      cobranza_mes: cobranzaMes,
      stock_critico: stockCritico,
      pedidos_pendientes: pedidosPendientes || 0,
      ticket_promedio: ticketPromedio,
    });

    setComparativa([
      { periodo: rMesAnioAnterior.label, facturacion: facturacionAnioAnterior, tieneDatos: facturacionAnioAnterior > 0 },
      { periodo: rMesAnterior.label, facturacion: facturacionMesAnterior, tieneDatos: facturacionMesAnterior > 0 },
      { periodo: rMesActual.label, facturacion: facturacionMes, tieneDatos: facturacionMes > 0 },
    ]);

    setLoading(false);
  }
  useEffect(() => { cargar(); }, [canal, mesRef]);

  function toggleKpi(k: string) {
    setKpisVisibles((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  }

  async function guardarKpis() {
    if (!userId) return;
    setGuardando(true);
    await supabase.from("preferencias_dashboard").upsert({ profile_id: userId, kpis_visibles: kpisVisibles, actualizado_en: new Date().toISOString() }, { onConflict: "profile_id" });
    setGuardando(false);
    setEditandoKpis(false);
  }

  const sinHistorialSuficiente = comparativa.every((c) => !c.tieneDatos) && !loading;

  function exportarSnapshot(formato: "pdf" | "excel") {
    const columnas = kpisVisibles.map((k) => ({
      header: KPI_LABEL[k],
      key: k,
      formato: (v: number) => (k.includes("facturacion") || k.includes("cobranza") || k.includes("ticket") ? fmtMoneda(v) : String(v)),
    }));
    const fila = [kpis];
    if (formato === "pdf") exportarPDF("Dashboard Ejecutivo — Snapshot", columnas, fila, "dashboard_ejecutivo");
    else exportarExcel("Dashboard Ejecutivo", columnas, fila, "dashboard_ejecutivo");
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4 items-end justify-between">
        <div className="flex gap-3 items-end">
          <div>
            <label className="text-xs text-gray-500">Mes de referencia</label>
            <input className="input" type="month" value={mesRef} onChange={(e) => setMesRef(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-500">Canal</label>
            <select className="input" value={canal} onChange={(e) => setCanal(e.target.value)}>
              <option value="">Todos</option>
              <option value="mayorista">Mayorista</option>
              <option value="masivo">Masivo</option>
              <option value="cuentas_clave">Cuentas Clave</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-xs" onClick={() => setEditandoKpis((v) => !v)}>{editandoKpis ? "Cerrar personalización" : "Personalizar KPIs"}</button>
          <button className="btn-secondary text-xs" onClick={() => exportarSnapshot("pdf")}>Exportar PDF</button>
          <button className="btn-secondary text-xs" onClick={() => exportarSnapshot("excel")}>Exportar Excel</button>
        </div>
      </div>

      {editandoKpis && (
        <div className="card mb-4">
          <h4 className="text-sm font-semibold text-navy mb-2">Qué KPIs mostrar</h4>
          <div className="flex flex-wrap gap-3 mb-3">
            {KPIS_TODOS.map((k) => (
              <label key={k} className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={kpisVisibles.includes(k)} onChange={() => toggleKpi(k)} /> {KPI_LABEL[k]}
              </label>
            ))}
          </div>
          <button className="btn-primary text-xs" onClick={guardarKpis} disabled={guardando}>{guardando ? "Guardando…" : "Guardar preferencia"}</button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-6">
        {kpisVisibles.map((k) => (
          <StatCard
            key={k}
            label={KPI_LABEL[k]}
            value={k.includes("facturacion") || k.includes("cobranza") || k.includes("ticket") ? fmtMoneda(kpis[k] || 0) : String(kpis[k] ?? "—")}
            tech
          />
        ))}
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-navy mb-3">Facturación — mes actual vs. mes anterior vs. mismo mes año anterior</h3>
        {sinHistorialSuficiente ? (
          <p className="text-xs text-gray-400">Datos insuficientes para mostrar el comparativo — hace falta más historial de pedidos.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={comparativa}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => fmtMoneda(Number(v))} />
              <Legend />
              <Bar dataKey="facturacion" name="Facturación" fill="#7A5C0A" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
