"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";
import GoalCard from "@/components/GoalCard";
import AnimatedNumber from "@/components/AnimatedNumber";
import { periodoActual, periodoStr, proyeccionRunRate } from "@/lib/stats";

const TIPO_LABEL: Record<string, string> = {
  monto_ventas: "Monto de ventas",
  unidades: "Unidades vendidas",
  cobranza: "Cobranza",
  entregas: "Entregas realizadas",
  rondas_completadas: "Rondas de vigilancia completadas",
};

const fmtMoneda = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

export default function MisComisiones() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [esquemas, setEsquemas] = useState<any[]>([]);
  const [objetivos, setObjetivos] = useState<any[]>([]);
  const [metricas, setMetricas] = useState({ montoVentas: 0, unidades: 0, cobranza: 0, entregas: 0, rondasCompletadas: 0 });

  const { anio, mes0, diaDelMes, diasDelMes } = periodoActual();
  const periodoInicio = periodoStr(anio, mes0);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const [{ data: esq }, { data: obj }] = await Promise.all([
        supabase.from("esquemas_comision").select("*").eq("rol", profile.role).eq("activo", true),
        supabase.from("objetivos_comerciales").select("*").eq("profile_id", profile.id).eq("periodo", periodoInicio),
      ]);
      setEsquemas(((esq || []) as any[]).filter((e) => e.profile_id === null || e.profile_id === profile.id));
      setObjetivos(obj || []);

      let montoVentas = 0, unidades = 0, cobranza = 0, entregas = 0, rondasCompletadas = 0;

      if (profile.role === "vendedor") {
        const { data: pedidos } = await supabase
          .from("pedidos")
          .select("total, pedido_items(cantidad)")
          .eq("vendedor_id", profile.id)
          .gte("fecha", periodoInicio)
          .not("estado", "in", "(rechazado,cancelado)");
        (pedidos || []).forEach((p: any) => {
          montoVentas += Number(p.total);
          (p.pedido_items || []).forEach((it: any) => (unidades += Number(it.cantidad)));
        });
      }

      if (profile.role === "cobrador" || profile.role === "entrega") {
        const campo = profile.role === "cobrador" ? "cobrador_id" : "repartidor_id";
        const { data: cobros } = await supabase.from("cobros").select("monto").eq(campo, profile.id).gte("fecha", periodoInicio);
        (cobros || []).forEach((c: any) => (cobranza += Number(c.monto)));
      }

      if (profile.role === "entrega") {
        const { data: ents } = await supabase
          .from("entregas")
          .select("estado, pedidos!inner(fecha)")
          .eq("repartidor_id", profile.id)
          .gte("pedidos.fecha", periodoInicio);
        entregas = (ents || []).filter((e: any) => e.estado === "total" || e.estado === "parcial").length;
      }

      if (profile.role === "vigilador") {
        const { data: cks } = await supabase
          .from("checkins_vigilancia")
          .select("punto_control_id, fecha")
          .eq("vigilador_id", profile.id)
          .gte("fecha", periodoInicio);
        // Se cuenta por día calendario con al menos un check-in (una "ronda completada" del día),
        // no por punto de control individual.
        rondasCompletadas = new Set((cks || []).map((c: any) => c.fecha.slice(0, 10))).size;
      }

      setMetricas({ montoVentas, unidades, cobranza, entregas, rondasCompletadas });
      setLoading(false);
    })();
  }, [profile, periodoInicio]);

  function baseDe(tipo: string) {
    if (tipo === "pct_venta") return metricas.montoVentas;
    if (tipo === "pct_cobranza") return metricas.cobranza;
    if (tipo === "fijo_por_entrega") return metricas.entregas;
    if (tipo === "fijo_por_ronda") return metricas.rondasCompletadas;
    return 0;
  }
  function metricaDe(tipoObjetivo: string) {
    if (tipoObjetivo === "monto_ventas") return metricas.montoVentas;
    if (tipoObjetivo === "unidades") return metricas.unidades;
    if (tipoObjetivo === "cobranza") return metricas.cobranza;
    if (tipoObjetivo === "entregas") return metricas.entregas;
    if (tipoObjetivo === "rondas_completadas") return metricas.rondasCompletadas;
    return 0;
  }

  // Especifico por usuario prevalece sobre el general del rol, por tipo.
  const esquemasEfectivos = Object.values(
    esquemas.reduce((acc: Record<string, any>, e) => {
      const prev = acc[e.tipo];
      if (!prev || (e.profile_id && !prev.profile_id)) acc[e.tipo] = e;
      return acc;
    }, {})
  ) as any[];

  const comisionDevengada = esquemasEfectivos.reduce((s, e) => {
    const base = baseDe(e.tipo);
    return s + (e.tipo === "fijo_por_entrega" ? base * Number(e.valor) : base * (Number(e.valor) / 100));
  }, 0);

  const comisionProyectada = proyeccionRunRate(comisionDevengada, diaDelMes, diasDelMes);

  return (
    <div>
      <PageHeader title="Mis Comisiones y Objetivos" subtitle={`Período en curso — día ${diaDelMes} de ${diasDelMes}`} live />

      {loading ? <p className="text-gray-400">Cargando…</p> : (
        <>
          <div className="card-tech mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-white/70">Comisión devengada este mes</div>
              <div className="text-3xl font-bold mt-1"><AnimatedNumber value={comisionDevengada} format={fmtMoneda} /></div>
              <div className="text-xs text-white/50 mt-1">
                Proyección de cierre (ritmo actual): <span className="font-semibold text-electric">{fmtMoneda(comisionProyectada)}</span>
              </div>
            </div>
            {esquemasEfectivos.length === 0 && (
              <p className="text-xs text-white/60 max-w-xs">Todavía no tenés un esquema de comisión configurado. Consultá con tu administrador.</p>
            )}
            <div className="flex gap-4 flex-wrap">
              {esquemasEfectivos.map((e) => (
                <div key={e.id} className="text-center">
                  <div className="text-[10px] text-white/60 uppercase">{e.tipo === "pct_venta" ? "% sobre ventas" : e.tipo === "pct_cobranza" ? "% sobre cobranza" : e.tipo === "fijo_por_ronda" ? "$ por ronda" : "$ por entrega"}</div>
                  <div className="text-lg font-bold text-electric">{e.tipo === "fijo_por_entrega" || e.tipo === "fijo_por_ronda" ? fmtMoneda(e.valor) : `${e.valor}%`}</div>
                </div>
              ))}
            </div>
          </div>

          <h3 className="text-sm font-semibold text-navy mb-3">Objetivos del período</h3>
          {objetivos.length === 0 ? (
            <p className="text-gray-400 text-sm mb-6">No tenés objetivos cargados para este mes.</p>
          ) : (
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              {objetivos.map((o) => {
                const alcanzado = metricaDe(o.tipo_objetivo);
                return (
                  <GoalCard
                    key={o.id}
                    titulo={TIPO_LABEL[o.tipo_objetivo] || o.tipo_objetivo}
                    alcanzado={alcanzado}
                    meta={Number(o.meta)}
                    unidad={o.tipo_objetivo === "monto_ventas" || o.tipo_objetivo === "cobranza" ? "moneda" : "numero"}
                    proyeccion={proyeccionRunRate(alcanzado, diaDelMes, diasDelMes)}
                  />
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card"><div className="text-xs text-gray-500">Ventas del mes</div><div className="text-lg font-bold text-navy">{fmtMoneda(metricas.montoVentas)}</div></div>
            <div className="card"><div className="text-xs text-gray-500">Unidades vendidas</div><div className="text-lg font-bold text-navy">{metricas.unidades}</div></div>
            <div className="card"><div className="text-xs text-gray-500">Cobranza del mes</div><div className="text-lg font-bold text-navy">{fmtMoneda(metricas.cobranza)}</div></div>
            <div className="card"><div className="text-xs text-gray-500">Entregas realizadas</div><div className="text-lg font-bold text-navy">{metricas.entregas}</div></div>
            {profile?.role === "vigilador" && (
              <div className="card"><div className="text-xs text-gray-500">Rondas completadas (días con check-in)</div><div className="text-lg font-bold text-navy">{metricas.rondasCompletadas}</div></div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
