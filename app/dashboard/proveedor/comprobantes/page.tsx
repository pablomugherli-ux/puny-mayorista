"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";

const ESTADO_LABEL: Record<string, string> = { pendiente: "Pendiente de revisión", procesado: "Procesado", rechazado: "Rechazado" };
const ESTADO_BADGE: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  procesado: "bg-green-100 text-green-700",
  rechazado: "bg-red-100 text-red-700",
};
const fmtFecha = (s: string | null) => (s ? new Date(s).toLocaleDateString("es-AR") : "—");

export default function ProveedorComprobantes() {
  const { profile } = useAuth();
  const [comprobantes, setComprobantes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ descripcion: "", monto: "", fecha: new Date().toISOString().slice(0, 10) });
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; error?: boolean } | null>(null);

  async function load() {
    if (!profile?.proveedor_id) { setLoading(false); return; }
    const { data } = await supabase
      .from("proveedor_comprobantes")
      .select("*")
      .eq("proveedor_id", profile.proveedor_id)
      .order("created_at", { ascending: false });
    setComprobantes(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [profile]);

  async function subir(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.tenant_id || !profile?.proveedor_id) return;
    setSubiendo(true);
    setAviso(null);
    let archivo_url: string | null = null;
    if (archivo) {
      const path = `comprobantes-proveedor/${profile.proveedor_id}-${Date.now()}-${archivo.name}`;
      const { data, error } = await supabase.storage.from("pod").upload(path, archivo);
      if (error) {
        setAviso({ texto: `No se pudo subir el archivo: ${error.message}`, error: true });
        setSubiendo(false);
        return;
      }
      archivo_url = supabase.storage.from("pod").getPublicUrl(data.path).data.publicUrl;
    }
    const { error } = await supabase.from("proveedor_comprobantes").insert({
      tenant_id: profile.tenant_id,
      proveedor_id: profile.proveedor_id,
      descripcion: form.descripcion,
      monto: form.monto ? Number(form.monto) : null,
      fecha: form.fecha,
      archivo_url,
      subido_por: profile.id,
    });
    if (error) {
      setAviso({ texto: `No se pudo registrar el comprobante: ${error.message}`, error: true });
    } else {
      setAviso({ texto: "Comprobante enviado. Queda pendiente de revisión por la distribuidora." });
      setForm({ descripcion: "", monto: "", fecha: new Date().toISOString().slice(0, 10) });
      setArchivo(null);
      await load();
    }
    setSubiendo(false);
  }

  if (!profile?.proveedor_id) {
    return (
      <div>
        <PageHeader title="Subir Comprobantes" subtitle="Portal de proveedor" />
        <p className="text-sm text-red-600">Tu usuario no está vinculado a ningún proveedor todavía.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Subir Comprobantes" subtitle="Facturas y remitos para que la distribuidora los revise y procese" />

      <form onSubmit={subir} className="card mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <input className="input col-span-2" placeholder="Descripción (ej: Factura A-0001-00001234)" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} required />
        <input className="input" type="number" step="0.01" placeholder="Monto (opcional)" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} />
        <input className="input" type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
        <input className="input col-span-2 md:col-span-3" type="file" accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] || null)} />
        <button className="btn-primary" disabled={subiendo}>{subiendo ? "Enviando…" : "Enviar comprobante"}</button>
        {aviso && (
          <p className={`col-span-2 md:col-span-4 text-sm rounded-md px-3 py-2 border ${aviso.error ? "text-red-700 bg-red-50 border-red-200" : "text-green-700 bg-green-50 border-green-200"}`}>
            {aviso.texto}
          </p>
        )}
      </form>

      <div className="card overflow-x-auto">
        <h3 className="text-sm font-semibold text-navy mb-3">Mis comprobantes enviados</h3>
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead><tr><th>Fecha</th><th>Descripción</th><th>Monto</th><th>Estado</th><th>Archivo</th></tr></thead>
            <tbody>
              {comprobantes.map((c) => (
                <tr key={c.id}>
                  <td>{fmtFecha(c.fecha)}</td>
                  <td>{c.descripcion}</td>
                  <td>{c.monto ? Number(c.monto).toLocaleString("es-AR", { style: "currency", currency: "ARS" }) : "—"}</td>
                  <td><span className={`badge ${ESTADO_BADGE[c.estado] || ""}`}>{ESTADO_LABEL[c.estado] || c.estado}</span></td>
                  <td>{c.archivo_url ? <a className="text-xs text-accent underline" href={c.archivo_url} target="_blank" rel="noreferrer">Ver</a> : "—"}</td>
                </tr>
              ))}
              {comprobantes.length === 0 && <tr><td colSpan={5} className="text-center text-gray-400 py-6">Sin comprobantes enviados todavía</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
