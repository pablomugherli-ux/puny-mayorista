"use client";
import { Fragment, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PageHeader from "@/components/PageHeader";

type Tab = "plan" | "asientos" | "mayor" | "inflacion" | "activofijo" | "automatizacion";

const CATEGORIAS_BIEN = ["Rodados", "Muebles y Útiles", "Maquinaria", "Inmuebles", "Equipos informáticos", "Otros"];

const TIPOS_CUENTA = [
  { value: "activo", label: "Activo" },
  { value: "pasivo", label: "Pasivo" },
  { value: "patrimonio_neto", label: "Patrimonio Neto" },
  { value: "ingreso", label: "Ingreso" },
  { value: "egreso", label: "Egreso / Gasto" },
] as const;

const fmt = (n: number) => Number(n || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" });
const fmtFecha = (s: string) => (s ? new Date(s + "T00:00:00").toLocaleDateString("es-AR") : "—");

async function tenantId() {
  const { data: u } = await supabase.auth.getUser();
  const { data: p } = await supabase.from("profiles").select("tenant_id").eq("id", u.user?.id).single();
  return p?.tenant_id as string;
}

export default function ContabilidadAdmin() {
  const [tab, setTab] = useState<Tab>("plan");
  const [cuentas, setCuentas] = useState<any[]>([]);
  const [loadingCuentas, setLoadingCuentas] = useState(true);

  async function loadCuentas() {
    const { data } = await supabase.from("plan_cuentas").select("*").order("codigo");
    setCuentas(data || []);
    setLoadingCuentas(false);
  }
  useEffect(() => { loadCuentas(); }, []);

  return (
    <div>
      <PageHeader
        title="Contabilidad"
        subtitle="Plan de cuentas, asientos de partida doble, libro mayor y ajuste por inflación. El motor de ajuste por inflación es una herramienta de apoyo — requiere revisión de un contador matriculado antes de usarse con fines fiscales reales."
      />
      <div className="flex gap-2 mb-5 flex-wrap">
        {([
          ["plan", "Plan de Cuentas"],
          ["asientos", "Asientos (Libro Diario)"],
          ["mayor", "Libro Mayor"],
          ["inflacion", "Ajuste por Inflación"],
          ["activofijo", "Activo Fijo"],
          ["automatizacion", "Automatización de Asientos"],
        ] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={tab === k ? "btn-primary" : "btn-secondary"}>
            {label}
          </button>
        ))}
      </div>

      {tab === "plan" && <TabPlanCuentas cuentas={cuentas} loading={loadingCuentas} reload={loadCuentas} />}
      {tab === "asientos" && <TabAsientos cuentas={cuentas} />}
      {tab === "mayor" && <TabLibroMayor cuentas={cuentas} />}
      {tab === "inflacion" && <TabInflacion cuentas={cuentas} reloadCuentas={loadCuentas} />}
      {tab === "activofijo" && <TabActivoFijo />}
      {tab === "automatizacion" && <TabAutomatizacion cuentas={cuentas} />}
    </div>
  );
}

// ============================================================================
// Plan de Cuentas
// ============================================================================
function TabPlanCuentas({ cuentas, loading, reload }: { cuentas: any[]; loading: boolean; reload: () => void }) {
  const [form, setForm] = useState({
    codigo: "", nombre: "", tipo: "activo" as (typeof TIPOS_CUENTA)[number]["value"],
    cuenta_padre_id: "", imputable: true, ajustable_por_inflacion: false, es_cuenta_rei: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nombreDe = (id: string | null) => cuentas.find((c) => c.id === id)?.nombre;

  async function crearCuenta(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const tid = await tenantId();
    const { error: err } = await supabase.from("plan_cuentas").insert({
      tenant_id: tid,
      codigo: form.codigo.trim(),
      nombre: form.nombre.trim(),
      tipo: form.tipo,
      cuenta_padre_id: form.cuenta_padre_id || null,
      imputable: form.imputable,
      ajustable_por_inflacion: form.ajustable_por_inflacion,
      es_cuenta_rei: form.es_cuenta_rei,
    });
    if (err) {
      setError(err.message.includes("duplicate") ? "Ya existe una cuenta con ese código." : err.message);
    } else {
      setForm({ codigo: "", nombre: "", tipo: "activo", cuenta_padre_id: "", imputable: true, ajustable_por_inflacion: false, es_cuenta_rei: false });
      reload();
    }
    setSaving(false);
  }

  async function desactivar(id: string) {
    await supabase.from("plan_cuentas").update({ activo: false }).eq("id", id);
    reload();
  }

  return (
    <div>
      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Nueva cuenta</h3>
        <form onSubmit={crearCuenta} className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <input className="input" placeholder="Código (ej. 1.1.01)" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} required />
          <input className="input col-span-2" placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
          <select className="input" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as any })}>
            {TIPOS_CUENTA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select className="input col-span-2" value={form.cuenta_padre_id} onChange={(e) => setForm({ ...form, cuenta_padre_id: e.target.value })}>
            <option value="">Sin cuenta padre (cuenta de primer nivel)</option>
            {cuentas.map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={form.imputable} onChange={(e) => setForm({ ...form, imputable: e.target.checked })} />
            Imputable (permite asientos)
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={form.ajustable_por_inflacion} onChange={(e) => setForm({ ...form, ajustable_por_inflacion: e.target.checked })} />
            Ajustable por inflación
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={form.es_cuenta_rei} onChange={(e) => setForm({ ...form, es_cuenta_rei: e.target.checked })} />
            Es la cuenta REI
          </label>
          <button className="btn-primary col-span-2" disabled={saving}>{saving ? "Guardando…" : "Agregar cuenta"}</button>
        </form>
        {error && <p className="text-danger text-xs mt-2">{error}</p>}
        <p className="text-xs text-gray-400 mt-2">
          Las cuentas "de grupo" (no imputables, ej. "1 — ACTIVO") sirven solo para organizar jerárquicamente; los asientos solo pueden cargarse en cuentas hoja marcadas como imputables. Marcá exactamente una cuenta como "Es la cuenta REI" para poder usar el ajuste por inflación.
        </p>
      </div>

      <div className="card overflow-x-auto">
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead><tr><th>Código</th><th>Nombre</th><th>Tipo</th><th>Cuenta padre</th><th>Imputable</th><th>Inflación</th><th>REI</th><th></th></tr></thead>
            <tbody>
              {cuentas.filter((c) => c.activo).map((c) => (
                <tr key={c.id}>
                  <td>{c.codigo}</td>
                  <td>{c.nombre}</td>
                  <td>{TIPOS_CUENTA.find((t) => t.value === c.tipo)?.label}</td>
                  <td>{nombreDe(c.cuenta_padre_id) || "—"}</td>
                  <td>{c.imputable ? "Sí" : <span className="text-gray-300">No</span>}</td>
                  <td>{c.ajustable_por_inflacion ? "Sí" : "—"}</td>
                  <td>{c.es_cuenta_rei ? <span className="badge bg-amber-100 text-amber-700">REI</span> : "—"}</td>
                  <td><button className="text-danger text-xs" onClick={() => desactivar(c.id)}>Desactivar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Asientos (Libro Diario)
// ============================================================================
function TabAsientos({ cuentas }: { cuentas: any[] }) {
  const [asientos, setAsientos] = useState<any[]>([]);
  const [items, setItems] = useState<Record<string, any[]>>({});
  const [expandido, setExpandido] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ fecha: new Date().toISOString().slice(0, 10), descripcion: "" });
  const [lineas, setLineas] = useState([
    { cuenta_id: "", debe: "", haber: "" },
    { cuenta_id: "", debe: "", haber: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const PAGE_SIZE = 50;
  const [pagina, setPagina] = useState(0);
  const [hayMas, setHayMas] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);

  const imputables = cuentas.filter((c) => c.imputable && c.activo);

  async function load(reset = true) {
    const desde = reset ? 0 : pagina * PAGE_SIZE;
    const hasta = desde + PAGE_SIZE - 1;
    const { data } = await supabase
      .from("asientos_contables")
      .select("*")
      .order("numero", { ascending: false })
      .range(desde, hasta);
    if (reset) {
      setAsientos(data || []);
      setPagina(1);
    } else {
      setAsientos((prev) => [...prev, ...(data || [])]);
      setPagina((p) => p + 1);
    }
    setHayMas((data || []).length === PAGE_SIZE);
    setLoading(false);
  }
  useEffect(() => { load(true); }, []);

  async function abrir(id: string) {
    if (expandido === id) { setExpandido(null); return; }
    setExpandido(id);
    if (!items[id]) {
      const { data } = await supabase.from("asiento_items").select("*, plan_cuentas(codigo, nombre)").eq("asiento_id", id);
      setItems((it) => ({ ...it, [id]: data || [] }));
    }
  }

  function actualizarLinea(i: number, campo: string, valor: string) {
    setLineas((ls) => ls.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)));
  }
  function agregarLinea() {
    setLineas((ls) => [...ls, { cuenta_id: "", debe: "", haber: "" }]);
  }
  function quitarLinea(i: number) {
    setLineas((ls) => ls.filter((_, idx) => idx !== i));
  }

  const totalDebe = lineas.reduce((s, l) => s + (Number(l.debe) || 0), 0);
  const totalHaber = lineas.reduce((s, l) => s + (Number(l.haber) || 0), 0);
  const balanceado = totalDebe === totalHaber && totalDebe > 0;

  async function crearAsiento(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!balanceado) {
      setError("El asiento no está balanceado: el total de Debe debe ser igual al total de Haber.");
      return;
    }
    const validas = lineas.filter((l) => l.cuenta_id && (Number(l.debe) > 0 || Number(l.haber) > 0));
    if (validas.length < 2) {
      setError("Cargá al menos dos líneas con cuenta e importe.");
      return;
    }
    setSaving(true);
    const tid = await tenantId();
    const { error: err } = await supabase.rpc("fn_crear_asiento", {
      p_tenant_id: tid,
      p_fecha: form.fecha,
      p_descripcion: form.descripcion,
      p_items: validas.map((l) => ({ cuenta_id: l.cuenta_id, debe: Number(l.debe) || 0, haber: Number(l.haber) || 0 })),
      p_origen: "manual",
    });
    if (err) {
      setError(err.message.replace(/^.*?: /, ""));
    } else {
      setForm({ fecha: new Date().toISOString().slice(0, 10), descripcion: "" });
      setLineas([{ cuenta_id: "", debe: "", haber: "" }, { cuenta_id: "", debe: "", haber: "" }]);
      load(true);
    }
    setSaving(false);
  }

  return (
    <div>
      <div className="card mb-6 overflow-x-auto">
        <h3 className="text-sm font-semibold text-navy mb-3">Nuevo asiento</h3>
        <form onSubmit={crearAsiento}>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <input className="input" type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
            <input className="input col-span-2" placeholder="Descripción / concepto del asiento" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} required />
          </div>
          <table className="tbl mb-2">
            <thead><tr><th>Cuenta</th><th>Debe</th><th>Haber</th><th></th></tr></thead>
            <tbody>
              {lineas.map((l, i) => (
                <tr key={i}>
                  <td>
                    <select className="input" value={l.cuenta_id} onChange={(e) => actualizarLinea(i, "cuenta_id", e.target.value)}>
                      <option value="">Cuenta…</option>
                      {imputables.map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
                    </select>
                  </td>
                  <td><input className="input w-28" type="number" min="0" step="0.01" value={l.debe} onChange={(e) => actualizarLinea(i, "debe", e.target.value)} /></td>
                  <td><input className="input w-28" type="number" min="0" step="0.01" value={l.haber} onChange={(e) => actualizarLinea(i, "haber", e.target.value)} /></td>
                  <td>{lineas.length > 2 && <button type="button" className="text-danger text-xs" onClick={() => quitarLinea(i)}>Quitar</button>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td>Totales</td>
                <td>{fmt(totalDebe)}</td>
                <td>{fmt(totalHaber)}</td>
                <td>{balanceado ? <span className="text-green-700 text-xs">Balanceado</span> : <span className="text-danger text-xs">No balancea</span>}</td>
              </tr>
            </tfoot>
          </table>
          <div className="flex items-center gap-3">
            <button type="button" className="btn-secondary text-xs" onClick={agregarLinea}>+ Agregar línea</button>
            <button className="btn-primary" disabled={saving || !balanceado}>{saving ? "Guardando…" : "Registrar asiento"}</button>
          </div>
          {error && <p className="text-danger text-xs mt-2">{error}</p>}
        </form>
      </div>

      <div className="card overflow-x-auto">
        <h3 className="text-sm font-semibold text-navy mb-3">Libro Diario</h3>
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead><tr><th>N°</th><th>Fecha</th><th>Descripción</th><th>Origen</th><th></th></tr></thead>
            <tbody>
              {asientos.map((a) => (
                <Fragment key={a.id}>
                  <tr>
                    <td>{a.numero}</td>
                    <td>{fmtFecha(a.fecha)}</td>
                    <td>{a.descripcion}</td>
                    <td>{a.origen === "ajuste_inflacion" ? <span className="badge bg-amber-100 text-amber-700">Ajuste inflación</span> : "Manual"}</td>
                    <td><button className="btn-secondary text-xs" onClick={() => abrir(a.id)}>{expandido === a.id ? "Cerrar" : "Ver líneas"}</button></td>
                  </tr>
                  {expandido === a.id && (
                    <tr>
                      <td colSpan={5} className="bg-gray-50">
                        <div className="overflow-x-auto">
                          <table className="tbl">
                            <thead><tr><th>Cuenta</th><th>Debe</th><th>Haber</th></tr></thead>
                            <tbody>
                              {(items[a.id] || []).map((it) => (
                                <tr key={it.id}>
                                  <td>{it.plan_cuentas?.codigo} — {it.plan_cuentas?.nombre}</td>
                                  <td>{it.debe > 0 ? fmt(it.debe) : "—"}</td>
                                  <td>{it.haber > 0 ? fmt(it.haber) : "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
        {!loading && hayMas && (
          <div className="text-center mt-3">
            <button
              className="btn-secondary text-xs"
              disabled={cargandoMas}
              onClick={async () => { setCargandoMas(true); await load(false); setCargandoMas(false); }}
            >
              {cargandoMas ? "Cargando…" : "Cargar más"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Libro Mayor
// ============================================================================
function TabLibroMayor({ cuentas }: { cuentas: any[] }) {
  const [cuentaId, setCuentaId] = useState("");
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const imputables = cuentas.filter((c) => c.imputable && c.activo);
  const cuenta = cuentas.find((c) => c.id === cuentaId);

  useEffect(() => {
    if (!cuentaId) { setMovimientos([]); return; }
    setLoading(true);
    supabase
      .from("asiento_items")
      .select("*, asientos_contables!inner(numero, fecha, descripcion)")
      .eq("cuenta_id", cuentaId)
      .order("fecha", { foreignTable: "asientos_contables", ascending: true })
      .order("numero", { foreignTable: "asientos_contables", ascending: true })
      .then(({ data }) => {
        setMovimientos(data || []);
        setLoading(false);
      });
  }, [cuentaId]);

  const esDeudora = cuenta && ["activo", "egreso"].includes(cuenta.tipo);
  let saldoAcumulado = 0;

  return (
    <div className="card">
      <h3 className="text-sm font-semibold text-navy mb-3">Libro Mayor por cuenta</h3>
      <select className="input mb-4 max-w-md" value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
        <option value="">Elegí una cuenta…</option>
        {imputables.map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
      </select>

      {loading && <p className="text-gray-400">Cargando…</p>}
      {!loading && cuentaId && (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>N° Asiento</th><th>Fecha</th><th>Descripción</th><th>Debe</th><th>Haber</th><th>Saldo</th></tr></thead>
            <tbody>
              {movimientos.map((m) => {
                const delta = esDeudora ? m.debe - m.haber : m.haber - m.debe;
                saldoAcumulado += delta;
                return (
                  <tr key={m.id}>
                    <td>{m.asientos_contables?.numero}</td>
                    <td>{fmtFecha(m.asientos_contables?.fecha)}</td>
                    <td>{m.asientos_contables?.descripcion}</td>
                    <td>{m.debe > 0 ? fmt(m.debe) : "—"}</td>
                    <td>{m.haber > 0 ? fmt(m.haber) : "—"}</td>
                    <td>{fmt(saldoAcumulado)}</td>
                  </tr>
                );
              })}
              {movimientos.length === 0 && (
                <tr><td colSpan={6} className="text-gray-400">Sin movimientos registrados para esta cuenta.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Ajuste por Inflación
// ============================================================================
function TabInflacion({ cuentas, reloadCuentas }: { cuentas: any[]; reloadCuentas: () => void }) {
  const [indices, setIndices] = useState<any[]>([]);
  const [nuevoIndice, setNuevoIndice] = useState({ periodo: "", coeficiente: "" });
  const [periodoAjuste, setPeriodoAjuste] = useState("");
  const [resultado, setResultado] = useState<{ texto: string; error?: boolean } | null>(null);
  const [generando, setGenerando] = useState(false);

  const cuentaRei = cuentas.find((c) => c.es_cuenta_rei && c.activo);
  const cuentasAjustables = cuentas.filter((c) => c.ajustable_por_inflacion && c.activo);

  async function load() {
    const { data } = await supabase.from("indices_inflacion").select("*").order("periodo", { ascending: false });
    setIndices(data || []);
  }
  useEffect(() => { load(); }, []);

  async function cargarIndice(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevoIndice.periodo || !nuevoIndice.coeficiente) return;
    const tid = await tenantId();
    const periodo = nuevoIndice.periodo + "-01";
    await supabase.from("indices_inflacion").upsert({ tenant_id: tid, periodo, coeficiente: Number(nuevoIndice.coeficiente) });
    setNuevoIndice({ periodo: "", coeficiente: "" });
    load();
  }

  async function generarAjuste() {
    if (!periodoAjuste) return;
    setResultado(null);
    setGenerando(true);
    const tid = await tenantId();
    const { error } = await supabase.rpc("fn_generar_ajuste_inflacion", { p_tenant_id: tid, p_periodo: periodoAjuste + "-01" });
    if (error) {
      setResultado({ texto: error.message.replace(/^.*?: /, ""), error: true });
    } else {
      setResultado({ texto: "Asiento de ajuste por inflación generado correctamente. Revisalo en la pestaña Asientos." });
      reloadCuentas();
    }
    setGenerando(false);
  }

  return (
    <div>
      <div className="card mb-6 border-l-4 border-amber-400">
        <p className="text-sm text-gray-700">
          Este motor recalcula el saldo de las cuentas marcadas como <strong>"Ajustable por inflación"</strong> aplicando
          el coeficiente mensual cargado, y genera un asiento automático con contrapartida en la cuenta marcada como{" "}
          <strong>REI</strong> (Resultado por Exposición a la Inflación). Es una herramienta de apoyo con una convención
          simplificada — <strong>requiere revisión de un contador matriculado</strong> antes de usarse con fines fiscales
          o de presentación de estados contables reales.
        </p>
        {!cuentaRei && <p className="text-danger text-xs mt-2">No hay ninguna cuenta marcada como "Es la cuenta REI" en el Plan de Cuentas. Marcá una antes de generar un ajuste.</p>}
        {cuentaRei && <p className="text-xs text-gray-400 mt-2">Cuenta REI configurada: {cuentaRei.codigo} — {cuentaRei.nombre}. Cuentas ajustables: {cuentasAjustables.length || "ninguna"}.</p>}
      </div>

      <div className="card mb-6 overflow-x-auto">
        <h3 className="text-sm font-semibold text-navy mb-3">Cargar índice / coeficiente mensual</h3>
        <form onSubmit={cargarIndice} className="grid grid-cols-3 gap-3 max-w-lg">
          <input className="input" type="month" value={nuevoIndice.periodo} onChange={(e) => setNuevoIndice({ ...nuevoIndice, periodo: e.target.value })} required />
          <input className="input" type="number" min="0" step="0.0001" placeholder="Coeficiente (ej. 1.045)" value={nuevoIndice.coeficiente} onChange={(e) => setNuevoIndice({ ...nuevoIndice, coeficiente: e.target.value })} required />
          <button className="btn-primary">Guardar índice</button>
        </form>
        <table className="tbl mt-4">
          <thead><tr><th>Período</th><th>Coeficiente</th></tr></thead>
          <tbody>
            {indices.map((i) => (
              <tr key={i.periodo}><td>{new Date(i.periodo + "T00:00:00").toLocaleDateString("es-AR", { month: "long", year: "numeric" })}</td><td>{i.coeficiente}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-navy mb-3">Generar asiento de ajuste</h3>
        <div className="flex items-center gap-3">
          <input className="input max-w-[200px]" type="month" value={periodoAjuste} onChange={(e) => setPeriodoAjuste(e.target.value)} />
          <button className="btn-primary" onClick={generarAjuste} disabled={generando || !periodoAjuste}>
            {generando ? "Generando…" : "Generar ajuste por inflación"}
          </button>
        </div>
        {resultado && <p className={`text-sm mt-3 ${resultado.error ? "text-danger" : "text-green-700"}`}>{resultado.texto}</p>}
      </div>
    </div>
  );
}

// ============================================================================
// Activo Fijo — Bienes de uso y amortizaciones lineales
// ============================================================================
function TabActivoFijo() {
  const [bienes, setBienes] = useState<any[]>([]);
  const [acumulados, setAcumulados] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ nombre: "", categoria: "Rodados", fecha_adquisicion: new Date().toISOString().slice(0, 10), valor_adquisicion: "", valor_residual: "0", vida_util_meses: "" });
  const [saving, setSaving] = useState(false);
  const [periodoGenerar, setPeriodoGenerar] = useState("");
  const [generando, setGenerando] = useState(false);
  const [resultadoGen, setResultadoGen] = useState<{ texto: string; error?: boolean } | null>(null);
  const [detalle, setDetalle] = useState<string | null>(null);
  const [amortizacionesBien, setAmortizacionesBien] = useState<Record<string, any[]>>({});

  async function load() {
    setLoading(true);
    const { data: b } = await supabase.from("bienes_uso").select("*").order("fecha_adquisicion", { ascending: false });
    setBienes(b || []);
    if (b && b.length > 0) {
      const { data: am } = await supabase.from("amortizaciones_bienes_uso").select("bien_id, monto");
      const acc: Record<string, number> = {};
      (am || []).forEach((a: any) => { acc[a.bien_id] = (acc[a.bien_id] || 0) + Number(a.monto); });
      setAcumulados(acc);
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function crearBien(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre || !form.valor_adquisicion || !form.vida_util_meses) return;
    setSaving(true);
    const tid = await tenantId();
    await supabase.from("bienes_uso").insert({
      tenant_id: tid,
      nombre: form.nombre,
      categoria: form.categoria,
      fecha_adquisicion: form.fecha_adquisicion,
      valor_adquisicion: Number(form.valor_adquisicion),
      valor_residual: Number(form.valor_residual) || 0,
      vida_util_meses: Number(form.vida_util_meses),
    });
    setForm({ nombre: "", categoria: "Rodados", fecha_adquisicion: new Date().toISOString().slice(0, 10), valor_adquisicion: "", valor_residual: "0", vida_util_meses: "" });
    setSaving(false);
    load();
  }

  async function darDeBaja(id: string) {
    await supabase.from("bienes_uso").update({ activo: false, fecha_baja: new Date().toISOString().slice(0, 10) }).eq("id", id);
    load();
  }

  async function generarAmortizacion() {
    if (!periodoGenerar) return;
    setGenerando(true);
    setResultadoGen(null);
    const tid = await tenantId();
    const { data, error } = await supabase.rpc("fn_generar_amortizacion_mensual", { p_tenant_id: tid, p_periodo: periodoGenerar + "-01" });
    if (error) {
      setResultadoGen({ texto: error.message.replace(/^.*?: /, ""), error: true });
    } else {
      setResultadoGen({ texto: `${data} bien(es) amortizado(s) para el período seleccionado.` });
      load();
    }
    setGenerando(false);
  }

  async function verDetalle(bienId: string) {
    if (detalle === bienId) { setDetalle(null); return; }
    setDetalle(bienId);
    if (!amortizacionesBien[bienId]) {
      const { data } = await supabase.from("amortizaciones_bienes_uso").select("*").eq("bien_id", bienId).order("periodo");
      setAmortizacionesBien((a) => ({ ...a, [bienId]: data || [] }));
    }
  }

  return (
    <div>
      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Nuevo bien de uso</h3>
        <form onSubmit={crearBien} className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <input className="input col-span-2" placeholder="Nombre / descripción" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
          <select className="input" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
            {CATEGORIAS_BIEN.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input className="input" type="date" value={form.fecha_adquisicion} onChange={(e) => setForm({ ...form, fecha_adquisicion: e.target.value })} required />
          <input className="input" type="number" min="0.01" step="0.01" placeholder="Valor de adquisición" value={form.valor_adquisicion} onChange={(e) => setForm({ ...form, valor_adquisicion: e.target.value })} required />
          <input className="input" type="number" min="0" step="0.01" placeholder="Valor residual" value={form.valor_residual} onChange={(e) => setForm({ ...form, valor_residual: e.target.value })} />
          <input className="input" type="number" min="1" placeholder="Vida útil (meses)" value={form.vida_util_meses} onChange={(e) => setForm({ ...form, vida_util_meses: e.target.value })} required />
          <button className="btn-primary col-span-2" disabled={saving}>{saving ? "Guardando…" : "Registrar bien"}</button>
        </form>
      </div>

      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Generar amortización del mes</h3>
        <p className="text-xs text-gray-400 mb-3">
          Calcula la cuota mensual lineal — (valor de adquisición − valor residual) / vida útil — para cada bien activo,
          respetando el tope del valor depreciable total. Ejecutalo una vez por mes; si un bien ya tiene generada la
          amortización de ese período, no se duplica.
        </p>
        <div className="flex items-center gap-3">
          <input className="input max-w-[200px]" type="month" value={periodoGenerar} onChange={(e) => setPeriodoGenerar(e.target.value)} />
          <button className="btn-primary" onClick={generarAmortizacion} disabled={generando || !periodoGenerar}>
            {generando ? "Generando…" : "Generar amortizaciones del período"}
          </button>
        </div>
        {resultadoGen && <p className={`text-sm mt-3 ${resultadoGen.error ? "text-danger" : "text-green-700"}`}>{resultadoGen.texto}</p>}
      </div>

      <div className="card overflow-x-auto">
        <h3 className="text-sm font-semibold text-navy mb-3">Bienes de uso</h3>
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Bien</th><th>Categoría</th><th>Adquisición</th><th>Valor original</th>
                <th>Amortizado acum.</th><th>Valor neto</th><th>Estado</th><th></th>
              </tr>
            </thead>
            <tbody>
              {bienes.map((b) => {
                const acumulado = acumulados[b.id] || 0;
                const valorNeto = Number(b.valor_adquisicion) - acumulado;
                return (
                  <Fragment key={b.id}>
                    <tr>
                      <td>{b.nombre}</td>
                      <td>{b.categoria}</td>
                      <td>{fmtFecha(b.fecha_adquisicion)}</td>
                      <td>{fmt(b.valor_adquisicion)}</td>
                      <td>{fmt(acumulado)}</td>
                      <td className={valorNeto <= 0 ? "text-gray-400" : ""}>{fmt(valorNeto)}</td>
                      <td>{b.activo ? <span className="badge bg-green-100 text-green-700">Activo</span> : <span className="badge bg-gray-100 text-gray-600">De baja</span>}</td>
                      <td className="whitespace-nowrap">
                        <button className="btn-secondary text-xs mr-2" onClick={() => verDetalle(b.id)}>{detalle === b.id ? "Cerrar" : "Detalle"}</button>
                        {b.activo && <button className="text-danger text-xs" onClick={() => darDeBaja(b.id)}>Dar de baja</button>}
                      </td>
                    </tr>
                    {detalle === b.id && (
                      <tr>
                        <td colSpan={8} className="bg-gray-50">
                          <div className="overflow-x-auto">
                            <table className="tbl">
                              <thead><tr><th>Período</th><th>Cuota</th><th>Acumulado</th></tr></thead>
                              <tbody>
                                {(amortizacionesBien[b.id] || []).map((a) => (
                                  <tr key={a.id}>
                                    <td>{new Date(a.periodo + "T00:00:00").toLocaleDateString("es-AR", { month: "long", year: "numeric" })}</td>
                                    <td>{fmt(a.monto)}</td>
                                    <td>{fmt(a.acumulado)}</td>
                                  </tr>
                                ))}
                                {(amortizacionesBien[b.id] || []).length === 0 && (
                                  <tr><td colSpan={3} className="text-gray-400">Sin amortizaciones generadas todavía.</td></tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {bienes.length === 0 && (
                <tr><td colSpan={8} className="text-gray-400">Sin bienes de uso registrados.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Automatización de Asientos — mapeo de cuentas para generar el asiento solo
// al vender, cobrar, comprar o pagar (igual que Tango).
// ============================================================================
function TabAutomatizacion({ cuentas }: { cuentas: any[] }) {
  const [config, setConfig] = useState<any>({
    cuenta_ventas_id: "", cuenta_iva_debito_id: "", cuenta_deudores_id: "",
    cuenta_compras_id: "", cuenta_iva_credito_id: "", cuenta_proveedores_id: "", cuenta_caja_id: "",
  });
  const [existe, setExiste] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [errores, setErrores] = useState<any[]>([]);
  const [verResueltos, setVerResueltos] = useState(false);
  const [resolviendo, setResolviendo] = useState<string | null>(null);

  const imputables = cuentas.filter((c) => c.imputable && c.activo);

  async function load() {
    setLoading(true);
    const tid = await tenantId();
    let q = supabase.from("config_contable_errores").select("*").order("created_at", { ascending: false }).limit(50);
    if (!verResueltos) q = q.eq("resuelta", false);
    const [{ data: cfg }, { data: errs }] = await Promise.all([
      supabase.from("config_contable").select("*").eq("tenant_id", tid).maybeSingle(),
      q,
    ]);
    if (cfg) {
      setConfig(cfg);
      setExiste(true);
    }
    setErrores(errs || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [verResueltos]);

  async function marcarResuelto(id: string) {
    setResolviendo(id);
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("config_contable_errores").update({
      resuelta: true, resuelta_por: u.user?.id, resuelta_en: new Date().toISOString(),
    }).eq("id", id);
    setResolviendo(null);
    load();
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setGuardado(false);
    const tid = await tenantId();
    const payload = {
      tenant_id: tid,
      cuenta_ventas_id: config.cuenta_ventas_id || null,
      cuenta_iva_debito_id: config.cuenta_iva_debito_id || null,
      cuenta_deudores_id: config.cuenta_deudores_id || null,
      cuenta_compras_id: config.cuenta_compras_id || null,
      cuenta_iva_credito_id: config.cuenta_iva_credito_id || null,
      cuenta_proveedores_id: config.cuenta_proveedores_id || null,
      cuenta_caja_id: config.cuenta_caja_id || null,
    };
    if (existe) {
      await supabase.from("config_contable").update(payload).eq("tenant_id", tid);
    } else {
      await supabase.from("config_contable").insert(payload);
      setExiste(true);
    }
    setSaving(false);
    setGuardado(true);
  }

  const campos: { key: string; label: string }[] = [
    { key: "cuenta_ventas_id", label: "Ventas (haber neto al facturar)" },
    { key: "cuenta_iva_debito_id", label: "IVA Débito Fiscal (haber IVA al facturar)" },
    { key: "cuenta_deudores_id", label: "Deudores por Ventas (debe al facturar, haber al cobrar)" },
    { key: "cuenta_compras_id", label: "Compras (debe neto al registrar una compra)" },
    { key: "cuenta_iva_credito_id", label: "IVA Crédito Fiscal (debe IVA al registrar una compra)" },
    { key: "cuenta_proveedores_id", label: "Proveedores (haber al comprar, debe al pagar)" },
    { key: "cuenta_caja_id", label: "Caja / Banco por defecto (debe al cobrar, haber al pagar)" },
  ];

  const completo = campos.every((c) => config[c.key]);

  return (
    <div>
      <div className="card mb-6 border-l-4 border-amber-400">
        <p className="text-sm text-gray-700">
          Mapeá acá qué cuenta del Plan de Cuentas corresponde a cada concepto. Con esto configurado, cada vez que se
          factura una venta (Lista 1), se registra un cobro (Lista 1), se carga una compra a proveedor o se registra un
          pago a proveedor, el asiento contable se genera solo — sin tocar nada en la pestaña Asientos. Es una versión
          simplificada de un único plan de cuentas y una única cuenta de Caja/Banco por defecto (no distingue por banco
          ni por vendedor); para reglas más finas, seguí cargando esos casos a mano.
        </p>
        {!completo && (
          <p className="text-xs text-amber-700 mt-2">
            Mientras falte algún campo, no se generará ningún asiento automático (tampoco se bloquea ninguna venta,
            cobro, compra o pago — simplemente no queda contabilizado solo, hay que hacerlo a mano como hasta ahora).
          </p>
        )}
      </div>

      {loading ? <p className="text-gray-400">Cargando…</p> : (
        <form onSubmit={guardar} className="card mb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          {campos.map((c) => (
            <div key={c.key}>
              <label className="text-xs text-gray-500">{c.label}</label>
              <select className="input" value={config[c.key] || ""} onChange={(e) => setConfig({ ...config, [c.key]: e.target.value })}>
                <option value="">Sin asignar…</option>
                {imputables.map((cu) => <option key={cu.id} value={cu.id}>{cu.codigo} — {cu.nombre}</option>)}
              </select>
            </div>
          ))}
          <button className="btn-primary md:col-span-2" disabled={saving}>{saving ? "Guardando…" : "Guardar configuración"}</button>
          {guardado && <p className="text-green-700 text-xs md:col-span-2">Configuración guardada.</p>}
        </form>
      )}

      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-navy">Errores de generación automática</h3>
          <label className="text-xs text-gray-500 flex items-center gap-1">
            <input type="checkbox" checked={verResueltos} onChange={(e) => setVerResueltos(e.target.checked)} />
            Ver también resueltos
          </label>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Si un asiento automático no se pudo generar (por ejemplo, una cuenta mapeada que después se desactivó), queda
          registrado acá. La venta, cobro, compra o pago correspondiente siempre se guarda igual — lo único que falla es
          la contabilización automática. Un error pendiente significa que ese movimiento quedó sin su asiento: revisalo
          y, si corresponde, cargalo a mano en la pestaña Asientos.
        </p>
        <table className="tbl">
          <thead><tr><th>Fecha</th><th>Origen</th><th>Mensaje</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {errores.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.created_at).toLocaleString("es-AR")}</td>
                <td className="capitalize">{e.origen}</td>
                <td>{e.mensaje}</td>
                <td>
                  {e.resuelta
                    ? <span className="badge bg-green-100 text-green-700">Resuelto</span>
                    : <span className="badge bg-red-100 text-red-700">Pendiente</span>}
                </td>
                <td>
                  {!e.resuelta && (
                    <button className="text-xs text-navy underline" disabled={resolviendo === e.id} onClick={() => marcarResuelto(e.id)}>
                      {resolviendo === e.id ? "Marcando…" : "Marcar resuelto"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {errores.length === 0 && <tr><td colSpan={5} className="text-gray-400">{verResueltos ? "Sin errores registrados." : "Sin errores pendientes."}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
