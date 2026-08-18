"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PageHeader from "@/components/PageHeader";
import ListaBadge from "@/components/ListaBadge";
import { regresionLineal } from "@/lib/stats";

// recharts es pesada (~100kb+) y esta pantalla la usa el Vendedor a diario
// desde el celular, muchas veces con datos móviles — se carga en un chunk
// aparte, después del contenido principal (sugerencias de venta), en vez de
// bloquear el JS inicial de la página.
const GraficosHistorialCliente = dynamic(() => import("@/components/GraficosHistorialCliente"), {
  ssr: false,
  loading: () => <div className="card mb-6 text-xs text-gray-400 h-[220px] flex items-center justify-center">Cargando gráficos…</div>,
});

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function FichaClienteInner() {
  const params = useSearchParams();
  const clienteId = params.get("id") || "";
  const [cliente, setCliente] = useState<any>(null);
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [productosCatalogo, setProductosCatalogo] = useState<any[]>([]);
  const [ofertas, setOfertas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: p }, { data: prods }, { data: ofs }] = await Promise.all([
        supabase.from("clientes").select("*, circuitos(nombre)").eq("id", clienteId).single(),
        supabase.from("pedidos")
          .select("id, numero, fecha, estado, lista, total, pedido_items(cantidad, subtotal, producto_id, productos(id, nombre, created_at))")
          .eq("cliente_id", clienteId)
          .order("fecha", { ascending: true }),
        supabase.from("productos").select("id, nombre, created_at").eq("activo", true),
        supabase.from("ofertas").select("*, productos(id, nombre)").eq("activa", true),
      ]);
      setCliente(c);
      setPedidos(p || []);
      setProductosCatalogo(prods || []);
      setOfertas(ofs || []);
      setLoading(false);
    })();
  }, [clienteId]);

  const hoy = new Date();
  const pedidosValidos = pedidos.filter((p) => p.estado !== "rechazado" && p.estado !== "cancelado");

  // Serie mensual (últimos 6 meses con datos)
  const porMes = new Map<string, number>();
  pedidosValidos.forEach((p) => {
    const d = new Date(p.fecha);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    porMes.set(key, (porMes.get(key) || 0) + Number(p.total));
  });
  const serie = Array.from(porMes.entries())
    .sort((a, b) => (a[0] > b[0] ? 1 : -1))
    .slice(-6)
    .map(([key, total]) => {
      const [y, m] = key.split("-").map(Number);
      return { mes: `${MESES[m]} '${String(y).slice(2)}`, total };
    });
  const proy = regresionLineal(serie.map((s) => s.total));

  // Ranking de productos comprados históricamente
  const rankingMap = new Map<string, { nombre: string; unidades: number; ultima: string }>();
  pedidosValidos.forEach((p) => {
    (p.pedido_items || []).forEach((it: any) => {
      const nombre = it.productos?.nombre || "—";
      const prev = rankingMap.get(it.producto_id) || { nombre, unidades: 0, ultima: p.fecha };
      prev.unidades += Number(it.cantidad);
      if (p.fecha > prev.ultima) prev.ultima = p.fecha;
      rankingMap.set(it.producto_id, prev);
    });
  });
  const ranking = Array.from(rankingMap.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.unidades - a.unidades);

  // Sugerencia 1: productos habituales sin recompra en 45+ días
  const DIAS_RECOMPRA = 45;
  const sugerenciasRecompra = ranking.filter((r) => {
    const dias = (hoy.getTime() - new Date(r.ultima).getTime()) / 86400000;
    return dias >= DIAS_RECOMPRA;
  }).slice(0, 5);

  // Sugerencia 2: productos nuevos (alta reciente) que el cliente nunca compró
  const idsComprados = new Set(ranking.map((r) => r.id));
  const productosNuevos = productosCatalogo.filter((p) => {
    if (idsComprados.has(p.id)) return false;
    const diasAlta = (hoy.getTime() - new Date(p.created_at).getTime()) / 86400000;
    return diasAlta <= 30;
  });

  // Sugerencia 3: ofertas vigentes relevantes (sobre productos ya comprados o generales)
  const hoyStr = hoy.toISOString().slice(0, 10);
  const ofertasVigentes = ofertas.filter((o) => o.fecha_desde <= hoyStr && (!o.fecha_hasta || o.fecha_hasta >= hoyStr));
  const ofertasRelevantes = ofertasVigentes.filter((o) => !o.producto_id || idsComprados.has(o.producto_id));

  const fmt = (n: number) => Number(n).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

  if (loading) return <p className="text-gray-400">Cargando…</p>;
  if (!cliente) return <p className="text-red-600">Cliente no encontrado o sin acceso.</p>;

  return (
    <div>
      <PageHeader title={cliente.nombre} subtitle={`${cliente.direccion || "—"} · ${cliente.circuitos?.nombre || "Fuera de zona"}`} />

      <div className="mb-5 flex gap-2">
        <Link href={`/dashboard/campo/vendedor/nuevo-pedido?cliente=${cliente.id}`} className="btn-primary text-xs">Nuevo pedido</Link>
        <Link href="/dashboard/campo/vendedor" className="btn-secondary text-xs">Volver a mi cartera</Link>
      </div>

      {/* Panel de sugerencias — lo primero que ve el vendedor al entrar */}
      <div className="card mb-6 bg-amber-50 border-amber-200">
        <h3 className="text-sm font-semibold text-navy mb-3">Panel de venta — qué ofrecerle hoy</h3>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-xs font-semibold text-gray-600 mb-1">Recompra sugerida (sin pedir hace {DIAS_RECOMPRA}+ días)</div>
            {sugerenciasRecompra.length === 0 && <p className="text-xs text-gray-400">Sin sugerencias por ahora.</p>}
            <ul className="space-y-1">
              {sugerenciasRecompra.map((r) => (
                <li key={r.id} className="text-xs">• {r.nombre} <span className="text-gray-400">(última: {new Date(r.ultima).toLocaleDateString("es-AR")})</span></li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-600 mb-1">Productos nuevos que aún no compró</div>
            {productosNuevos.length === 0 && <p className="text-xs text-gray-400">No hay altas recientes pendientes.</p>}
            <ul className="space-y-1">
              {productosNuevos.map((p) => <li key={p.id} className="text-xs">• {p.nombre}</li>)}
            </ul>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-600 mb-1">Ofertas vigentes aplicables</div>
            {ofertasRelevantes.length === 0 && <p className="text-xs text-gray-400">Sin ofertas vigentes relevantes.</p>}
            <ul className="space-y-1">
              {ofertasRelevantes.map((o) => (
                <li key={o.id} className="text-xs">
                  • {o.titulo} — {o.productos?.nombre || "todo el catálogo"} {o.descuento_pct ? `(${o.descuento_pct}% off)` : o.precio_oferta ? `($${o.precio_oferta})` : ""}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <GraficosHistorialCliente serie={serie} proy={proy} fmt={fmt} />

      <div className="card mb-6 overflow-x-auto">
        <h3 className="text-sm font-semibold text-navy mb-3">Ranking histórico de productos comprados</h3>
        <table className="tbl">
          <thead><tr><th>Producto</th><th>Unidades históricas</th><th>Última compra</th></tr></thead>
          <tbody>
            {ranking.map((r) => (
              <tr key={r.id}>
                <td>{r.nombre}</td>
                <td>{r.unidades}</td>
                <td>{new Date(r.ultima).toLocaleDateString("es-AR")}</td>
              </tr>
            ))}
            {ranking.length === 0 && <tr><td colSpan={3} className="text-center text-gray-400 py-4">Sin compras registradas</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto">
        <h3 className="text-sm font-semibold text-navy mb-3">Historial de pedidos</h3>
        <table className="tbl">
          <thead><tr><th>N°</th><th>Fecha</th><th>Lista</th><th>Estado</th><th>Total</th></tr></thead>
          <tbody>
            {[...pedidos].reverse().map((p) => (
              <tr key={p.id}>
                <td>#{p.numero}</td>
                <td>{new Date(p.fecha).toLocaleDateString("es-AR")}</td>
                <td><ListaBadge lista={p.lista} /></td>
                <td className="capitalize">{p.estado.replace("_", " ")}</td>
                <td>{fmt(p.total)}</td>
              </tr>
            ))}
            {pedidos.length === 0 && <tr><td colSpan={5} className="text-center text-gray-400 py-4">Sin pedidos</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FichaCliente() {
  return (
    <Suspense fallback={<p className="text-gray-400">Cargando…</p>}>
      <FichaClienteInner />
    </Suspense>
  );
}
