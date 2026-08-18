"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const MESES = 6;
const fmt = (n: number) => Number(n || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" });

async function tenantId() {
  const { data: u } = await supabase.auth.getUser();
  const { data: p } = await supabase.from("profiles").select("tenant_id").eq("id", u.user?.id).single();
  return p?.tenant_id as string;
}

function primerDiaMes(offset: number) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return d;
}
function claveMes(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function labelMes(d: Date) {
  return d.toLocaleDateString("es-AR", { month: "short", year: "2-digit" });
}

export default function CashFlowAdmin() {
  const [loading, setLoading] = useState(true);
  const [saldoActual, setSaldoActual] = useState(0);
  const [cobranzas, setCobranzas] = useState<Record<string, number>>({});
  const [pagosProveedores, setPagosProveedores] = useState<Record<string, number>>({});
  const [sueldoEstimado, setSueldoEstimado] = useState(0);
  const [ivaNetoEstimado, setIvaNetoEstimado] = useState(0);
  const [saldoCajaHoy, setSaldoCajaHoy] = useState(0);
  const [saldoBancos, setSaldoBancos] = useState(0);

  const [escenarios, setEscenarios] = useState<any[]>([]);
  const [escenarioId, setEscenarioId] = useState<string>("");
  const [conceptos, setConceptos] = useState<any[]>([]);
  const [nuevoEscenario, setNuevoEscenario] = useState({ nombre: "", descripcion: "" });
  const [nuevoConcepto, setNuevoConcepto] = useState({ nombre: "", tipo: "egreso" as "ingreso" | "egreso", periodo: claveMes(primerDiaMes(1)), monto: "" });

  const meses = useMemo(() => Array.from({ length: MESES }).map((_, i) => primerDiaMes(i)), []);

  async function loadBase() {
    setLoading(true);
    const hoy = new Date().toISOString().slice(0, 10);
    const hace3Meses = new Date();
    hace3Meses.setMonth(hace3Meses.getMonth() - 3);

    const [
      { data: bancos }, { data: comprobantes }, { data: comprasPend }, { data: itemsOp }, { data: liq },
      { data: cajaHoy }, { data: ivaVentas }, { data: ivaCompras },
    ] = await Promise.all([
      supabase.from("bancos").select("saldo_actual").eq("activo", true),
      supabase.from("comprobantes").select("saldo_pendiente, fecha_vencimiento, fecha").eq("tipo", "factura").eq("lista", 1).gt("saldo_pendiente", 0),
      supabase.from("proveedor_movimientos").select("id, monto, fecha_vencimiento, fecha").eq("tipo", "compra"),
      supabase.from("orden_pago_items").select("proveedor_movimiento_id, monto_aplicado"),
      supabase.from("liquidaciones_sueldo").select("total").eq("estado", "cerrada").order("periodo", { ascending: false }).limit(20),
      supabase.from("cajas_diarias").select("id, monto_apertura, caja_movimientos(tipo, monto)").eq("fecha", hoy).eq("estado", "abierta"),
      supabase.from("comprobantes").select("iva_monto, fecha").eq("tipo", "factura").eq("lista", 1).gte("fecha", hace3Meses.toISOString()),
      supabase.from("proveedor_movimientos").select("iva_monto, fecha").eq("tipo", "compra").gte("fecha", hace3Meses.toISOString()),
    ]);

    const totalBancos = (bancos || []).reduce((s: number, b: any) => s + Number(b.saldo_actual || 0), 0);
    const totalCajaHoy = (cajaHoy || []).reduce((s: number, c: any) => {
      const movs = (c.caja_movimientos || []) as any[];
      const neto = movs.reduce((m, mv) => m + (mv.tipo === "ingreso" ? Number(mv.monto) : -Number(mv.monto)), 0);
      return s + Number(c.monto_apertura || 0) + neto;
    }, 0);
    setSaldoBancos(totalBancos);
    setSaldoCajaHoy(totalCajaHoy);
    setSaldoActual(totalBancos + totalCajaHoy);

    const cob: Record<string, number> = {};
    (comprobantes || []).forEach((c: any) => {
      const f = new Date(c.fecha_vencimiento || c.fecha);
      const k = claveMes(f);
      cob[k] = (cob[k] || 0) + Number(c.saldo_pendiente);
    });
    setCobranzas(cob);

    const aplicado: Record<string, number> = {};
    (itemsOp || []).forEach((it: any) => { aplicado[it.proveedor_movimiento_id] = (aplicado[it.proveedor_movimiento_id] || 0) + Number(it.monto_aplicado); });
    const pag: Record<string, number> = {};
    (comprasPend || []).forEach((c: any) => {
      const pendiente = Number(c.monto) - (aplicado[c.id] || 0);
      if (pendiente <= 0.01) return;
      const f = new Date(c.fecha_vencimiento || c.fecha);
      const k = claveMes(f);
      pag[k] = (pag[k] || 0) + pendiente;
    });
    setPagosProveedores(pag);

    const ultimasLiq = (liq || []).slice(0, 5);
    const sueldoProm = ultimasLiq.length ? ultimasLiq.reduce((s: number, l: any) => s + Number(l.total), 0) / ultimasLiq.length : 0;
    setSueldoEstimado(sueldoProm);

    // IVA neto proyectado: promedio mensual de los últimos 3 meses (débito de ventas
    // Lista 1 menos crédito de compras). Es una estimación simplificada — no contempla
    // saldos a favor arrastrados de períodos previos ni percepciones/retenciones de IVA.
    const mesesConDatos = new Set<string>();
    let totalDebito = 0, totalCredito = 0;
    (ivaVentas || []).forEach((c: any) => { totalDebito += Number(c.iva_monto || 0); mesesConDatos.add(claveMes(new Date(c.fecha))); });
    (ivaCompras || []).forEach((c: any) => { totalCredito += Number(c.iva_monto || 0); mesesConDatos.add(claveMes(new Date(c.fecha))); });
    const cantMeses = Math.max(mesesConDatos.size, 1);
    setIvaNetoEstimado((totalDebito - totalCredito) / cantMeses);

    setLoading(false);
  }

  async function loadEscenarios() {
    const { data } = await supabase.from("cashflow_escenarios").select("*").order("created_at");
    setEscenarios(data || []);
  }

  async function loadConceptos(escId: string) {
    if (!escId) { setConceptos([]); return; }
    const { data } = await supabase.from("cashflow_conceptos").select("*").eq("escenario_id", escId).order("periodo");
    setConceptos(data || []);
  }

  useEffect(() => { loadBase(); loadEscenarios(); }, []);
  useEffect(() => { loadConceptos(escenarioId); }, [escenarioId]);

  async function crearEscenario(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevoEscenario.nombre) return;
    const tid = await tenantId();
    const { data } = await supabase.from("cashflow_escenarios").insert({ tenant_id: tid, ...nuevoEscenario }).select().single();
    setNuevoEscenario({ nombre: "", descripcion: "" });
    await loadEscenarios();
    if (data) setEscenarioId(data.id);
  }

  async function agregarConcepto(e: React.FormEvent) {
    e.preventDefault();
    if (!escenarioId || !nuevoConcepto.nombre || !nuevoConcepto.monto) return;
    const tid = await tenantId();
    await supabase.from("cashflow_conceptos").insert({
      tenant_id: tid, escenario_id: escenarioId, nombre: nuevoConcepto.nombre, tipo: nuevoConcepto.tipo,
      periodo: nuevoConcepto.periodo + "-01", monto: Number(nuevoConcepto.monto),
    });
    setNuevoConcepto({ nombre: "", tipo: "egreso", periodo: claveMes(primerDiaMes(1)), monto: "" });
    loadConceptos(escenarioId);
  }

  async function eliminarConcepto(id: string) {
    await supabase.from("cashflow_conceptos").delete().eq("id", id);
    loadConceptos(escenarioId);
  }

  const filas = useMemo(() => {
    let saldo = saldoActual;
    return meses.map((m) => {
      const k = claveMes(m);
      const esMesAguinaldo = m.getMonth() === 5 || m.getMonth() === 11; // junio o diciembre (1ra/2da cuota SAC)
      const aguinaldo = esMesAguinaldo ? sueldoEstimado * 0.5 : 0;
      const ivaAPagar = Math.max(ivaNetoEstimado, 0);
      const ivaAFavor = Math.max(-ivaNetoEstimado, 0);
      const ingresosReales = cobranzas[k] || 0;
      const pagosProv = pagosProveedores[k] || 0;
      const egresosReales = pagosProv + sueldoEstimado + aguinaldo + ivaAPagar;
      const conceptosMes = conceptos.filter((c) => c.periodo.slice(0, 7) === k);
      const ingresosConcepto = conceptosMes.filter((c) => c.tipo === "ingreso").reduce((s, c) => s + Number(c.monto), 0);
      const egresosConcepto = conceptosMes.filter((c) => c.tipo === "egreso").reduce((s, c) => s + Number(c.monto), 0);
      const saldoInicial = saldo;
      const neto = ingresosReales + ingresosConcepto + ivaAFavor - egresosReales - egresosConcepto;
      saldo = saldoInicial + neto;
      return {
        mes: m, key: k, saldoInicial, ingresosReales, pagosProveedores: pagosProv, sueldoEstimado, aguinaldo,
        ivaAPagar, ivaAFavor, egresosReales, ingresosConcepto, egresosConcepto, neto, saldoFinal: saldo,
      };
    });
  }, [meses, saldoActual, cobranzas, pagosProveedores, sueldoEstimado, ivaNetoEstimado, conceptos]);

  const chartData = filas.map((f) => ({ mes: labelMes(f.mes), saldo: Math.round(f.saldoFinal) }));

  return (
    <div>
      <PageHeader
        title="Cash Flow Proyectado"
        subtitle="Proyección hacia adelante — a diferencia de Tesorería (retrospectiva), combina cobranzas y pagos a proveedores pendientes reales con conceptos manuales que armás por escenario."
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Saldo actual (bancos + caja de hoy)" value={fmt(saldoActual)} tech />
        <StatCard label="Cobranzas pendientes (total)" value={fmt(Object.values(cobranzas).reduce((a, b) => a + b, 0))} />
        <StatCard label="Pagos a proveedores pendientes (total)" value={fmt(Object.values(pagosProveedores).reduce((a, b) => a + b, 0))} />
      </div>
      <p className="text-xs text-gray-400 mb-6">
        Saldo actual: {fmt(saldoBancos)} en bancos + {fmt(saldoCajaHoy)} en caja(s) abierta(s) hoy.
        {ivaNetoEstimado > 0
          ? ` IVA neto estimado a pagar: ${fmt(ivaNetoEstimado)}/mes (promedio de los últimos meses con datos).`
          : ivaNetoEstimado < 0
          ? ` Saldo a favor de IVA estimado: ${fmt(-ivaNetoEstimado)}/mes (promedio de los últimos meses con datos).`
          : ""}
      </p>

      <div className="card mb-6">
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <label className="text-sm text-gray-600">Escenario:</label>
          <select className="input max-w-xs" value={escenarioId} onChange={(e) => setEscenarioId(e.target.value)}>
            <option value="">Solo datos reales (sin escenario)</option>
            {escenarios.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
        <form onSubmit={crearEscenario} className="flex gap-2 flex-wrap">
          <input className="input" placeholder="Nombre del nuevo escenario (ej. Pesimista)" value={nuevoEscenario.nombre} onChange={(e) => setNuevoEscenario({ ...nuevoEscenario, nombre: e.target.value })} />
          <input className="input flex-1" placeholder="Descripción (opcional)" value={nuevoEscenario.descripcion} onChange={(e) => setNuevoEscenario({ ...nuevoEscenario, descripcion: e.target.value })} />
          <button className="btn-secondary">Crear escenario</button>
        </form>
      </div>

      {escenarioId && (
        <div className="card mb-6 overflow-x-auto">
          <h3 className="text-sm font-semibold text-navy mb-3">Conceptos del escenario</h3>
          <form onSubmit={agregarConcepto} className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
            <input className="input col-span-2" placeholder="Concepto (ej. Compra de vehículo)" value={nuevoConcepto.nombre} onChange={(e) => setNuevoConcepto({ ...nuevoConcepto, nombre: e.target.value })} required />
            <select className="input" value={nuevoConcepto.tipo} onChange={(e) => setNuevoConcepto({ ...nuevoConcepto, tipo: e.target.value as any })}>
              <option value="ingreso">Ingreso</option>
              <option value="egreso">Egreso</option>
            </select>
            <input className="input" type="month" value={nuevoConcepto.periodo} onChange={(e) => setNuevoConcepto({ ...nuevoConcepto, periodo: e.target.value })} />
            <input className="input" type="number" min="0.01" step="0.01" placeholder="Importe" value={nuevoConcepto.monto} onChange={(e) => setNuevoConcepto({ ...nuevoConcepto, monto: e.target.value })} required />
            <button className="btn-primary col-span-2 md:col-span-5">Agregar concepto</button>
          </form>
          {conceptos.length > 0 && (
            <table className="tbl">
              <thead><tr><th>Período</th><th>Concepto</th><th>Tipo</th><th>Importe</th><th></th></tr></thead>
              <tbody>
                {conceptos.map((c) => (
                  <tr key={c.id}>
                    <td>{labelMes(new Date(c.periodo + "T00:00:00"))}</td>
                    <td>{c.nombre}</td>
                    <td>{c.tipo === "ingreso" ? <span className="badge bg-green-100 text-green-700">Ingreso</span> : <span className="badge bg-red-100 text-red-700">Egreso</span>}</td>
                    <td>{fmt(c.monto)}</td>
                    <td><button className="text-danger text-xs" onClick={() => eliminarConcepto(c.id)}>Quitar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {loading ? <p className="text-gray-400">Cargando…</p> : (
        <>
          <div className="card mb-6" style={{ height: 260 }}>
            <h3 className="text-sm font-semibold text-navy mb-3">Saldo proyectado</h3>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis tickFormatter={(v) => fmt(v)} width={90} />
                <Tooltip formatter={(v: any) => fmt(Number(v))} />
                <Line type="monotone" dataKey="saldo" stroke="#7a1f3d" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Mes</th><th>Saldo inicial</th><th>+ Cobranzas</th><th>+ IVA a favor (est.)</th><th>+ Ingresos escenario</th>
                  <th>- Pagos proveedores</th><th>- Sueldos (est.)</th><th>- Aguinaldo (est.)</th><th>- IVA a pagar (est.)</th>
                  <th>- Egresos escenario</th><th>Saldo final</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.key}>
                    <td className="capitalize">{labelMes(f.mes)}</td>
                    <td>{fmt(f.saldoInicial)}</td>
                    <td className="text-green-700">{fmt(f.ingresosReales)}</td>
                    <td className="text-green-700">{fmt(f.ivaAFavor)}</td>
                    <td className="text-green-700">{fmt(f.ingresosConcepto)}</td>
                    <td className="text-danger">{fmt(f.pagosProveedores)}</td>
                    <td className="text-danger">{fmt(f.sueldoEstimado)}</td>
                    <td className="text-danger">{fmt(f.aguinaldo)}</td>
                    <td className="text-danger">{fmt(f.ivaAPagar)}</td>
                    <td className="text-danger">{fmt(f.egresosConcepto)}</td>
                    <td className={f.saldoFinal < 0 ? "text-danger font-semibold" : "font-semibold"}>{fmt(f.saldoFinal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Cobranzas y pagos a proveedores se toman de comprobantes/movimientos reales pendientes, agrupados por su fecha
            de vencimiento (o fecha de emisión si no tienen vencimiento cargado). El sueldo estimado es el promedio de las
            últimas liquidaciones cerradas, repetido cada mes. El aguinaldo estimado (jun/dic) es la mitad de ese promedio,
            una aproximación de SAC — no reemplaza el cálculo real por mejor remuneración del semestre. El IVA neto estimado
            es el promedio mensual de los últimos meses con datos (débito de ventas Lista 1 menos crédito de compras) y no
            contempla saldos a favor arrastrados de períodos previos ni percepciones/retenciones. Es una herramienta de
            planificación, no un compromiso de pago ni una liquidación impositiva real.
          </p>
        </>
      )}
    </div>
  );
}
