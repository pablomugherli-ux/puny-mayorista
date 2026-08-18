"use client";
import { Fragment, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";

const fmtFecha = (s: string | null) => (s ? new Date(s).toLocaleDateString("es-AR") : "—");

const ESTADO_OC_LABEL: Record<string, string> = {
  sugerida: "Sugerida",
  confirmada: "Confirmada",
  recibida: "Recibida",
  cancelada: "Cancelada",
};
const ESTADO_OC_BADGE: Record<string, string> = {
  sugerida: "bg-amber-100 text-amber-700",
  confirmada: "bg-blue-100 text-blue-700",
  recibida: "bg-green-100 text-green-700",
  cancelada: "bg-red-100 text-red-700",
};

async function tenantId() {
  const { data: u } = await supabase.auth.getUser();
  const { data: p } = await supabase.from("profiles").select("tenant_id").eq("id", u.user?.id).single();
  return p?.tenant_id as string;
}

type Tab = "compras" | "depositos";

// Antes toda la sección de Stock era un único componente monolítico: un
// Encargado de Depósitos (permiso_depositos) veía también los botones de
// Compras (crear/confirmar/cancelar orden de compra, config de stock
// mínimo) aunque la RLS ya se lo bloqueara al hacer clic. Se separa en dos
// pestañas — Compras y Depósitos — cada una gateada por su propio permiso,
// mismo patrón que Tesorería.
export default function StockAdmin() {
  const { profile, tenant, permisos } = useAuth();
  const esTotal = !!profile && ["dueno", "administrador"].includes(profile.role);
  // RBAC dinámico — Fase 5: profiles.permiso_stock/permiso_depositos quedan
  // retiradas; se lee directo de mis_permisos_activos() (Fase 4).
  const veCompras = esTotal || permisos.has("stock.acceso");
  const veDepositos = esTotal || permisos.has("depositos.acceso");

  const TABS = ([
    ["compras", "Compras", veCompras],
    ["depositos", "Depósitos", veDepositos],
  ] as const).filter(([, , visible]) => visible);

  const [tab, setTab] = useState<Tab | null>(null);
  useEffect(() => {
    if (!tab && TABS.length) setTab(TABS[0][0] as Tab);
  }, [TABS.length]);

  return (
    <div>
      <PageHeader
        title="Stock y Compras"
        subtitle="Stock mínimo, órdenes de compra, depósitos, trazabilidad por lote y toma de inventario."
      />
      {TABS.length > 1 && (
        <div className="flex gap-2 mb-5 flex-wrap">
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k as Tab)} className={tab === k ? "btn-primary" : "btn-secondary"}>{label}</button>
          ))}
        </div>
      )}
      {!TABS.length && <p className="text-sm text-gray-400">No tenés acceso a ninguna sección de este módulo.</p>}
      {tab === "compras" && <TabCompras />}
      {tab === "depositos" && <TabDepositos diasAlertaVencimiento={tenant?.dias_alerta_vencimiento_stock || 30} />}
    </div>
  );
}

