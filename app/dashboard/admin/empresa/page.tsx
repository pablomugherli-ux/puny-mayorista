"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";
import Logo from "@/components/Logo";

const COLORES_SUGERIDOS = [
  { fondo: "#7A5C0A", texto: "#D4AF37" },
  { fondo: "#1D3557", texto: "#F1FAEE" },
  { fondo: "#18181B", texto: "#EF233C" },
  { fondo: "#0F6E56", texto: "#E1F5EE" },
  { fondo: "#712B13", texto: "#FAECE7" },
];

export default function EmpresaAdmin() {
  const { profile, tenant, refreshTenant } = useAuth();
  const [tenants, setTenants] = useState<any[]>([]);
  const [tenantId, setTenantId] = useState<string>("");
  const [form, setForm] = useState<any>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const esMaster = profile?.role === "master";

  useEffect(() => {
    if (esMaster) {
      supabase.from("tenants").select("*").then(({ data }) => {
        setTenants(data || []);
        if (data && data[0]) { setTenantId(data[0].id); setForm(data[0]); }
      });
    } else if (tenant) {
      setTenantId(tenant.id);
      setForm(tenant);
    }
  }, [esMaster, tenant]);

  function cambiarTenantSeleccionado(id: string) {
    setTenantId(id);
    setForm(tenants.find((t) => t.id === id) || null);
  }

  async function guardar() {
    if (!form) return;
    setGuardando(true);
    setMensaje(null);
    const { error } = await supabase.from("tenants").update({
      nombre: form.nombre, razon_social: form.razon_social, cuit: form.cuit,
      direccion: form.direccion, telefono: form.telefono, email_contacto: form.email_contacto,
      sitio_web: form.sitio_web, eslogan: form.eslogan,
      logo_color_fondo: form.logo_color_fondo, logo_color_texto: form.logo_color_texto,
      dias_alerta_vencimiento_stock: Number(form.dias_alerta_vencimiento_stock) || 30,
    }).eq("id", form.id);
    if (error) setMensaje("Error al guardar: " + error.message.replace(/^.*?: /, ""));
    else {
      setMensaje("Datos guardados.");
      if (!esMaster) await refreshTenant();
    }
    setGuardando(false);
  }

  async function subirLogo(file: File) {
    if (!form) return;
    setSubiendo(true);
    setMensaje(null);
    const ext = file.name.split(".").pop();
    const path = `${form.id}/logo.${ext}`;
    const { error: errUpload } = await supabase.storage.from("branding").upload(path, file, { upsert: true });
    if (errUpload) {
      setMensaje("No se pudo subir el logo: " + errUpload.message);
      setSubiendo(false);
      return;
    }
    const { data: pub } = supabase.storage.from("branding").getPublicUrl(path);
    const url = `${pub.publicUrl}?v=${Date.now()}`;
    const { error: errUpdate } = await supabase.from("tenants").update({ logo_url: url }).eq("id", form.id);
    if (errUpdate) setMensaje("Logo subido pero no se pudo guardar: " + errUpdate.message);
    else {
      setForm({ ...form, logo_url: url });
      setMensaje("Logo actualizado.");
      if (!esMaster) await refreshTenant();
    }
    setSubiendo(false);
  }

  async function quitarLogoSubido() {
    if (!form) return;
    await supabase.from("tenants").update({ logo_url: null }).eq("id", form.id);
    setForm({ ...form, logo_url: null });
    if (!esMaster) await refreshTenant();
  }

  if (!form) return <p className="text-gray-400">Cargando…</p>;

  return (
    <div>
      <PageHeader title="Datos de la Empresa" subtitle="Personalizá el nombre, los datos comerciales y el logo que ve tu equipo dentro de la app" />

      {esMaster && (
        <div className="card mb-4">
          <label className="text-xs text-gray-500">Distribuidora a editar</label>
          <select className="input" value={tenantId} onChange={(e) => cambiarTenantSeleccionado(e.target.value)}>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-sm font-semibold text-navy mb-3">Datos comerciales</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500">Nombre comercial (se muestra en toda la app)</label>
              <input className="input" value={form.nombre || ""} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Eslogan / categoría (debajo del nombre)</label>
              <input className="input" value={form.eslogan || ""} onChange={(e) => setForm({ ...form, eslogan: e.target.value.toUpperCase() })} placeholder="MAYORISTA" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Razón social</label>
              <input className="input" value={form.razon_social || ""} onChange={(e) => setForm({ ...form, razon_social: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500">CUIT</label>
              <input className="input" value={form.cuit || ""} onChange={(e) => setForm({ ...form, cuit: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Dirección</label>
              <input className="input" value={form.direccion || ""} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Teléfono</label>
                <input className="input" value={form.telefono || ""} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-500">Email de contacto</label>
                <input className="input" value={form.email_contacto || ""} onChange={(e) => setForm({ ...form, email_contacto: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500">Sitio web</label>
              <input className="input" value={form.sitio_web || ""} onChange={(e) => setForm({ ...form, sitio_web: e.target.value })} placeholder="https://" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Días de anticipación para alertas de vencimiento de mercadería</label>
              <input
                className="input" type="number" min={1} max={365}
                value={form.dias_alerta_vencimiento_stock ?? 30}
                onChange={(e) => setForm({ ...form, dias_alerta_vencimiento_stock: e.target.value })}
              />
              <p className="text-[11px] text-gray-400 mt-1">Con cuántos días de anticipación se avisa que un producto o lote está por vencer (por defecto, 30).</p>
            </div>
            <button className="btn-tech text-xs" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar datos"}</button>
          </div>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-navy mb-3">Logo</h3>

          <div className="flex items-center gap-6 mb-4 p-4 rounded-lg bg-navy">
            <Logo variant="on-dark" size="lg" nombre={form.nombre} subtitulo={form.eslogan} logoUrl={form.logo_url} colorFondo={form.logo_color_fondo} colorTexto={form.logo_color_texto} />
          </div>

          <div className="mb-4">
            <label className="text-xs font-semibold text-gray-600">Opción 1 — Subir tu propio logo</label>
            <p className="text-[11px] text-gray-400 mb-2">Imagen cuadrada recomendada (PNG con fondo transparente da mejor resultado).</p>
            <input type="file" accept="image/*" className="input" disabled={subiendo}
              onChange={(e) => e.target.files?.[0] && subirLogo(e.target.files[0])} />
            {form.logo_url && (
              <button className="text-xs text-accent underline mt-2" onClick={quitarLogoSubido}>Quitar logo subido y usar el generado</button>
            )}
          </div>

          {!form.logo_url && (
            <div>
              <label className="text-xs font-semibold text-gray-600">Opción 2 — Editar el logo generado (inicial + colores)</label>
              <p className="text-[11px] text-gray-400 mb-2">Se usa la primera letra de tu nombre comercial sobre un color de fondo a elección.</p>
              <div className="flex gap-2 flex-wrap mb-3">
                {COLORES_SUGERIDOS.map((c, i) => (
                  <button key={i} title="Aplicar combinación"
                    onClick={() => setForm({ ...form, logo_color_fondo: c.fondo, logo_color_texto: c.texto })}
                    style={{ background: c.fondo }} className="w-8 h-8 rounded-md border border-gray-200 flex items-center justify-center">
                    <span style={{ color: c.texto }} className="text-xs font-bold">A</span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-gray-500">Color de fondo</label>
                  <input type="color" className="w-full h-9 rounded border border-gray-200" value={form.logo_color_fondo || "#7A5C0A"} onChange={(e) => setForm({ ...form, logo_color_fondo: e.target.value })} />
                </div>
                <div>
                  <label className="text-[11px] text-gray-500">Color de letra</label>
                  <input type="color" className="w-full h-9 rounded border border-gray-200" value={form.logo_color_texto || "#D4AF37"} onChange={(e) => setForm({ ...form, logo_color_texto: e.target.value })} />
                </div>
              </div>
              <button className="btn-secondary text-xs mt-3" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar colores del logo"}</button>
            </div>
          )}

          {mensaje && <p className="text-xs text-gray-600 mt-3">{mensaje}</p>}
        </div>
      </div>
    </div>
  );
}
