"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";

const TIPO_LICENCIA: { value: string; label: string }[] = [
  { value: "vacaciones", label: "Vacaciones" },
  { value: "enfermedad", label: "Enfermedad" },
  { value: "estudio", label: "Examen / estudio" },
  { value: "otro", label: "Otro" },
];

const ESTADO_BADGE: Record<string, string> = {
  pendiente: "bg-amber-100 text-amber-700",
  aprobada: "bg-green-100 text-green-700",
  rechazada: "bg-red-100 text-red-700",
  cancelada: "bg-gray-100 text-gray-600",
};
const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  cancelada: "Cancelada",
};

const fmt = (n: number) => Number(n || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" });
const fmtFecha = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("es-AR");
const fmtPeriodo = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("es-AR", { month: "long", year: "numeric" });

export default function MiPortalEmpleado() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [recibos, setRecibos] = useState<any[]>([]);
  const [reciboAbierto, setReciboAbierto] = useState<string | null>(null);
  const [solicitudes, setSolicitudes] = useState<any[]>([]);
  const [form, setForm] = useState({ tipo: "vacaciones", fecha_desde: "", fecha_hasta: "", motivo: "" });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!profile) return;
    setLoading(true);
    const [{ data: liq }, { data: sol }] = await Promise.all([
      supabase.from("liquidaciones_sueldo").select("*").eq("profile_id", profile.id).eq("estado", "cerrada").order("periodo", { ascending: false }),
      supabase.from("solicitudes_licencia").select("*").eq("profile_id", profile.id).order("created_at", { ascending: false }),
    ]);
    setRecibos(liq || []);
    setSolicitudes(sol || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [profile?.id]);

  async function enviarSolicitud(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!profile) return;
    if (!form.fecha_desde || !form.fecha_hasta) {
      setError("Completá las fechas desde y hasta.");
      return;
    }
    if (form.fecha_hasta < form.fecha_desde) {
      setError("La fecha hasta no puede ser anterior a la fecha desde.");
      return;
    }
    setEnviando(true);
    const { error: err } = await supabase.from("solicitudes_licencia").insert({
      tenant_id: profile.tenant_id,
      profile_id: profile.id,
      tipo: form.tipo,
      fecha_desde: form.fecha_desde,
      fecha_hasta: form.fecha_hasta,
      motivo: form.motivo || null,
    });
    if (err) setError(err.message);
    else setForm({ tipo: "vacaciones", fecha_desde: "", fecha_hasta: "", motivo: "" });
    setEnviando(false);
    load();
  }

  async function cancelar(id: string) {
    await supabase.from("solicitudes_licencia").update({ estado: "cancelada" }).eq("id", id);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Mi Portal"
        subtitle="Tus recibos de sueldo digitales y tus pedidos de vacaciones o licencia — solo vos y Recursos Humanos pueden verlos."
      />

      {loading ? <p className="text-gray-400">Cargando…</p> : (
        <>
          <div className="card mb-6">
            <h3 className="text-sm font-semibold text-navy mb-3">Mis recibos de sueldo</h3>
            {recibos.length === 0 ? (
              <p className="text-gray-400 text-sm">Todavía no hay liquidaciones cerradas a tu nombre.</p>
            ) : (
              <div className="space-y-2">
                {recibos.map((r) => (
                  <div key={r.id} className="border border-gray-200 rounded">
                    <button
                      className="w-full flex items-center justify-between px-3 py-2 text-sm"
                      onClick={() => setReciboAbierto(reciboAbierto === r.id ? null : r.id)}
                    >
                      <span className="capitalize font-medium">{fmtPeriodo(r.periodo)}</span>
                      <span className="text-navy font-semibold">{fmt(r.total)}</span>
                    </button>
                    {reciboAbierto === r.id && (
                      <div className="px-3 pb-3 text-sm text-gray-600 space-y-1 border-t border-gray-100 pt-2">
                        <div className="flex justify-between"><span>Sueldo básico</span><span>{fmt(r.sueldo_base)}</span></div>
                        <div className="flex justify-between"><span>Comisiones</span><span>{fmt(r.comisiones)}</span></div>
                        <div className="flex justify-between"><span>Premios</span><span>{fmt(r.premios)}</span></div>
                        {Number(r.premios_acumulados) > 0 && (
                          <div className="flex justify-between"><span>Premios acumulados</span><span>{fmt(r.premios_acumulados)}</span></div>
                        )}
                        <div className="flex justify-between font-semibold text-navy border-t border-gray-100 pt-1"><span>Total</span><span>{fmt(r.total)}</span></div>
                        {r.notas && <p className="text-xs text-gray-400 pt-1">{r.notas}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card mb-6">
            <h3 className="text-sm font-semibold text-navy mb-3">Pedir vacaciones o licencia</h3>
            <form onSubmit={enviarSolicitud} className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <select className="input" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                {TIPO_LICENCIA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <input className="input" type="date" value={form.fecha_desde} onChange={(e) => setForm({ ...form, fecha_desde: e.target.value })} required />
              <input className="input" type="date" value={form.fecha_hasta} onChange={(e) => setForm({ ...form, fecha_hasta: e.target.value })} required />
              <input className="input" placeholder="Motivo (opcional)" value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
              <button className="btn-primary col-span-2 md:col-span-4" disabled={enviando}>{enviando ? "Enviando…" : "Enviar solicitud"}</button>
            </form>
            {error && <p className="text-danger text-xs mt-2">{error}</p>}
          </div>

          <div className="card overflow-x-auto">
            <h3 className="text-sm font-semibold text-navy mb-3">Mis solicitudes</h3>
            <table className="tbl">
              <thead><tr><th>Tipo</th><th>Desde</th><th>Hasta</th><th>Motivo</th><th>Estado</th><th>Comentario</th><th></th></tr></thead>
              <tbody>
                {solicitudes.map((s) => (
                  <tr key={s.id}>
                    <td className="capitalize">{TIPO_LICENCIA.find((t) => t.value === s.tipo)?.label || s.tipo}</td>
                    <td>{fmtFecha(s.fecha_desde)}</td>
                    <td>{fmtFecha(s.fecha_hasta)}</td>
                    <td>{s.motivo || "—"}</td>
                    <td><span className={`badge ${ESTADO_BADGE[s.estado]}`}>{ESTADO_LABEL[s.estado]}</span></td>
                    <td className="text-xs text-gray-500">{s.comentario_resolucion || "—"}</td>
                    <td>
                      {s.estado === "pendiente" && (
                        <button className="text-danger text-xs" onClick={() => cancelar(s.id)}>Cancelar</button>
                      )}
                    </td>
                  </tr>
                ))}
                {solicitudes.length === 0 && <tr><td colSpan={7} className="text-gray-400">Todavía no pediste ninguna licencia.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
