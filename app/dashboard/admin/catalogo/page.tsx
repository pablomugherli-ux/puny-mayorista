"use client";
import { Fragment, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { buscarColumna, parsearFecha, parsearNumeroOpcional } from "@/lib/importUtils";
import PageHeader from "@/components/PageHeader";
import CodigoProducto from "@/components/CodigoProducto";

type Prod = {
  id: string; sku: string; nombre: string; unidad_medida: string; stock: number;
  es_combo: boolean; es_fraccionado: boolean; producto_base_id: string | null;
  costo_promedio: number | null;
  rubro: string | null; subrubro: string | null;
  proveedores: { nombre: string } | null;
  listas_precio: { lista: number; precio: number; actualizado_en: string }[];
};

type ResultadoImportPrecios = {
  totales: number; creados: number; actualizados: number; alertas: number; errores: number;
  mensajesAlerta: string[];
};

type ComboItem = { id: string; item_producto_id: string; cantidad: number };

const TIPOS = [
  { value: "normal", label: "Producto normal" },
  { value: "combo", label: "Combo (varios productos empaquetados)" },
  { value: "fraccionado", label: "Fraccionado (porción de un producto a granel)" },
] as const;

export default function CatalogoAdmin() {
  const [rows, setRows] = useState<Prod[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    sku: "", nombre: "", unidad_medida: "unidad", stock: 0, precio1: 0, precio2: 0,
    tipo: "normal" as (typeof TIPOS)[number]["value"], producto_base_id: "",
  });
  const [saving, setSaving] = useState(false);

  const [gestionando, setGestionando] = useState<string | null>(null);
  const [combo, setCombo] = useState<ComboItem[]>([]);
  const [nuevoItem, setNuevoItem] = useState({ item_producto_id: "", cantidad: 1 });

  const [importandoPrecios, setImportandoPrecios] = useState(false);
  const [resultadoImportPrecios, setResultadoImportPrecios] = useState<ResultadoImportPrecios | null>(null);

  async function load() {
    const { data } = await supabase
      .from("productos")
      .select("id, sku, nombre, unidad_medida, stock, es_combo, es_fraccionado, producto_base_id, costo_promedio, rubro, subrubro, proveedores(nombre), listas_precio(lista, precio, actualizado_en)")
      .order("nombre");
    setRows((data as any) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function crearProducto(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data: prof } = await supabase.auth.getUser();
    const { data: perfil } = await supabase.from("profiles").select("tenant_id").eq("id", prof.user?.id).single();
    const { data: nuevo, error } = await supabase
      .from("productos")
      .insert({
        tenant_id: perfil?.tenant_id,
        sku: form.sku,
        nombre: form.nombre,
        unidad_medida: form.unidad_medida,
        stock: form.stock,
        es_combo: form.tipo === "combo",
        es_fraccionado: form.tipo === "fraccionado",
        producto_base_id: form.tipo === "fraccionado" && form.producto_base_id ? form.producto_base_id : null,
      })
      .select()
      .single();
    if (!error && nuevo) {
      await supabase.from("listas_precio").insert([
        { tenant_id: perfil?.tenant_id, producto_id: nuevo.id, lista: 1, precio: form.precio1 },
        { tenant_id: perfil?.tenant_id, producto_id: nuevo.id, lista: 2, precio: form.precio2 },
      ]);
      setForm({ sku: "", nombre: "", unidad_medida: "unidad", stock: 0, precio1: 0, precio2: 0, tipo: "normal", producto_base_id: "" });
      await load();
    }
    setSaving(false);
  }

  // Importación de listas de precios de proveedores. Cada fila se procesa
  // vía el RPC fn_importar_producto_lista_precio (SECURITY DEFINER), que
  // hace el upsert completo (producto por SKU=código de barra, proveedor,
  // costo cotizado, listas 1/público y 2/mayorista) del lado del servidor.
  async function importarListaPrecios(file: File) {
    setImportandoPrecios(true);
    setResultadoImportPrecios(null);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
      if (rows.length < 2) throw new Error("El archivo no tiene filas de datos.");

      const headers = rows[0].map((h) => String(h ?? ""));
      const idxFecha = buscarColumna(headers, ["fecha", "date"]);
      const idxCodigo = buscarColumna(headers, ["codigo de barra", "código de barra", "codigo de barras", "código de barras", "sku", "codigo", "código", "ean", "barcode"]);
      const idxDescripcion = buscarColumna(headers, ["descripcion", "descripción", "producto", "nombre", "detalle"]);
      const idxRubro = buscarColumna(headers, ["rubro", "categoria", "categoría"]);
      const idxSubrubro = buscarColumna(headers, ["subrubro", "subcategoria", "subcategoría"]);
      const idxProveedor = buscarColumna(headers, ["proveedor"]);
      const idxCosto = buscarColumna(headers, ["costo", "costo unitario", "precio costo"]);
      const idxPorcentaje = buscarColumna(headers, ["porcentaje de ganancia", "% de ganancia", "% ganancia", "porcentaje ganancia", "margen", "% margen"]);
      const idxPrecioPublico = buscarColumna(headers, ["precio de publico", "precio de público", "precio publico", "precio público", "precio consumidor final", "pvp"]);
      const idxPrecioMayorista = buscarColumna(headers, ["precio mayorista", "precio por mayor", "precio distribuidor"]);

      if (idxDescripcion === -1) {
        throw new Error("No se reconoce la columna de Descripción. Es obligatoria para poder identificar el producto.");
      }

      let creados = 0, actualizados = 0, alertas = 0, errores = 0;
      const mensajesAlerta: string[] = [];
      const dataRows = rows.slice(1).filter((r) => r.some((c) => c !== undefined && c !== ""));

      for (const row of dataRows) {
        try {
          const descripcion = String(row[idxDescripcion] ?? "").trim();
          if (!descripcion) { errores++; continue; }

          const { data, error } = await supabase.rpc("fn_importar_producto_lista_precio", {
            p_sku: idxCodigo !== -1 ? String(row[idxCodigo] ?? "").trim() || null : null,
            p_descripcion: descripcion,
            p_rubro: idxRubro !== -1 ? String(row[idxRubro] ?? "").trim() || null : null,
            p_subrubro: idxSubrubro !== -1 ? String(row[idxSubrubro] ?? "").trim() || null : null,
            p_proveedor_nombre: idxProveedor !== -1 ? String(row[idxProveedor] ?? "").trim() || null : null,
            p_costo: idxCosto !== -1 ? parsearNumeroOpcional(row[idxCosto]) : null,
            p_porcentaje_ganancia: idxPorcentaje !== -1 ? parsearNumeroOpcional(row[idxPorcentaje]) : null,
            p_precio_publico: idxPrecioPublico !== -1 ? parsearNumeroOpcional(row[idxPrecioPublico]) : null,
            p_precio_mayorista: idxPrecioMayorista !== -1 ? parsearNumeroOpcional(row[idxPrecioMayorista]) : null,
            p_fecha: idxFecha !== -1 ? parsearFecha(row[idxFecha]) : null,
          });
          if (error || !data || !data[0]) { errores++; continue; }
          const r = data[0];
          if (r.r_accion === "creado") creados++; else actualizados++;
          if (r.r_alerta_precio) {
            alertas++;
            mensajesAlerta.push(`${descripcion}: ${r.r_mensaje}`);
          }
        } catch {
          errores++;
        }
      }

      const { data: prof } = await supabase.auth.getUser();
      const { data: perfil } = await supabase.from("profiles").select("tenant_id").eq("id", prof.user?.id).single();
      await supabase.from("importaciones_listas_precio").insert({
        tenant_id: perfil?.tenant_id, importado_por: prof.user?.id, nombre_archivo: file.name,
        filas_totales: dataRows.length, filas_creadas: creados, filas_actualizadas: actualizados,
        filas_con_alerta_precio: alertas, filas_error: errores,
      });

      setResultadoImportPrecios({ totales: dataRows.length, creados, actualizados, alertas, errores, mensajesAlerta });
      await load();
    } catch (e: any) {
      alert(e?.message || "No se pudo procesar el archivo.");
    }
    setImportandoPrecios(false);
  }

  const [historialAbierto, setHistorialAbierto] = useState<string | null>(null);
  const [historialCosto, setHistorialCosto] = useState<any[]>([]);
  const [historialPrecio, setHistorialPrecio] = useState<any[]>([]);

  async function abrirHistorial(p: Prod) {
    if (historialAbierto === p.id) {
      setHistorialAbierto(null);
      return;
    }
    setHistorialAbierto(p.id);
    const [{ data: costo }, { data: precio }] = await Promise.all([
      supabase.from("movimientos_costo_stock").select("tipo, cantidad, costo_unitario, costo_promedio_anterior, costo_promedio_nuevo, created_at").eq("producto_id", p.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("listas_precio_historial").select("lista, precio_anterior, precio_nuevo, cambiado_en").eq("producto_id", p.id).order("cambiado_en", { ascending: false }).limit(20),
    ]);
    setHistorialCosto(costo || []);
    setHistorialPrecio(precio || []);
  }

  async function abrirGestion(p: Prod) {
    if (gestionando === p.id) {
      setGestionando(null);
      return;
    }
    setGestionando(p.id);
    const { data } = await supabase.from("producto_combo_items").select("id, item_producto_id, cantidad").eq("combo_id", p.id);
    setCombo((data as ComboItem[]) || []);
    setNuevoItem({ item_producto_id: "", cantidad: 1 });
  }

  async function agregarItemCombo(comboId: string) {
    if (!nuevoItem.item_producto_id || nuevoItem.cantidad <= 0) return;
    const { data: prof } = await supabase.auth.getUser();
    const { data: perfil } = await supabase.from("profiles").select("tenant_id").eq("id", prof.user?.id).single();
    const { error } = await supabase.from("producto_combo_items").insert({
      tenant_id: perfil?.tenant_id, combo_id: comboId,
      item_producto_id: nuevoItem.item_producto_id, cantidad: nuevoItem.cantidad,
    });
    if (!error) {
      const { data } = await supabase.from("producto_combo_items").select("id, item_producto_id, cantidad").eq("combo_id", comboId);
      setCombo((data as ComboItem[]) || []);
      setNuevoItem({ item_producto_id: "", cantidad: 1 });
    }
  }

  async function quitarItemCombo(comboId: string, itemId: string) {
    await supabase.from("producto_combo_items").delete().eq("id", itemId);
    const { data } = await supabase.from("producto_combo_items").select("id, item_producto_id, cantidad").eq("combo_id", comboId);
    setCombo((data as ComboItem[]) || []);
  }

  const fmt = (n: number) => Number(n).toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  const nombreDe = (id: string) => rows.find((r) => r.id === id)?.nombre || "—";

  return (
    <div>
      <PageHeader title="Catálogo de Productos" subtitle="Precios Lista 1 (facturado) y Lista 2 (gestión interna) por producto, incluyendo combos y fraccionados" />

      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Nuevo producto</h3>
        <form onSubmit={crearProducto} className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <input className="input" placeholder="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required />
          <input className="input col-span-2" placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
          <input className="input" placeholder="Unidad" value={form.unidad_medida} onChange={(e) => setForm({ ...form, unidad_medida: e.target.value })} />
          <input className="input" type="number" placeholder="Stock" value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} />
          <select className="input" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as any, producto_base_id: "" })}>
            {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          {form.tipo === "fraccionado" && (
            <select className="input col-span-2" value={form.producto_base_id} onChange={(e) => setForm({ ...form, producto_base_id: e.target.value })} required>
              <option value="">Producto a granel de origen…</option>
              {rows.filter((r) => !r.es_combo && !r.es_fraccionado).map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          )}
          <input className="input" type="number" placeholder="Precio Lista 1" value={form.precio1} onChange={(e) => setForm({ ...form, precio1: Number(e.target.value) })} />
          <input className="input" type="number" placeholder="Precio Lista 2" value={form.precio2} onChange={(e) => setForm({ ...form, precio2: Number(e.target.value) })} />
          <button className="btn-primary col-span-2 md:col-span-2" disabled={saving}>{saving ? "Guardando…" : "Agregar producto"}</button>
        </form>
        {form.tipo === "combo" && (
          <p className="text-xs text-gray-400 mt-2">
            Después de crearlo, abrí "Gestionar" en la fila del combo para elegir qué productos y en qué cantidad lo componen.
          </p>
        )}
      </div>

      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Importar lista de precios de un proveedor</h3>
        <p className="text-xs text-gray-500 mb-3">
          Subí el archivo en Excel o CSV con columnas Fecha, Código de barra, Descripción, Rubro, Subrubro,
          Proveedor, Costo, % de Ganancia, Precio de Público y Precio Mayorista (los nombres de columna se
          reconocen de forma flexible). El código de barra matchea contra el SKU del producto: si no existe, se
          crea el producto con un código provisorio (para asignarle uno real después) y, si el proveedor tampoco
          existe, se da de alta automáticamente. El costo se guarda como cotización de ese proveedor puntual — no
          pisa el costo promedio del producto, que sigue gobernado por tus compras reales. Si el % de ganancia
          declarado no coincide con el precio mayorista informado (con cierta tolerancia), la fila se marca en el
          resumen para que la revises, pero igual se importa.
        </p>
        <div className="flex gap-2 items-center flex-wrap">
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            disabled={importandoPrecios}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importarListaPrecios(f); e.target.value = ""; }}
            className="text-sm"
          />
          {importandoPrecios && <span className="text-xs text-gray-400">Procesando…</span>}
        </div>
        {resultadoImportPrecios && (
          <div className="text-sm mt-3 bg-green-50 border border-green-200 rounded-md px-3 py-2 text-green-700">
            <p>
              {resultadoImportPrecios.totales} filas leídas — {resultadoImportPrecios.creados} productos creados,{" "}
              {resultadoImportPrecios.actualizados} actualizados, {resultadoImportPrecios.errores} con error.
              {resultadoImportPrecios.alertas > 0 && ` ${resultadoImportPrecios.alertas} con alerta de precio.`}
            </p>
            {resultadoImportPrecios.mensajesAlerta.length > 0 && (
              <ul className="text-xs text-amber-700 mt-2 space-y-0.5">
                {resultadoImportPrecios.mensajesAlerta.slice(0, 15).map((m, i) => <li key={i}>⚠ {m}</li>)}
                {resultadoImportPrecios.mensajesAlerta.length > 15 && <li>… y {resultadoImportPrecios.mensajesAlerta.length - 15} más.</li>}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="card overflow-x-auto">
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead>
              <tr>
                <th>SKU</th><th>Producto</th><th>Rubro</th><th>Proveedor</th><th>Tipo</th><th>Unidad</th><th>Stock</th>
                <th>Costo prom.</th><th>Precio Lista 1</th><th>Margen</th><th>Precio Lista 2</th><th>Código</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const p1 = p.listas_precio?.find((l) => l.lista === 1)?.precio;
                const p2 = p.listas_precio?.find((l) => l.lista === 2)?.precio;
                const p1Fecha = p.listas_precio?.find((l) => l.lista === 1)?.actualizado_en;
                const p2Fecha = p.listas_precio?.find((l) => l.lista === 2)?.actualizado_en;
                const fechaCorta = (iso?: string) => iso ? new Date(iso).toLocaleDateString("es-AR") : null;
                return (
                  <Fragment key={p.id}>
                    <tr>
                      <td>{p.sku}</td>
                      <td>
                        {p.nombre}
                        {p.subrubro && <div className="text-[11px] text-gray-400">{p.subrubro}</div>}
                      </td>
                      <td className="text-xs text-gray-500">{p.rubro || "—"}</td>
                      <td className="text-xs text-gray-500">{p.proveedores?.nombre || "—"}</td>
                      <td>
                        {p.es_combo && <span className="badge bg-amber-100 text-amber-700">Combo</span>}
                        {p.es_fraccionado && <span className="badge bg-blue-100 text-blue-700">Fraccionado{p.producto_base_id ? ` de ${nombreDe(p.producto_base_id)}` : ""}</span>}
                        {!p.es_combo && !p.es_fraccionado && <span className="text-gray-300">—</span>}
                      </td>
                      <td>{p.unidad_medida}</td>
                      <td>{p.stock}</td>
                      <td>{p.costo_promedio ? fmt(p.costo_promedio) : "—"}</td>
                      <td>
                        {p1 != null ? fmt(p1) : "—"}
                        {fechaCorta(p1Fecha) && <div className="text-[10px] text-gray-400">act. {fechaCorta(p1Fecha)}</div>}
                      </td>
                      <td>
                        {p.costo_promedio && p1 != null ? (
                          <span className={p1 - p.costo_promedio >= 0 ? "text-green-700" : "text-danger"}>
                            {fmt(p1 - p.costo_promedio)} ({(((p1 - p.costo_promedio) / p.costo_promedio) * 100).toFixed(1)}%)
                          </span>
                        ) : "—"}
                      </td>
                      <td>
                        {p2 != null ? fmt(p2) : "—"}
                        {fechaCorta(p2Fecha) && <div className="text-[10px] text-gray-400">act. {fechaCorta(p2Fecha)}</div>}
                      </td>
                      <td><CodigoProducto sku={p.sku} nombre={p.nombre} /></td>
                      <td className="space-x-1 whitespace-nowrap">
                        {p.es_combo && (
                          <button type="button" className="btn-secondary text-xs" onClick={() => abrirGestion(p)}>
                            {gestionando === p.id ? "Cerrar" : "Gestionar"}
                          </button>
                        )}
                        <button type="button" className="btn-secondary text-xs" onClick={() => abrirHistorial(p)}>
                          {historialAbierto === p.id ? "Cerrar" : "Historial"}
                        </button>
                      </td>
                    </tr>
                    {historialAbierto === p.id && (
                      <tr>
                        <td colSpan={13} className="bg-gray-50">
                          <div className="p-3 grid md:grid-cols-2 gap-4 overflow-x-auto">
                            <div>
                              <p className="text-xs font-semibold text-navy mb-2">Historial de costo/stock (últimos 20 movimientos)</p>
                              {historialCosto.length === 0 ? <p className="text-xs text-gray-400">Sin movimientos registrados.</p> : (
                                <table className="tbl">
                                  <thead><tr><th>Fecha</th><th>Tipo</th><th>Cant.</th><th>Costo unit.</th><th>Costo prom. antes → después</th></tr></thead>
                                  <tbody>
                                    {historialCosto.map((m, i) => (
                                      <tr key={i}>
                                        <td>{new Date(m.created_at).toLocaleString("es-AR")}</td>
                                        <td>{m.tipo}</td>
                                        <td>{m.cantidad}</td>
                                        <td>{m.costo_unitario != null ? fmt(m.costo_unitario) : "—"}</td>
                                        <td>{m.costo_promedio_anterior != null ? fmt(m.costo_promedio_anterior) : "—"} → {fmt(m.costo_promedio_nuevo)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-navy mb-2">Historial de precios (últimos 20 cambios)</p>
                              {historialPrecio.length === 0 ? <p className="text-xs text-gray-400">Sin cambios registrados.</p> : (
                                <table className="tbl">
                                  <thead><tr><th>Fecha</th><th>Lista</th><th>Precio antes → después</th></tr></thead>
                                  <tbody>
                                    {historialPrecio.map((h, i) => (
                                      <tr key={i}>
                                        <td>{new Date(h.cambiado_en).toLocaleString("es-AR")}</td>
                                        <td>{h.lista === 1 ? "Público" : "Mayorista"}</td>
                                        <td>{h.precio_anterior != null ? fmt(h.precio_anterior) : "—"} → {fmt(h.precio_nuevo)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    {gestionando === p.id && p.es_combo && (
                      <tr>
                        <td colSpan={13} className="bg-gray-50">
                          <div className="p-3 space-y-2 overflow-x-auto">
                            <p className="text-xs font-semibold text-navy">Composición del combo (solo informativa — el stock del combo se maneja por su propio SKU)</p>
                            <table className="tbl">
                              <thead><tr><th>Producto</th><th>Cantidad</th><th></th></tr></thead>
                              <tbody>
                                {combo.map((it) => (
                                  <tr key={it.id}>
                                    <td>{nombreDe(it.item_producto_id)}</td>
                                    <td>{it.cantidad}</td>
                                    <td><button type="button" className="text-danger text-xs" onClick={() => quitarItemCombo(p.id, it.id)}>Quitar</button></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div className="flex gap-2">
                              <select className="input" value={nuevoItem.item_producto_id} onChange={(e) => setNuevoItem({ ...nuevoItem, item_producto_id: e.target.value })}>
                                <option value="">Producto…</option>
                                {rows.filter((r) => r.id !== p.id && !r.es_combo).map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                              </select>
                              <input className="input w-24" type="number" min={1} value={nuevoItem.cantidad} onChange={(e) => setNuevoItem({ ...nuevoItem, cantidad: Number(e.target.value) })} />
                              <button type="button" className="btn-primary shrink-0" onClick={() => agregarItemCombo(p.id)}>Agregar</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-3">
        Un combo o un fraccionado es, para el resto del sistema, un producto más: tiene su propio SKU, su propio
        stock y se escanea igual que cualquier otro en "Nuevo Pedido". El armado físico (pesar, embolsar o
        empaquetar) es una tarea de depósito — reflejá el stock de ese SKU cuando lo tengas armado.
      </p>
    </div>
  );
}
