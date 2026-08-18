"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PageHeader from "@/components/PageHeader";

export default function ClientesAdmin() {
  const [rows, setRows] = useState<any[]>([]);
  const [circuitos, setCircuitos] = useState<any[]>([]);
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    nombre: "", razon_social: "", cuit: "", direccion: "", lat: -34.6037, lng: -58.3816,
    telefono: "", email: "", lista_1: true, lista_2: false, limite_credito: 0, vendedor_id: "", circuito_id: "",
  });
  const [saving, setSaving] = useState(false);

  const PAGE_SIZE = 50;
  const [pagina, setPagina] = useState(0);
  const [hayMas, setHayMas] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);

  // Circuitos y vendedores son catálogos chicos (para los <select> del formulario) y se cargan completos una sola vez.
  async function loadFiltros() {
    const [{ data: cir }, { data: v }] = await Promise.all([
      supabase.from("circuitos").select("id, nombre"),
      supabase.from("profiles").select("id, nombre").eq("role", "vendedor"),
    ]);
    setCircuitos(cir || []);
    setVendedores(v || []);
  }

  // Esta pantalla no tiene buscador/filtro de texto: la lista de clientes se pagina directamente contra la tabla.
  async function load(reset = true) {
    const desde = reset ? 0 : pagina * PAGE_SIZE;
    const hasta = desde + PAGE_SIZE - 1;
    const { data } = await supabase
      .from("clientes")
      .select("*, circuitos(nombre), profiles:vendedor_id(nombre)")
      .order("nombre")
      .range(desde, hasta);
    if (reset) {
      setRows(data || []);
      setPagina(1);
    } else {
      setRows((prev) => [...prev, ...(data || [])]);
      setPagina((p) => p + 1);
    }
    setHayMas((data || []).length === PAGE_SIZE);
    setLoading(false);
  }
  useEffect(() => { loadFiltros(); load(true); }, []);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { data: p } = await supabase.from("profiles").select("tenant_id").eq("id", u.user?.id).single();
    await supabase.from("clientes").insert({
      tenant_id: p?.tenant_id,
      nombre: form.nombre, razon_social: form.razon_social, cuit: form.cuit, direccion: form.direccion,
      lat: form.lat, lng: form.lng, telefono: form.telefono, email: form.email,
      lista_1_habilitada: form.lista_1, lista_2_habilitada: form.lista_2,
      limite_credito: form.limite_credito,
      vendedor_id: form.vendedor_id || null, circuito_id: form.circuito_id || null,
    });
    setSaving(false);
    setForm({ ...form, nombre: "", razon_social: "", cuit: "", direccion: "", telefono: "", email: "" });
    load(true);
  }

  return (
    <div>
      <PageHeader title="Clientes" subtitle="Cartera comercial y habilitación de listas de precio por cliente" />

      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Nuevo cliente</h3>
        <form onSubmit={crear} className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input className="input" placeholder="Nombre comercial" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
          <input className="input" placeholder="Razón social" value={form.razon_social} onChange={(e) => setForm({ ...form, razon_social: e.target.value })} />
          <input className="input" placeholder="CUIT" value={form.cuit} onChange={(e) => setForm({ ...form, cuit: e.target.value })} />
          <input className="input" placeholder="Dirección" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
          <input className="input" placeholder="Teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
          <input className="input" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="input" type="number" step="0.0001" placeholder="Latitud" value={form.lat} onChange={(e) => setForm({ ...form, lat: Number(e.target.value) })} />
          <input className="input" type="number" step="0.0001" placeholder="Longitud" value={form.lng} onChange={(e) => setForm({ ...form, lng: Number(e.target.value) })} />
          <select className="input" value={form.circuito_id} onChange={(e) => setForm({ ...form, circuito_id: e.target.value })}>
            <option value="">Circuito…</option>
            {circuitos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <select className="input" value={form.vendedor_id} onChange={(e) => setForm({ ...form, vendedor_id: e.target.value })}>
            <option value="">Vendedor…</option>
            {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
          </select>
          <input className="input" type="number" placeholder="Límite de crédito" value={form.limite_credito} onChange={(e) => setForm({ ...form, limite_credito: Number(e.target.value) })} />
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1"><input type="checkbox" checked={form.lista_1} onChange={(e) => setForm({ ...form, lista_1: e.target.checked })} /> Lista 1</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={form.lista_2} onChange={(e) => setForm({ ...form, lista_2: e.target.checked })} /> Lista 2</label>
          </div>
          <button className="btn-primary col-span-2" disabled={saving}>{saving ? "Guardando…" : "Crear cliente"}</button>
        </form>
      </div>

      <div className="card overflow-x-auto">
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead><tr><th>Cliente</th><th>CUIT</th><th>Circuito</th><th>Vendedor</th><th>Listas habilitadas</th><th>Límite crédito</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.nombre}</td>
                  <td>{c.cuit || "—"}</td>
                  <td>{c.circuitos?.nombre || "—"}</td>
                  <td>{c.profiles?.nombre || "—"}</td>
                  <td>{[c.lista_1_habilitada && "Lista 1", c.lista_2_habilitada && "Lista 2"].filter(Boolean).join(" + ") || "—"}</td>
                  <td>{Number(c.limite_credito).toLocaleString("es-AR", { style: "currency", currency: "ARS" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && hayMas && (
          <div className="text-center mt-3">
            <button
              className="btn-secondary text-xs"
              disabled={cargandoMas}
              onClick={async () => { setCargandoMas(true); await load(false); setCargandoMas(false); }}
            >
              {cargandoMas ? "Cargando…" : "Cargar más"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
