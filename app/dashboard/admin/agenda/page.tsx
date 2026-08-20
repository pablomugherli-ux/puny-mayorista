"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";

type Evento = {
  id: string; titulo: string; fecha: string; hora: string | null;
  recordatorio_minutos_antes: number | null; tipo: "reunion" | "llamada" | "tarea" | "otro"; notas: string | null;
};

const TIPO_LABEL: Record<Evento["tipo"], string> = { reunion: "Reunión", llamada: "Llamada", tarea: "Tarea", otro: "Otro" };
const TIPO_BADGE: Record<Evento["tipo"], string> = {
  reunion: "bg-blue-100 text-blue-700", llamada: "bg-purple-100 text-purple-700",
  tarea: "bg-amber-100 text-amber-700", otro: "bg-gray-100 text-gray-600",
};
const fmtFecha = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "short" });

// Agenda Personal (Fase G, agosto 2026) — eventos propios de cada usuario,
// no compartida entre roles (según lo pedido explícitamente). Ver
// PUNY_Especificacion_Maestro_Dueno.docx, sección 4.4.e.
export default function AgendaPersonal() {
  const { profile } = useAuth();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ titulo: "", fecha: new Date().toISOString().slice(0, 10), hora: "", recordatorio_minutos_antes: "", tipo: "otro" as Evento["tipo"], notas: "" });
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    if (!profile) return;
    setLoading(true);
    const hoy = new Date().toISOString().slice(0, 10);
    const { data } = await supabase.from("agenda_eventos").select("*").eq("profile_id", profile.id).gte("fecha", hoy).order("fecha").order("hora");
    setEventos((data as Evento[]) || []);
    setLoading(false);
  }
  useEffect(() => { cargar(); }, [profile?.id]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !form.titulo.trim() || !form.fecha) return;
    setGuardando(true);
    const { data: u } = await supabase.auth.getUser();
    const { data: p } = await supabase.from("profiles").select("tenant_id").eq("id", u.user?.id).single();
    await supabase.from("agenda_eventos").insert({
      tenant_id: p?.tenant_id,
      profile_id: profile.id,
      titulo: form.titulo.trim(),
      fecha: form.fecha,
      hora: form.hora || null,
      recordatorio_minutos_antes: form.recordatorio_minutos_antes ? Number(form.recordatorio_minutos_antes) : null,
      tipo: form.tipo,
      notas: form.notas || null,
    });
    setForm({ titulo: "", fecha: new Date().toISOString().slice(0, 10), hora: "", recordatorio_minutos_antes: "", tipo: "otro", notas: "" });
    setGuardando(false);
    cargar();
  }

  async function eliminar(id: string) {
    await supabase.from("agenda_eventos").delete().eq("id", id);
    cargar();
  }

  const porFecha: Record<string, Evento[]> = {};
  eventos.forEach((e) => { (porFecha[e.fecha] ||= []).push(e); });

  return (
    <div>
      <PageHeader title="Agenda Personal" subtitle="Tus propios recordatorios y eventos — no la ve nadie más." />

      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Nuevo evento</h3>
        <form onSubmit={crear} className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <input className="input col-span-2" placeholder="Título" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} required />
          <input className="input" type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
          <input className="input" type="time" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} />
          <select className="input" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as Evento["tipo"] })}>
            {Object.entries(TIPO_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input className="input" type="number" min="0" placeholder="Recordar (min. antes)" value={form.recordatorio_minutos_antes} onChange={(e) => setForm({ ...form, recordatorio_minutos_antes: e.target.value })} />
          <input className="input col-span-3" placeholder="Notas (opcional)" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          <button className="btn-primary" disabled={guardando}>{guardando ? "Guardando…" : "Agregar"}</button>
        </form>
      </div>

      {loading ? <p className="text-gray-400">Cargando…</p> : (
        <div className="space-y-4">
          {Object.entries(porFecha).map(([fecha, evs]) => (
            <div key={fecha} className="card">
              <h4 className="text-xs font-semibold text-navy uppercase mb-2">{fmtFecha(fecha)}</h4>
              <div className="space-y-2">
                {evs.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-2 border border-gray-100 rounded-md px-3 py-2">
                    <div>
                      <span className={`badge ${TIPO_BADGE[e.tipo]} mr-2`}>{TIPO_LABEL[e.tipo]}</span>
                      {e.hora && <span className="text-xs text-gray-500 mr-2">{e.hora.slice(0, 5)}</span>}
                      <span className="text-sm font-medium">{e.titulo}</span>
                      {e.notas && <div className="text-xs text-gray-400">{e.notas}</div>}
                    </div>
                    <button className="text-danger text-xs shrink-0" onClick={() => eliminar(e.id)}>Eliminar</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {eventos.length === 0 && <p className="text-gray-400 text-sm">Sin eventos próximos cargados.</p>}
        </div>
      )}
    </div>
  );
}
