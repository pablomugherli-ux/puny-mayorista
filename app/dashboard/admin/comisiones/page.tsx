"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PageHeader from "@/components/PageHeader";

const ROLES = [
  { value: "vendedor", label: "Vendedor" },
  { value: "cobrador", label: "Cobrador" },
  { value: "entrega", label: "Entrega (logística)" },
];
const TIPOS: Record<string, { value: string; label: string }[]> = {
  vendedor: [{ value: "pct_venta", label: "% sobre monto de venta" }],
  cobrador: [{ value: "pct_cobranza", label: "% sobre cobranza" }],
  entrega: [
    { value: "fijo_por_entrega", label: "Monto fijo por entrega" },
    { value: "pct_cobranza", label: "% sobre cobranza contra-entrega" },
  ],
};

export default function ComisionesAdmin() {
  const [rows, setRows] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ rol: "vendedor", alcance: "rol", profile_id: "", tipo: "pct_venta", valor: "" });

  async function load() {
    const [{ data: e }, { data: u }] = await Promise.all([
      supabase.from("esquemas_comision").select("*, profiles(nombre)").order("rol"),
      supabase.from("profiles").select("id, nombre, role").in("role", ["vendedor", "cobrador", "entrega"]).order("nombre"),
    ]);
    setRows(e || []);
    setUsuarios(u || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data: uAuth } = await supabase.auth.getUser();
    const { data: perfil } = await supabase.from("profiles").select("tenant_id").eq("id", uAuth.user?.id).single();
    await supabase.from("esquemas_comision").insert({
      tenant_id: perfil?.tenant_id,
      profile_id: form.alcance === "usuario" ? form.profile_id : null,
      rol: form.rol,
      tipo: form.tipo,
      valor: Number(form.valor),
    });
    setForm({ ...form, valor: "" });
    await load();
    setSaving(false);
  }

  async function toggle(row: any) {
    await supabase.from("esquemas_comision").update({ activo: !row.activo }).eq("id", row.id);
    load();
  }

  const usuariosDelRol = usuarios.filter((u) => u.role === form.rol);

  return (
    <div>
      <PageHeader title="Esquemas de Comisión" subtitle="Definí comisiones por rol o por usuario específico — se aplican en tiempo real en el panel de cada trabajador" />

      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Nuevo esquema</h3>
        <form onSubmit={crear} className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="text-xs text-gray-500">Rol</label>
            <select className="input" value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value, tipo: TIPOS[e.target.value][0].value, profile_id: "" })}>
              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Alcance</label>
            <select className="input" value={form.alcance} onChange={(e) => setForm({ ...form, alcance: e.target.value })}>
              <option value="rol">Todo el rol</option>
              <option value="usuario">Usuario específico</option>
            </select>
          </div>
          {form.alcance === "usuario" && (
            <div>
              <label className="text-xs text-gray-500">Usuario</label>
              <select className="input" value={form.profile_id} onChange={(e) => setForm({ ...form, profile_id: e.target.value })} required>
                <option value="">Seleccionar…</option>
                {usuariosDelRol.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs text-gray-500">Tipo</label>
            <select className="input" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              {TIPOS[form.rol].map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">{form.tipo === "fijo_por_entrega" ? "Monto ($)" : "Porcentaje (%)"}</label>
            <input className="input" type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} required />
          </div>
          <button className="btn-tech col-span-2 md:col-span-1" disabled={saving}>{saving ? "Guardando…" : "Crear esquema"}</button>
        </form>
      </div>

      <div className="card overflow-x-auto">
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead><tr><th>Rol</th><th>Alcance</th><th>Tipo</th><th>Valor</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="capitalize">{r.rol}</td>
                  <td>{r.profile_id ? r.profiles?.nombre : "Todo el rol"}</td>
                  <td>{r.tipo === "pct_venta" ? "% venta" : r.tipo === "pct_cobranza" ? "% cobranza" : "$ fijo / entrega"}</td>
                  <td>{r.tipo === "fijo_por_entrega" ? `$${r.valor}` : `${r.valor}%`}</td>
                  <td><span className={`badge ${r.activo ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{r.activo ? "Activo" : "Inactivo"}</span></td>
                  <td><button className="text-xs text-accent underline" onClick={() => toggle(r)}>{r.activo ? "Desactivar" : "Reactivar"}</button></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-6">Sin esquemas cargados</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
