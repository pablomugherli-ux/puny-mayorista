"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import { ROLE_LABEL } from "@/lib/types";
import { periodoStr, diasEnMes } from "@/lib/stats";
import { useAuth } from "@/lib/useAuth";
import UsuariosAdmin from "../usuarios/page";

type Tab = "caja" | "iva" | "sueldos" | "legajos" | "licencias" | "accesos";

const MODALIDADES_CONTRATO = [
  { value: "tiempo_indeterminado", label: "Tiempo indeterminado" },
  { value: "plazo_fijo", label: "Plazo fijo" },
  { value: "eventual", label: "Eventual" },
  { value: "pasantia", label: "Pasantía" },
  { value: "temporada", label: "Temporada" },
] as const;

const fmt = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n || 0);
const fmtFecha = (s: string | null) => (s ? new Date(s).toLocaleDateString("es-AR") : "—");
// Fase A (agosto 2026): cajas multimoneda — a diferencia de fmt() (siempre ARS,
// usado por IVA/Sueldos/Legajos que sí son en pesos), acá cada caja puede estar
// en una divisa distinta y hay que mostrarlo explícito.
function fmtM(n: number, moneda: string) {
  try { return new Intl.NumberFormat("es-AR", { style: "currency", currency: moneda || "ARS" }).format(n || 0); }
  catch { return `${moneda} ${(n || 0).toFixed(2)}`; }
}

async function tenantId() {
  const { data: u } = await supabase.auth.getUser();
  const { data: p } = await supabase.from("profiles").select("tenant_id").eq("id", u.user?.id).single();
  return p?.tenant_id as string;
}
async function miId() {
  const { data: u } = await supabase.auth.getUser();
  return u.user?.id as string;
}

// Antes, toda la página quedaba detrás de un único permiso (permiso_rrhh),
// mostrando las 5 solapas completas a quien lo tuviera. Con los roles de
// función única nuevos (Cajero/Encargado de Caja, Tesorero, Jefe de
// Personal) cada uno debe ver solo lo suyo — se gatea cada solapa acá,
// además de la RLS de fondo que ya lo exige igual (esto es solo para no
// mostrar botones que van a fallar).
// Reformulación de navegación (agosto 2026): Dueño/Administrador entran acá
// desde dos pestañas distintas del Ribbon — "Finanzas" (Caja + IVA) y
// "Personal" (Sueldos, Legajos, Licencias, Accesos) — separadas porque son
// dos preguntas de negocio distintas ("¿cómo está la plata?" vs. "¿cómo está
// mi gente?"), ver PUNY_Propuesta_Reformulacion_Navegacion.docx. Sigue siendo
// una sola página con un solo set de permisos; `soloTabs` restringe qué
// solapas ofrece cada punto de entrada. Sin el prop, comportamiento idéntico
// al de antes (todas las solapas visibles según permiso).
export default function TesoreriaAdmin({ soloTabs, initialTab }: { soloTabs?: Tab[]; initialTab?: Tab } = {}) {
  const { profile, permisos } = useAuth();
  const esTotal = !!profile && ["dueno", "administrador"].includes(profile.role);
  // RBAC dinámico — Fase 5: profiles.permiso_caja/rrhh/finanzas quedan
  // retiradas; se lee directo de mis_permisos_activos() (Fase 4).
  const veCaja = esTotal || permisos.has("caja.acceso") || permisos.has("rrhh.acceso");
  const veIva = esTotal || permisos.has("finanzas.acceso") || permisos.has("rrhh.acceso");
  const veRrhh = esTotal || permisos.has("rrhh.acceso");

  // "Empleados y Accesos" (checklist RBAC dinámico) queda reservado a
  // dueno/administrador de forma dura acá también — es un permiso sensible
  // no delegable (sección 7 de la propuesta RBAC), a diferencia de las otras
  // solapas de este módulo que sí puede ver quien tenga permiso_rrhh.
  const TABS = ([
    ["caja", "Cajas Diarias", veCaja],
    ["iva", "Libro de IVA", veIva],
    ["sueldos", "Liquidación de Sueldos", veRrhh],
    ["legajos", "Legajos y SICOSS", veRrhh],
    ["licencias", "Vacaciones y Licencias", veRrhh],
    ["accesos", "Empleados y Accesos", esTotal],
  ] as const).filter(([k, , visible]) => visible && (!soloTabs || soloTabs.includes(k as Tab)));

  const [tab, setTab] = useState<Tab | null>(initialTab && TABS.some(([k]) => k === initialTab) ? initialTab : null);
  useEffect(() => {
    if (!tab && TABS.length) setTab(TABS[0][0] as Tab);
  }, [TABS.length]);

  return (
    <div>
      <PageHeader
        title="Tesorería y Sueldos"
        subtitle="Cajas diarias, Libro de IVA (ventas y compras), Liquidación de sueldos, Legajos de empleados y exportación estilo SICOSS."
      />
      <div className="flex gap-2 mb-5 flex-wrap">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k as Tab)} className={tab === k ? "btn-primary" : "btn-secondary"}>{label}</button>
        ))}
      </div>
      {!TABS.length && <p className="text-sm text-gray-400">No tenés acceso a ninguna sección de este módulo.</p>}
      {tab === "caja" && <TabCaja />}
      {tab === "iva" && <TabIva />}
      {tab === "sueldos" && <TabSueldos />}
      {tab === "legajos" && <TabLegajos />}
      {tab === "licencias" && <TabLicencias />}
      {tab === "accesos" && <UsuariosAdmin />}
    </div>
  );
}

