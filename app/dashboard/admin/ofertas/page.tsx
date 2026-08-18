"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PageHeader from "@/components/PageHeader";

type Oferta = {
  id: string; producto_id: string | null; titulo: string; descripcion: string | null;
  descuento_pct: number | null; precio_oferta: number | null;
  fecha_desde: string; fecha_hasta: string | null; activa: boolean;
  productos?: { nombre: string } | null;
};

export default function OfertasAdmin() {
  const [rows, setRows] = useState<Oferta[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    producto_id: "", titulo: "", descripcion: "", descuento_pct: "", precio_oferta: "",
    fecha_desde: new Date().toISOString().slice(0, 10), fecha_hasta: "",
  });

  async function load() {
    const [{ data: o }, { data: p }] = await Promise.all([
      supabase.from("ofertas").select("*, productos(nombre)").order("fecha_desde", { ascending: false }),
      supabase.from("productos").select("id, nombre").eq("activo", true).order("nombre"),
    ]);
    setRows((o as any) || []);
    setProductos(p || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { data: perfil } = await supabase.from("profiles").select("tenant_id").eq("id", u.user?.id).single();
    await supabase.from("ofertas").insert({
      tenant_id: perfil?.tenant_id,
      producto_id: form.producto_id || null,
      titulo: form.titulo,
      descripcion: form.descripcion || null,
      descuento_pct: form.descuento_pct ? Number(form.descuento_pct) : null,
      precio_oferta: form.precio_oferta ? Number(form.precio_oferta) : null,
      fecha_desde: form.fecha_desde,
      fecha_hasta: form.fecha_hasta || null,
    });
    setForm({ producto_id: "", titulo: "", descripcion: "", descuento_pct: "", precio_oferta: "", fecha_desde: new Date().toISOString().slice(0, 10), fecha_hasta: "" });
    await load();
    setSaving(false);
  }

  async function toggleActiva(o: Oferta) {
    await supabase.from("ofertas").update({ activa: !o.activa }).eq("id", o.id);
    load();
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const vigente = (o: Oferta) => o.activa && o.fecha_desde <= hoy && (!o.fecha_hasta || o.fecha_hasta >= hoy);

  return (
    <div>
      <PageHeader title="Ofertas vigentes" subtitle="Promociones activas que alimentan el panel de sugerencias del vendedor y el catálogo" />

      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Nueva oferta</h3>
        <form onSubmit={crear} className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <select className="input" value={form.producto_id} onChange={(e) => setForm({ ...form, producto_id: e.target.value })}>
            <option value="">Todo el catálogo</option>
            {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <input className="input col-span-2" placeholder="Título" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} required />
          <input className="input" type="number" placeholder="Descuento %" value={form.descuento_pct} onChange={(e) => setForm({ ...form, descuento_pct: e.target.value })} />
          <input className="input" type="number" placeholder="Precio oferta ($)" value={form.precio_oferta} onChange={(e) => setForm({ ...form, precio_oferta: e.target.value })} />
          <input className="input" type="date" value={form.fecha_desde} onChange={(e) => setForm({ ...form, fecha_desde: e.target.value })} />
          <input className="input" type="date" placeholder="Hasta (opcional)" value={form.fecha_hasta} onChange={(e) => setForm({ ...form, fecha_hasta: e.target.value })} />
          <input className="input col-span-2" placeholder="Descripción (opcional, visible en el panel del vendedor)" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          <button className="btn-primary col-span-2" disabled={saving}>{saving ? "Guardando…" : "Publicar oferta"}</button>
        </form>
      </div>

      <div className="card overflow-x-auto">
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead><tr><th>Título</th><th>Producto</th><th>Beneficio</th><th>Vigencia</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td>{o.titulo}{o.descripcion && <div className="text-xs text-gray-400">{o.descripcion}</div>}</td>
                  <td>{o.productos?.nombre || "Todo el catálogo"}</td>
                  <td>{o.descuento_pct ? `${o.descuento_pct}% off` : o.precio_oferta ? `$${o.precio_oferta}` : "—"}</td>
                  <td className="text-xs">{o.fecha_desde} → {o.fecha_hasta || "sin fin"}</td>
                  <td>
                    <span className={`badge ${vigente(o) ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {vigente(o) ? "Vigente" : o.activa ? "Fuera de fecha" : "Desactivada"}
                    </span>
                  </td>
                  <td>
                    <button className="text-xs text-accent underline" onClick={() => toggleActiva(o)}>
                      {o.activa ? "Desactivar" : "Reactivar"}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-6">Sin ofertas cargadas</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
