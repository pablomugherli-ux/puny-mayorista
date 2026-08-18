"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";

const fmt = (n: number) => Number(n || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" });

export default function MasivoPOS() {
  const { profile } = useAuth();
  const [productos, setProductos] = useState<any[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [carrito, setCarrito] = useState<Record<string, number>>({});
  const [nombreCliente, setNombreCliente] = useState("Consumidor Final");
  const [telefonoCliente, setTelefonoCliente] = useState("");
  const [medioPago, setMedioPago] = useState<"efectivo" | "transferencia" | "tarjeta">("efectivo");
  const [cobrando, setCobrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ultimoTicket, setUltimoTicket] = useState<any | null>(null);
  const [ventasHoy, setVentasHoy] = useState({ cantidad: 0, total: 0 });

  async function loadProductos() {
    const { data } = await supabase.from("productos").select("*, listas_precio(lista, precio)").eq("activo", true).order("nombre");
    setProductos(data || []);
  }
  async function loadVentasHoy() {
    if (!profile) return;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const { data } = await supabase.from("pedidos").select("id, total").eq("tenant_id", profile.tenant_id).eq("canal_venta", "masivo").eq("origen", "pos").gte("created_at", hoy.toISOString());
    setVentasHoy({ cantidad: (data || []).length, total: (data || []).reduce((s, p: any) => s + Number(p.total || 0), 0) });
  }
  useEffect(() => { loadProductos(); }, []);
  useEffect(() => { loadVentasHoy(); }, [profile?.tenant_id]);

  const precioDe = (prod: any) => prod.listas_precio?.find((l: any) => l.lista === 1)?.precio || 0;

  const productosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return productos.slice(0, 30);
    return productos.filter((p) => p.nombre.toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q)).slice(0, 30);
  }, [productos, busqueda]);

  const items = Object.entries(carrito)
    .map(([id, cant]) => {
      const prod = productos.find((p) => p.id === id);
      if (!prod || cant <= 0) return null;
      const precio = precioDe(prod);
      return { producto: prod, cantidad: cant, precio, subtotal: precio * cant };
    })
    .filter(Boolean) as any[];

  const total = items.reduce((s, i) => s + i.subtotal, 0);
  const itemsSinStock = items.filter((i) => i.cantidad > (i.producto.stock ?? 0));

  function agregar(prod: any) {
    setCarrito({ ...carrito, [prod.id]: (carrito[prod.id] || 0) + 1 });
  }
  function actualizarCantidad(id: string, cant: number) {
    setCarrito({ ...carrito, [id]: Math.max(0, cant) });
  }
  function quitar(id: string) {
    const c = { ...carrito };
    delete c[id];
    setCarrito(c);
  }

  async function cobrar() {
    if (!profile || items.length === 0 || itemsSinStock.length > 0) return;
    setCobrando(true);
    setError(null);
    try {
      let clienteId: string;
      const { data: clienteExistente } = telefonoCliente
        ? await supabase.from("clientes").select("id").eq("tenant_id", profile.tenant_id).eq("telefono", telefonoCliente).maybeSingle()
        : { data: null };
      if (clienteExistente) {
        clienteId = clienteExistente.id;
      } else {
        const { data: nuevoCliente, error: errCliente } = await supabase.from("clientes").insert({
          tenant_id: profile.tenant_id, nombre: nombreCliente || "Consumidor Final", telefono: telefonoCliente || null, canal_origen: "masivo", vendedor_id: profile.id,
        }).select().single();
        if (errCliente) throw errCliente;
        clienteId = nuevoCliente.id;
      }

      const { data: pedido, error: errPedido } = await supabase.from("pedidos").insert({
        tenant_id: profile.tenant_id, cliente_id: clienteId, vendedor_id: profile.id, lista: 1,
        estado: "entregado", origen: "pos", canal_venta: "masivo", total,
      }).select().single();
      if (errPedido) throw errPedido;

      const { error: errItems } = await supabase.from("pedido_items").insert(
        items.map((i) => ({ pedido_id: pedido.id, producto_id: i.producto.id, cantidad: i.cantidad, precio_unitario: i.precio, descuento_pct: 0, subtotal: i.subtotal }))
      );
      if (errItems) throw errItems;

      const { data: comprobante, error: errComp } = await supabase.from("comprobantes").insert({
        tenant_id: profile.tenant_id, pedido_id: pedido.id, cliente_id: clienteId, lista: 1, tipo: "factura",
        total, saldo_pendiente: 0, estado: "pagado",
      }).select().single();
      if (errComp) throw errComp;

      setUltimoTicket({ numero: comprobante.numero, total, items, medioPago, cliente: nombreCliente });
      setCarrito({});
      setNombreCliente("Consumidor Final");
      setTelefonoCliente("");
      loadVentasHoy();
      loadProductos();
    } catch (e: any) {
      setError(e.message || "Error al cobrar la venta.");
    }
    setCobrando(false);
  }

  return (
    <div>
      <PageHeader title="PUNY MASIVO — Punto de Venta" subtitle="Venta rápida al mostrador (canal B2C), reutilizando el mismo catálogo y stock del canal mayorista." />

      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard label="Ventas de hoy (Masivo)" value={String(ventasHoy.cantidad)} tech />
        <StatCard label="Total facturado hoy (Masivo)" value={fmt(ventasHoy.total)} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 card">
          <input className="input mb-3" placeholder="Buscar producto por nombre o SKU…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2" style={{ maxHeight: 420, overflowY: "auto" }}>
            {productosFiltrados.map((p) => (
              <button key={p.id} onClick={() => agregar(p)} className="border border-gray-200 rounded p-2 text-left hover:bg-gray-50">
                <div className="text-sm font-medium truncate">{p.nombre}</div>
                <div className="text-xs text-gray-400">Stock: {p.stock ?? 0}</div>
                <div className="text-sm text-navy font-semibold">{fmt(precioDe(p))}</div>
              </button>
            ))}
            {productosFiltrados.length === 0 && <p className="text-gray-400 text-sm">Sin resultados.</p>}
          </div>
        </div>

        <div className="card flex flex-col">
          <h3 className="text-sm font-semibold text-navy mb-3">Carrito</h3>
          <div className="flex-1 overflow-y-auto space-y-2 mb-3" style={{ maxHeight: 300 }}>
            {items.map((i) => (
              <div key={i.producto.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">{i.producto.nombre}</span>
                <input type="number" className="input w-16 text-center" value={i.cantidad} min={0} onChange={(e) => actualizarCantidad(i.producto.id, Number(e.target.value))} />
                <span className="w-20 text-right">{fmt(i.subtotal)}</span>
                <button className="text-danger text-xs" onClick={() => quitar(i.producto.id)}>×</button>
              </div>
            ))}
            {items.length === 0 && <p className="text-gray-400 text-xs">Carrito vacío.</p>}
          </div>
          {itemsSinStock.length > 0 && <p className="text-danger text-xs mb-2">Sin stock suficiente: {itemsSinStock.map((i) => i.producto.nombre).join(", ")}</p>}
          <div className="border-t border-gray-100 pt-2 mb-2">
            <input className="input mb-1" placeholder="Nombre del cliente" value={nombreCliente} onChange={(e) => setNombreCliente(e.target.value)} />
            <input className="input mb-1" placeholder="Teléfono (opcional, para identificar clientes recurrentes)" value={telefonoCliente} onChange={(e) => setTelefonoCliente(e.target.value)} />
            <select className="input" value={medioPago} onChange={(e) => setMedioPago(e.target.value as any)}>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="tarjeta">Tarjeta</option>
            </select>
          </div>
          <div className="text-lg font-semibold text-navy mb-2">Total: {fmt(total)}</div>
          {error && <p className="text-danger text-xs mb-2">{error}</p>}
          <button className="btn-primary" disabled={cobrando || items.length === 0 || itemsSinStock.length > 0} onClick={cobrar}>
            {cobrando ? "Cobrando…" : "Cobrar"}
          </button>
          {ultimoTicket && (
            <div className="text-xs text-gray-500 mt-2 border-t border-gray-100 pt-2">
              Ticket #{ultimoTicket.numero} — {fmt(ultimoTicket.total)} — {ultimoTicket.medioPago} — {ultimoTicket.cliente}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