// ============================================================================
// Vacaciones y Licencias — aprobación de solicitudes de empleados de campo
// ============================================================================
function TabLicencias() {
  const [solicitudes, setSolicitudes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [verTodas, setVerTodas] = useState(false);
  const [resolviendo, setResolviendo] = useState<string | null>(null);
  const [comentarios, setComentarios] = useState<Record<string, string>>({});
  const [ausentesHoy, setAusentesHoy] = useState<any[]>([]);
  const [loadingAusentes, setLoadingAusentes] = useState(true);

  const TIPO_LABEL: Record<string, string> = { vacaciones: "Vacaciones", enfermedad: "Enfermedad", estudio: "Examen / estudio", otro: "Otro" };
  const ESTADO_BADGE: Record<string, string> = {
    pendiente: "bg-amber-100 text-amber-700", aprobada: "bg-green-100 text-green-700",
    rechazada: "bg-red-100 text-red-700", cancelada: "bg-gray-100 text-gray-600",
  };

  // Fase D — Control de Ausentismo Diario (KPI 12): "quién falta hoy y por
  // qué", consolidado en un vistazo — antes había que ir empleado por
  // empleado. Se apoya en la misma tabla solicitudes_licencia ya aprobada,
  // filtrando el rango [fecha_desde, fecha_hasta] contra la fecha de hoy.
  async function loadAusentesHoy() {
    setLoadingAusentes(true);
    const hoy = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("solicitudes_licencia")
      .select("*, profiles(nombre, role)")
      .eq("estado", "aprobada")
      .lte("fecha_desde", hoy)
      .gte("fecha_hasta", hoy);
    setAusentesHoy(data || []);
    setLoadingAusentes(false);
  }
  useEffect(() => { loadAusentesHoy(); }, []);

  async function load() {
    setLoading(true);
    let q = supabase.from("solicitudes_licencia").select("*, profiles(nombre, email)").order("created_at", { ascending: false });
    if (!verTodas) q = q.eq("estado", "pendiente");
    const { data } = await q;
    setSolicitudes(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [verTodas]);

  async function resolver(id: string, estado: "aprobada" | "rechazada") {
    setResolviendo(id);
    const uid = await miId();
    await supabase.from("solicitudes_licencia").update({
      estado, resuelta_por: uid, resuelta_en: new Date().toISOString(),
      comentario_resolucion: comentarios[id] || null,
    }).eq("id", id);
    setResolviendo(null);
    load();
    loadAusentesHoy();
  }

  return (
    <div>
      <div className="card-tech mb-6">
        <h3 className="text-xs uppercase tracking-wide text-white/70 mb-3">
          Ausentismo de hoy ({new Date().toLocaleDateString("es-AR")}) — {ausentesHoy.length} persona{ausentesHoy.length === 1 ? "" : "s"}
        </h3>
        {loadingAusentes ? (
          <p className="text-white/60 text-sm">Cargando…</p>
        ) : ausentesHoy.length === 0 ? (
          <p className="text-white/60 text-sm">Nadie tiene una licencia aprobada vigente hoy.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {ausentesHoy.map((a) => (
              <div key={a.id} className="bg-white/10 rounded-md px-3 py-2">
                <div className="font-semibold text-electric text-sm">{a.profiles?.nombre || "Empleado"}</div>
                <div className="text-[11px] text-white/70">{TIPO_LABEL[a.tipo] || a.tipo} · hasta {fmtFecha(a.fecha_hasta)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card mb-6 border-l-4 border-amber-400">
        <p className="text-sm text-gray-700">
          Los empleados de campo (vendedor, entrega, cobrador) piden acá sus vacaciones y licencias desde "Mi Portal".
          Aprobar o rechazar no descuenta ni ajusta automáticamente la liquidación de sueldos — es solo el registro y
          la comunicación del pedido; el ajuste en los haberes, si corresponde, se sigue cargando a mano en Liquidación
          de Sueldos.
        </p>
      </div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-navy">Solicitudes</h3>
        <label className="text-xs text-gray-500 flex items-center gap-1">
          <input type="checkbox" checked={verTodas} onChange={(e) => setVerTodas(e.target.checked)} />
          Ver todas (incluye resueltas)
        </label>
      </div>
      {loading ? <p className="text-gray-400">Cargando…</p> : (
        <div className="space-y-3">
          {solicitudes.map((s) => (
            <div key={s.id} className="card">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <div>
                  <span className="font-medium">{s.profiles?.nombre || s.profiles?.email || "Empleado"}</span>
                  <span className="text-xs text-gray-400 ml-2">{TIPO_LABEL[s.tipo] || s.tipo}</span>
                </div>
                <span className={`badge ${ESTADO_BADGE[s.estado]}`}>{s.estado}</span>
              </div>
              <p className="text-sm text-gray-600 mb-1">{fmtFecha(s.fecha_desde)} → {fmtFecha(s.fecha_hasta)}</p>
              {s.motivo && <p className="text-xs text-gray-500 mb-2">Motivo: {s.motivo}</p>}
              {s.estado === "pendiente" ? (
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  <input
                    className="input flex-1 min-w-[200px]" placeholder="Comentario (opcional)"
                    value={comentarios[s.id] || ""} onChange={(e) => setComentarios({ ...comentarios, [s.id]: e.target.value })}
                  />
                  <button className="btn-primary text-sm" disabled={resolviendo === s.id} onClick={() => resolver(s.id, "aprobada")}>Aprobar</button>
                  <button className="text-danger text-sm" disabled={resolviendo === s.id} onClick={() => resolver(s.id, "rechazada")}>Rechazar</button>
                </div>
              ) : (
                s.comentario_resolucion && <p className="text-xs text-gray-400 mt-1">Comentario: {s.comentario_resolucion}</p>
              )}
            </div>
          ))}
          {solicitudes.length === 0 && <p className="text-gray-400 text-sm">{verTodas ? "Sin solicitudes registradas." : "No hay solicitudes pendientes."}</p>}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Cajas diarias — varias cajas simultáneas, con resumen general para el
// Dueño/administradores. Cada caja se abre y cierra de forma independiente
// (ej. una por vendedor ambulante, una por depósito, una general de mostrador).
// ============================================================================
function TabCaja() {
  const [cajas, setCajas] = useState<any[]>([]);
  const [movsPorCaja, setMovsPorCaja] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [cajaSeleccionada, setCajaSeleccionada] = useState<string | null>(null);
  const [nombreNueva, setNombreNueva] = useState("");
  const [monedaNueva, setMonedaNueva] = useState("ARS");
  const [montoApertura, setMontoApertura] = useState("0");
  const [nuevoMov, setNuevoMov] = useState({ tipo: "ingreso" as "ingreso" | "egreso", concepto: "", monto: "" });
  const hoy = new Date().toISOString().slice(0, 10);

  async function load() {
    setLoading(true);
    const { data: cs } = await supabase.from("cajas_diarias").select("*, profiles!cajas_diarias_abierta_por_fkey(nombre)").eq("fecha", hoy).order("nombre");
    setCajas(cs || []);
    if (cs && cs.length > 0) {
      const { data: ms } = await supabase.from("caja_movimientos").select("*").in("caja_id", cs.map((c: any) => c.id)).order("fecha", { ascending: false });
      const agrupado: Record<string, any[]> = {};
      (ms || []).forEach((m: any) => { (agrupado[m.caja_id] ||= []).push(m); });
      setMovsPorCaja(agrupado);
      setCajaSeleccionada((prev) => prev && cs.some((c: any) => c.id === prev) ? prev : cs[0].id);
    } else {
      setMovsPorCaja({});
      setCajaSeleccionada(null);
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function abrirCaja(e: React.FormEvent) {
    e.preventDefault();
    if (!nombreNueva.trim()) return;
    const tid = await tenantId();
    const uid = await miId();
    const { error } = await supabase.from("cajas_diarias").insert({
      tenant_id: tid, fecha: hoy, nombre: nombreNueva.trim(), moneda: monedaNueva.trim().toUpperCase() || "ARS", monto_apertura: Number(montoApertura), abierta_por: uid,
    });
    if (!error) { setNombreNueva(""); setMonedaNueva("ARS"); setMontoApertura("0"); load(); }
  }

  async function registrarMov(e: React.FormEvent) {
    e.preventDefault();
    if (!cajaSeleccionada || !nuevoMov.monto) return;
    const tid = await tenantId();
    const uid = await miId();
    await supabase.from("caja_movimientos").insert({
      tenant_id: tid, caja_id: cajaSeleccionada, tipo: nuevoMov.tipo, concepto: nuevoMov.concepto, monto: Number(nuevoMov.monto), created_by: uid,
    });
    setNuevoMov({ tipo: "ingreso", concepto: "", monto: "" });
    load();
  }

  function totalesDe(caja: any) {
    const movs = movsPorCaja[caja.id] || [];
    const ingresos = movs.filter((m) => m.tipo === "ingreso").reduce((a, m) => a + Number(m.monto), 0);
    const egresos = movs.filter((m) => m.tipo === "egreso").reduce((a, m) => a + Number(m.monto), 0);
    const cierreSugerido = Number(caja.monto_apertura) + ingresos - egresos;
    return { ingresos, egresos, cierreSugerido };
  }

  async function cerrarCaja(caja: any) {
    const uid = await miId();
    const { cierreSugerido } = totalesDe(caja);
    await supabase.from("cajas_diarias").update({ estado: "cerrada", monto_cierre: cierreSugerido, cerrada_por: uid }).eq("id", caja.id);
    load();
  }

  if (loading) return <p className="text-gray-400">Cargando…</p>;

  const resumen = cajas.reduce(
    (acc, c) => {
      const { ingresos, egresos } = totalesDe(c);
      acc.apertura += Number(c.monto_apertura);
      acc.ingresos += ingresos;
      acc.egresos += egresos;
      if (c.estado === "abierta") acc.abiertas += 1; else acc.cerradas += 1;
      return acc;
    },
    { apertura: 0, ingresos: 0, egresos: 0, abiertas: 0, cerradas: 0 }
  );
  // Fase A: el saldo consolidado se agrupa por moneda — sumar ARS con USD
  // sin convertir daría un número engañoso. Cada moneda muestra su propio total.
  const saldoPorMoneda = cajas.reduce<Record<string, number>>((acc, c: any) => {
    const { ingresos, egresos } = totalesDe(c);
    const m = c.moneda || "ARS";
    acc[m] = (acc[m] || 0) + Number(c.monto_apertura) + ingresos - egresos;
    return acc;
  }, {});
  const caja = cajas.find((c) => c.id === cajaSeleccionada);
  const { ingresos, egresos, cierreSugerido } = caja ? totalesDe(caja) : { ingresos: 0, egresos: 0, cierreSugerido: 0 };

  return (
    <div>
      {cajas.length > 0 && (
        <div className="card-tech mb-6">
          <h3 className="text-xs uppercase tracking-wide text-white/70 mb-3">Resumen general — todas las cajas de hoy ({fmtFecha(hoy)})</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div><div className="text-[10px] text-white/60 uppercase">Cajas abiertas</div><div className="text-lg font-bold text-electric">{resumen.abiertas}</div></div>
            <div><div className="text-[10px] text-white/60 uppercase">Cajas cerradas</div><div className="text-lg font-bold text-electric">{resumen.cerradas}</div></div>
            <div><div className="text-[10px] text-white/60 uppercase">Ingresos totales (ARS)</div><div className="text-lg font-bold text-electric">{fmt(resumen.ingresos)}</div></div>
            <div><div className="text-[10px] text-white/60 uppercase">Egresos totales (ARS)</div><div className="text-lg font-bold text-electric">{fmt(resumen.egresos)}</div></div>
          </div>
          <div className="text-[10px] text-white/60 uppercase mb-1">Saldo consolidado por moneda</div>
          <div className="flex flex-wrap gap-4">
            {Object.entries(saldoPorMoneda).map(([m, v]) => (
              <div key={m} className="text-lg font-bold text-electric">{fmtM(v, m)}</div>
            ))}
          </div>
        </div>
      )}

      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Abrir una nueva caja</h3>
        <form onSubmit={abrirCaja} className="flex gap-2 flex-wrap">
          <input className="input flex-1 min-w-[180px]" placeholder="Nombre de la caja (ej. Mostrador, Caja Vendedor Ambulante)" value={nombreNueva} onChange={(e) => setNombreNueva(e.target.value)} required />
          <input className="input w-24" placeholder="Moneda" value={monedaNueva} onChange={(e) => setMonedaNueva(e.target.value)} title="Ej: ARS, USD, EUR — sin límite de divisas simultáneas" />
          <input className="input w-40" type="number" step="0.01" min="0" placeholder="Monto de apertura" value={montoApertura} onChange={(e) => setMontoApertura(e.target.value)} required />
          <button className="btn-primary shrink-0">Abrir caja</button>
        </form>
      </div>

      {cajas.length === 0 ? (
        <p className="text-gray-400">No hay cajas abiertas hoy todavía.</p>
      ) : (
        <>
          <div className="flex gap-2 mb-5 flex-wrap">
            {cajas.map((c) => (
              <button
                key={c.id}
                onClick={() => setCajaSeleccionada(c.id)}
                className={cajaSeleccionada === c.id ? "btn-primary text-xs" : "btn-secondary text-xs"}
              >
                {c.nombre} <span className="opacity-70">({c.moneda || "ARS"})</span> {c.estado === "cerrada" ? "· cerrada" : ""}
              </button>
            ))}
          </div>

          {caja && (
            <>
              <div className="grid grid-cols-4 gap-4 mb-6">
                <StatCard label={`Apertura (${caja.moneda || "ARS"})`} value={fmtM(caja.monto_apertura, caja.moneda)} />
                <StatCard label="Ingresos" value={fmtM(ingresos, caja.moneda)} />
                <StatCard label="Egresos" value={fmtM(egresos, caja.moneda)} />
                <StatCard label={caja.estado === "cerrada" ? "Cierre registrado" : "Cierre sugerido"} value={fmtM(caja.estado === "cerrada" ? caja.monto_cierre : cierreSugerido, caja.moneda)} tech />
              </div>

              {caja.estado === "abierta" && (
                <div className="card mb-6">
                  <h3 className="text-sm font-semibold text-navy mb-3">Registrar movimiento — {caja.nombre}</h3>
                  <form onSubmit={registrarMov} className="grid grid-cols-3 gap-2">
                    <select className="input" value={nuevoMov.tipo} onChange={(e) => setNuevoMov({ ...nuevoMov, tipo: e.target.value as any })}>
                      <option value="ingreso">Ingreso</option>
                      <option value="egreso">Egreso</option>
                    </select>
                    <input className="input" placeholder="Concepto" value={nuevoMov.concepto} onChange={(e) => setNuevoMov({ ...nuevoMov, concepto: e.target.value })} required />
                    <input className="input" type="number" step="0.01" min="0.01" placeholder="Importe" value={nuevoMov.monto} onChange={(e) => setNuevoMov({ ...nuevoMov, monto: e.target.value })} required />
                    <button className="btn-primary col-span-3">Registrar</button>
                  </form>
                  <button className="btn-secondary mt-4" onClick={() => cerrarCaja(caja)}>Cerrar esta caja</button>
                </div>
              )}

              <div className="card overflow-x-auto">
                <h3 className="text-sm font-semibold text-navy mb-3">Movimientos de {caja.nombre}</h3>
                <table className="tbl">
                  <thead><tr><th>Hora</th><th>Tipo</th><th>Concepto</th><th>Importe</th></tr></thead>
                  <tbody>
                    {(movsPorCaja[caja.id] || []).map((m) => (
                      <tr key={m.id}>
                        <td>{new Date(m.fecha).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</td>
                        <td><span className={`badge ${m.tipo === "ingreso" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{m.tipo}</span></td>
                        <td>{m.concepto}</td>
                        <td>{fmtM(m.monto, caja.moneda)}</td>
                      </tr>
                    ))}
                    {(movsPorCaja[caja.id] || []).length === 0 && <tr><td colSpan={4} className="text-gray-400">Sin movimientos todavía.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// Libro de IVA (ventas y compras)
// ============================================================================
function TabIva() {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes0, setMes0] = useState(hoy.getMonth());
  const [ventas, setVentas] = useState<any[]>([]);
  const [compras, setCompras] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const inicio = periodoStr(anio, mes0);
      const fin = periodoStr(mes0 === 11 ? anio + 1 : anio, mes0 === 11 ? 0 : mes0 + 1);
      const [{ data: v }, { data: c }] = await Promise.all([
        // Libro de IVA Ventas: exclusivamente Circuito 1 (Lista 1, oficial/facturable).
        // El Circuito 2 (Lista 2, interno) queda excluido de forma estricta — un
        // comprobante de Lista 2 ni siquiera puede tener tipo "factura" (constraint en la base).
        supabase.from("comprobantes").select("*, clientes(nombre)").eq("tipo", "factura").eq("lista", 1).gte("fecha", inicio).lt("fecha", fin).order("fecha"),
        supabase.from("proveedor_movimientos").select("*, proveedores(nombre)").eq("tipo", "compra").gte("fecha", inicio).lt("fecha", fin).order("fecha"),
      ]);
      setVentas(v || []);
      setCompras(c || []);
      setLoading(false);
    })();
  }, [anio, mes0]);

  const totalVentasNeto = ventas.reduce((a, v) => a + Number(v.neto || v.total / 1.21), 0);
  const totalVentasIva = ventas.reduce((a, v) => a + Number(v.iva_monto || v.total - v.total / 1.21), 0);
  const totalComprasNeto = compras.reduce((a, c) => a + Number(c.neto || c.monto / 1.21), 0);
  const totalComprasIva = compras.reduce((a, c) => a + Number(c.iva_monto || c.monto - c.monto / 1.21), 0);

  return (
    <div>
      <p className="text-xs text-gray-400 mb-3">
        Incluye exclusivamente Circuito 1 (Lista 1, ventas oficiales facturables). El Circuito 2 (Lista 2, ventas
        internas) queda excluido de este libro por diseño — no es fiscal.
      </p>
      <div className="flex gap-2 mb-6">
        <select className="input w-24" value={mes0} onChange={(e) => setMes0(Number(e.target.value))}>
          {Array.from({ length: 12 }).map((_, i) => <option key={i} value={i}>{new Date(2000, i, 1).toLocaleDateString("es-AR", { month: "long" })}</option>)}
        </select>
        <input className="input w-24" type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value))} />
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Ventas — Neto" value={fmt(totalVentasNeto)} />
        <StatCard label="Ventas — IVA débito fiscal" value={fmt(totalVentasIva)} />
        <StatCard label="Compras — Neto" value={fmt(totalComprasNeto)} />
        <StatCard label="Compras — IVA crédito fiscal" value={fmt(totalComprasIva)} />
      </div>
      <div className="card-tech mb-6">
        <div className="text-xs uppercase tracking-wide text-white/70">Saldo técnico de IVA del período (débito − crédito)</div>
        <div className="text-2xl font-bold mt-1">{fmt(totalVentasIva - totalComprasIva)}</div>
      </div>

      {loading ? <p className="text-gray-400">Cargando…</p> : (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card overflow-x-auto">
            <h3 className="text-sm font-semibold text-navy mb-3">Libro de IVA Ventas</h3>
            <table className="tbl">
              <thead><tr><th>Fecha</th><th>Cliente</th><th>Comp.</th><th>Neto</th><th>IVA</th><th>Total</th></tr></thead>
              <tbody>
                {ventas.map((v) => {
                  const neto = Number(v.neto || v.total / 1.21);
                  const iva = Number(v.iva_monto || v.total - v.total / 1.21);
                  return (
                    <tr key={v.id}>
                      <td>{fmtFecha(v.fecha)}</td><td>{v.clientes?.nombre || "—"}</td><td>#{v.numero}</td>
                      <td>{fmt(neto)}</td><td>{fmt(iva)}</td><td>{fmt(v.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="card overflow-x-auto">
            <h3 className="text-sm font-semibold text-navy mb-3">Libro de IVA Compras</h3>
            <table className="tbl">
              <thead><tr><th>Fecha</th><th>Proveedor</th><th>Neto</th><th>IVA</th><th>Total</th></tr></thead>
              <tbody>
                {compras.map((c) => {
                  const neto = Number(c.neto || c.monto / 1.21);
                  const iva = Number(c.iva_monto || c.monto - c.monto / 1.21);
                  return (
                    <tr key={c.id}>
                      <td>{fmtFecha(c.fecha)}</td><td>{c.proveedores?.nombre || "—"}</td>
                      <td>{fmt(neto)}</td><td>{fmt(iva)}</td><td>{fmt(c.monto)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-3">
        Si un comprobante o compra no tiene neto/IVA cargado explícitamente, se estima al 21% sobre el total como
        valor de referencia — cargá el desglose real en cada comprobante para un libro de IVA exacto.
      </p>
    </div>
  );
}

// ============================================================================
// Liquidación de sueldos
// ============================================================================
function TabSueldos() {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes0, setMes0] = useState(hoy.getMonth());
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [liquidaciones, setLiquidaciones] = useState<Record<string, any>>({});
  const [sugeridas, setSugeridas] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [edicion, setEdicion] = useState<Record<string, { sueldo_base: string; premios: string; premios_acumulados: string }>>({});

  const periodo = periodoStr(anio, mes0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: emp } = await supabase.from("profiles").select("*").not("role", "in", "(dueno,master,cliente_b2b)").eq("activo", true);
      setEmpleados(emp || []);

      const { data: liq } = await supabase.from("liquidaciones_sueldo").select("*").eq("periodo", periodo);
      const porId: Record<string, any> = {};
      (liq || []).forEach((l: any) => (porId[l.profile_id] = l));
      setLiquidaciones(porId);

      const ed: Record<string, any> = {};
      (emp || []).forEach((e: any) => {
        const l = porId[e.id];
        ed[e.id] = {
          sueldo_base: String(l?.sueldo_base ?? 0),
          premios: String(l?.premios ?? 0),
          premios_acumulados: String(l?.premios_acumulados ?? 0),
        };
      });
      setEdicion(ed);

      // Comisión sugerida del período seleccionado, con la misma lógica que
      // "Mis Comisiones y Objetivos" pero para un mes histórico arbitrario.
      const inicio = periodo;
      const fin = periodoStr(mes0 === 11 ? anio + 1 : anio, mes0 === 11 ? 0 : mes0 + 1);
      const { data: esquemas } = await supabase.from("esquemas_comision").select("*").eq("activo", true);
      const sug: Record<string, number> = {};
      for (const e of emp || []) {
        const esqRol = (esquemas || []).filter((s: any) => s.rol === e.role && (s.profile_id === null || s.profile_id === e.id));
        const efectivos = Object.values(
          esqRol.reduce((acc: Record<string, any>, s: any) => {
            const prev = acc[s.tipo];
            if (!prev || (s.profile_id && !prev.profile_id)) acc[s.tipo] = s;
            return acc;
          }, {} as Record<string, any>)
        ) as any[];
        if (efectivos.length === 0) { sug[e.id] = 0; continue; }

        let montoVentas = 0, cobranza = 0, entregas = 0;
        if (e.role === "vendedor") {
          const { data: pedidos } = await supabase.from("pedidos").select("total").eq("vendedor_id", e.id).gte("fecha", inicio).lt("fecha", fin).not("estado", "in", "(rechazado,cancelado)");
          montoVentas = (pedidos || []).reduce((a: number, p: any) => a + Number(p.total), 0);
        }
        if (e.role === "cobrador" || e.role === "entrega") {
          const campo = e.role === "cobrador" ? "cobrador_id" : "repartidor_id";
          const { data: cobros } = await supabase.from("cobros").select("monto").eq(campo, e.id).gte("fecha", inicio).lt("fecha", fin);
          cobranza = (cobros || []).reduce((a: number, c: any) => a + Number(c.monto), 0);
        }
        if (e.role === "entrega") {
          const { data: ents } = await supabase.from("entregas").select("estado, pedidos!inner(fecha)").eq("repartidor_id", e.id).gte("pedidos.fecha", inicio).lt("pedidos.fecha", fin);
          entregas = (ents || []).filter((x: any) => x.estado === "total" || x.estado === "parcial").length;
        }

        sug[e.id] = efectivos.reduce((s, esq) => {
          const base = esq.tipo === "pct_venta" ? montoVentas : esq.tipo === "pct_cobranza" ? cobranza : esq.tipo === "fijo_por_entrega" ? entregas : 0;
          return s + (esq.tipo === "fijo_por_entrega" ? base * Number(esq.valor) : base * (Number(esq.valor) / 100));
        }, 0);
      }
      setSugeridas(sug);
      setLoading(false);
    })();
  }, [periodo]);

  async function guardar(empId: string, cerrar: boolean) {
    const tid = await tenantId();
    const uid = await miId();
    const ed = edicion[empId];
    const comisiones = sugeridas[empId] || 0;
    const payload = {
      tenant_id: tid,
      profile_id: empId,
      periodo,
      sueldo_base: Number(ed.sueldo_base) || 0,
      comisiones,
      premios: Number(ed.premios) || 0,
      premios_acumulados: Number(ed.premios_acumulados) || 0,
      estado: cerrar ? "cerrada" : "borrador",
      created_by: uid,
      ...(cerrar ? { cerrado_en: new Date().toISOString() } : {}),
    };
    const existente = liquidaciones[empId];
    if (existente) {
      await supabase.from("liquidaciones_sueldo").update(payload).eq("id", existente.id);
    } else {
      await supabase.from("liquidaciones_sueldo").insert(payload);
    }
    const { data: liq } = await supabase.from("liquidaciones_sueldo").select("*").eq("periodo", periodo);
    const porId: Record<string, any> = {};
    (liq || []).forEach((l: any) => (porId[l.profile_id] = l));
    setLiquidaciones(porId);
  }

  const totalNomina = empleados.reduce((a, e) => {
    const l = liquidaciones[e.id];
    if (l) return a + Number(l.total);
    const ed = edicion[e.id];
    if (!ed) return a;
    return a + (Number(ed.sueldo_base) || 0) + (sugeridas[e.id] || 0) + (Number(ed.premios) || 0) + (Number(ed.premios_acumulados) || 0);
  }, 0);

  return (
    <div>
      <div className="flex gap-2 mb-6">
        <select className="input w-24" value={mes0} onChange={(e) => setMes0(Number(e.target.value))}>
          {Array.from({ length: 12 }).map((_, i) => <option key={i} value={i}>{new Date(2000, i, 1).toLocaleDateString("es-AR", { month: "long" })}</option>)}
        </select>
        <input className="input w-24" type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value))} />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Empleados" value={String(empleados.length)} />
        <StatCard label="Liquidaciones cerradas" value={String(Object.values(liquidaciones).filter((l: any) => l.estado === "cerrada").length)} />
        <StatCard label="Nómina total del período" value={fmt(totalNomina)} tech />
      </div>

      {loading ? <p className="text-gray-400">Cargando…</p> : (
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Empleado</th><th>Rol</th><th>Sueldo base</th><th>Comisiones (sugeridas)</th>
                <th>Premios del período</th><th>Premios acumulados multi-período</th><th>Total</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {empleados.map((e) => {
                const l = liquidaciones[e.id];
                const ed = edicion[e.id] || { sueldo_base: "0", premios: "0", premios_acumulados: "0" };
                const cerrada = l?.estado === "cerrada";
                const total = (Number(ed.sueldo_base) || 0) + (sugeridas[e.id] || 0) + (Number(ed.premios) || 0) + (Number(ed.premios_acumulados) || 0);
                return (
                  <tr key={e.id} className={cerrada ? "opacity-70" : ""}>
                    <td className="font-medium">{e.nombre}</td>
                    <td>{ROLE_LABEL[e.role as keyof typeof ROLE_LABEL]}</td>
                    <td>
                      <input className="input text-xs w-24" type="number" step="0.01" disabled={cerrada} value={ed.sueldo_base}
                        onChange={(ev) => setEdicion((s) => ({ ...s, [e.id]: { ...s[e.id], sueldo_base: ev.target.value } }))} />
                    </td>
                    <td>{fmt(sugeridas[e.id] || 0)}</td>
                    <td>
                      <input className="input text-xs w-24" type="number" step="0.01" disabled={cerrada} value={ed.premios}
                        onChange={(ev) => setEdicion((s) => ({ ...s, [e.id]: { ...s[e.id], premios: ev.target.value } }))} />
                    </td>
                    <td>
                      <input className="input text-xs w-24" type="number" step="0.01" disabled={cerrada} value={ed.premios_acumulados}
                        onChange={(ev) => setEdicion((s) => ({ ...s, [e.id]: { ...s[e.id], premios_acumulados: ev.target.value } }))} />
                    </td>
                    <td className="font-semibold">{fmt(total)}</td>
                    <td><span className={`badge ${cerrada ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{cerrada ? "Cerrada" : "Borrador"}</span></td>
                    <td>
                      {!cerrada && (
                        <div className="flex gap-1">
                          <button className="btn-secondary text-xs" onClick={() => guardar(e.id, false)}>Guardar</button>
                          <button className="btn-primary text-xs" onClick={() => guardar(e.id, true)}>Cerrar mes</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400 mt-3">
        La comisión sugerida se calcula automáticamente con el mismo esquema configurado en "Esquemas de Comisión",
        aplicado al período seleccionado. Los premios del período y los premios acumulados por cumplimiento de
        objetivos multi-período (por ejemplo, un bono trimestral o anual) se cargan manualmente, ya que dependen de
        la regla de negocio específica que definas. Una liquidación "cerrada" queda fija y visible como recibo para
        el propio empleado.
      </p>
    </div>
  );
}

// ============================================================================
// Legajos de empleados + exportación estilo SICOSS
// ============================================================================
function TabLegajos() {
  const [legajos, setLegajos] = useState<any[]>([]);
  const [empleados, setEmpleados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    profile_id: "", apellido: "", nombre: "", cuil: "", fecha_nacimiento: "", fecha_ingreso: "",
    categoria_convenio: "", modalidad_contratacion: "tiempo_indeterminado" as (typeof MODALIDADES_CONTRATO)[number]["value"],
    situacion_revista: "01", codigo_obra_social: "", cbu: "", domicilio: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hoy = new Date();
  const [periodoExport, setPeriodoExport] = useState(`${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`);
  const [generando, setGenerando] = useState(false);
  const [confirmoNoOficial, setConfirmoNoOficial] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: l }, { data: e }] = await Promise.all([
      supabase.from("legajos_empleados").select("*").order("apellido"),
      supabase.from("profiles").select("id, nombre, email, role").not("role", "in", "(dueno,master,cliente_b2b)").eq("activo", true),
    ]);
    setLegajos(l || []);
    setEmpleados(e || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function seleccionarEmpleado(profileId: string) {
    const emp = empleados.find((e) => e.id === profileId);
    const partes = (emp?.nombre || "").trim().split(/\s+/);
    const nombre = partes.slice(-1).join(" ") || "";
    const apellido = partes.slice(0, -1).join(" ") || emp?.nombre || "";
    setForm({ ...form, profile_id: profileId, apellido: apellido || emp?.nombre || "", nombre: profileId ? nombre : form.nombre });
  }

  async function crearLegajo(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.apellido || !form.nombre || !form.cuil || !form.fecha_ingreso) return;
    setSaving(true);
    const tid = await tenantId();
    const { error: err } = await supabase.from("legajos_empleados").insert({
      tenant_id: tid,
      profile_id: form.profile_id || null,
      apellido: form.apellido, nombre: form.nombre, cuil: form.cuil,
      fecha_nacimiento: form.fecha_nacimiento || null,
      fecha_ingreso: form.fecha_ingreso,
      categoria_convenio: form.categoria_convenio,
      modalidad_contratacion: form.modalidad_contratacion,
      situacion_revista: form.situacion_revista,
      codigo_obra_social: form.codigo_obra_social,
      cbu: form.cbu || null,
      domicilio: form.domicilio || null,
    });
    if (err) {
      setError(err.message.includes("duplicate") ? "Ya existe un legajo con ese CUIL." : err.message);
    } else {
      setForm({ profile_id: "", apellido: "", nombre: "", cuil: "", fecha_nacimiento: "", fecha_ingreso: "", categoria_convenio: "", modalidad_contratacion: "tiempo_indeterminado", situacion_revista: "01", codigo_obra_social: "", cbu: "", domicilio: "" });
      load();
    }
    setSaving(false);
  }

  async function darDeBaja(id: string) {
    await supabase.from("legajos_empleados").update({ activo: false, fecha_egreso: new Date().toISOString().slice(0, 10) }).eq("id", id);
    load();
  }

  async function generarSicoss() {
    if (!confirmoNoOficial) return;
    setGenerando(true);
    const tid = await tenantId();
    const { data: tenant } = await supabase.from("tenants").select("razon_social, cuit, nombre").eq("id", tid).single();
    const periodoAAAAMM = periodoExport.replace("-", "");
    const periodoDate = periodoExport + "-01";

    const activos = legajos.filter((l) => l.activo);
    const { data: liquidaciones } = await supabase.from("liquidaciones_sueldo").select("profile_id, total").eq("periodo", periodoDate);
    const totalPorProfile: Record<string, number> = {};
    (liquidaciones || []).forEach((l: any) => { if (l.profile_id) totalPorProfile[l.profile_id] = Number(l.total); });

    const lineas: string[] = [];
    lineas.push(`# Archivo estilo SICOSS — simplificado — NO ES el layout oficial de AFIP.`);
    lineas.push(`# Empleador: ${tenant?.razon_social || tenant?.nombre || "—"} | CUIT: ${tenant?.cuit || "—"} | Período: ${periodoAAAAMM}`);
    lineas.push(`# IMPORTANTE: validar campos, códigos y formato exacto con un contador o gestoría antes de presentar ante AFIP/ANSES.`);
    lineas.push(`CUIL|Apellido|Nombre|Situacion_Revista|Modalidad_Contratacion|Codigo_Obra_Social|CBU|Fecha_Ingreso|Fecha_Egreso|Categoria_Convenio|Remuneracion_Total|Periodo`);

    let totalRemunerado = 0;
    for (const l of activos) {
      const remuneracion = l.profile_id ? (totalPorProfile[l.profile_id] || 0) : 0;
      totalRemunerado += remuneracion;
      lineas.push([
        l.cuil.replace(/-/g, ""),
        l.apellido,
        l.nombre,
        l.situacion_revista,
        l.modalidad_contratacion,
        l.codigo_obra_social || "",
        l.cbu || "",
        l.fecha_ingreso,
        l.fecha_egreso || "",
        l.categoria_convenio || "",
        remuneracion.toFixed(2),
        periodoAAAAMM,
      ].join("|"));
    }
    lineas.push(`# Total empleados: ${activos.length} | Total remunerado del período: ${totalRemunerado.toFixed(2)}`);

    const blob = new Blob([lineas.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sicoss_simplificado_${periodoAAAAMM}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setGenerando(false);
  }

  return (
    <div>
      <div className="card mb-6 border-l-4 border-amber-400">
        <p className="text-sm text-gray-700">
          El legajo guarda los datos laborales de cada empleado (CUIL, convenio, obra social, modalidad de contratación,
          etc.) necesarios para armar la liquidación y exportar un archivo con la estructura general de SICOSS. No hay
          integración en vivo con AFIP/ANSES — el sistema no tiene ni puede tener las credenciales fiscales reales de tu
          distribuidora. El archivo generado usa un formato simplificado (delimitado por "|") con los campos estándar más
          relevantes; <strong>el layout exacto de columnas y códigos vigentes debe validarlo un contador o gestoría</strong> antes
          de presentarlo ante el organismo.
        </p>
      </div>

      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Nuevo legajo</h3>
        <form onSubmit={crearLegajo} className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <select className="input col-span-2" value={form.profile_id} onChange={(e) => seleccionarEmpleado(e.target.value)}>
            <option value="">Vincular a un usuario del sistema (opcional)…</option>
            {empleados.map((e) => <option key={e.id} value={e.id}>{e.nombre} ({e.email})</option>)}
          </select>
          <input className="input" placeholder="Apellido" value={form.apellido} onChange={(e) => setForm({ ...form, apellido: e.target.value })} required />
          <input className="input" placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
          <input className="input" placeholder="CUIL (AA-DDDDDDDD-D)" value={form.cuil} onChange={(e) => setForm({ ...form, cuil: e.target.value })} required />
          <input className="input" type="date" placeholder="Fecha de nacimiento" value={form.fecha_nacimiento} onChange={(e) => setForm({ ...form, fecha_nacimiento: e.target.value })} />
          <input className="input" type="date" value={form.fecha_ingreso} onChange={(e) => setForm({ ...form, fecha_ingreso: e.target.value })} required title="Fecha de ingreso" />
          <select className="input" value={form.modalidad_contratacion} onChange={(e) => setForm({ ...form, modalidad_contratacion: e.target.value as any })}>
            {MODALIDADES_CONTRATO.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <input className="input" placeholder="Categoría / convenio (ej. CCT 130/75 Adm. A)" value={form.categoria_convenio} onChange={(e) => setForm({ ...form, categoria_convenio: e.target.value })} />
          <input className="input" placeholder="Código de obra social" value={form.codigo_obra_social} onChange={(e) => setForm({ ...form, codigo_obra_social: e.target.value })} />
          <input className="input" placeholder="CBU (para pago de haberes)" value={form.cbu} onChange={(e) => setForm({ ...form, cbu: e.target.value })} />
          <input className="input col-span-2" placeholder="Domicilio" value={form.domicilio} onChange={(e) => setForm({ ...form, domicilio: e.target.value })} />
          <button className="btn-primary col-span-2" disabled={saving}>{saving ? "Guardando…" : "Registrar legajo"}</button>
        </form>
        {error && <p className="text-danger text-xs mt-2">{error}</p>}
      </div>

      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Exportar archivo estilo SICOSS</h3>
        <label className="flex items-start gap-2 text-xs text-gray-600 mb-3">
          <input type="checkbox" className="mt-0.5" checked={confirmoNoOficial} onChange={(e) => setConfirmoNoOficial(e.target.checked)} />
          <span>
            Entiendo que este archivo es un export <strong>simplificado y no oficial</strong>, que no reemplaza el
            aplicativo SICOSS de AFIP, y que debo validar su contenido con un contador o gestoría antes de presentarlo
            ante cualquier organismo.
          </span>
        </label>
        <div className="flex items-center gap-3">
          <input className="input max-w-[200px]" type="month" value={periodoExport} onChange={(e) => setPeriodoExport(e.target.value)} />
          <button className="btn-primary" onClick={generarSicoss} disabled={generando || !confirmoNoOficial || legajos.filter((l) => l.activo).length === 0}>
            {generando ? "Generando…" : "Descargar archivo del período"}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Toma la remuneración total de la liquidación de sueldos <strong>cerrada</strong> de cada empleado vinculado a un
          usuario del sistema para ese período. Los legajos sin liquidación cerrada en el período se exportan con
          remuneración en $0.
        </p>
      </div>

      <div className="card overflow-x-auto">
        <h3 className="text-sm font-semibold text-navy mb-3">Legajos registrados</h3>
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead>
              <tr><th>Apellido y Nombre</th><th>CUIL</th><th>Ingreso</th><th>Modalidad</th><th>Convenio</th><th>Obra Social</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {legajos.map((l) => (
                <tr key={l.id}>
                  <td>{l.apellido}, {l.nombre}</td>
                  <td>{l.cuil}</td>
                  <td>{fmtFecha(l.fecha_ingreso)}</td>
                  <td>{MODALIDADES_CONTRATO.find((m) => m.value === l.modalidad_contratacion)?.label}</td>
                  <td>{l.categoria_convenio || "—"}</td>
                  <td>{l.codigo_obra_social || "—"}</td>
                  <td>{l.activo ? <span className="badge bg-green-100 text-green-700">Activo</span> : <span className="badge bg-gray-100 text-gray-600">De baja</span>}</td>
                  <td>{l.activo && <button className="text-danger text-xs" onClick={() => darDeBaja(l.id)}>Dar de baja</button>}</td>
                </tr>
              ))}
              {legajos.length === 0 && <tr><td colSpan={8} className="text-gray-400">Sin legajos registrados.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
