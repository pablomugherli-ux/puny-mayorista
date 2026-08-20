"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";
import { ROLE_LABEL, type UserRole } from "@/lib/types";

type Documento = {
  id: string; categoria: "folleteria" | "contrato" | "manual" | "otro"; nombre: string;
  archivo_url: string; visible_para_roles: string[]; created_at: string;
};

const CATEGORIA_LABEL: Record<Documento["categoria"], string> = {
  folleteria: "Folletería digital", contrato: "Contrato", manual: "Manual", otro: "Otro",
};

const ROLES_SELECCIONABLES: UserRole[] = ["vendedor", "administrador", "supervisor", "entrega", "cobrador", "cliente_b2b", "vendedor_masivo", "asesor_inmuner"];

async function tenantId() {
  const { data: u } = await supabase.auth.getUser();
  const { data: p } = await supabase.from("profiles").select("tenant_id").eq("id", u.user?.id).single();
  return p?.tenant_id as string;
}

// Gestor Documental y Folletería Digital (Fase G, agosto 2026). Ver
// PUNY_Especificacion_Maestro_Dueno.docx, sección 4.4.f. La folletería
// digital reutiliza el mismo modelo con categoria="folleteria", pensada
// para que Vendedores la compartan con clientes desde la app de campo.
export default function GestorDocumental() {
  const { profile } = useAuth();
  const puedeGestionar = !!profile && ["dueno", "administrador"].includes(profile.role);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ categoria: Documento["categoria"]; nombre: string; roles: UserRole[] }>({ categoria: "otro", nombre: "", roles: [] });
  const [archivo, setArchivo] = useState<File | null>(null);

  async function cargar() {
    setLoading(true);
    const { data } = await supabase.from("documentos").select("*").order("created_at", { ascending: false });
    setDocumentos((data as Documento[]) || []);
    setLoading(false);
  }
  useEffect(() => { cargar(); }, []);

  function toggleRol(r: UserRole) {
    setForm((f) => ({ ...f, roles: f.roles.includes(r) ? f.roles.filter((x) => x !== r) : [...f.roles, r] }));
  }

  async function subir(e: React.FormEvent) {
    e.preventDefault();
    if (!archivo || !form.nombre.trim()) return;
    setError(null);
    setSubiendo(true);
    try {
      const tid = await tenantId();
      const ext = archivo.name.split(".").pop();
      const path = `${tid}/${Date.now()}_${archivo.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const { error: errUp } = await supabase.storage.from("documentos").upload(path, archivo, { upsert: false });
      if (errUp) throw errUp;
      // El bucket "documentos" es privado (no público): se guarda la ruta
      // interna en archivo_url y se genera una URL firmada de corta duración
      // recién al abrir el archivo, no al subirlo.
      await supabase.from("documentos").insert({
        tenant_id: tid,
        categoria: form.categoria,
        nombre: form.nombre.trim(),
        archivo_url: path,
        visible_para_roles: form.roles,
        subido_por: profile?.id,
      });
      setForm({ categoria: "otro", nombre: "", roles: [] });
      setArchivo(null);
      cargar();
    } catch (err: any) {
      setError(err?.message || "No se pudo subir el archivo.");
    }
    setSubiendo(false);
  }

  async function eliminar(id: string) {
    await supabase.from("documentos").delete().eq("id", id);
    cargar();
  }

  async function abrir(path: string) {
    const { data, error } = await supabase.storage.from("documentos").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) { alert("No se pudo abrir el archivo."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div>
      <PageHeader title="Gestor Documental" subtitle="Documentos y folletería digital, con visibilidad por rol. La folletería queda disponible para que Vendedores la compartan con clientes." />

      {puedeGestionar && (
        <div className="card mb-6">
          <h3 className="text-sm font-semibold text-navy mb-3">Subir documento</h3>
          <form onSubmit={subir} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="Nombre del documento" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
              <select className="input" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value as Documento["categoria"] })}>
                {Object.entries(CATEGORIA_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Visible para (dejá todo sin marcar para que solo lo vean Dueño/Administrador)</label>
              <div className="flex flex-wrap gap-2">
                {ROLES_SELECCIONABLES.map((r) => (
                  <label key={r} className="flex items-center gap-1 text-xs border rounded-md px-2 py-1">
                    <input type="checkbox" checked={form.roles.includes(r)} onChange={() => toggleRol(r)} /> {ROLE_LABEL[r]}
                  </label>
                ))}
              </div>
            </div>
            <input type="file" onChange={(e) => setArchivo(e.target.files?.[0] || null)} required className="text-sm" />
            {error && <p className="text-danger text-xs">{error}</p>}
            <button className="btn-primary" disabled={subiendo || !archivo}>{subiendo ? "Subiendo…" : "Subir"}</button>
          </form>
        </div>
      )}

      <div className="card overflow-x-auto">
        <h3 className="text-sm font-semibold text-navy mb-3">Documentos disponibles</h3>
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead><tr><th>Nombre</th><th>Categoría</th><th>Visible para</th><th></th></tr></thead>
            <tbody>
              {documentos.map((d) => (
                <tr key={d.id}>
                  <td><a href={d.archivo_url} target="_blank" rel="noreferrer" className="text-navy underline">{d.nombre}</a></td>
                  <td><span className="badge bg-gray-100 text-gray-700">{CATEGORIA_LABEL[d.categoria]}</span></td>
                  <td className="text-xs text-gray-500">{d.visible_para_roles.length === 0 ? "Solo Dueño/Administrador" : d.visible_para_roles.map((r) => ROLE_LABEL[r as UserRole] || r).join(", ")}</td>
                  <td>{puedeGestionar && <button className="text-danger text-xs" onClick={() => eliminar(d.id)}>Eliminar</button>}</td>
                </tr>
              ))}
              {documentos.length === 0 && <tr><td colSpan={4} className="text-gray-400">Sin documentos cargados todavía.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