// ============================================================================
// Compras — stock mínimo por producto, órdenes de compra
// ============================================================================
function TabCompras() {
  const [productos, setProductos] = useState<any[]>([]);
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [ordenes, setOrdenes] = useState<any[]>([]);
  const [items, setItems] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [nuevaOc, setNuevaOc] = useState({ proveedor_id: "", producto_id: "", cantidad: "", costo_unitario: "" });

  async function load() {
    const [{ data: p }, { data: prov }, { data: oc }] = await Promise.all([
      supabase.from("productos").select("*").order("nombre"),
      supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
      supabase.from("ordenes_compra").select("*, proveedores(nombre)").order("fecha", { ascending: false }),
    ]);
    setProductos(p || []);
    setProveedores(prov || []);
    setOrdenes(oc || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function abrirOrden(id: string) {
    if (expandida === id) { setExpandida(null); return; }
    setExpandida(id);
    if (!items[id]) {
      const { data } = await supabase.from("orden_compra_items").select("*, productos(nombre, sku)").eq("orden_id", id);
      setItems((it) => ({ ...it, [id]: data || [] }));
    }
  }

  async function cambiarEstadoOc(id: string, estado: string) {
    await supabase.from("ordenes_compra").update({ estado }).eq("id", id);
    load();
  }

  async function guardarConfig(producto: any, campo: string, valor: any) {
    await supabase.from("productos").update({ [campo]: valor }).eq("id", producto.id);
    setProductos((ps) => ps.map((p) => (p.id === producto.id ? { ...p, [campo]: valor } : p)));
  }

  async function crearOcManual(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevaOc.producto_id || !nuevaOc.cantidad) return;
    const tid = await tenantId();
    const { data: orden } = await supabase.from("ordenes_compra").insert({
      tenant_id: tid,
      proveedor_id: nuevaOc.proveedor_id || null,
      estado: "sugerida",
      generada_automaticamente: false,
      criterio: "producto",
      notas: "Creada manualmente.",
    }).select().single();
    if (orden) {
      await supabase.from("orden_compra_items").insert({
        orden_id: orden.id,
        producto_id: nuevaOc.producto_id,
        cantidad: Number(nuevaOc.cantidad),
        costo_unitario: nuevaOc.costo_unitario ? Number(nuevaOc.costo_unitario) : null,
      });
    }
    setNuevaOc({ proveedor_id: "", producto_id: "", cantidad: "", costo_unitario: "" });
    load();
  }

  const bajoMinimo = productos.filter((p) => p.stock_minimo > 0 && Number(p.stock) <= Number(p.stock_minimo));

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard label="Productos bajo mínimo" value={String(bajoMinimo.length)} />
        <StatCard label="Órdenes de compra abiertas" value={String(ordenes.filter((o) => o.estado === "sugerida" || o.estado === "confirmada").length)} />
      </div>

      {bajoMinimo.length > 0 && (
        <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="text-sm font-semibold text-amber-800 mb-1">Stock bajo mínimo</div>
          <ul className="text-sm text-amber-800 space-y-0.5">
            {bajoMinimo.map((p) => (
              <li key={p.id}>{p.nombre}: {p.stock} {p.unidad_medida} (mínimo {p.stock_minimo}) — se generó/actualizó una orden de compra sugerida automáticamente.</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card overflow-x-auto mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Configuración de stock mínimo por producto</h3>
        <p className="text-xs text-gray-400 mb-3">Solo el Dueño puede modificar esta configuración (edición de catálogo).</p>
        <table className="tbl">
          <thead><tr><th>Producto</th><th>Rubro</th><th>Stock actual</th><th>Stock mínimo</th><th>Proveedor preferido</th><th>Vence</th></tr></thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.id}>
                <td className="font-medium">{p.nombre}</td>
                <td>
                  <input className="input text-xs" defaultValue={p.rubro || ""} onBlur={(e) => guardarConfig(p, "rubro", e.target.value || null)} placeholder="Rubro" />
                </td>
                <td>{p.stock} {p.unidad_medida}</td>
                <td>
                  <input className="input text-xs w-24" type="number" min={0} step="0.01" defaultValue={p.stock_minimo}
                    onBlur={(e) => guardarConfig(p, "stock_minimo", Number(e.target.value))} />
                </td>
                <td>
                  <select className="input text-xs" defaultValue={p.proveedor_preferido_id || ""} onChange={(e) => guardarConfig(p, "proveedor_preferido_id", e.target.value || null)}>
                    <option value="">Sin asignar</option>
                    {proveedores.map((pr) => <option key={pr.id} value={pr.id}>{pr.nombre}</option>)}
                  </select>
                </td>
                <td>
                  <input className="input text-xs" type="date" defaultValue={p.fecha_vencimiento || ""} onBlur={(e) => guardarConfig(p, "fecha_vencimiento", e.target.value || null)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Crear orden de compra manual</h3>
        <form onSubmit={crearOcManual} className="grid grid-cols-3 gap-2">
          <select className="input" value={nuevaOc.proveedor_id} onChange={(e) => setNuevaOc({ ...nuevaOc, proveedor_id: e.target.value })}>
            <option value="">Proveedor…</option>
            {proveedores.map((pr) => <option key={pr.id} value={pr.id}>{pr.nombre}</option>)}
          </select>
          <select className="input" value={nuevaOc.producto_id} onChange={(e) => setNuevaOc({ ...nuevaOc, producto_id: e.target.value })} required>
            <option value="">Producto…</option>
            {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <input className="input" type="number" min="0.01" step="0.01" placeholder="Cantidad" value={nuevaOc.cantidad} onChange={(e) => setNuevaOc({ ...nuevaOc, cantidad: e.target.value })} required />
          <input className="input" type="number" min="0" step="0.01" placeholder="Costo unitario (opcional)" value={nuevaOc.costo_unitario} onChange={(e) => setNuevaOc({ ...nuevaOc, costo_unitario: e.target.value })} />
          <button className="btn-primary col-span-3">Crear orden</button>
        </form>
        <p className="text-xs text-gray-400 mt-2">
          Si cargás el costo unitario, al recibir la orden se actualiza automáticamente el costo promedio ponderado del producto.
        </p>
      </div>

      <div className="card overflow-x-auto">
        <h3 className="text-sm font-semibold text-navy mb-3">Órdenes de compra</h3>
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead><tr><th>Fecha</th><th>Proveedor</th><th>Origen</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {ordenes.map((o) => (
                <Fragment key={o.id}>
                  <tr>
                    <td>{fmtFecha(o.fecha)}</td>
                    <td>{o.proveedores?.nombre || "Sin asignar"}</td>
                    <td>{o.generada_automaticamente ? "Automática (stock bajo mínimo)" : "Manual"}</td>
                    <td><span className={`badge ${ESTADO_OC_BADGE[o.estado]}`}>{ESTADO_OC_LABEL[o.estado]}</span></td>
                    <td><button className="btn-secondary" onClick={() => abrirOrden(o.id)}>{expandida === o.id ? "Cerrar" : "Ver"}</button></td>
                  </tr>
                  {expandida === o.id && (
                    <tr>
                      <td colSpan={5} className="bg-gray-50">
                        <div className="p-3 overflow-x-auto">
                          <table className="tbl mb-3">
                            <thead><tr><th>Producto</th><th>SKU</th><th>Cantidad</th></tr></thead>
                            <tbody>
                              {(items[o.id] || []).map((it) => (
                                <tr key={it.id}><td>{it.productos?.nombre}</td><td>{it.productos?.sku}</td><td>{it.cantidad}</td></tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="flex gap-2">
                            {o.estado === "sugerida" && <button className="btn-primary" onClick={() => cambiarEstadoOc(o.id, "confirmada")}>Confirmar</button>}
                            {o.estado === "confirmada" && <button className="btn-primary" onClick={() => cambiarEstadoOc(o.id, "recibida")}>Marcar recibida (suma stock)</button>}
                            {o.estado !== "recibida" && o.estado !== "cancelada" && <button className="btn-secondary" onClick={() => cambiarEstadoOc(o.id, "cancelada")}>Cancelar</button>}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Depósitos — distribución entre depósitos, transferencias, trazabilidad por
// lote/vencimiento y toma de inventario masiva
// ============================================================================
function TabDepositos({ diasAlertaVencimiento }: { diasAlertaVencimiento: number }) {
  const [productos, setProductos] = useState<any[]>([]);
  const [depositos, setDepositos] = useState<any[]>([]);
  const [stockDepositos, setStockDepositos] = useState<any[]>([]);
  const [lotes, setLotes] = useState<any[]>([]);
  const [nuevoDeposito, setNuevoDeposito] = useState("");
  const [transferencia, setTransferencia] = useState({ producto_id: "", origen: "", destino: "", cantidad: "" });
  const [avisoTransferencia, setAvisoTransferencia] = useState<{ texto: string; error?: boolean } | null>(null);
  const [nuevoLote, setNuevoLote] = useState({ producto_id: "", numero_lote: "", fecha_vencimiento: "", cantidad: "", deposito_id: "" });
  const [conteos, setConteos] = useState<Record<string, string>>({});
  const [guardandoInventario, setGuardandoInventario] = useState(false);
  const [resultadoInventario, setResultadoInventario] = useState<{ ajustados: number } | null>(null);

  async function load() {
    const [{ data: p }, { data: dep }, { data: sd }, { data: lt }] = await Promise.all([
      supabase.from("productos").select("*").order("nombre"),
      supabase.from("depositos").select("*").order("es_principal", { ascending: false }).order("nombre"),
      supabase.from("stock_por_deposito").select("*"),
      supabase.from("lotes_producto").select("*, productos(nombre)").order("fecha_vencimiento", { ascending: true, nullsFirst: false }),
    ]);
    setProductos(p || []);
    setDepositos(dep || []);
    setStockDepositos(sd || []);
    setLotes(lt || []);
  }
  useEffect(() => { load(); }, []);

  async function crearLote(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevoLote.producto_id || !nuevoLote.numero_lote || !nuevoLote.cantidad) return;
    const tid = await tenantId();
    await supabase.from("lotes_producto").insert({
      tenant_id: tid, producto_id: nuevoLote.producto_id, numero_lote: nuevoLote.numero_lote,
      fecha_vencimiento: nuevoLote.fecha_vencimiento || null, cantidad: Number(nuevoLote.cantidad),
      deposito_id: nuevoLote.deposito_id || null,
    });
    setNuevoLote({ producto_id: "", numero_lote: "", fecha_vencimiento: "", cantidad: "", deposito_id: "" });
    load();
  }

  async function eliminarLote(id: string) {
    await supabase.from("lotes_producto").delete().eq("id", id);
    load();
  }

  function diasParaVencer(fecha: string | null) {
    if (!fecha) return null;
    return Math.ceil((new Date(fecha).getTime() - Date.now()) / 86400000);
  }

  async function crearDeposito(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevoDeposito.trim()) return;
    const tid = await tenantId();
    await supabase.from("depositos").insert({ tenant_id: tid, nombre: nuevoDeposito.trim() });
    setNuevoDeposito("");
    load();
  }

  async function transferirStock(e: React.FormEvent) {
    e.preventDefault();
    setAvisoTransferencia(null);
    const { producto_id, origen, destino, cantidad } = transferencia;
    if (!producto_id || !origen || !destino || !cantidad) return;
    const { error } = await supabase.rpc("fn_transferir_stock", {
      p_producto_id: producto_id, p_origen_deposito_id: origen, p_destino_deposito_id: destino, p_cantidad: Number(cantidad),
    });
    if (error) {
      setAvisoTransferencia({ texto: error.message.replace(/^.*?: /, ""), error: true });
    } else {
      setAvisoTransferencia({ texto: "Transferencia registrada." });
      setTransferencia({ producto_id: "", origen: "", destino: "", cantidad: "" });
      load();
    }
  }

  function cantidadEnDeposito(productoId: string, depositoId: string) {
    return stockDepositos.find((sd) => sd.producto_id === productoId && sd.deposito_id === depositoId)?.cantidad ?? 0;
  }

  async function guardarInventario(e: React.FormEvent) {
    e.preventDefault();
    const entradas = Object.entries(conteos).filter(([, v]) => v.trim() !== "");
    if (entradas.length === 0) return;
    setGuardandoInventario(true);
    setResultadoInventario(null);
    let ajustados = 0;
    for (const [productoId, valor] of entradas) {
      const { error } = await supabase.rpc("fn_ajustar_stock", {
        p_producto_id: productoId,
        p_cantidad_nueva: Number(valor),
        p_motivo: "Toma de inventario masiva",
      });
      if (!error) ajustados++;
    }
    setResultadoInventario({ ajustados });
    setConteos({});
    setGuardandoInventario(false);
    load();
  }

  const lotesPorVencer = lotes.filter((l) => {
    if (!l.fecha_vencimiento) return false;
    const dias = (new Date(l.fecha_vencimiento).getTime() - Date.now()) / 86400000;
    return dias <= diasAlertaVencimiento;
  });

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard label="Depósitos activos" value={String(depositos.length)} />
        <StatCard label={`Lotes por vencer (${diasAlertaVencimiento} días)`} value={String(lotesPorVencer.length)} />
      </div>

      <div className="card overflow-x-auto mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Depósitos y distribución de stock</h3>
        <p className="text-xs text-gray-400 mb-3">
          El total por producto siempre es el mismo (suma de todos los depósitos); esto muestra cómo está
          repartido entre depósitos. Las ventas y compras siguen operando sobre el total — mové stock a un depósito
          secundario con la transferencia de abajo, y volvé a moverlo antes de venderlo si hace falta.
        </p>
        <table className="tbl mb-4">
          <thead><tr><th>Producto</th>{depositos.map((d) => <th key={d.id}>{d.nombre}{d.es_principal ? " (principal)" : ""}</th>)}</tr></thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.id}>
                <td>{p.nombre}</td>
                {depositos.map((d) => <td key={d.id}>{cantidadEnDeposito(p.id, d.id)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="grid md:grid-cols-2 gap-4">
          <form onSubmit={crearDeposito} className="flex gap-2">
            <input className="input" placeholder="Nombre del nuevo depósito" value={nuevoDeposito} onChange={(e) => setNuevoDeposito(e.target.value)} />
            <button className="btn-secondary shrink-0">Crear depósito</button>
          </form>

          <form onSubmit={transferirStock} className="space-y-2">
            <div className="flex gap-2">
              <select className="input" value={transferencia.producto_id} onChange={(e) => setTransferencia({ ...transferencia, producto_id: e.target.value })} required>
                <option value="">Producto…</option>
                {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <input className="input w-24" type="number" min="0.01" step="0.01" placeholder="Cant." value={transferencia.cantidad} onChange={(e) => setTransferencia({ ...transferencia, cantidad: e.target.value })} required />
            </div>
            <div className="flex gap-2 items-center">
              <select className="input" value={transferencia.origen} onChange={(e) => setTransferencia({ ...transferencia, origen: e.target.value })} required>
                <option value="">Desde…</option>
                {depositos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
              <span className="text-xs text-gray-400">→</span>
              <select className="input" value={transferencia.destino} onChange={(e) => setTransferencia({ ...transferencia, destino: e.target.value })} required>
                <option value="">Hacia…</option>
                {depositos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
            </div>
            <button className="btn-primary">Transferir</button>
            {avisoTransferencia && (
              <p className={`text-xs rounded-md px-3 py-2 border ${avisoTransferencia.error ? "text-red-700 bg-red-50 border-red-200" : "text-green-700 bg-green-50 border-green-200"}`}>
                {avisoTransferencia.texto}
              </p>
            )}
          </form>
        </div>
      </div>

      <div className="card overflow-x-auto mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Trazabilidad por lote / vencimiento</h3>
        <p className="text-xs text-gray-400 mb-3">
          Registro informativo por partida — no reemplaza el stock total del producto ni elige automáticamente qué
          lote se vende primero; sirve para saber qué partidas tenés y cuáles vencen antes.
        </p>
        <form onSubmit={crearLote} className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          <select className="input" value={nuevoLote.producto_id} onChange={(e) => setNuevoLote({ ...nuevoLote, producto_id: e.target.value })} required>
            <option value="">Producto…</option>
            {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <input className="input" placeholder="N° de lote" value={nuevoLote.numero_lote} onChange={(e) => setNuevoLote({ ...nuevoLote, numero_lote: e.target.value })} required />
          <input className="input" type="date" value={nuevoLote.fecha_vencimiento} onChange={(e) => setNuevoLote({ ...nuevoLote, fecha_vencimiento: e.target.value })} />
          <input className="input" type="number" min="0.01" step="0.01" placeholder="Cantidad" value={nuevoLote.cantidad} onChange={(e) => setNuevoLote({ ...nuevoLote, cantidad: e.target.value })} required />
          <select className="input" value={nuevoLote.deposito_id} onChange={(e) => setNuevoLote({ ...nuevoLote, deposito_id: e.target.value })}>
            <option value="">Depósito (opcional)</option>
            {depositos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
          </select>
          <button className="btn-primary col-span-2 md:col-span-5">Registrar lote</button>
        </form>
        <table className="tbl">
          <thead><tr><th>Producto</th><th>Lote</th><th>Cantidad</th><th>Vence</th><th></th></tr></thead>
          <tbody>
            {lotes.map((l) => {
              const dias = diasParaVencer(l.fecha_vencimiento);
              return (
                <tr key={l.id}>
                  <td>{l.productos?.nombre}</td>
                  <td>{l.numero_lote}</td>
                  <td>{l.cantidad}</td>
                  <td>
                    {l.fecha_vencimiento ? fmtFecha(l.fecha_vencimiento) : "—"}
                    {dias != null && dias <= 30 && (
                      <span className={`badge ml-2 ${dias < 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                        {dias < 0 ? "Vencido" : `${dias} días`}
                      </span>
                    )}
                  </td>
                  <td><button className="text-danger text-xs" onClick={() => eliminarLote(l.id)}>Eliminar</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Toma de inventario masiva</h3>
        <p className="text-xs text-gray-400 mb-3">
          Cargá el stock real contado para cada producto que necesites ajustar (dejá vacíos los que no cambiaron) y guardá. Cada ajuste queda registrado en la auditoría de stock.
        </p>
        <form onSubmit={guardarInventario}>
          <div className="overflow-x-auto max-h-96 overflow-y-auto border border-gray-100 rounded">
            <table className="tbl">
              <thead>
                <tr><th>SKU</th><th>Producto</th><th>Stock sistema</th><th>Stock real (conteo)</th></tr>
              </thead>
              <tbody>
                {productos.map((p) => (
                  <tr key={p.id}>
                    <td>{p.sku}</td>
                    <td>{p.nombre}</td>
                    <td>{p.stock}</td>
                    <td>
                      <input
                        className="input w-28"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="—"
                        value={conteos[p.id] || ""}
                        onChange={(e) => setConteos({ ...conteos, [p.id]: e.target.value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn-primary mt-3" disabled={guardandoInventario}>
            {guardandoInventario ? "Guardando…" : "Aplicar ajustes de inventario"}
          </button>
          {resultadoInventario && (
            <span className="ml-3 text-sm text-navy">
              {resultadoInventario.ajustados} producto(s) ajustado(s) correctamente.
            </span>
          )}
        </form>
      </div>
    </div>
  );
}
