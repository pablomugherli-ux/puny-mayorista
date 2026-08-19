"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import StatCard from "@/components/StatCard";
import { exportarPDF, exportarExcel } from "@/lib/reportes";
import { LayoutDashboard, PieChart, ShoppingCart, Wallet, Package, Users } from "lucide-react";

const Bi = dynamic(() => import("../bi/page"), { ssr: false });
const DashboardEjecutivo = dynamic(() => import("./DashboardEjecutivo"), { ssr: false });

const fmtMoneda = (n: number) => Number(n || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" });
const fmtFecha = (s: string | null) => (s ? new Date(s).toLocaleDateString("es-AR") : "—");
const primerDiaMes = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
const hoyStr = () => new Date().toISOString().slice(0, 10);

async function tenantId() {
  const { data: u } = await supabase.auth.getUser();
  const { data: p } = await supabase.from("profiles").select("tenant_id").eq("id", u.user?.id).single();
  return p?.tenant_id as string;
}

function FiltroFechas({ desde, hasta, setDesde, setHasta }: any) {
  return (
    <>
      <div>
        <label className="text-xs text-gray-500">Desde</label>
        <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
      </div>
      <div>
        <label className="text-xs text-gray-500">Hasta</label>
        <input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
      </div>
    </>
  );
}

function InformeVentas() {
  const [desde, setDesde] = useState(primerDiaMes());
  const [hasta, setHasta] = useState(hoyStr());
  const [canal, setCanal] = useState("");
  const [vendedorId, setVendedorId] = useState("");
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [filas, setFilas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("profiles").select("id, nombre").in("role", ["vendedor", "vendedor_masivo", "asesor_inmuner"]).order("nombre").then(({ data }) => setVendedores(data || []));
  }, []);

  async function buscar() {
    setLoading(true);
    let q = supabase.from("pedidos").select("numero, fecha, total, canal_venta, clientes(nombre), profiles!pedidos_vendedor_id_fkey(nombre)")
      .gte("fecha", desde).lte("fecha", hasta + "T23:59:59").order("fecha", { ascending: false });
    if (canal) q = q.eq("canal_venta", canal);
    if (vendedorId) q = q.eq("vendedor_id", vendedorId);
    const { data, error } = await q;
    if (error) {
      // fallback sin el alias explícito de FK, por si el nombre de la constraint difiere
      let q2 = supabase.from("pedidos").select("numero, fecha, total, canal_venta, vendedor_id, clientes(nombre)")
        .gte("fecha", desde).lte("fecha", hasta + "T23:59:59").order("fecha", { ascending: false });
      if (canal) q2 = q2.eq("canal_venta", canal);
      if (vendedorId) q2 = q2.eq("vendedor_id", vendedorId);
      const { data: d2 } = await q2;
      setFilas(d2 || []);
    } else {
      setFilas(data || []);
    }
    setLoading(false);
  }
  useEffect(() => { buscar(); }, []);

  const total = filas.reduce((s, f) => s + Number(f.total || 0), 0);
  const columnas = [
    { header: "Fecha", key: "fecha", formato: (v: string) => fmtFecha(v) },
    { header: "N°", key: "numero" },
    { header: "Cliente", key: "cliente", formato: (v: any, row?: any) => v },
    { header: "Canal", key: "canal_venta" },
    { header: "Total", key: "total", formato: (v: number) => fmtMoneda(v) },
  ];
  const datosExport = filas.map((f) => ({ fecha: f.fecha, numero: f.numero, cliente: f.clientes?.nombre || "—", canal_venta: f.canal_venta, total: f.total }));

  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-5 gap-3 mb-4 items-end">
        <FiltroFechas desde={desde} hasta={hasta} setDesde={setDesde} setHasta={setHasta} />
        <div>
          <label className="text-xs text-gray-500">Canal</label>
          <select className="input" value={canal} onChange={(e) => setCanal(e.target.value)}>
            <option value="">Todos</option>
            <option value="mayorista">Mayorista</option>
            <option value="masivo">Masivo</option>
            <option value="cuentas_clave">Cuentas Clave</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">Vendedor</label>
          <select className="input" value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}>
            <option value="">Todos</option>
            {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-2 mb-4">
        <button className="btn-primary text-sm" onClick={buscar} disabled={loading}>{loading ? "Buscando…" : "Buscar"}</button>
        <button className="btn-secondary text-sm" onClick={() => exportarPDF("Informe de Ventas", columnas, datosExport, "informe_ventas")}>Exportar PDF</button>
        <button className="btn-secondary text-sm" onClick={() => exportarExcel("Ventas", columnas, datosExport, "informe_ventas")}>Exportar Excel</button>
      </div>
      <StatCard label="Total del período" value={fmtMoneda(total)} tech />
      <table className="tbl mt-4">
        <thead><tr><th>Fecha</th><th>N°</th><th>Cliente</th><th>Canal</th><th>Total</th></tr></thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i}>
              <td>{fmtFecha(f.fecha)}</td>
              <td>{f.numero}</td>
              <td>{f.clientes?.nombre || "—"}</td>
              <td className="capitalize">{f.canal_venta}</td>
              <td>{fmtMoneda(f.total)}</td>
            </tr>
          ))}
          {filas.length === 0 && <tr><td colSpan={5} className="text-gray-400 text-xs py-3">Sin resultados para el filtro elegido.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function InformeCobranzas() {
  const [desde, setDesde] = useState(primerDiaMes());
  const [hasta, setHasta] = useState(hoyStr());
  const [cobradorId, setCobradorId] = useState("");
  const [cobradores, setCobradores] = useState<any[]>([]);
  const [filas, setFilas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("profiles").select("id, nombre").in("role", ["cobrador", "vendedor", "entrega"]).order("nombre").then(({ data }) => setCobradores(data || []));
  }, []);

  async function buscar() {
    setLoading(true);
    let q = supabase.from("cobros").select("fecha, monto, medio_pago, clientes(nombre)")
      .gte("fecha", desde).lte("fecha", hasta + "T23:59:59").order("fecha", { ascending: false });
    if (cobradorId) q = q.eq("cobrador_id", cobradorId);
    const { data } = await q;
    setFilas(data || []);
    setLoading(false);
  }
  useEffect(() => { buscar(); }, []);

  const total = filas.reduce((s, f) => s + Number(f.monto || 0), 0);
  const columnas = [
    { header: "Fecha", key: "fecha", formato: (v: string) => fmtFecha(v) },
    { header: "Cliente", key: "cliente" },
    { header: "Medio de pago", key: "medio_pago" },
    { header: "Monto", key: "monto", formato: (v: number) => fmtMoneda(v) },
  ];
  const datosExport = filas.map((f) => ({ fecha: f.fecha, cliente: f.clientes?.nombre || "—", medio_pago: f.medio_pago, monto: f.monto }));

  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-4 gap-3 mb-4 items-end">
        <FiltroFechas desde={desde} hasta={hasta} setDesde={setDesde} setHasta={setHasta} />
        <div>
          <label className="text-xs text-gray-500">Cobrador / Vendedor</label>
          <select className="input" value={cobradorId} onChange={(e) => setCobradorId(e.target.value)}>
            <option value="">Todos</option>
            {cobradores.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
          </select>
        </div>
      </div>
      <div className="flex gap-2 mb-4">
        <button className="btn-primary text-sm" onClick={buscar} disabled={loading}>{loading ? "Buscando…" : "Buscar"}</button>
        <button className="btn-secondary text-sm" onClick={() => exportarPDF("Informe de Cobranzas", columnas, datosExport, "informe_cobranzas")}>Exportar PDF</button>
        <button className="btn-secondary text-sm" onClick={() => exportarExcel("Cobranzas", columnas, datosExport, "informe_cobranzas")}>Exportar Excel</button>
      </div>
      <StatCard label="Total cobrado en el período" value={fmtMoneda(total)} tech />
      <table className="tbl mt-4">
        <thead><tr><th>Fecha</th><th>Cliente</th><th>Medio de pago</th><th>Monto</th></tr></thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i}>
              <td>{fmtFecha(f.fecha)}</td>
              <td>{f.clientes?.nombre || "—"}</td>
              <td className="capitalize">{f.medio_pago}</td>
              <td>{fmtMoneda(f.monto)}</td>
            </tr>
          ))}
          {filas.length === 0 && <tr><td colSpan={4} className="text-gray-400 text-xs py-3">Sin resultados para el filtro elegido.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function InformeStock() {
  const [productos, setProductos] = useState<any[]>([]);
  const [lotes, setLotes] = useState<any[]>([]);
  const { tenant } = useAuth();
  const dias = tenant?.dias_alerta_vencimiento_stock || 30;

  useEffect(() => {
    supabase.from("productos").select("nombre, stock, stock_minimo, fecha_vencimiento").order("nombre").then(({ data }) => setProductos(data || []));
    supabase.from("lotes_producto").select("numero_lote, cantidad, fecha_vencimiento, productos(nombre)").order("fecha_vencimiento", { ascending: true, nullsFirst: false }).then(({ data }) => setLotes(data || []));
  }, []);

  const bajoMinimo = productos.filter((p) => p.stock_minimo > 0 && Number(p.stock) <= Number(p.stock_minimo));
  const porVencer = productos.filter((p) => p.fecha_vencimiento && (new Date(p.fecha_vencimiento).getTime() - Date.now()) / 86400000 <= dias);

  const columnas = [
    { header: "Producto", key: "nombre" },
    { header: "Stock", key: "stock" },
    { header: "Mínimo", key: "stock_minimo" },
    { header: "Vencimiento", key: "fecha_vencimiento", formato: (v: string) => fmtFecha(v) },
  ];

  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-2 gap-4 mb-4">
        <StatCard label="Productos bajo mínimo" value={String(bajoMinimo.length)} />
        <StatCard label={`Por vencer (${dias} días)`} value={String(porVencer.length + lotes.filter((l) => l.fecha_vencimiento && (new Date(l.fecha_vencimiento).getTime() - Date.now()) / 86400000 <= dias).length)} />
      </div>
      <div className="flex gap-2 mb-4">
        <button className="btn-secondary text-sm" onClick={() => exportarPDF("Informe de Stock — Bajo mínimo", columnas, bajoMinimo, "informe_stock_bajo_minimo")}>Exportar bajo mínimo (PDF)</button>
        <button className="btn-secondary text-sm" onClick={() => exportarExcel("Stock", columnas, bajoMinimo, "informe_stock_bajo_minimo")}>Exportar bajo mínimo (Excel)</button>
      </div>
      <table className="tbl">
        <thead><tr><th>Producto</th><th>Stock</th><th>Mínimo</th><th>Vencimiento</th></tr></thead>
        <tbody>
          {bajoMinimo.map((p, i) => (
            <tr key={i}><td>{p.nombre}</td><td>{p.stock}</td><td>{p.stock_minimo}</td><td>{fmtFecha(p.fecha_vencimiento)}</td></tr>
          ))}
          {bajoMinimo.length === 0 && <tr><td colSpan={4} className="text-gray-400 text-xs py-3">Sin productos bajo el mínimo.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function InformeRRHH() {
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7));
  const [filas, setFilas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function buscar() {
    setLoading(true);
    const { data } = await supabase.from("liquidaciones_sueldo").select("periodo, sueldo_base, comisiones, premios, total, estado, profiles(nombre)")
      .gte("periodo", periodo + "-01").lt("periodo", periodo + "-32");
    setFilas(data || []);
    setLoading(false);
  }
  useEffect(() => { buscar(); }, []);

  const total = filas.reduce((s, f) => s + Number(f.total || 0), 0);
  const columnas = [
    { header: "Empleado", key: "empleado" },
    { header: "Sueldo base", key: "sueldo_base", formato: (v: number) => fmtMoneda(v) },
    { header: "Comisiones", key: "comisiones", formato: (v: number) => fmtMoneda(v) },
    { header: "Premios", key: "premios", formato: (v: number) => fmtMoneda(v) },
    { header: "Total", key: "total", formato: (v: number) => fmtMoneda(v) },
    { header: "Estado", key: "estado" },
  ];
  const datosExport = filas.map((f) => ({ empleado: f.profiles?.nombre || "—", sueldo_base: f.sueldo_base, comisiones: f.comisiones, premios: f.premios, total: f.total, estado: f.estado }));

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-3 mb-4 items-end">
        <div>
          <label className="text-xs text-gray-500">Período</label>
          <input className="input" type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
        </div>
        <button className="btn-primary text-sm" onClick={buscar} disabled={loading}>{loading ? "Buscando…" : "Buscar"}</button>
        <button className="btn-secondary text-sm" onClick={() => exportarPDF("Informe de RRHH", columnas, datosExport, "informe_rrhh")}>Exportar PDF</button>
        <button className="btn-secondary text-sm" onClick={() => exportarExcel("RRHH", columnas, datosExport, "informe_rrhh")}>Exportar Excel</button>
      </div>
      <StatCard label="Total liquidado en el período" value={fmtMoneda(total)} tech />
      <table className="tbl mt-4">
        <thead><tr><th>Empleado</th><th>Sueldo base</th><th>Comisiones</th><th>Premios</th><th>Total</th><th>Estado</th></tr></thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i}>
              <td>{f.profiles?.nombre || "—"}</td>
              <td>{fmtMoneda(f.sueldo_base)}</td>
              <td>{fmtMoneda(f.comisiones)}</td>
              <td>{fmtMoneda(f.premios)}</td>
              <td>{fmtMoneda(f.total)}</td>
              <td className="capitalize">{f.estado}</td>
            </tr>
          ))}
          {filas.length === 0 && <tr><td colSpan={6} className="text-gray-400 text-xs py-3">Sin liquidaciones para el período elegido.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

const TABS = [
  { key: "ejecutivo", label: "Dashboard Ejecutivo", icon: LayoutDashboard, Comp: DashboardEjecutivo },
  { key: "bi", label: "PUNY BI", icon: PieChart, Comp: Bi },
  { key: "ventas", label: "Informe de Ventas", icon: ShoppingCart, Comp: InformeVentas },
  { key: "cobranzas", label: "Informe de Cobranzas", icon: Wallet, Comp: InformeCobranzas },
  { key: "stock", label: "Informe de Stock", icon: Package, Comp: InformeStock },
  { key: "rrhh", label: "Informe de RRHH", icon: Users, Comp: InformeRRHH },
  // "PUNY Seguridad" se retiró de acá (agosto 2026, reformulación de
  // navegación): tenía 3 puertas de entrada distintas en el menú del Dueño.
  // Queda una sola, en Sistema → Accesos.
];

export default function PanelInformes() {
  const [tab, setTab] = useState(TABS[0].key);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t && TABS.some((x) => x.key === t)) setTab(t);
  }, []);

  const activa = TABS.find((t) => t.key === tab);

  return (
    <div>
      <h1 className="text-xl font-bold text-navy mb-1">Informes y Reportes</h1>
      <p className="text-sm text-gray-500 mb-4">Panel ejecutivo, analítica cross-canal e informes por módulo con filtros y exportación a PDF/Excel.</p>
      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded text-sm font-medium ${tab === t.key ? "bg-navy text-white" : "bg-gray-100 text-gray-600"}`}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>
      {activa && <activa.Comp />}
    </div>
  );
}
