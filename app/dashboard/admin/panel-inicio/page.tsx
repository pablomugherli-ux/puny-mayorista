"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import StatCard from "@/components/StatCard";
import {
  PlusCircle, Wallet, PackageSearch, LayoutDashboard, Landmark,
  CreditCard, Scale, FileCheck2, FileWarning, UserX, Bell, ChevronDown, ChevronUp,
} from "lucide-react";

const fmtMoneda = (n: number, m = "ARS") => {
  try { return new Intl.NumberFormat("es-AR", { style: "currency", currency: m }).format(n || 0); }
  catch { return `${m} ${(n || 0).toFixed(2)}`; }
};

function hoyRango() {
  const inicio = new Date(); inicio.setHours(0, 0, 0, 0);
  const fin = new Date(); fin.setHours(23, 59, 59, 999);
  return { inicio: inicio.toISOString(), fin: fin.toISOString() };
}
function mesRango() {
  const hoy = new Date();
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59);
  return { inicio: inicio.toISOString(), fin: fin.toISOString(), periodo: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01` };
}

// Suma dos mapas moneda->monto en uno solo.
function sumarPorMoneda(...mapas: Record<string, number>[]) {
  const out: Record<string, number> = {};
  for (const m of mapas) for (const [k, v] of Object.entries(m)) out[k] = (out[k] || 0) + v;
  return out;
}

type FilaVendedor = { id: string; nombre: string; meta: number; real: number };

// ============================================================================
// Panel Principal del Dueño — reformulación agosto 2026 (13 KPIs + módulos
// críticos, ver PUNY_Especificacion_Maestro_Dueno.docx sección 4.2). Antes
// esta página solo mostraba 3 números del día — ahora es el punto de
// entrada con visibilidad 360° pedido: ventas vs. meta con drill-down,
// saldos a proveedores/clientes, todas las fuentes de dinero consolidadas
// por moneda, cheques (propios y de terceros), IVA y ausentismo del día.
// El Centro de Alertas (KPI 13) ya se muestra arriba de esta página, en
// todo el sistema, vía el componente global AlertasOperativas — acá solo
// queda un acceso directo a Informes para no duplicar esa consulta.
// ============================================================================
export default function PanelInicio() {
  const [loading, setLoading] = useState(true);
  const [ventasHoy, setVentasHoy] = useState(0);
  const [cobranzaHoy, setCobranzaHoy] = useState(0);
  const [pedidosPendientes, setPedidosPendientes] = useState(0);

  // KPI 1
  const [ventasMes, setVentasMes] = useState(0);
  const [metaMes, setMetaMes] = useState(0);
  const [filasVendedores, setFilasVendedores] = useState<FilaVendedor[]>([]);
  const [verDrillDown, setVerDrillDown] = useState(false);
  // KPI 2 / 3
  const [saldoProveedores, setSaldoProveedores] = useState(0);
  const [saldoClientes, setSaldoClientes] = useState(0);
  // KPI 4 / 5 / 6 / 7 / 8
  const [porMonedaCaja, setPorMonedaCaja] = useState<Record<string, number>>({});
  const [porMonedaBilleteras, setPorMonedaBilleteras] = useState<Record<string, number>>({});
  const [porMonedaBancos, setPorMonedaBancos] = useState<Record<string, number>>({});
  const [tarjetaPendiente, setTarjetaPendiente] = useState(0);
  const [tarjetaLiquidado, setTarjetaLiquidado] = useState(0);
  // KPI 9 / 10
  const [chequesPropiosPend, setChequesPropiosPend] = useState({ cantidad: 0, monto: 0 });
  const [chequesTercerosCartera, setChequesTercerosCartera] = useState({ cantidad: 0, monto: 0 });
  // KPI 11
  const [saldoTecnicoIva, setSaldoTecnicoIva] = useState(0);
  // KPI 12
  const [ausentesHoy, setAusentesHoy] = useState(0);

  useEffect(() => {
    (async () => {
      const { inicio: iHoy, fin: fHoy } = hoyRango();
      const { inicio: iMes, fin: fMes, periodo } = mesRango();
      const hoyStr = new Date().toISOString().slice(0, 10);

      const [
        { data: pedidosHoy }, { data: cobrosHoy }, { count: pendCount },
        { data: pedidosMes }, { data: objetivos }, { data: vendedores },
        { data: rpcProv }, { data: rpcClientes }, { data: rpcCajas },
        { data: billeteras }, { data: bancos }, { data: cobrosTarjeta },
        { data: chqPropios }, { data: chqTerceros }, { data: ausentes },
        { data: ventasIva }, { data: comprasIva },
      ] = await Promise.all([
        supabase.from("pedidos").select("total").gte("fecha", iHoy).lte("fecha", fHoy),
        supabase.from("cobros").select("monto").gte("fecha", iHoy).lte("fecha", fHoy),
        supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
        supabase.from("pedidos").select("total, vendedor_id").gte("fecha", iMes).lte("fecha", fMes).not("estado", "in", "(rechazado,cancelado)"),
        supabase.from("objetivos_comerciales").select("profile_id, meta").eq("periodo", periodo).eq("tipo_objetivo", "monto_ventas"),
        supabase.from("profiles").select("id, nombre").eq("role", "vendedor").eq("activo", true),
        supabase.rpc("fn_kpi_saldo_proveedores"),
        supabase.rpc("fn_kpi_saldo_clientes"),
        supabase.rpc("fn_kpi_saldo_cajas_por_moneda"),
        supabase.from("billeteras_virtuales").select("moneda, saldo_actual").eq("activa", true),
        supabase.from("bancos").select("moneda, saldo_actual").eq("activo", true),
        supabase.from("cobros").select("monto, monto_neto, acreditado").eq("medio_pago", "tarjeta"),
        supabase.from("cheques_propios").select("monto").eq("estado", "pendiente"),
        supabase.from("valores_cartera").select("monto").eq("estado", "en_cartera"),
        supabase.from("solicitudes_licencia").select("id").eq("estado", "aprobada").lte("fecha_desde", hoyStr).gte("fecha_hasta", hoyStr),
        supabase.from("comprobantes").select("total, neto, iva_monto").eq("tipo", "factura").eq("lista", 1).gte("fecha", iMes).lte("fecha", fMes),
        supabase.from("proveedor_movimientos").select("monto, neto, iva_monto").eq("tipo", "compra").gte("fecha", iMes).lte("fecha", fMes),
      ]);

      setVentasHoy((pedidosHoy || []).reduce((s: number, p: any) => s + Number(p.total || 0), 0));
      setCobranzaHoy((cobrosHoy || []).reduce((s: number, c: any) => s + Number(c.monto || 0), 0));
      setPedidosPendientes(pendCount || 0);

      // KPI 1 — ventas del mes vs. meta, con drill-down por vendedor.
      const ventasPorVendedor: Record<string, number> = {};
      let totalVentasMes = 0;
      (pedidosMes || []).forEach((p: any) => {
        totalVentasMes += Number(p.total || 0);
        if (p.vendedor_id) ventasPorVendedor[p.vendedor_id] = (ventasPorVendedor[p.vendedor_id] || 0) + Number(p.total || 0);
      });
      setVentasMes(totalVentasMes);
      const metaPorVendedor: Record<string, number> = {};
      let totalMeta = 0;
      (objetivos || []).forEach((o: any) => { metaPorVendedor[o.profile_id] = Number(o.meta || 0); totalMeta += Number(o.meta || 0); });
      setMetaMes(totalMeta);
      setFilasVendedores(
        (vendedores || []).map((v: any) => ({
          id: v.id, nombre: v.nombre,
          meta: metaPorVendedor[v.id] || 0,
          real: ventasPorVendedor[v.id] || 0,
        }))
      );

      setSaldoProveedores(Number(rpcProv || 0));
      setSaldoClientes(Number(rpcClientes || 0));

      setPorMonedaCaja((rpcCajas || []).reduce((acc: Record<string, number>, r: any) => { acc[r.moneda] = Number(r.saldo); return acc; }, {}));
      setPorMonedaBilleteras((billeteras || []).reduce((acc: Record<string, number>, b: any) => { acc[b.moneda] = (acc[b.moneda] || 0) + Number(b.saldo_actual); return acc; }, {}));
      setPorMonedaBancos((bancos || []).reduce((acc: Record<string, number>, b: any) => { acc[b.moneda] = (acc[b.moneda] || 0) + Number(b.saldo_actual); return acc; }, {}));

      let tPend = 0, tLiq = 0;
      (cobrosTarjeta || []).forEach((c: any) => {
        const neto = c.monto_neto ?? c.monto;
        if (c.acreditado) tLiq += Number(neto); else tPend += Number(neto);
      });
      setTarjetaPendiente(tPend);
      setTarjetaLiquidado(tLiq);

      setChequesPropiosPend({ cantidad: (chqPropios || []).length, monto: (chqPropios || []).reduce((s: number, c: any) => s + Number(c.monto), 0) });
      setChequesTercerosCartera({ cantidad: (chqTerceros || []).length, monto: (chqTerceros || []).reduce((s: number, c: any) => s + Number(c.monto), 0) });

      setAusentesHoy((ausentes || []).length);

      const ivaVentas = (ventasIva || []).reduce((s: number, v: any) => s + Number(v.iva_monto ?? v.total - v.total / 1.21), 0);
      const ivaCompras = (comprasIva || []).reduce((s: number, c: any) => s + Number(c.iva_monto ?? c.monto - c.monto / 1.21), 0);
      setSaldoTecnicoIva(ivaVentas - ivaCompras);

      setLoading(false);
    })();
  }, []);

  // KPI 8 — Total consolidado de liquidez: Caja + Billeteras + Tarjetas + Bancos,
  // agrupado por moneda (las tarjetas no tienen moneda propia en el sistema hoy,
  // se suman a ARS). Sumar divisas distintas sin convertir sería engañoso, así
  // que se muestra un total por cada una en vez de un único número.
  const porMonedaLiquidez = sumarPorMoneda(
    porMonedaCaja, porMonedaBilleteras, porMonedaBancos,
    { ARS: tarjetaPendiente + tarjetaLiquidado }
  );

  return (
    <div>
      <h1 className="text-xl font-bold text-navy mb-1">Inicio — Panel Principal</h1>
      <p className="text-sm text-gray-500 mb-4">Visibilidad 360° del negocio: ventas del mes, todas las fuentes de dinero, cheques, IVA y ausentismo. Las alertas operativas y financieras se muestran arriba de esta página cuando corresponde.</p>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Ventas de hoy" value={loading ? "…" : fmtMoneda(ventasHoy)} tech />
        <StatCard label="Cobranza de hoy" value={loading ? "…" : fmtMoneda(cobranzaHoy)} />
        <StatCard label="Pedidos pendientes" value={loading ? "…" : String(pedidosPendientes)} />
      </div>

      {/* KPI 8 — Total consolidado de liquidez, destacado como la tarjeta más grande. */}
      <div className="card-tech mb-6">
        <h3 className="text-xs uppercase tracking-wide text-white/70 mb-2">Total consolidado de liquidez (Caja + Billeteras + Tarjetas + Bancos)</h3>
        {loading ? (
          <p className="text-white/60 text-sm">Calculando…</p>
        ) : (
          <div className="flex flex-wrap gap-6">
            {Object.entries(porMonedaLiquidez).map(([m, v]) => (
              <div key={m}>
                <div className="text-[10px] text-white/60 uppercase">{m}</div>
                <div className="text-2xl font-bold text-electric">{fmtMoneda(v, m)}</div>
              </div>
            ))}
            {Object.keys(porMonedaLiquidez).length === 0 && <p className="text-white/60 text-sm">Sin fuentes de dinero cargadas todavía.</p>}
          </div>
        )}
      </div>

      {/* KPI 1 — Ventas del mes vs. meta, con drill-down por vendedor. */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-navy">Ventas del mes vs. meta</h3>
          <button className="text-xs text-navy underline flex items-center gap-1" onClick={() => setVerDrillDown((v) => !v)}>
            {verDrillDown ? <>Ocultar por vendedor <ChevronUp size={14} /></> : <>Ver por vendedor <ChevronDown size={14} /></>}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-2">
          <StatCard label="Ventas del mes (real)" value={loading ? "…" : fmtMoneda(ventasMes)} tech />
          <StatCard label="Meta del mes" value={loading ? "…" : (metaMes > 0 ? fmtMoneda(metaMes) : "Sin metas cargadas")} />
        </div>
        {metaMes > 0 && (
          <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
            <div className="bg-navy h-2 rounded-full" style={{ width: `${Math.min(100, (ventasMes / metaMes) * 100)}%` }} />
          </div>
        )}
        {verDrillDown && (
          <div className="mt-3 overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Vendedor</th><th>Meta</th><th>Real</th><th>% cumplido</th></tr></thead>
              <tbody>
                {filasVendedores.map((f) => (
                  <tr key={f.id}>
                    <td>{f.nombre}</td>
                    <td>{f.meta > 0 ? fmtMoneda(f.meta) : "—"}</td>
                    <td>{fmtMoneda(f.real)}</td>
                    <td>{f.meta > 0 ? `${Math.round((f.real / f.meta) * 100)}%` : "—"}</td>
                  </tr>
                ))}
                {filasVendedores.length === 0 && <tr><td colSpan={4} className="text-gray-400">Sin vendedores activos.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* KPI 2, 3 — Saldo a Proveedores / Cuenta Corriente a Cobrar */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Link href="/dashboard/admin/panel-finanzas?tab=finanzas">
          <StatCard label="Saldo a Proveedores" value={loading ? "…" : fmtMoneda(saldoProveedores)} tech />
        </Link>
        <Link href="/dashboard/admin/panel-ventas?tab=cuenta-corriente">
          <StatCard label="Cuenta Corriente a Cobrar" value={loading ? "…" : fmtMoneda(saldoClientes)} />
        </Link>
      </div>

      {/* KPI 4, 5, 6, 7 — Dinero por fuente, cada una por moneda */}
      <div className="grid md:grid-cols-4 gap-4 mb-6">
        <Link href="/dashboard/admin/panel-finanzas?tab=caja" className="card block hover:bg-gray-50">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-2"><Wallet size={14} /> Dinero en Caja</div>
          {Object.entries(porMonedaCaja).length === 0 && <div className="text-sm text-gray-400">Sin cajas abiertas hoy</div>}
          {Object.entries(porMonedaCaja).map(([m, v]) => <div key={m} className="font-bold text-navy">{fmtMoneda(v, m)}</div>)}
        </Link>
        <Link href="/dashboard/admin/panel-finanzas?tab=finanzas" className="card block hover:bg-gray-50">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-2"><CreditCard size={14} /> Billeteras Virtuales</div>
          {Object.entries(porMonedaBilleteras).length === 0 && <div className="text-sm text-gray-400">Sin billeteras cargadas</div>}
          {Object.entries(porMonedaBilleteras).map(([m, v]) => <div key={m} className="font-bold text-navy">{fmtMoneda(v, m)}</div>)}
        </Link>
        <Link href="/dashboard/admin/panel-finanzas?tab=finanzas" className="card block hover:bg-gray-50">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-2"><CreditCard size={14} /> Tarjetas de Crédito</div>
          <div className="font-bold text-navy">{fmtMoneda(tarjetaPendiente)} <span className="text-[10px] text-gray-400 font-normal">pendiente</span></div>
          <div className="text-xs text-gray-500">{fmtMoneda(tarjetaLiquidado)} liquidado</div>
        </Link>
        <Link href="/dashboard/admin/panel-finanzas?tab=finanzas" className="card block hover:bg-gray-50">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-2"><Landmark size={14} /> Bancos</div>
          {Object.entries(porMonedaBancos).length === 0 && <div className="text-sm text-gray-400">Sin cuentas cargadas</div>}
          {Object.entries(porMonedaBancos).map(([m, v]) => <div key={m} className="font-bold text-navy">{fmtMoneda(v, m)}</div>)}
        </Link>
      </div>

      {/* KPI 9, 10 — Cheques */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Link href="/dashboard/admin/panel-finanzas?tab=finanzas" className="card block hover:bg-gray-50">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-2"><FileWarning size={14} /> Cheques Librados (propios)</div>
          <div className="font-bold text-navy">{fmtMoneda(chequesPropiosPend.monto)}</div>
          <div className="text-xs text-gray-500">{chequesPropiosPend.cantidad} pendiente{chequesPropiosPend.cantidad === 1 ? "" : "s"} de pago</div>
        </Link>
        <Link href="/dashboard/admin/panel-finanzas?tab=finanzas" className="card block hover:bg-gray-50">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-2"><FileCheck2 size={14} /> Cheques de Terceros</div>
          <div className="font-bold text-navy">{fmtMoneda(chequesTercerosCartera.monto)}</div>
          <div className="text-xs text-gray-500">{chequesTercerosCartera.cantidad} en cartera</div>
        </Link>
      </div>

      {/* KPI 11, 12, 13 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Link href="/dashboard/admin/panel-finanzas?tab=iva" className="card block hover:bg-gray-50">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-2"><Scale size={14} /> Libro IVA — saldo técnico del mes</div>
          <div className="font-bold text-navy">{fmtMoneda(saldoTecnicoIva)}</div>
        </Link>
        <Link href="/dashboard/admin/panel-personal?tab=licencias" className="card block hover:bg-gray-50">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-2"><UserX size={14} /> Ausentismo de hoy</div>
          <div className="font-bold text-navy">{ausentesHoy} persona{ausentesHoy === 1 ? "" : "s"}</div>
        </Link>
        <Link href="/dashboard/admin/panel-informes?tab=ejecutivo" className="card block hover:bg-gray-50">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-2"><Bell size={14} /> Centro de Alertas e Informes</div>
          <div className="text-xs text-gray-500">Las alertas activas se muestran arriba de esta página. Click para ver informes gerenciales completos.</div>
        </Link>
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-navy mb-3">Accesos rápidos</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link href="/dashboard/admin/panel-ventas?tab=pedidos" className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-100 hover:bg-gray-50 text-center">
            <PlusCircle size={22} className="text-navy" />
            <span className="text-xs font-medium text-gray-700">Nuevo Pedido</span>
          </Link>
          <Link href="/dashboard/admin/panel-finanzas?tab=caja" className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-100 hover:bg-gray-50 text-center">
            <Wallet size={22} className="text-navy" />
            <span className="text-xs font-medium text-gray-700">Ver Caja</span>
          </Link>
          <Link href="/dashboard/admin/panel-stock?tab=depositos" className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-100 hover:bg-gray-50 text-center">
            <PackageSearch size={22} className="text-navy" />
            <span className="text-xs font-medium text-gray-700">Stock por vencer</span>
          </Link>
          <Link href="/dashboard/admin/panel-informes?tab=ejecutivo" className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-100 hover:bg-gray-50 text-center">
            <LayoutDashboard size={22} className="text-navy" />
            <span className="text-xs font-medium text-gray-700">Dashboard Ejecutivo</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
