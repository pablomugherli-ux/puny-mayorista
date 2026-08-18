"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import ProgressRing from "@/components/ProgressRing";
import { periodoActual, periodoStr } from "@/lib/stats";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const COLORS = ["#7A5C0A", "#B8860B", "#D4AF37", "#E3C878", "#3D2E05", "#C98A2C"];
const TIPO_LABEL: Record<string, string> = {
  monto_ventas: "Monto de ventas", unidades: "Unidades", cobranza: "Cobranza", entregas: "Entregas",
};

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [comprobantes, setComprobantes] = useState<any[]>([]);
  const [ranking, setRanking] = useState<{ nombre: string; unidades: number }[]>([]);
  const [clientesCount, setClientesCount] = useState(0);
  const [leaderboard, setLeaderboard] = useState<{ nombre: string; rol: string; tipo: string; alcanzado: number; meta: number; pct: number }[]>([]);

  const { mes0, anio } = periodoActual();
  const periodoInicio = periodoStr(anio, mes0);

  useEffect(() => {
    (async () => {
      // NOTA PERFORMANCE (revisión paginación admin, ago-2026):
      // `pedidos` y `pedido_items` se traen completos porque alimentan KPIs agregados de TODA la historia
      // (totalLista1/totalLista2 = suma de `total` por lista, pedidos.length = conteo total, estadoCounts =
      // conteo agrupado por estado, ranking de productos). No existe un filtro que reduzca filas sin cambiar
      // esos resultados, y una paginación tipo "cargar más" no tiene sentido para un total: cargar solo la
      // "primera página" daría KPIs incorrectos. Por eso NO se le agrega `.range()` acá. El fix real para que
      // esto no crezca sin límite es mover el agregado al servidor (una función/vista de Postgres que devuelva
      // sum(total)/count(*)/group by estado ya calculados), lo cual excede el alcance de esta tarea de paginación
      // de UI y requeriría una migración de base de datos aparte.
      // `comprobantes` sí se pudo acotar: solo se necesitan saldo_pendiente > 0 para las sumas de deuda
      // (deudaLista1/deudaLista2), ya que los comprobantes saldados suman 0 y no afectan el resultado. Se aplicó
      // `.gt("saldo_pendiente", 0)`, mismo criterio ya usado en cobro-clientes, cobrador, cashflow y AlertasOperativas.
      const [{ data: p }, { data: c }, { data: items }, { count }] = await Promise.all([
        supabase.from("pedidos").select("id, estado, lista, total, fecha, vendedor_id"),
        supabase.from("comprobantes").select("id, lista, total, saldo_pendiente, estado, fecha_vencimiento").gt("saldo_pendiente", 0),
        supabase.from("pedido_items").select("cantidad, producto_id, productos(nombre), pedido_id, pedidos!inner(vendedor_id, fecha)"),
        supabase.from("clientes").select("id", { count: "exact", head: true }).eq("activo", true),
      ]);
      setPedidos(p || []);
      setComprobantes(c || []);
      setClientesCount(count || 0);

      const map = new Map<string, number>();
      (items || []).forEach((it: any) => {
        const nombre = it.productos?.nombre || "—";
        map.set(nombre, (map.get(nombre) || 0) + Number(it.cantidad));
      });
      const rk = Array.from(map.entries())
        .map(([nombre, unidades]) => ({ nombre, unidades }))
        .sort((a, b) => b.unidades - a.unidades)
        .slice(0, 5);
      setRanking(rk);

      // --- Leaderboard de cumplimiento de objetivos del mes ---
      const { data: objetivos } = await supabase
        .from("objetivos_comerciales")
        .select("*, profiles(nombre, role)")
        .eq("periodo", periodoInicio);

      if (objetivos && objetivos.length > 0) {
        const [{ data: cobrosMes }, { data: entregasMes }] = await Promise.all([
          supabase.from("cobros").select("monto, cobrador_id, repartidor_id").gte("fecha", periodoInicio),
          supabase.from("entregas").select("estado, repartidor_id, pedidos!inner(fecha)").gte("pedidos.fecha", periodoInicio),
        ]);

        const ventasPorVendedor = new Map<string, number>();
        const unidadesPorVendedor = new Map<string, number>();
        (p || []).filter((x: any) => x.fecha >= periodoInicio && x.estado !== "rechazado" && x.estado !== "cancelado").forEach((x: any) => {
          if (!x.vendedor_id) return;
          ventasPorVendedor.set(x.vendedor_id, (ventasPorVendedor.get(x.vendedor_id) || 0) + Number(x.total));
        });
        (items || []).forEach((it: any) => {
          const vId = it.pedidos?.vendedor_id;
          if (!vId || !it.pedidos?.fecha || it.pedidos.fecha < periodoInicio) return;
          unidadesPorVendedor.set(vId, (unidadesPorVendedor.get(vId) || 0) + Number(it.cantidad));
        });
        const cobranzaPorCobrador = new Map<string, number>();
        const cobranzaPorEntrega = new Map<string, number>();
        (cobrosMes || []).forEach((c: any) => {
          if (c.cobrador_id) cobranzaPorCobrador.set(c.cobrador_id, (cobranzaPorCobrador.get(c.cobrador_id) || 0) + Number(c.monto));
          if (c.repartidor_id) cobranzaPorEntrega.set(c.repartidor_id, (cobranzaPorEntrega.get(c.repartidor_id) || 0) + Number(c.monto));
        });
        const entregasPorRepartidor = new Map<string, number>();
        (entregasMes || []).forEach((e: any) => {
          if (e.estado === "total" || e.estado === "parcial") entregasPorRepartidor.set(e.repartidor_id, (entregasPorRepartidor.get(e.repartidor_id) || 0) + 1);
        });

        const lb = objetivos.map((o: any) => {
          let alcanzado = 0;
          if (o.tipo_objetivo === "monto_ventas") alcanzado = ventasPorVendedor.get(o.profile_id) || 0;
          else if (o.tipo_objetivo === "unidades") alcanzado = unidadesPorVendedor.get(o.profile_id) || 0;
          else if (o.tipo_objetivo === "cobranza") alcanzado = (cobranzaPorCobrador.get(o.profile_id) || 0) + (cobranzaPorEntrega.get(o.profile_id) || 0);
          else if (o.tipo_objetivo === "entregas") alcanzado = entregasPorRepartidor.get(o.profile_id) || 0;
          const meta = Number(o.meta) || 0;
          return {
            nombre: o.profiles?.nombre || "—", rol: o.profiles?.role || "",
            tipo: TIPO_LABEL[o.tipo_objetivo] || o.tipo_objetivo,
            alcanzado, meta, pct: meta > 0 ? (alcanzado / meta) * 100 : 0,
          };
        }).sort((a, b) => b.pct - a.pct);
        setLeaderboard(lb);
      }

      setLoading(false);
    })();
  }, [periodoInicio]);

  const totalLista1 = pedidos.filter((p) => p.lista === 1).reduce((s, p) => s + Number(p.total), 0);
  const totalLista2 = pedidos.filter((p) => p.lista === 2).reduce((s, p) => s + Number(p.total), 0);
  const deudaLista1 = comprobantes.filter((c) => c.lista === 1).reduce((s, c) => s + Number(c.saldo_pendiente), 0);
  const deudaLista2 = comprobantes.filter((c) => c.lista === 2).reduce((s, c) => s + Number(c.saldo_pendiente), 0);

  const estadoCounts = Object.entries(
    pedidos.reduce((acc: Record<string, number>, p) => {
      acc[p.estado] = (acc[p.estado] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const fmt = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

  return (
    <div>
      <PageHeader title="Dashboard / Business Intelligence" subtitle="KPIs operativos y comerciales en tiempo real" live />
      {loading ? (
        <p className="text-gray-400">Cargando indicadores…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <StatCard label="Clientes activos" value={String(clientesCount)} numericValue={clientesCount} tech />
            <StatCard label="Pedidos totales" value={String(pedidos.length)} numericValue={pedidos.length} tech />
            <StatCard label="Circuito 1 — Oficial/AFIP (Lista 1)" value={fmt(totalLista1)} numericValue={totalLista1} format={fmt} sub="facturable, impacta Libro de IVA" tech />
            <StatCard label="Circuito 2 — Interno (Lista 2)" value={fmt(totalLista2)} numericValue={totalLista2} format={fmt} sub="remitos, no fiscal" />
            <StatCard label="Deuda pendiente Circuito 1" value={fmt(deudaLista1)} numericValue={deudaLista1} format={fmt} />
            <StatCard label="Saldo pendiente Circuito 2" value={fmt(deudaLista2)} numericValue={deudaLista2} format={fmt} />
          </div>

          <div className="card-tech mb-6 flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-white/70">Real Global — Circuito 1 + Circuito 2</div>
              <div className="text-2xl font-bold mt-1">{fmt(totalLista1 + totalLista2)}</div>
              <div className="text-xs text-white/50 mt-1">Control de inventario y flujo de caja real. La separación contable/fiscal se mantiene estricta: solo el Circuito 1 entra al Libro de IVA y a los reportes impositivos.</div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-white/70">Saldo pendiente total</div>
              <div className="text-2xl font-bold mt-1 text-electric">{fmt(deudaLista1 + deudaLista2)}</div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <div className="card">
              <h3 className="text-sm font-semibold text-navy mb-3">Ranking de productos (unidades vendidas)</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={ranking} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" fontSize={11} />
                  <YAxis type="category" dataKey="nombre" width={140} fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="unidades" fill="#B8860B" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <h3 className="text-sm font-semibold text-navy mb-3">Pedidos por estado</h3>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={estadoCounts} dataKey="value" nameKey="name" outerRadius={90} label>
                    {estadoCounts.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-navy">Ranking de cumplimiento de objetivos — {String(mes0 + 1).padStart(2, "0")}/{anio}</h3>
            </div>
            {leaderboard.length === 0 ? (
              <p className="text-xs text-gray-400">Todavía no hay objetivos cargados para este mes (Admin → Objetivos).</p>
            ) : (
              <div className="space-y-2">
                {leaderboard.map((l, i) => (
                  <div key={i} className="flex items-center gap-3 py-1.5 border-b last:border-0 border-gray-100">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? "bg-warning text-white" : i === 1 ? "bg-gray-300 text-navy" : i === 2 ? "bg-amber-200 text-navy" : "bg-gray-100 text-gray-500"}`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-navy truncate">{l.nombre} <span className="text-xs font-normal text-gray-400 capitalize">· {l.rol}</span></div>
                      <div className="text-[11px] text-gray-400">{l.tipo}</div>
                    </div>
                    <ProgressRing pct={l.pct} size={44} stroke={5} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-gray-400 mt-6">
            Los KPIs de kilómetros recorridos vs. efectividad y antigüedad de deuda detallada se amplían en las
            secciones Mapa en Vivo y Cuenta Corriente respectivamente.
          </p>
        </>
      )}
    </div>
  );
}
