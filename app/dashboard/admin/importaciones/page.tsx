"use client";
import { Fragment, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PageHeader from "@/components/PageHeader";

const ESTADO_LABEL: Record<string, string> = {
  borrador: "Borrador",
  en_transito: "En tránsito",
  nacionalizada: "Nacionalizada",
  cancelada: "Cancelada",
};
const ESTADO_BADGE: Record<string, string> = {
  borrador: "bg-gray-100 text-gray-600",
  en_transito: "bg-blue-100 text-blue-700",
  nacionalizada: "bg-green-100 text-green-700",
  cancelada: "bg-red-100 text-red-700",
};

const fmt = (n: number, m = "ARS") => {
  try { return new Intl.NumberFormat("es-AR", { style: "currency", currency: m }).format(n || 0); }
  catch { return `${m} ${Number(n || 0).toFixed(2)}`; }
};
const fmtFecha = (s: string | null) => (s ? new Date(s).toLocaleDateString("es-AR") : "—");

async function tenantId() {
  const { data: u } = await supabase.auth.getUser();
  const { data: p } = await supabase.from("profiles").select("tenant_id").eq("id", u.user?.id).single();
  return p?.tenant_id as string;
}

export default function ImportacionesAdmin() {
  const [importaciones, setImportaciones] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [items, setItems] = useState<Record<string, any[]>>({});
  const [expandida, setExpandida] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({ proveedor_id: "", numero_referencia: "", fecha: new Date().toISOString().slice(0, 10), moneda: "USD", tipo_cambio: "", flete: "0", seguro: "0", derechos_importacion: "0", otros_gastos: "0", notas: "" });
  const [itemsForm, setItemsForm] = useState([{ producto_id: "", cantidad: "", fob_unitario: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nacionalizando, setNacionalizando] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: imp }, { data: prod }, { data: prov }] = await Promise.all([
      supabase.from("importaciones").select("*, proveedores(nombre)").order("fecha", { ascending: false }),
      supabase.from("productos").select("id, sku, nombre").order("nombre"),
      supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
    ]);
    setImportaciones(imp || []);
    setProductos(prod || []);
    setProveedores(prov || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function abrir(id: string) {
    if (expandida === id) { setExpandida(null); return; }
    setExpandida(id);
    if (!items[id]) {
      const { data } = await supabase.from("importacion_items").select("*, productos(nombre, sku)").eq("importacion_id", id);
      setItems((it) => ({ ...it, [id]: data || [] }));
    }
  }

  function actualizarItem(i: number, campo: string, valor: string) {
    setItemsForm((its) => its.map((it, idx) => (idx === i ? { ...it, [campo]: valor } : it)));
  }
  function agregarItem() {
    setItemsForm((its) => [...its, { producto_id: "", cantidad: "", fob_unitario: "" }]);
  }
  function quitarItem(i: number) {
    setItemsForm((its) => its.filter((_, idx) => idx !== i));
  }

  const totalFob = itemsForm.reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.fob_unitario) || 0), 0);

  async function crearImportacion(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const validos = itemsForm.filter((it) => it.producto_id && Number(it.cantidad) > 0 && Number(it.fob_unitario) >= 0);
    if (validos.length === 0) {
      setError("Cargá al menos un ítem con producto, cantidad y valor FOB unitario.");
      return;
    }
    if (!form.tipo_cambio || Number(form.tipo_cambio) <= 0) {
      setError("Indicá el tipo de cambio a aplicar.");
      return;
    }
    setSaving(true);
    const tid = await tenantId();
    const { data: u } = await supabase.auth.getUser();
    const { data: imp, error: err } = await supabase.from("importaciones").insert({
      tenant_id: tid,
      proveedor_id: form.proveedor_id || null,
      numero_referencia: form.numero_referencia || null,
      fecha: form.fecha,
      moneda: form.moneda,
      tipo_cambio: Number(form.tipo_cambio),
      flete: Number(form.flete) || 0,
      seguro: Number(form.seguro) || 0,
      derechos_importacion: Number(form.derechos_importacion) || 0,
      otros_gastos: Number(form.otros_gastos) || 0,
      notas: form.notas || null,
      created_by: u.user?.id,
    }).select().single();
    if (err || !imp) {
      setError(err?.message || "No se pudo crear la importación.");
      setSaving(false);
      return;
    }
    await supabase.from("importacion_items").insert(
      validos.map((it) => ({ tenant_id: tid, importacion_id: imp.id, producto_id: it.producto_id, cantidad: Number(it.cantidad), fob_unitario: Number(it.fob_unitario) }))
    );
    setForm({ proveedor_id: "", numero_referencia: "", fecha: new Date().toISOString().slice(0, 10), moneda: "USD", tipo_cambio: "", flete: "0", seguro: "0", derechos_importacion: "0", otros_gastos: "0", notas: "" });
    setItemsForm([{ producto_id: "", cantidad: "", fob_unitario: "" }]);
    setSaving(false);
    load();
  }

  async function nacionalizar(id: string) {
    setNacionalizando(id);
    const { error: err } = await supabase.rpc("fn_nacionalizar_importacion", { p_importacion_id: id });
    if (err) {
      alert(err.message.replace(/^.*?: /, ""));
    } else {
      setItems((it) => { const c = { ...it }; delete c[id]; return c; });
      load();
    }
    setNacionalizando(null);
  }

  async function cambiarEstado(id: string, estado: string) {
    await supabase.from("importaciones").update({ estado }).eq("id", id);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Importaciones"
        subtitle="Registro de importaciones, ítems FOB y gastos (flete, seguro, derechos). Al nacionalizar, el costo de importación por unidad se prorratea entre los ítems y actualiza automáticamente el stock y el costo promedio de cada producto."
      />

      <div className="card mb-6 overflow-x-auto">
        <h3 className="text-sm font-semibold text-navy mb-3">Nueva importación</h3>
        <form onSubmit={crearImportacion}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <select className="input" value={form.proveedor_id} onChange={(e) => setForm({ ...form, proveedor_id: e.target.value })}>
              <option value="">Proveedor (opcional)…</option>
              {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <input className="input" placeholder="N° de referencia / despacho" value={form.numero_referencia} onChange={(e) => setForm({ ...form, numero_referencia: e.target.value })} />
            <input className="input" type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
            <select className="input" value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value })}>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="ARS">ARS</option>
            </select>
            <input className="input" type="number" min="0.0001" step="0.0001" placeholder={`Tipo de cambio (${form.moneda} → ARS)`} value={form.tipo_cambio} onChange={(e) => setForm({ ...form, tipo_cambio: e.target.value })} required />
            <input className="input" type="number" min="0" step="0.01" placeholder="Flete (ARS)" value={form.flete} onChange={(e) => setForm({ ...form, flete: e.target.value })} />
            <input className="input" type="number" min="0" step="0.01" placeholder="Seguro (ARS)" value={form.seguro} onChange={(e) => setForm({ ...form, seguro: e.target.value })} />
            <input className="input" type="number" min="0" step="0.01" placeholder="Derechos de importación (ARS)" value={form.derechos_importacion} onChange={(e) => setForm({ ...form, derechos_importacion: e.target.value })} />
            <input className="input" type="number" min="0" step="0.01" placeholder="Otros gastos (ARS)" value={form.otros_gastos} onChange={(e) => setForm({ ...form, otros_gastos: e.target.value })} />
            <input className="input col-span-2 md:col-span-3" placeholder="Notas" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </div>

          <table className="tbl mb-2">
            <thead><tr><th>Producto</th><th>Cantidad</th><th>FOB unitario ({form.moneda})</th><th>Subtotal FOB</th><th></th></tr></thead>
            <tbody>
              {itemsForm.map((it, i) => (
                <tr key={i}>
                  <td>
                    <select className="input" value={it.producto_id} onChange={(e) => actualizarItem(i, "producto_id", e.target.value)}>
                      <option value="">Producto…</option>
                      {productos.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.nombre}</option>)}
                    </select>
                  </td>
                  <td><input className="input w-28" type="number" min="0.01" step="0.01" value={it.cantidad} onChange={(e) => actualizarItem(i, "cantidad", e.target.value)} /></td>
                  <td><input className="input w-28" type="number" min="0" step="0.01" value={it.fob_unitario} onChange={(e) => actualizarItem(i, "fob_unitario", e.target.value)} /></td>
                  <td>{fmt((Number(it.cantidad) || 0) * (Number(it.fob_unitario) || 0), form.moneda)}</td>
                  <td>{itemsForm.length > 1 && <button type="button" className="text-danger text-xs" onClick={() => quitarItem(i)}>Quitar</button>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold"><td colSpan={3}>Total FOB</td><td>{fmt(totalFob, form.moneda)}</td><td></td></tr>
            </tfoot>
          </table>
          <div className="flex items-center gap-3">
            <button type="button" className="btn-secondary text-xs" onClick={agregarItem}>+ Agregar ítem</button>
            <button className="btn-primary" disabled={saving}>{saving ? "Guardando…" : "Registrar importación"}</button>
          </div>
          {error && <p className="text-danger text-xs mt-2">{error}</p>}
        </form>
      </div>

      <div className="card overflow-x-auto">
        <h3 className="text-sm font-semibold text-navy mb-3">Importaciones registradas</h3>
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead>
              <tr><th>Referencia</th><th>Proveedor</th><th>Fecha</th><th>Moneda / T.C.</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {importaciones.map((imp) => (
                <Fragment key={imp.id}>
                  <tr>
                    <td>{imp.numero_referencia || "—"}</td>
                    <td>{imp.proveedores?.nombre || "—"}</td>
                    <td>{fmtFecha(imp.fecha)}</td>
                    <td>{imp.moneda} / {imp.tipo_cambio}</td>
                    <td><span className={`badge ${ESTADO_BADGE[imp.estado]}`}>{ESTADO_LABEL[imp.estado]}</span></td>
                    <td className="whitespace-nowrap">
                      <button className="btn-secondary text-xs mr-2" onClick={() => abrir(imp.id)}>{expandida === imp.id ? "Cerrar" : "Ver detalle"}</button>
                      {imp.estado !== "nacionalizada" && imp.estado !== "cancelada" && (
                        <button className="btn-primary text-xs mr-2" disabled={nacionalizando === imp.id} onClick={() => nacionalizar(imp.id)}>
                          {nacionalizando === imp.id ? "Nacionalizando…" : "Nacionalizar"}
                        </button>
                      )}
                      {imp.estado === "borrador" && (
                        <button className="text-danger text-xs" onClick={() => cambiarEstado(imp.id, "cancelada")}>Cancelar</button>
                      )}
                    </td>
                  </tr>
                  {expandida === imp.id && (
                    <tr>
                      <td colSpan={6} className="bg-gray-50">
                        <div className="overflow-x-auto">
                          <table className="tbl">
                            <thead><tr><th>Producto</th><th>Cantidad</th><th>FOB unitario</th><th>Costo de importación / unidad (ARS)</th></tr></thead>
                            <tbody>
                              {(items[imp.id] || []).map((it: any) => (
                                <tr key={it.id}>
                                  <td>{it.productos?.sku} — {it.productos?.nombre}</td>
                                  <td>{it.cantidad}</td>
                                  <td>{fmt(it.fob_unitario, imp.moneda)}</td>
                                  <td>{it.costo_unitario_ars != null ? fmt(it.costo_unitario_ars) : <span className="text-gray-400">Se calcula al nacionalizar</span>}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {imp.notas && <p className="text-xs text-gray-500 mt-2">Notas: {imp.notas}</p>}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {importaciones.length === 0 && <tr><td colSpan={6} className="text-gray-400">Sin importaciones registradas.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-3">
        "Nacionalizar" reparte flete, seguro, derechos de importación y otros gastos entre los ítems en proporción a su
        valor FOB, calcula el costo de importación por unidad en pesos y lo suma al stock del producto actualizando su
        costo promedio ponderado — igual que al recibir una orden de compra local. Esta acción es irreversible y solo
        puede ejecutarse una vez por importación.
      </p>
    </div>
  );
}
