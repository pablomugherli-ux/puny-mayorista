"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PageHeader from "@/components/PageHeader";
import ProgressRing from "@/components/ProgressRing";

const TIPOS_POR_ROL: Record<string, { value: string; label: string; unidad: "moneda" | "numero" }[]> = {
  vendedor: [
    { value: "monto_ventas", label: "Monto de ventas", unidad: "moneda" },
    { value: "unidades", label: "Unidades vendidas", unidad: "numero" },
  ],
  cobrador: [{ value: "cobranza", label: "Cobranza", unidad: "moneda" }],
  entrega: [
    { value: "entregas", label: "Entregas realizadas", unidad: "numero" },
    { value: "cobranza", label: "Cobranza contra-entrega", unidad: "moneda" },
  ],
};

function mesActualInput() {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}`;
}

export default function ObjetivosAdmin() {
  const [rows, setRows] = useState<any[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ profile_id: "", periodo: mesActualInput(), tipo_objetivo: "monto_ventas", meta: "" });

  async function load() {
    const [{ data: o }, { data: u }] = await Promise.all([
      supabase.from("objetivos_comerciales").select("*, profiles(nombre, role)").order("periodo", { ascending: false }),
      supabase.from("profiles").select("id, nombre, role").in("role", ["vendedor", "cobrador", "entrega"]).order("nombre"),
    ]);
    setRows(o || []);
    setUsuarios(u || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const usuarioSel = usuarios.find((u) => u.id === form.profile_id);
  const tiposDisponibles = usuarioSel ? TIPOS_POR_ROL[usuarioSel.role] || [] : [];

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!form.profile_id) return;
    setSaving(true);
    const { data: uAuth } = await supabase.auth.getUser();
    const { data: perfil } = await supabase.from("profiles").select("tenant_id").eq("id", uAuth.user?.id).single();
    const periodoDate = `${form.periodo}-01`;
    await supabase.from("objetivos_comerciales").upsert({
      tenant_id: perfil?.tenant_id,
      profile_id: form.profile_id,
      periodo: periodoDate,
      tipo_objetivo: form.tipo_objetivo,
      meta: Number(form.meta),
    }, { onConflict: "profile_id,periodo,tipo_objetivo,lista" });
    setForm({ ...form, meta: "" });
    await load();
    setSaving(false);
  }

  return (
    <div>
      <PageHeader title="Objetivos Comerciales" subtitle="Metas mensuales por usuario — alimentan el panel de objetivos en tiempo real de cada trabajador" />

      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Nuevo objetivo</h3>
        <form onSubmit={crear} className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div className="col-span-2">
            <label className="text-xs text-gray-500">Usuario</label>
            <select className="input" value={form.profile_id} onChange={(e) => {
              const u = usuarios.find((x) => x.id === e.target.value);
              const primerTipo = u ? TIPOS_POR_ROL[u.role]?.[0]?.value : "monto_ventas";
              setForm({ ...form, profile_id: e.target.value, tipo_objetivo: primerTipo || "monto_ventas" });
            }} required>
              <option value="">Seleccionar…</option>
              {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre} ({u.role})</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Período</label>
            <input className="input" type="month" value={form.periodo} onChange={(e) => setForm({ ...form, periodo: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-500">Tipo de objetivo</label>
            <select className="input" value={form.tipo_objetivo} onChange={(e) => setForm({ ...form, tipo_objetivo: e.target.value })} disabled={!usuarioSel}>
              {tiposDisponibles.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Meta</label>
            <input className="input" type="number" value={form.meta} onChange={(e) => setForm({ ...form, meta: e.target.value })} required />
          </div>
          <button className="btn-tech col-span-2 md:col-span-1" disabled={saving || !form.profile_id}>{saving ? "Guardando…" : "Guardar objetivo"}</button>
        </form>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {loading ? <p className="text-gray-400">Cargando…</p> : rows.length === 0 ? (
          <p className="text-gray-400 col-span-3">Sin objetivos cargados.</p>
        ) : rows.map((o) => (
          <div key={o.id} className="card flex items-center gap-3">
            <ProgressRing pct={0} size={56} stroke={6} label="" />
            <div>
              <div className="font-semibold text-navy text-sm">{o.profiles?.nombre}</div>
              <div className="text-xs text-gray-500 capitalize">{o.profiles?.role} · {o.periodo?.slice(0, 7)}</div>
              <div className="text-xs mt-1">{o.tipo_objetivo.replace("_", " ")}: <span className="font-semibold">{Number(o.meta).toLocaleString("es-AR")}</span></div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-3">El % de cumplimiento real se ve en el panel de cada usuario y en el ranking del dashboard, calculado en tiempo real sobre sus ventas/cobranzas/entregas.</p>
    </div>
  );
}
