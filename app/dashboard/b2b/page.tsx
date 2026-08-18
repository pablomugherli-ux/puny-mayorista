"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";

export default function B2BCatalogo() {
  const { profile } = useAuth();
  const [cliente, setCliente] = useState<any>(null);
  const [productos, setProductos] = useState<any[]>([]);
  const [descuentos, setDescuentos] = useState<any[]>([]);
  const [lista, setLista] = useState<1 | 2>(1);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.cliente_id) return;
    supabase.from("clientes").select("*").eq("id", profile.cliente_id).single().then(({ data }) => setCliente(data));
    supabase.from("productos").select("*, listas_precio(lista, precio)").eq("activo", true).order("nombre").then(({ data }) => setProductos(data || []));
    supabase.from("descuentos_volumen").select("*").then(({ data }) => setDescuentos(data || []));
  }, [profile]);

  function precioDe(prod: any, l: number) { return prod.listas_precio?.find((x: any) => x.lista === l)?.precio || 0; }
  function descuentoDe(productoId: string, l: number, cantidad: number) {
    const aplicables = descuentos.filter((d) => d.producto_id === productoId && d.lista === l && cantidad >= d.cantidad_minima);
    return aplicables.length ? Math.max(...aplicables.map((d) => d.descuento_pct)) : 0;
  }

  const items = productos.map((p) => {
    const cant = cantidades[p.id] || 0;
    if (cant <= 0) return null;
    const precio = precioDe(p, lista);
    const desc = descuentoDe(p.id, lista, cant);
    return { producto: p, cantidad: cant, precio, descuento: desc, subtotal: cant * precio * (1 - desc / 100) };
  }).filter(Boolean) as any[];
  const total = items.reduce((s, i) => s + i.subtotal, 0);

  async function confirmar() {
    if (!cliente || !profile || items.length === 0) return;
    setSaving(true);
    setError(null);
    setMensaje(null);
    const { data: pedido, error: errPedido } = await supabase
      .from("pedidos")
      .insert({ tenant_id: profile.tenant_id, cliente_id: cliente.id, lista, estado: "pendiente", origen: "b2b" })
      .select().single();
    if (errPedido || !pedido) {
      setError(
        errPedido?.message?.includes("row-level security") || errPedido?.code === "42501"
          ? "Tu cuenta no tiene habilitado operar esta lista de precios — pedile al Dueño/Administrador que revise tu acceso en Usuarios y Permisos."
          : `No se pudo enviar el pedido: ${errPedido?.message || "error desconocido"}.`
      );
      setSaving(false);
      return;
    }
    const { error: errItems } = await supabase.from("pedido_items").insert(items.map((i) => ({
      pedido_id: pedido.id, producto_id: i.producto.id, cantidad: i.cantidad, precio_unitario: i.precio, descuento_pct: i.descuento, subtotal: i.subtotal,
    })));
    if (errItems) {
      setError(`El pedido #${pedido.numero} se creó pero hubo un error al cargar los ítems: ${errItems.message}. Contactá al Dueño/Administrador.`);
      setSaving(false);
      return;
    }
    setMensaje(`Pedido #${pedido.numero} enviado correctamente. Podés seguir su estado en "Mis Pedidos".`);
    setCantidades({});
    setSaving(false);
  }

  if (!profile?.cliente_id) return <p className="text-gray-400">Tu usuario no está vinculado a una cuenta de cliente.</p>;

  return (
    <div>
      <PageHeader title={`Catálogo — ${cliente?.nombre || ""}`} subtitle="Autogestión 24/7: pedidos directos según tu lista habilitada" />
      {cliente && (
        <div className="card mb-4 flex gap-4 items-center">
          <label className="text-xs font-semibold text-gray-600">Lista de precio</label>
          <select className="input w-auto" value={lista} onChange={(e) => setLista(Number(e.target.value) as 1 | 2)}>
            {cliente.lista_1_habilitada && <option value={1}>Lista 1 — Oficial</option>}
            {cliente.lista_2_habilitada && <option value={2}>Lista 2</option>}
          </select>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead><tr><th>Producto</th><th>Precio</th><th>Cantidad</th><th>Desc. %</th><th>Subtotal</th></tr></thead>
          <tbody>
            {productos.map((p) => {
              const precio = precioDe(p, lista);
              const cant = cantidades[p.id] || 0;
              const desc = descuentoDe(p.id, lista, cant);
              return (
                <tr key={p.id}>
                  <td>{p.nombre}</td>
                  <td>{precio.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}</td>
                  <td><input type="number" min={0} className="input w-20" value={cant || ""} onChange={(e) => setCantidades({ ...cantidades, [p.id]: Number(e.target.value) })} /></td>
                  <td>{desc}%</td>
                  <td>{(cant * precio * (1 - desc / 100)).toLocaleString("es-AR", { style: "currency", currency: "ARS" })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex justify-between items-center mt-4 border-t pt-4">
          <div className="text-lg font-bold text-navy">Total: {total.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}</div>
          <button className="btn-primary" disabled={saving || items.length === 0} onClick={confirmar}>{saving ? "Enviando…" : "Confirmar pedido"}</button>
        </div>
        {mensaje && <p className="text-sm text-green-700 mt-2">{mensaje}</p>}
        {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 mt-2">{error}</p>}
      </div>
    </div>
  );
}
