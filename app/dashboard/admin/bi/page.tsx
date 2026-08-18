"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const fmt = (n: number) => Number(n || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const CANAL_LABEL: Record<string, string> = { masivo: "Masivo", mayorista: "Mayorista", cuentas_clave: "Cuentas Clave" };
const CANAL_COLOR: Record<string, string> = { masivo: "#B8860B", mayorista: "#7a1f3d", cuentas_clave: "#2c5f7c" };

function primerDiaMes(offset: number) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d;
}

export default function BIUnificado() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [porCanalMes, setPorCanalMes] = useState<any[]>([]);
  const [totalesCanal, setTotalesCanal] = useState<{ canal: string; total: number; cantidad: number }[]>([]);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      setLoading(true);
      const desde = primerDiaMes(-5);
      const { data: pedidos } = await supabase
        .from("pedidos")
        .select("canal_venta, total, created_at")
        .eq("tenant_id", profile.tenant_id)
        .not("estado", "in", "(rechazado,cancelado)")
        .gte("created_at", desde.toISOString());

      const meses = Array.from({ length: 6 }).map((_, i) => primerDiaMes(-5 + i));
      const claveMes = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const labelMes = (d: Date) => d.toLocaleDateString("es-AR", { month: "short" });

      const porMes: Record<string, any> = {};
      meses.forEach((m) => { porMes[claveMes(m)] = { mes: labelMes(m), masivo: 0, mayorista: 0, cuentas_clave: 0 }; });
      const totales: Record<string, { total: number; cantidad: number }> = { masivo: { total: 0, cantidad: 0 }, mayorista: { total: 0, cantidad: 0 }, cuentas_clave: { total: 0, cantidad: 0 } };

      (pedidos || []).forEach((p: any) => {
        const k = claveMes(new Date(p.created_at));
        const canal = p.canal_venta || "mayorista";
        if (porMes[k]) porMes[k][canal] = (porMes[k][canal] || 0) + Number(p.total || 0);
        if (totales[canal]) { totales[canal].total += Number(p.total || 0); totales[canal].cantidad += 1; }
      });

      setPorCanalMes(Object.values(porMes));
      setTotalesCanal(Object.entries(totales).map(([canal, v]) => ({ canal, ...v })));
      setLoading(false);
    })();
  }, [profile?.tenant_id]);

  const totalGeneral = totalesCanal.reduce((s, c) => s + c.total, 0);

  return (
    <div>
      <PageHeader
        title="PUNY BI — Dashboard Unificado"
        subtitle="Consolida la facturación de los tres canales de venta (Masivo, Mayorista, Cuentas Clave) sobre los mismos datos de pedidos — sin procesos de sincronización aparte."
      />

      {loading ? <p className="text-gray-400">Cargando…</p> : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            {totalesCanal.map((c) => (
              <StatCard key={c.canal} label={`${CANAL_LABEL[c.canal]} — últimos 6 meses`} value={fmt(c.total)} tech={c.canal === "mayorista"} />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="card col-span-2" style={{ height: 320 }}>
              <h3 className="text-sm font-semibold text-navy mb-3">Facturación mensual por canal</h3>
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={porCanalMes}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="mes" />
                  <YAxis tickFormatter={(v) => fmt(v)} width={80} />
                  <Tooltip formatter={(v: any) => fmt(Number(v))} />
                  <Legend formatter={(v) => CANAL_LABEL[v] || v} />
                  <Bar dataKey="masivo" stackId="a" fill={CANAL_COLOR.masivo} />
                  <Bar dataKey="mayorista" stackId="a" fill={CANAL_COLOR.mayorista} />
                  <Bar dataKey="cuentas_clave" stackId="a" fill={CANAL_COLOR.cuentas_clave} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card" style={{ height: 320 }}>
              <h3 className="text-sm font-semibold text-navy mb-3">Participación por canal</h3>
              <ResponsiveContainer width="100%" height="80%">
                <PieChart>
                  <Pie data={totalesCanal} dataKey="total" nameKey="canal" cx="50%" cy="50%" outerRadius={80} label={(e) => CANAL_LABEL[e.canal]}>
                    {totalesCanal.map((c) => <Cell key={c.canal} fill={CANAL_COLOR[c.canal]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmt(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card mt-6 overflow-x-auto">
            <h3 className="text-sm font-semibold text-navy mb-3">Resumen por canal</h3>
            <table className="tbl">
              <thead><tr><th>Canal</th><th>Pedidos</th><th>Facturación</th><th>Ticket promedio</th><th>% del total</th></tr></thead>
              <tbody>
                {totalesCanal.map((c) => (
                  <tr key={c.canal}>
                    <td>{CANAL_LABEL[c.canal]}</td>
                    <td>{c.cantidad}</td>
                    <td>{fmt(c.total)}</td>
                    <td>{fmt(c.cantidad ? c.total / c.cantidad : 0)}</td>
                    <td>{totalGeneral ? ((c.total / totalGeneral) * 100).toFixed(1) : "0"}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
