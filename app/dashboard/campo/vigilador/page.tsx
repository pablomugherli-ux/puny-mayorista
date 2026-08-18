"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import { distanciaMetros, obtenerPosicionActual } from "@/lib/geo";
import { ejecutarOEncolar, leerConCache } from "@/lib/offlineSync";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const hoyNombre = DIAS[new Date().getDay()];
const hoyISO = new Date().toISOString().slice(0, 10);

const GRAVEDAD_BADGE: Record<string, string> = {
  alta: "bg-red-100 text-red-700",
  media: "bg-amber-100 text-amber-700",
  baja: "bg-gray-100 text-gray-600",
};

export default function VigiladorHome() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rondasHoy, setRondasHoy] = useState<any[]>([]);
  const [puntos, setPuntos] = useState<Record<string, any>>({});
  const [checkinsHoy, setCheckinsHoy] = useState<Record<string, number>>({});
  const [checkeando, setCheckeando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Record<string, { dentro: boolean; distancia: number | null }>>({});

  const [novedades, setNovedades] = useState<any[]>([]);
  const [form, setForm] = useState({ punto_control_id: "", gravedad: "media", descripcion: "" });
  const [enviando, setEnviando] = useState(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);

  async function load() {
    if (!profile) return;
    setLoading(true);
    // Se cachea localmente para que Mi Ronda se pueda seguir viendo (y
    // trabajando: check-in y novedades) sin conexión.
    const rondas = await leerConCache(`rondas_vigilancia:${profile.id}`, () =>
      supabase.from("rondas_vigilancia").select("*").eq("vigilador_id", profile.id).eq("activo", true)
    );
    const deHoy = (rondas || []).filter((r: any) => (r.dias_semana || []).includes(hoyNombre));
    setRondasHoy(deHoy);

    const idsPuntos = Array.from(new Set(deHoy.flatMap((r: any) => r.puntos_control_ids || [])));
    if (idsPuntos.length > 0) {
      const pc = await leerConCache(`puntos_control:${profile.id}`, () => supabase.from("puntos_control").select("*").in("id", idsPuntos));
      const mapa: Record<string, any> = {};
      (pc || []).forEach((p: any) => (mapa[p.id] = p));
      setPuntos(mapa);
    } else {
      setPuntos({});
    }

    const cks = await leerConCache(`checkins_hoy:${profile.id}:${hoyISO}`, () =>
      supabase.from("checkins_vigilancia").select("punto_control_id, fecha").eq("vigilador_id", profile.id).gte("fecha", `${hoyISO}T00:00:00`)
    );
    const conteo: Record<string, number> = {};
    (cks || []).forEach((c: any) => (conteo[c.punto_control_id] = (conteo[c.punto_control_id] || 0) + 1));
    setCheckinsHoy(conteo);

    const nov = await leerConCache(`novedades:${profile.id}`, () =>
      supabase.from("novedades_vigilancia").select("*, puntos_control(nombre)").eq("vigilador_id", profile.id).order("fecha", { ascending: false }).limit(15)
    );
    setNovedades(nov || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [profile?.id]);

  async function hacerCheckIn(rondaId: string, puntoId: string) {
    const punto = puntos[puntoId];
    if (!profile || !punto) return;
    setCheckeando(puntoId);
    try {
      const pos = await obtenerPosicionActual();
      const { latitude, longitude } = pos.coords;
      const distancia = distanciaMetros(latitude, longitude, punto.lat, punto.lng);
      const dentro = distancia != null ? distancia <= (punto.radio_geofence_m || 100) : false;
      // Igual que en los demás flujos de campo: id y fecha real los genera
      // el celular, no la base — así el check-in queda con la hora real de
      // la ronda aunque se suba recién al recuperar señal.
      await ejecutarOEncolar({
        tabla: "checkins_vigilancia", tipo: "insert",
        payload: {
          id: crypto.randomUUID(), tenant_id: profile.tenant_id, ronda_id: rondaId, punto_control_id: puntoId, vigilador_id: profile.id,
          lat: latitude, lng: longitude, distancia_m: distancia, dentro_geofence: dentro,
          fecha: new Date().toISOString(),
        },
        descripcion: `Check-in — ${punto.nombre}`,
        tenantId: profile.tenant_id,
      });
      setResultado((r) => ({ ...r, [puntoId]: { dentro, distancia } }));
      setCheckinsHoy((c) => ({ ...c, [puntoId]: (c[puntoId] || 0) + 1 }));
    } catch {
      setResultado((r) => ({ ...r, [puntoId]: { dentro: false, distancia: null } }));
    }
    setCheckeando(null);
  }

  async function cargarNovedad(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !form.descripcion.trim()) return;
    setEnviando(true);
    setErrorForm(null);
    const descripcion = form.descripcion.trim();
    const punto_control_id = form.punto_control_id || null;
    const fecha = new Date().toISOString();
    const res = await ejecutarOEncolar({
      tabla: "novedades_vigilancia", tipo: "insert",
      payload: {
        id: crypto.randomUUID(), tenant_id: profile.tenant_id, vigilador_id: profile.id,
        punto_control_id, gravedad: form.gravedad, descripcion, fecha,
      },
      descripcion: `Novedad — ${descripcion.slice(0, 40)}`,
      tenantId: profile.tenant_id,
    });
    if (!res.ok) {
      setErrorForm(res.error || "No se pudo guardar la novedad.");
    } else {
      setForm({ punto_control_id: "", gravedad: "media", descripcion: "" });
      if (res.encolado) {
        // Se refleja de inmediato en la lista aunque todavía no se subió,
        // para que el vigilador vea que quedó registrada.
        setNovedades((n) => [
          { id: crypto.randomUUID(), fecha, gravedad: form.gravedad, descripcion, puntos_control: punto_control_id ? puntos[punto_control_id] : null },
          ...n,
        ]);
      }
    }
    setEnviando(false);
    if (!res.encolado) load();
  }

  const totalPuntosHoy = rondasHoy.reduce((s, r) => s + (r.puntos_control_ids || []).length, 0);
  const totalChequeados = Object.keys(checkinsHoy).length;

  return (
    <div>
      <PageHeader title={`Mi ronda — ${profile?.nombre}`} subtitle={`Puntos de control programados para hoy (${hoyNombre})`} live />

      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard label="Puntos de control de hoy" value={String(totalPuntosHoy)} tech />
        <StatCard label="Chequeados hoy" value={String(totalChequeados)} />
      </div>

      {loading ? <p className="text-gray-400">Cargando…</p> : (
        <>
          {rondasHoy.length === 0 && <p className="text-gray-400 mb-8">No tenés rondas asignadas para hoy ({hoyNombre}).</p>}
          {rondasHoy.map((r) => (
            <div key={r.id} className="mb-8">
              <h3 className="text-sm font-semibold text-navy mb-2">
                {r.nombre}{r.hora_inicio ? ` — ${r.hora_inicio.slice(0, 5)} a ${r.hora_fin?.slice(0, 5) || "?"}` : ""}
              </h3>
              <div className="grid md:grid-cols-2 gap-4">
                {(r.puntos_control_ids || []).map((pid: string, i: number) => {
                  const p = puntos[pid];
                  if (!p) return null;
                  const yaChequeado = (checkinsHoy[pid] || 0) > 0;
                  const res = resultado[pid];
                  return (
                    <div key={pid} className="card">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-navy text-white text-xs font-bold mb-1">{i + 1}</div>
                          <div className="font-semibold text-navy">{p.nombre}</div>
                          <div className="text-xs text-gray-500">{p.direccion}</div>
                        </div>
                        {yaChequeado && <span className="badge bg-green-100 text-green-700">Chequeado hoy ({checkinsHoy[pid]})</span>}
                      </div>
                      <button
                        className="btn-secondary text-xs mt-3"
                        onClick={() => hacerCheckIn(r.id, pid)}
                        disabled={checkeando === pid}
                      >
                        {checkeando === pid ? "Obteniendo ubicación…" : "Check-in geolocalizado"}
                      </button>
                      {res && (
                        <p className={`text-xs mt-2 ${res.dentro ? "text-green-700" : "text-amber-700"}`}>
                          {res.dentro
                            ? `✓ Dentro del radio (${res.distancia?.toFixed(0)} m)`
                            : `⚠ Fuera del radio (${res.distancia != null ? res.distancia.toFixed(0) + " m" : "sin ubicación"}) — queda registrado como excepción`}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="card mb-6">
            <h3 className="text-sm font-semibold text-navy mb-3">Cargar novedad</h3>
            <form onSubmit={cargarNovedad} className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <select className="input" value={form.punto_control_id} onChange={(e) => setForm({ ...form, punto_control_id: e.target.value })}>
                <option value="">Sin punto específico</option>
                {Object.values(puntos).map((p: any) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <select className="input" value={form.gravedad} onChange={(e) => setForm({ ...form, gravedad: e.target.value })}>
                <option value="baja">Gravedad baja</option>
                <option value="media">Gravedad media</option>
                <option value="alta">Gravedad alta</option>
              </select>
              <input className="input col-span-2" placeholder="Descripción de la novedad" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} required />
              <button className="btn-primary col-span-2 md:col-span-1" disabled={enviando}>{enviando ? "Guardando…" : "Cargar novedad"}</button>
            </form>
            {errorForm && <p className="text-danger text-xs mt-2">{errorForm}</p>}
          </div>

          <div className="card overflow-x-auto">
            <h3 className="text-sm font-semibold text-navy mb-3">Mis últimas novedades</h3>
            <table className="tbl">
              <thead><tr><th>Fecha</th><th>Punto</th><th>Gravedad</th><th>Descripción</th></tr></thead>
              <tbody>
                {novedades.map((n) => (
                  <tr key={n.id}>
                    <td>{new Date(n.fecha).toLocaleString("es-AR")}</td>
                    <td>{n.puntos_control?.nombre || "—"}</td>
                    <td><span className={`badge ${GRAVEDAD_BADGE[n.gravedad]}`}>{n.gravedad}</span></td>
                    <td>{n.descripcion}</td>
                  </tr>
                ))}
                {novedades.length === 0 && <tr><td colSpan={4} className="text-gray-400">Sin novedades cargadas todavía.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
