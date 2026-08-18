"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import StatCard from "@/components/StatCard";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const GRAVEDAD_BADGE: Record<string, string> = {
  alta: "bg-red-100 text-red-700",
  media: "bg-amber-100 text-amber-700",
  baja: "bg-gray-100 text-gray-600",
};

export default function Vigilancia() {
  const { profile } = useAuth();
  // El sidebar promete "Vigilancia (lectura)" para Supervisor, pero esta
  // pantalla renderizaba los mismos formularios de alta que ve el Dueño.
  // Bug detectado en vivo: además, el combo "Elegir vigilador" y los
  // nombres en las tablas salían vacíos para Supervisor porque antes no
  // podía leer "profiles" en absoluto (se sumó una policy de lectura para
  // eso). Acá se oculta la parte de ALTA para que la promesa de "lectura"
  // sea real.
  const soloLectura = profile?.role === "supervisor";
  const [loading, setLoading] = useState(true);
  const [puntos, setPuntos] = useState<any[]>([]);
  const [rondas, setRondas] = useState<any[]>([]);
  const [vigiladores, setVigiladores] = useState<any[]>([]);
  const [checkins, setCheckins] = useState<any[]>([]);
  const [novedades, setNovedades] = useState<any[]>([]);
  const [incumplimientos, setIncumplimientos] = useState<any[]>([]);

  const [nuevoPunto, setNuevoPunto] = useState({ nombre: "", direccion: "", lat: "", lng: "", radio_geofence_m: "100" });
  const [guardandoPunto, setGuardandoPunto] = useState(false);

  const [nuevaRonda, setNuevaRonda] = useState({ nombre: "", vigilador_id: "", hora_inicio: "", hora_fin: "" });
  const [diasRonda, setDiasRonda] = useState<string[]>([]);
  const [puntosRonda, setPuntosRonda] = useState<string[]>([]);
  const [guardandoRonda, setGuardandoRonda] = useState(false);
  const [errorRonda, setErrorRonda] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ data: pc }, { data: rv }, { data: vig }, { data: cks }, { data: nov }, { data: inc }] = await Promise.all([
      supabase.from("puntos_control").select("*").order("nombre"),
      supabase.from("rondas_vigilancia").select("*, profiles(nombre)").order("nombre"),
      supabase.from("profiles").select("id, nombre").eq("role", "vigilador"),
      supabase.from("checkins_vigilancia").select("*, puntos_control(nombre), profiles!checkins_vigilancia_vigilador_id_fkey(nombre)").order("fecha", { ascending: false }).limit(30),
      supabase.from("novedades_vigilancia").select("*, puntos_control(nombre), profiles!novedades_vigilancia_vigilador_id_fkey(nombre)").order("fecha", { ascending: false }).limit(30),
      supabase.rpc("fn_incumplimientos_ronda", { p_dias_atras: 3 }),
    ]);
    setPuntos(pc || []);
    setRondas(rv || []);
    setVigiladores(vig || []);
    setCheckins(cks || []);
    setNovedades(nov || []);
    setIncumplimientos(inc || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function agregarPunto(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !nuevoPunto.nombre.trim()) return;
    setGuardandoPunto(true);
    await supabase.from("puntos_control").insert({
      tenant_id: profile.tenant_id,
      nombre: nuevoPunto.nombre.trim(),
      direccion: nuevoPunto.direccion || null,
      lat: nuevoPunto.lat ? Number(nuevoPunto.lat) : null,
      lng: nuevoPunto.lng ? Number(nuevoPunto.lng) : null,
      radio_geofence_m: Number(nuevoPunto.radio_geofence_m) || 100,
    });
    setNuevoPunto({ nombre: "", direccion: "", lat: "", lng: "", radio_geofence_m: "100" });
    setGuardandoPunto(false);
    load();
  }

  function toggleDia(d: string) {
    setDiasRonda((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }
  function togglePuntoRonda(id: string) {
    setPuntosRonda((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function agregarRonda(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !nuevaRonda.nombre.trim() || !nuevaRonda.vigilador_id || puntosRonda.length === 0) {
      setErrorRonda("Completá nombre, vigilador y al menos un punto de control.");
      return;
    }
    setGuardandoRonda(true);
    setErrorRonda(null);
    const { error } = await supabase.from("rondas_vigilancia").insert({
      tenant_id: profile.tenant_id,
      nombre: nuevaRonda.nombre.trim(),
      vigilador_id: nuevaRonda.vigilador_id,
      dias_semana: diasRonda,
      hora_inicio: nuevaRonda.hora_inicio || null,
      hora_fin: nuevaRonda.hora_fin || null,
      puntos_control_ids: puntosRonda,
    });
    if (error) setErrorRonda(error.message);
    else {
      setNuevaRonda({ nombre: "", vigilador_id: "", hora_inicio: "", hora_fin: "" });
      setDiasRonda([]);
      setPuntosRonda([]);
    }
    setGuardandoRonda(false);
    load();
  }

  if (loading) return <p className="text-gray-400">Cargando…</p>;

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Control de vigiladores/serenos: puntos de control, rondas con check-in geolocalizado, libro de novedades y
        alertas de incumplimiento — funcionalidad adicional dentro de PUNY Seguridad, para distribuidoras que cuentan
        con personal de vigilancia física.
      </p>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Puntos de control activos" value={String(puntos.filter((p) => p.activo).length)} tech />
        <StatCard label="Rondas configuradas" value={String(rondas.length)} />
        <StatCard label="Incumplimientos (últimos 3 días)" value={String(incumplimientos.length)} />
      </div>

      {soloLectura && (
        <div className="card mb-6 bg-gray-50 border-gray-200">
          <p className="text-sm text-gray-600">
            Acceso de solo lectura: como Supervisor podés ver puntos de control, rondas, check-ins, novedades e
            incumplimientos, pero el alta de puntos y rondas la maneja el Dueño/Administrador desde acá mismo.
          </p>
        </div>
      )}

      {!soloLectura && vigiladores.length === 0 && (
        <div className="card mb-6 bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-800">
            Todavía no hay usuarios con rol "Vigilador / Sereno" creados. Se crean desde Sistema → Usuarios y Permisos,
            igual que cualquier otro usuario de campo.
          </p>
        </div>
      )}

      {soloLectura ? (
        <div className="card mb-6">
          <h3 className="text-sm font-semibold text-navy mb-3">Puntos de control</h3>
          <div className="space-y-1">
            {puntos.map((p) => (
              <div key={p.id} className="text-xs text-gray-600 border-b border-gray-100 py-1 flex justify-between">
                <span>{p.nombre}{p.direccion ? ` — ${p.direccion}` : ""}</span>
                <span className="text-gray-400">{p.radio_geofence_m} m</span>
              </div>
            ))}
            {puntos.length === 0 && <p className="text-xs text-gray-400">Sin puntos de control cargados.</p>}
          </div>
        </div>
      ) : (
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h3 className="text-sm font-semibold text-navy mb-3">Agregar punto de control</h3>
          <form onSubmit={agregarPunto} className="space-y-2">
            <input className="input" placeholder="Nombre (ej. Portón principal)" value={nuevoPunto.nombre} onChange={(e) => setNuevoPunto({ ...nuevoPunto, nombre: e.target.value })} required />
            <input className="input" placeholder="Dirección (opcional)" value={nuevoPunto.direccion} onChange={(e) => setNuevoPunto({ ...nuevoPunto, direccion: e.target.value })} />
            <div className="grid grid-cols-3 gap-2">
              <input className="input" type="number" step="any" placeholder="Latitud" value={nuevoPunto.lat} onChange={(e) => setNuevoPunto({ ...nuevoPunto, lat: e.target.value })} />
              <input className="input" type="number" step="any" placeholder="Longitud" value={nuevoPunto.lng} onChange={(e) => setNuevoPunto({ ...nuevoPunto, lng: e.target.value })} />
              <input className="input" type="number" placeholder="Radio (m)" value={nuevoPunto.radio_geofence_m} onChange={(e) => setNuevoPunto({ ...nuevoPunto, radio_geofence_m: e.target.value })} />
            </div>
            <button className="btn-primary text-xs" disabled={guardandoPunto}>{guardandoPunto ? "Guardando…" : "Agregar punto"}</button>
          </form>
          <div className="mt-4 space-y-1">
            {puntos.map((p) => (
              <div key={p.id} className="text-xs text-gray-600 border-b border-gray-100 py-1 flex justify-between">
                <span>{p.nombre}{p.direccion ? ` — ${p.direccion}` : ""}</span>
                <span className="text-gray-400">{p.radio_geofence_m} m</span>
              </div>
            ))}
            {puntos.length === 0 && <p className="text-xs text-gray-400">Sin puntos de control cargados.</p>}
          </div>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-navy mb-3">Armar ronda</h3>
          <form onSubmit={agregarRonda} className="space-y-2">
            <input className="input" placeholder="Nombre de la ronda" value={nuevaRonda.nombre} onChange={(e) => setNuevaRonda({ ...nuevaRonda, nombre: e.target.value })} required />
            <select className="input" value={nuevaRonda.vigilador_id} onChange={(e) => setNuevaRonda({ ...nuevaRonda, vigilador_id: e.target.value })} required>
              <option value="">Elegir vigilador…</option>
              {vigiladores.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input className="input" type="time" value={nuevaRonda.hora_inicio} onChange={(e) => setNuevaRonda({ ...nuevaRonda, hora_inicio: e.target.value })} />
              <input className="input" type="time" value={nuevaRonda.hora_fin} onChange={(e) => setNuevaRonda({ ...nuevaRonda, hora_fin: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">Días</label>
              <div className="flex flex-wrap gap-1 mt-1">
                {DIAS.map((d) => (
                  <button type="button" key={d} onClick={() => toggleDia(d)}
                    className={`text-[11px] px-2 py-1 rounded border ${diasRonda.includes(d) ? "bg-navy text-white border-navy" : "border-gray-200 text-gray-600"}`}>
                    {d.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600">Puntos de control (en orden de click)</label>
              <div className="flex flex-wrap gap-1 mt-1">
                {puntos.map((p) => {
                  const idx = puntosRonda.indexOf(p.id);
                  return (
                    <button type="button" key={p.id} onClick={() => togglePuntoRonda(p.id)}
                      className={`text-[11px] px-2 py-1 rounded border ${idx >= 0 ? "bg-accent text-white border-accent" : "border-gray-200 text-gray-600"}`}>
                      {idx >= 0 ? `${idx + 1}. ` : ""}{p.nombre}
                    </button>
                  );
                })}
              </div>
            </div>
            <button className="btn-primary text-xs" disabled={guardandoRonda}>{guardandoRonda ? "Guardando…" : "Crear ronda"}</button>
            {errorRonda && <p className="text-danger text-xs">{errorRonda}</p>}
          </form>
        </div>
      </div>
      )}

      <div className="card mb-6 overflow-x-auto">
        <h3 className="text-sm font-semibold text-navy mb-3">Rondas configuradas</h3>
        <table className="tbl">
          <thead><tr><th>Ronda</th><th>Vigilador</th><th>Días</th><th>Horario</th><th>Puntos</th></tr></thead>
          <tbody>
            {rondas.map((r) => (
              <tr key={r.id}>
                <td>{r.nombre}</td>
                <td>{r.profiles?.nombre || "—"}</td>
                <td>{(r.dias_semana || []).map((d: string) => d.slice(0, 3)).join(", ") || "—"}</td>
                <td>{r.hora_inicio ? `${r.hora_inicio.slice(0, 5)}–${r.hora_fin?.slice(0, 5) || "?"}` : "—"}</td>
                <td>{(r.puntos_control_ids || []).length}</td>
              </tr>
            ))}
            {rondas.length === 0 && <tr><td colSpan={5} className="text-gray-400">Sin rondas configuradas.</td></tr>}
          </tbody>
        </table>
      </div>

      {incumplimientos.length > 0 && (
        <div className="card mb-6 bg-red-50 border-red-200">
          <h3 className="text-sm font-semibold text-red-800 mb-2">Incumplimientos de ronda (últimos 3 días)</h3>
          <ul className="text-xs text-red-800 space-y-0.5">
            {incumplimientos.slice(0, 15).map((i: any, idx: number) => (
              <li key={idx}>
                • {i.vigilador_nombre} no chequeó "{i.punto_control_nombre}" de la ronda "{i.ronda_nombre}" — {new Date(i.fecha_programada).toLocaleDateString("es-AR")}
              </li>
            ))}
            {incumplimientos.length > 15 && <li>… y {incumplimientos.length - 15} más.</li>}
          </ul>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card overflow-x-auto">
          <h3 className="text-sm font-semibold text-navy mb-3">Actividad reciente (check-ins)</h3>
          <table className="tbl">
            <thead><tr><th>Fecha</th><th>Vigilador</th><th>Punto</th><th>Estado</th></tr></thead>
            <tbody>
              {checkins.map((c: any) => (
                <tr key={c.id}>
                  <td>{new Date(c.fecha).toLocaleString("es-AR")}</td>
                  <td>{c.profiles?.nombre || "—"}</td>
                  <td>{c.puntos_control?.nombre || "—"}</td>
                  <td>{c.dentro_geofence ? <span className="badge bg-green-100 text-green-700">Dentro</span> : <span className="badge bg-amber-100 text-amber-700">Fuera</span>}</td>
                </tr>
              ))}
              {checkins.length === 0 && <tr><td colSpan={4} className="text-gray-400">Sin check-ins registrados.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card overflow-x-auto">
          <h3 className="text-sm font-semibold text-navy mb-3">Libro de novedades</h3>
          <table className="tbl">
            <thead><tr><th>Fecha</th><th>Vigilador</th><th>Gravedad</th><th>Descripción</th></tr></thead>
            <tbody>
              {novedades.map((n: any) => (
                <tr key={n.id}>
                  <td>{new Date(n.fecha).toLocaleString("es-AR")}</td>
                  <td>{n.profiles?.nombre || "—"}</td>
                  <td><span className={`badge ${GRAVEDAD_BADGE[n.gravedad]}`}>{n.gravedad}</span></td>
                  <td>{n.descripcion}</td>
                </tr>
              ))}
              {novedades.length === 0 && <tr><td colSpan={4} className="text-gray-400">Sin novedades cargadas.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
