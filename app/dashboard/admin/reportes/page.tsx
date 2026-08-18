"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";
import { exportarPDF, exportarExcel, Columna } from "@/lib/reportes";

const fmtMoneda = (n: any) => Number(n || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" });
const fmtFecha = (v: any) => (v ? new Date(v).toLocaleDateString("es-AR") : "—");

type TipoReporte = "ventas" | "cobranzas" | "cuenta_corriente" | "comisiones" | "stock";

const REPORTES: { value: TipoReporte; label: string; usaFechas: boolean }[] = [
  { value: "ventas", label: "Ventas (pedidos)", usaFechas: true },
  { value: "cobranzas", label: "Cobranzas", usaFechas: true },
  { value: "cuenta_corriente", label: "Cuenta corriente (comprobantes)", usaFechas: false },
  { value: "comisiones", label: "Comisiones devengadas por usuario", usaFechas: true },
  { value: "stock", label: "Stock de productos", usaFechas: false },
];

function primerDiaMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function hoyStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportesAdmin() {
  const { tenant } = useAuth();
  const [tipo, setTipo] = useState<TipoReporte>("ventas");
  const [formato, setFormato] = useState<"pdf" | "excel">("pdf");
  const [desde, setDesde] = useState(primerDiaMes());
  const [hasta, setHasta] = useState(hoyStr());
  const [generando, setGenerando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function generar() {
    setGenerando(true);
    setMensaje(null);
    try {
      let titulo = "", nombreArchivo = "", columnas: Columna[] = [], datos: any[] = [];

      if (tipo === "ventas") {
        const { data } = await supabase
          .from("pedidos")
          .select("numero, fecha, estado, lista, total, clientes(nombre), profiles:vendedor_id(nombre)")
          .gte("fecha", desde).lte("fecha", hasta + "T23:59:59")
          .order("fecha");
        datos = (data || []).map((d: any) => ({ ...d, cliente: d.clientes?.nombre, vendedor: d.profiles?.nombre }));
        titulo = `Ventas — ${desde} a ${hasta}`;
        nombreArchivo = `ventas_${desde}_${hasta}`;
        columnas = [
          { header: "N°", key: "numero" }, { header: "Fecha", key: "fecha", formato: fmtFecha },
          { header: "Cliente", key: "cliente" }, { header: "Vendedor", key: "vendedor" },
          { header: "Lista", key: "lista" }, { header: "Estado", key: "estado" },
          { header: "Total", key: "total", formato: fmtMoneda },
        ];
      }

      if (tipo === "cobranzas") {
        const { data } = await supabase
          .from("cobros")
          .select("fecha, monto, medio_pago, referencia_pago, lista, clientes(nombre), cobrador:cobrador_id(nombre), repartidor:repartidor_id(nombre)")
          .gte("fecha", desde).lte("fecha", hasta + "T23:59:59")
          .order("fecha");
        datos = (data || []).map((d: any) => ({ ...d, cliente: d.clientes?.nombre, cobrado_por: d.cobrador?.nombre || d.repartidor?.nombre || "—" }));
        titulo = `Cobranzas — ${desde} a ${hasta}`;
        nombreArchivo = `cobranzas_${desde}_${hasta}`;
        columnas = [
          { header: "Fecha", key: "fecha", formato: fmtFecha }, { header: "Cliente", key: "cliente" },
          { header: "Cobrado por", key: "cobrado_por" }, { header: "Medio", key: "medio_pago" },
          { header: "Referencia", key: "referencia_pago" }, { header: "Lista", key: "lista" },
          { header: "Monto", key: "monto", formato: fmtMoneda },
        ];
      }

      if (tipo === "cuenta_corriente") {
        const { data } = await supabase
          .from("comprobantes")
          .select("numero, fecha_vencimiento, lista, total, saldo_pendiente, estado, clientes(nombre)")
          .order("fecha_vencimiento");
        datos = (data || []).map((d: any) => ({ ...d, cliente: d.clientes?.nombre }));
        titulo = "Cuenta corriente — comprobantes";
        nombreArchivo = "cuenta_corriente";
        columnas = [
          { header: "N°", key: "numero" }, { header: "Cliente", key: "cliente" },
          { header: "Vence", key: "fecha_vencimiento", formato: fmtFecha }, { header: "Lista", key: "lista" },
          { header: "Total", key: "total", formato: fmtMoneda }, { header: "Saldo pendiente", key: "saldo_pendiente", formato: fmtMoneda },
          { header: "Estado", key: "estado" },
        ];
      }

      if (tipo === "comisiones") {
        const [{ data: esquemas }, { data: pedidos }, { data: cobros }, { data: entregas }, { data: usuarios }] = await Promise.all([
          supabase.from("esquemas_comision").select("*").eq("activo", true),
          supabase.from("pedidos").select("total, vendedor_id, fecha, estado").gte("fecha", desde).lte("fecha", hasta + "T23:59:59"),
          supabase.from("cobros").select("monto, cobrador_id, repartidor_id, fecha").gte("fecha", desde).lte("fecha", hasta + "T23:59:59"),
          supabase.from("entregas").select("estado, repartidor_id, pedidos!inner(fecha)").gte("pedidos.fecha", desde).lte("pedidos.fecha", hasta + "T23:59:59"),
          supabase.from("profiles").select("id, nombre, role").in("role", ["vendedor", "cobrador", "entrega"]),
        ]);
        const ventasPor = new Map<string, number>();
        (pedidos || []).filter((p: any) => p.estado !== "rechazado" && p.estado !== "cancelado").forEach((p: any) => {
          if (p.vendedor_id) ventasPor.set(p.vendedor_id, (ventasPor.get(p.vendedor_id) || 0) + Number(p.total));
        });
        const cobranzaPorCobrador = new Map<string, number>();
        const cobranzaPorEntrega = new Map<string, number>();
        (cobros || []).forEach((c: any) => {
          if (c.cobrador_id) cobranzaPorCobrador.set(c.cobrador_id, (cobranzaPorCobrador.get(c.cobrador_id) || 0) + Number(c.monto));
          if (c.repartidor_id) cobranzaPorEntrega.set(c.repartidor_id, (cobranzaPorEntrega.get(c.repartidor_id) || 0) + Number(c.monto));
        });
        const entregasPor = new Map<string, number>();
        (entregas || []).forEach((e: any) => {
          if (e.estado === "total" || e.estado === "parcial") entregasPor.set(e.repartidor_id, (entregasPor.get(e.repartidor_id) || 0) + 1);
        });
        datos = (usuarios || []).map((u: any) => {
          const esquemasUsuario = (esquemas || []).filter((e: any) => e.rol === u.role && (e.profile_id === null || e.profile_id === u.id));
          const efectivos = Object.values(esquemasUsuario.reduce((acc: any, e: any) => {
            const prev = acc[e.tipo];
            if (!prev || (e.profile_id && !prev.profile_id)) acc[e.tipo] = e;
            return acc;
          }, {})) as any[];
          const base = (tipoEsq: string) =>
            tipoEsq === "pct_venta" ? (ventasPor.get(u.id) || 0)
            : tipoEsq === "pct_cobranza" ? ((cobranzaPorCobrador.get(u.id) || 0) + (cobranzaPorEntrega.get(u.id) || 0))
            : tipoEsq === "fijo_por_entrega" ? (entregasPor.get(u.id) || 0)
            : 0;
          const comision = efectivos.reduce((s, e) => s + (e.tipo === "fijo_por_entrega" ? base(e.tipo) * Number(e.valor) : base(e.tipo) * (Number(e.valor) / 100)), 0);
          return { nombre: u.nombre, rol: u.role, comision };
        }).filter((d: any) => d.comision > 0);
        titulo = `Comisiones devengadas — ${desde} a ${hasta}`;
        nombreArchivo = `comisiones_${desde}_${hasta}`;
        columnas = [
          { header: "Usuario", key: "nombre" }, { header: "Rol", key: "rol" },
          { header: "Comisión devengada", key: "comision", formato: fmtMoneda },
        ];
      }

      if (tipo === "stock") {
        const { data } = await supabase.from("productos").select("sku, nombre, unidad_medida, stock, listas_precio(lista, precio)").order("nombre");
        datos = (data || []).map((p: any) => ({
          ...p,
          precio1: p.listas_precio?.find((l: any) => l.lista === 1)?.precio,
          precio2: p.listas_precio?.find((l: any) => l.lista === 2)?.precio,
        }));
        titulo = "Stock de productos";
        nombreArchivo = "stock_productos";
        columnas = [
          { header: "SKU", key: "sku" }, { header: "Producto", key: "nombre" }, { header: "Unidad", key: "unidad_medida" },
          { header: "Stock", key: "stock" }, { header: "Precio L1", key: "precio1", formato: fmtMoneda }, { header: "Precio L2", key: "precio2", formato: fmtMoneda },
        ];
      }

      if (datos.length === 0) {
        setMensaje("No hay datos para los filtros seleccionados.");
        setGenerando(false);
        return;
      }

      if (formato === "pdf") await exportarPDF(titulo, columnas, datos, nombreArchivo, { nombre: tenant?.nombre, logoUrl: tenant?.logo_url });
      else await exportarExcel(titulo.slice(0, 30), columnas, datos, nombreArchivo);

      setMensaje(`Reporte generado: ${datos.length} registros.`);
    } catch (e: any) {
      setMensaje("Error al generar el reporte: " + (e?.message || "desconocido"));
    }
    setGenerando(false);
  }

  const reporteActual = REPORTES.find((r) => r.value === tipo)!;

  return (
    <div>
      <PageHeader title="Reportes" subtitle="Exportación a PDF o Excel, generada en el momento sobre datos reales" live />

      <div className="card">
        <div className="grid md:grid-cols-4 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="text-xs text-gray-500">Tipo de reporte</label>
            <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoReporte)}>
              {REPORTES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          {reporteActual.usaFechas && (
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
          )}
        </div>

        <div className="flex items-center gap-4 mt-4">
          <div className="flex gap-2">
            <button className={`btn-secondary text-xs ${formato === "pdf" ? "!bg-navy !text-white" : ""}`} onClick={() => setFormato("pdf")}>PDF</button>
            <button className={`btn-secondary text-xs ${formato === "excel" ? "!bg-navy !text-white" : ""}`} onClick={() => setFormato("excel")}>Excel</button>
          </div>
          <button className="btn-tech" onClick={generar} disabled={generando}>
            {generando ? "Generando…" : `Generar ${formato === "pdf" ? "PDF" : "Excel"}`}
          </button>
        </div>
        {mensaje && <p className="text-sm text-gray-600 mt-3">{mensaje}</p>}
      </div>
    </div>
  );
}
