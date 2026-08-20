"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { invocarFuncion } from "@/lib/invocarFuncion";
import { buscarColumna, parsearFecha, parsearNumero } from "@/lib/importUtils";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import {
  ESTADO_VALOR_LABEL,
  MEDIO_PAGO_LABEL,
  COSTO_BANCARIO_TIPO_LABEL,
  ESTADO_CHEQUE_PROPIO_LABEL,
  type Banco,
  type MovimientoBancario,
  type Proveedor,
  type ProveedorMovimiento,
  type ValorCartera,
  type MedioPagoConfig,
  type CostoBancario,
  type Billetera,
  type MovimientoBilletera,
  type ChequePropio,
} from "@/lib/types";

type Tab = "bancos" | "proveedores" | "cartera" | "billeteras" | "chequespropios" | "medios" | "escaneo";

const fmtMoneda = (n: number, m = "ARS") => {
  try { return new Intl.NumberFormat("es-AR", { style: "currency", currency: m }).format(n); }
  catch { return `${m} ${n.toFixed(2)}`; }
};
const fmtFecha = (s: string | null) => (s ? new Date(s).toLocaleDateString("es-AR") : "—");

async function tenantId() {
  const { data: u } = await supabase.auth.getUser();
  const { data: p } = await supabase.from("profiles").select("tenant_id").eq("id", u.user?.id).single();
  return p?.tenant_id as string;
}

export default function FinanzasAdmin() {
  const [tab, setTab] = useState<Tab>("bancos");

  return (
    <div>
      <PageHeader
        title="Finanzas"
        subtitle="Bancos, Proveedores, Cartera de Valores y Medios de Pago — registro y control, no procesa transacciones de dinero de forma automática."
      />
      <div className="flex gap-2 mb-5 flex-wrap">
        {([
          ["bancos", "Bancos"],
          ["proveedores", "Proveedores"],
          ["cartera", "Cartera de Valores (terceros)"],
          ["billeteras", "Billeteras Virtuales"],
          ["chequespropios", "Cheques Librados (propios)"],
          ["medios", "Medios de Pago"],
          ["escaneo", "Escanear Comprobantes"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={tab === k ? "btn-primary" : "btn-secondary"}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "bancos" && <TabBancos />}
      {tab === "proveedores" && <TabProveedores />}
      {tab === "cartera" && <TabCartera />}
      {tab === "billeteras" && <TabBilleteras />}
      {tab === "chequespropios" && <TabChequesPropios />}
      {tab === "medios" && <TabMedios />}
      {tab === "escaneo" && <TabEscaneo />}
    </div>
  );
}

// ============================================================================
// Bancos
// ============================================================================
function TabBancos() {
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [movs, setMovs] = useState<(MovimientoBancario & { bancos: { nombre: string } | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuevoBanco, setNuevoBanco] = useState({ nombre: "", cbu: "", alias: "", moneda: "ARS" });
  const [nuevoMov, setNuevoMov] = useState({ banco_id: "", tipo: "ingreso" as "ingreso" | "egreso", concepto: "", monto: "", comprobante_ref: "" });
  const [bancoImport, setBancoImport] = useState("");
  const [importando, setImportando] = useState(false);
  const [resultadoImport, setResultadoImport] = useState<{ totales: number; conciliados: number; creados: number; sinProcesar: number } | null>(null);

  async function load() {
    const [{ data: b }, { data: m }] = await Promise.all([
      supabase.from("bancos").select("*").order("nombre"),
      supabase.from("movimientos_bancarios").select("*, bancos(nombre)").order("fecha", { ascending: false }).order("created_at", { ascending: false }).limit(50),
    ]);
    setBancos((b as Banco[]) || []);
    setMovs((m as any) || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function crearBanco(e: React.FormEvent) {
    e.preventDefault();
    const tid = await tenantId();
    await supabase.from("bancos").insert({ tenant_id: tid, ...nuevoBanco });
    setNuevoBanco({ nombre: "", cbu: "", alias: "", moneda: "ARS" });
    load();
  }

  async function crearMov(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevoMov.banco_id || !nuevoMov.monto) return;
    const tid = await tenantId();
    await supabase.from("movimientos_bancarios").insert({
      tenant_id: tid,
      banco_id: nuevoMov.banco_id,
      tipo: nuevoMov.tipo,
      concepto: nuevoMov.concepto,
      monto: Number(nuevoMov.monto),
      comprobante_ref: nuevoMov.comprobante_ref || null,
    });
    setNuevoMov({ banco_id: "", tipo: "ingreso", concepto: "", monto: "", comprobante_ref: "" });
    load();
  }

  async function marcarConciliado(id: string, valor: boolean) {
    await supabase.from("movimientos_bancarios").update({ conciliado: valor }).eq("id", id);
    setMovs((ms) => ms.map((m) => (m.id === id ? { ...m, conciliado: valor } : m)));
  }

  async function importarExtracto(file: File) {
    if (!bancoImport) {
      alert("Elegí primero a qué cuenta bancaria pertenece el extracto.");
      return;
    }
    setImportando(true);
    setResultadoImport(null);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
      if (rows.length < 2) throw new Error("El archivo no tiene filas de datos.");

      const headers = rows[0].map((h) => String(h ?? ""));
      const idxFecha = buscarColumna(headers, ["fecha", "date"]);
      const idxConcepto = buscarColumna(headers, ["concepto", "descripcion", "descripción", "detalle"]);
      const idxImporte = buscarColumna(headers, ["importe", "monto", "amount"]);
      const idxDebito = buscarColumna(headers, ["debito", "débito", "egreso"]);
      const idxCredito = buscarColumna(headers, ["credito", "crédito", "ingreso"]);

      if (idxFecha === -1 || (idxImporte === -1 && idxDebito === -1 && idxCredito === -1)) {
        throw new Error("No se reconocen las columnas. El archivo necesita al menos Fecha e Importe (o Débito/Crédito).");
      }

      let conciliados = 0, creados = 0, sinProcesar = 0;
      const dataRows = rows.slice(1).filter((r) => r.some((c) => c !== undefined && c !== ""));

      for (const row of dataRows) {
        try {
          const fechaRaw = row[idxFecha];
          const fecha = parsearFecha(fechaRaw);
          let monto = 0;
          if (idxImporte !== -1) {
            monto = parsearNumero(row[idxImporte]);
          } else {
            const cred = idxCredito !== -1 ? parsearNumero(row[idxCredito]) : 0;
            const deb = idxDebito !== -1 ? parsearNumero(row[idxDebito]) : 0;
            monto = cred - deb;
          }
          if (!fecha || !monto) { sinProcesar++; continue; }
          const concepto = idxConcepto !== -1 ? String(row[idxConcepto] ?? "") : "Importado de extracto bancario";

          const { data, error } = await supabase.rpc("fn_conciliar_movimiento", {
            p_banco_id: bancoImport, p_fecha: fecha, p_monto: monto, p_concepto: concepto,
          });
          if (error) { sinProcesar++; continue; }
          const accion = (data as any)?.[0]?.accion;
          if (accion === "conciliado") conciliados++;
          else if (accion === "creado") creados++;
          else sinProcesar++;
        } catch {
          sinProcesar++;
        }
      }

      const tid = await tenantId();
      await supabase.from("extracto_importaciones").insert({
        tenant_id: tid, banco_id: bancoImport, nombre_archivo: file.name,
        filas_totales: dataRows.length, filas_matcheadas: conciliados, filas_creadas: creados, filas_sin_procesar: sinProcesar,
      });

      setResultadoImport({ totales: dataRows.length, conciliados, creados, sinProcesar });
      await load();
    } catch (e: any) {
      alert(e?.message || "No se pudo procesar el archivo.");
    }
    setImportando(false);
  }

  const totalPorMoneda = bancos.reduce((acc, b) => {
    acc[b.moneda] = (acc[b.moneda] || 0) + Number(b.saldo_actual);
    return acc;
  }, {} as Record<string, number>);

  return (
    <div>
      <TabAcreditaciones bancos={bancos} onAcreditado={load} />

      {/* Fase A (agosto 2026): antes solo se mostraban las primeras 2 monedas
          (recorte de interfaz, no una limitación real) — ahora se muestran
          todas, sin límite de divisas simultáneas. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Cuentas bancarias" value={String(bancos.length)} />
        {Object.entries(totalPorMoneda).map(([moneda, total]) => (
          <StatCard key={moneda} label={`Saldo consolidado (${moneda})`} value={fmtMoneda(total, moneda)} />
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="card">
          <h3 className="text-sm font-semibold text-navy mb-3">Nueva cuenta bancaria</h3>
          <form onSubmit={crearBanco} className="space-y-2">
            <input className="input" placeholder="Nombre del banco" value={nuevoBanco.nombre} onChange={(e) => setNuevoBanco({ ...nuevoBanco, nombre: e.target.value })} required />
            <input className="input" placeholder="CBU" value={nuevoBanco.cbu} onChange={(e) => setNuevoBanco({ ...nuevoBanco, cbu: e.target.value })} />
            <div className="flex gap-2">
              <input className="input" placeholder="Alias" value={nuevoBanco.alias} onChange={(e) => setNuevoBanco({ ...nuevoBanco, alias: e.target.value })} />
              <input className="input w-24" placeholder="Moneda" value={nuevoBanco.moneda} onChange={(e) => setNuevoBanco({ ...nuevoBanco, moneda: e.target.value })} />
            </div>
            <button className="btn-primary">Crear cuenta</button>
          </form>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-navy mb-3">Registrar movimiento</h3>
          <form onSubmit={crearMov} className="space-y-2">
            <select className="input" value={nuevoMov.banco_id} onChange={(e) => setNuevoMov({ ...nuevoMov, banco_id: e.target.value })} required>
              <option value="">Cuenta bancaria…</option>
              {bancos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
            </select>
            <div className="flex gap-2">
              <select className="input" value={nuevoMov.tipo} onChange={(e) => setNuevoMov({ ...nuevoMov, tipo: e.target.value as any })}>
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
              </select>
              <input className="input" type="number" step="0.01" min="0.01" placeholder="Importe" value={nuevoMov.monto} onChange={(e) => setNuevoMov({ ...nuevoMov, monto: e.target.value })} required />
            </div>
            <input className="input" placeholder="Concepto" value={nuevoMov.concepto} onChange={(e) => setNuevoMov({ ...nuevoMov, concepto: e.target.value })} required />
            <input className="input" placeholder="Referencia de comprobante (opcional)" value={nuevoMov.comprobante_ref} onChange={(e) => setNuevoMov({ ...nuevoMov, comprobante_ref: e.target.value })} />
            <button className="btn-primary">Registrar</button>
          </form>
        </div>
      </div>

      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Conciliación bancaria — importar extracto</h3>
        <p className="text-xs text-gray-500 mb-3">
          Subí el extracto de tu banco en Excel o CSV (columnas Fecha e Importe, o Fecha + Débito/Crédito). El sistema
          intenta matchear cada línea contra un movimiento ya cargado (misma cuenta, importe exacto, fecha ±1 día) y lo
          marca conciliado; si no encuentra coincidencia, carga el movimiento directamente porque viene del banco.
        </p>
        <div className="flex gap-2 items-center flex-wrap">
          <select className="input" value={bancoImport} onChange={(e) => setBancoImport(e.target.value)}>
            <option value="">Cuenta bancaria del extracto…</option>
            {bancos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
          </select>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            disabled={importando}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importarExtracto(f); e.target.value = ""; }}
            className="text-sm"
          />
          {importando && <span className="text-xs text-gray-400">Procesando…</span>}
        </div>
        {resultadoImport && (
          <p className="text-sm mt-3 bg-green-50 border border-green-200 rounded-md px-3 py-2 text-green-700">
            {resultadoImport.totales} filas leídas — {resultadoImport.conciliados} conciliadas contra movimientos existentes,{" "}
            {resultadoImport.creados} cargadas como nuevas, {resultadoImport.sinProcesar} no se pudieron interpretar.
          </p>
        )}
      </div>

      <div className="card overflow-x-auto">
        <h3 className="text-sm font-semibold text-navy mb-3">Últimos movimientos</h3>
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead><tr><th>Fecha</th><th>Cuenta</th><th>Tipo</th><th>Concepto</th><th>Importe</th><th>Conciliado</th></tr></thead>
            <tbody>
              {movs.map((m) => (
                <tr key={m.id}>
                  <td>{fmtFecha(m.fecha)}</td>
                  <td>{m.bancos?.nombre || "—"}</td>
                  <td><span className={`badge ${m.tipo === "ingreso" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{m.tipo}</span></td>
                  <td>{m.concepto}</td>
                  <td>{fmtMoneda(m.monto)}</td>
                  <td><input type="checkbox" checked={m.conciliado} onChange={(e) => marcarConciliado(m.id, e.target.checked)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <TabCostosBancarios bancos={bancos} onAplicado={load} />
    </div>
  );
}

// ============================================================================
// Costos bancarios pormenorizados (mantenimiento, chequera, impuestos, retenciones)
// ============================================================================
function TabCostosBancarios({ bancos, onAplicado }: { bancos: Banco[]; onAplicado: () => void }) {
  const [costos, setCostos] = useState<(CostoBancario & { bancos: { nombre: string } | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuevo, setNuevo] = useState({ banco_id: "", tipo: "mantenimiento_cuenta" as CostoBancario["tipo"], descripcion: "", monto: "", porcentaje: "", periodicidad: "mensual" as CostoBancario["periodicidad"] });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aplicando, setAplicando] = useState(false);
  const [montosAplicacion, setMontosAplicacion] = useState<Record<string, string>>({});
  const [pendientesAplicar, setPendientesAplicar] = useState<(CostoBancario & { bancos: { nombre: string } | null })[]>([]);
  const [resultadoAplicacion, setResultadoAplicacion] = useState<string | null>(null);

  const periodoActual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };

  async function load() {
    setLoading(true);
    const { data: c } = await supabase.from("costos_bancarios").select("*, bancos(nombre)").order("tipo");
    setCostos((c as any) || []);
    const activos = ((c as any) || []).filter((x: any) => x.activo);
    if (activos.length > 0) {
      const { data: aplic } = await supabase
        .from("aplicaciones_costos_bancarios")
        .select("costo_id")
        .eq("periodo", periodoActual())
        .in("costo_id", activos.map((x: any) => x.id));
      const yaAplicados = new Set((aplic || []).map((a: any) => a.costo_id));
      setPendientesAplicar(activos.filter((x: any) => !yaAplicados.has(x.id)));
    } else {
      setPendientesAplicar([]);
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function agregarCosto(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevo.banco_id || !nuevo.descripcion || (!nuevo.monto && !nuevo.porcentaje)) {
      setError("Elegí el banco, describí el costo, e indicá un monto fijo o un porcentaje.");
      return;
    }
    setGuardando(true);
    setError(null);
    const tid = await tenantId();
    const { error: err } = await supabase.from("costos_bancarios").insert({
      tenant_id: tid,
      banco_id: nuevo.banco_id,
      tipo: nuevo.tipo,
      descripcion: nuevo.descripcion,
      monto: nuevo.monto ? Number(nuevo.monto) : null,
      porcentaje: nuevo.porcentaje ? Number(nuevo.porcentaje) : null,
      periodicidad: nuevo.periodicidad,
    });
    if (err) setError(err.message);
    else setNuevo({ banco_id: "", tipo: "mantenimiento_cuenta", descripcion: "", monto: "", porcentaje: "", periodicidad: "mensual" });
    setGuardando(false);
    load();
  }

  async function desactivarCosto(id: string) {
    await supabase.from("costos_bancarios").update({ activo: false }).eq("id", id);
    load();
  }

  async function aplicarCostosDelMes() {
    setAplicando(true);
    setResultadoAplicacion(null);
    const periodo = periodoActual();
    let aplicados = 0;
    for (const c of pendientesAplicar) {
      const monto = c.monto != null ? Number(c.monto) : Number(montosAplicacion[c.id] || 0);
      if (!monto || monto <= 0) continue;
      const tid = await tenantId();
      const { data: mov } = await supabase.from("movimientos_bancarios").insert({
        tenant_id: tid, banco_id: c.banco_id, tipo: "egreso",
        concepto: `${COSTO_BANCARIO_TIPO_LABEL[c.tipo]} — ${c.descripcion} (${periodo.slice(0, 7)})`,
        monto,
      }).select().single();
      if (mov) {
        await supabase.from("aplicaciones_costos_bancarios").insert({
          tenant_id: tid, costo_id: c.id, periodo, monto_aplicado: monto, movimiento_bancario_id: mov.id,
        });
        aplicados++;
      }
    }
    setResultadoAplicacion(`Se aplicaron ${aplicados} de ${pendientesAplicar.length} costo(s) del período ${periodo.slice(0, 7)}.`);
    setMontosAplicacion({});
    setAplicando(false);
    await load();
    onAplicado();
  }

  return (
    <div className="mt-6">
      <div className="card mb-6 overflow-x-auto">
        <h3 className="text-sm font-semibold text-navy mb-1">Costos bancarios pormenorizados</h3>
        <p className="text-xs text-gray-400 mb-4">
          Mantenimiento de cuenta, chequeras, impuestos y retenciones que cobra cada banco. Los de monto fijo se
          pueden aplicar automáticamente con el botón de abajo; los que son un porcentaje (ej. impuesto a los
          débitos/créditos) requieren indicar el monto calculado del período antes de aplicarlos, porque depende del
          movimiento real de la cuenta ese mes.
        </p>
        <form onSubmit={agregarCosto} className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
          <select className="input" value={nuevo.banco_id} onChange={(e) => setNuevo({ ...nuevo, banco_id: e.target.value })}>
            <option value="">Banco…</option>
            {bancos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
          </select>
          <select className="input" value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value as any })}>
            {Object.entries(COSTO_BANCARIO_TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input className="input col-span-2" placeholder="Descripción" value={nuevo.descripcion} onChange={(e) => setNuevo({ ...nuevo, descripcion: e.target.value })} />
          <input className="input" type="number" step="0.01" placeholder="Monto fijo $" value={nuevo.monto} onChange={(e) => setNuevo({ ...nuevo, monto: e.target.value, porcentaje: "" })} />
          <input className="input" type="number" step="0.01" placeholder="o %" value={nuevo.porcentaje} onChange={(e) => setNuevo({ ...nuevo, porcentaje: e.target.value, monto: "" })} />
          <select className="input" value={nuevo.periodicidad} onChange={(e) => setNuevo({ ...nuevo, periodicidad: e.target.value as any })}>
            <option value="mensual">Mensual</option>
            <option value="unica">Única vez</option>
          </select>
          <button className="btn-primary" disabled={guardando}>{guardando ? "Guardando…" : "Agregar costo"}</button>
        </form>
        {error && <p className="text-danger text-xs mb-3">{error}</p>}

        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead><tr><th>Banco</th><th>Tipo</th><th>Descripción</th><th>Monto/%</th><th>Periodicidad</th><th></th></tr></thead>
            <tbody>
              {costos.filter((c) => c.activo).map((c) => (
                <tr key={c.id}>
                  <td>{c.bancos?.nombre || "—"}</td>
                  <td>{COSTO_BANCARIO_TIPO_LABEL[c.tipo]}</td>
                  <td>{c.descripcion}</td>
                  <td>{c.monto != null ? fmtMoneda(c.monto) : `${c.porcentaje}%`}</td>
                  <td>{c.periodicidad === "mensual" ? "Mensual" : "Única vez"}</td>
                  <td><button className="text-xs text-danger underline" onClick={() => desactivarCosto(c.id)}>Desactivar</button></td>
                </tr>
              ))}
              {costos.filter((c) => c.activo).length === 0 && <tr><td colSpan={6} className="text-gray-400">Sin costos bancarios configurados.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {pendientesAplicar.length > 0 && (
        <div className="card mb-6 bg-amber-50 border-amber-200">
          <h3 className="text-sm font-semibold text-navy mb-1">Aplicar costos del mes en curso</h3>
          <p className="text-xs text-gray-500 mb-3">
            {pendientesAplicar.length} costo(s) activo(s) todavía no se cargaron como egreso este mes. Para los de
            porcentaje, indicá el monto calculado antes de confirmar.
          </p>
          <div className="space-y-2 mb-3">
            {pendientesAplicar.map((c) => (
              <div key={c.id} className="flex items-center gap-3 text-sm">
                <span className="flex-1">{c.bancos?.nombre} — {COSTO_BANCARIO_TIPO_LABEL[c.tipo]} ({c.descripcion})</span>
                {c.monto != null ? (
                  <span className="font-semibold text-navy">{fmtMoneda(c.monto)}</span>
                ) : (
                  <input
                    className="input w-32" type="number" step="0.01" placeholder={`${c.porcentaje}% → $`}
                    value={montosAplicacion[c.id] || ""}
                    onChange={(e) => setMontosAplicacion({ ...montosAplicacion, [c.id]: e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>
          <button className="btn-primary text-xs" onClick={aplicarCostosDelMes} disabled={aplicando}>
            {aplicando ? "Aplicando…" : "Aplicar costos del mes"}
          </button>
          {resultadoAplicacion && <p className="text-xs text-green-700 mt-2">{resultadoAplicacion}</p>}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Acreditaciones bancarias pendientes (transferencia, QR, Mercado Pago, MODO, tarjeta)
// ============================================================================
function TabAcreditaciones({ bancos, onAcreditado }: { bancos: Banco[]; onAcreditado: () => void }) {
  const [pendientes, setPendientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("cobros")
      .select("id, tenant_id, monto, retencion_monto, monto_neto, medio_pago, fecha, fecha_acreditacion_estimada, acreditado, clientes(nombre)")
      .eq("acreditado", false)
      .neq("medio_pago", "efectivo")
      .neq("medio_pago", "cheque")
      .order("fecha_acreditacion_estimada", { ascending: true })
      .limit(200);
    const lista = (data as any[]) || [];
    setPendientes(lista);
    setLoading(false);

    // Acreditación automática: todo cobro cuyo plazo ya se cumplió se acredita
    // al banco configurado para ese medio de pago apenas se carga esta pantalla
    // (no hay proceso en segundo plano — se resuelve la primera vez que alguien
    // entra acá después de vencido el plazo).
    const hoy = new Date().toISOString().slice(0, 10);
    const listos = lista.filter((c: any) => c.fecha_acreditacion_estimada && c.fecha_acreditacion_estimada <= hoy);
    if (listos.length === 0) return;

    const { data: medios } = await supabase.from("medios_pago_config").select("tipo, banco_destino_id");
    const bancoPorMedio: Record<string, string | null> = {};
    (medios || []).forEach((m: any) => (bancoPorMedio[m.tipo] = m.banco_destino_id));

    let acreditados = 0, sinBanco = 0;
    for (const c of listos) {
      const bancoId = bancoPorMedio[c.medio_pago];
      if (!bancoId) { sinBanco++; continue; }
      const { data: mov } = await supabase.from("movimientos_bancarios").insert({
        tenant_id: c.tenant_id,
        banco_id: bancoId, tipo: "ingreso",
        concepto: `Acreditación cobro ${MEDIO_PAGO_LABEL[c.medio_pago as MedioPagoConfig["tipo"]]}${c.clientes?.nombre ? " — " + c.clientes.nombre : ""}`,
        monto: c.monto_neto ?? c.monto,
      }).select().single();
      if (mov) {
        await supabase.from("cobros").update({ acreditado: true, movimiento_bancario_id: mov.id }).eq("id", c.id);
        acreditados++;
      }
    }
    if (acreditados > 0 || sinBanco > 0) {
      setMensaje(
        `${acreditados} cobro(s) acreditado(s) automáticamente.` +
        (sinBanco > 0 ? ` ${sinBanco} no se pudieron acreditar porque el medio de pago no tiene banco destino configurado (Finanzas → Medios de Pago).` : "")
      );
      const { data: data2 } = await supabase
        .from("cobros")
        .select("id, monto, retencion_monto, monto_neto, medio_pago, fecha, fecha_acreditacion_estimada, acreditado, clientes(nombre)")
        .eq("acreditado", false)
        .neq("medio_pago", "efectivo")
        .neq("medio_pago", "cheque")
        .order("fecha_acreditacion_estimada", { ascending: true })
        .limit(200);
      setPendientes(data2 || []);
      onAcreditado();
    }
  }
  useEffect(() => { load(); }, []);

  if (loading) return null;
  if (pendientes.length === 0 && !mensaje) return null;

  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <div className="card mb-6 overflow-x-auto">
      <h3 className="text-sm font-semibold text-navy mb-1">Acreditaciones bancarias</h3>
      <p className="text-xs text-gray-400 mb-3">
        Cobros por transferencia, QR, tarjeta, Mercado Pago o MODO, con su retención descontada y su fecha estimada
        de acreditación según lo configurado en Medios de Pago.
      </p>
      {mensaje && <p className="text-xs text-green-700 mb-3 bg-green-50 border border-green-200 rounded-md px-3 py-2">{mensaje}</p>}
      {pendientes.length > 0 && (
        <table className="tbl">
          <thead><tr><th>Cliente</th><th>Medio</th><th>Bruto</th><th>Retención</th><th>Neto</th><th>Acredita</th><th>Estado</th></tr></thead>
          <tbody>
            {pendientes.slice(0, 30).map((c: any) => {
              const lista = c.fecha_acreditacion_estimada && c.fecha_acreditacion_estimada <= hoy;
              return (
                <tr key={c.id}>
                  <td>{c.clientes?.nombre || "—"}</td>
                  <td>{MEDIO_PAGO_LABEL[c.medio_pago as MedioPagoConfig["tipo"]] || c.medio_pago}</td>
                  <td>{fmtMoneda(c.monto)}</td>
                  <td>{fmtMoneda(c.retencion_monto || 0)}</td>
                  <td className="font-semibold">{fmtMoneda(c.monto_neto ?? c.monto)}</td>
                  <td>{fmtFecha(c.fecha_acreditacion_estimada)}</td>
                  <td>
                    {lista
                      ? <span className="badge bg-amber-100 text-amber-700">Requiere banco destino</span>
                      : <span className="badge bg-gray-100 text-gray-600">En tránsito</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ============================================================================
// Proveedores
// ============================================================================
const TIPOS_RETENCION = [
  { value: "iva", label: "IVA" },
  { value: "ganancias", label: "Ganancias" },
  { value: "iibb", label: "IIBB" },
  { value: "suss", label: "SUSS" },
  { value: "otra", label: "Otra" },
] as const;

function TabProveedores() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [movs, setMovs] = useState<ProveedorMovimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuevo, setNuevo] = useState({ nombre: "", cuit: "", contacto: "", telefono: "", email: "", direccion: "", condicion_pago: "" });
  const [nuevoMov, setNuevoMov] = useState({ tipo: "compra" as "compra" | "ajuste", monto: "", comprobante_ref: "", descripcion: "" });

  const [catalogo, setCatalogo] = useState<any[]>([]);
  const [productosDisponibles, setProductosDisponibles] = useState<any[]>([]);
  const [nuevoItemCatalogo, setNuevoItemCatalogo] = useState({ producto_id: "", costo_unitario: "", codigo_proveedor: "" });
  const [guardandoItemCatalogo, setGuardandoItemCatalogo] = useState(false);

  const [bancos, setBancos] = useState<any[]>([]);
  const [pendientes, setPendientes] = useState<any[]>([]);
  const [seleccion, setSeleccion] = useState<Record<string, string>>({});
  const [retenciones, setRetenciones] = useState<{ tipo: string; alicuota: string; monto: string }[]>([]);
  const [ordenForm, setOrdenForm] = useState({ fecha: new Date().toISOString().slice(0, 10), medio_pago: "transferencia", banco_id: "", notas: "" });
  const [ordenesPago, setOrdenesPago] = useState<any[]>([]);
  const [creandoOrden, setCreandoOrden] = useState(false);
  const [errorOrden, setErrorOrden] = useState<string | null>(null);

  async function load() {
    const [{ data: p }, { data: b }, { data: prod }] = await Promise.all([
      supabase.from("proveedores").select("*").order("nombre"),
      supabase.from("bancos").select("id, nombre"),
      supabase.from("productos").select("id, nombre, sku").eq("activo", true).order("nombre"),
    ]);
    setProveedores((p as Proveedor[]) || []);
    setBancos(b || []);
    setProductosDisponibles(prod || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function loadCatalogo(proveedorId: string) {
    const { data } = await supabase
      .from("proveedor_productos")
      .select("*, productos(nombre, sku)")
      .eq("proveedor_id", proveedorId)
      .eq("activo", true)
      .order("actualizado_en", { ascending: false });
    setCatalogo(data || []);
  }

  async function agregarItemCatalogo(e: React.FormEvent) {
    e.preventDefault();
    if (!seleccionado || !nuevoItemCatalogo.producto_id) return;
    setGuardandoItemCatalogo(true);
    const tid = await tenantId();
    await supabase.from("proveedor_productos").upsert({
      tenant_id: tid,
      proveedor_id: seleccionado,
      producto_id: nuevoItemCatalogo.producto_id,
      costo_unitario: nuevoItemCatalogo.costo_unitario ? Number(nuevoItemCatalogo.costo_unitario) : null,
      codigo_proveedor: nuevoItemCatalogo.codigo_proveedor || null,
      actualizado_en: new Date().toISOString(),
    }, { onConflict: "tenant_id,proveedor_id,producto_id" });
    setNuevoItemCatalogo({ producto_id: "", costo_unitario: "", codigo_proveedor: "" });
    setGuardandoItemCatalogo(false);
    loadCatalogo(seleccionado);
  }

  async function quitarItemCatalogo(id: string) {
    await supabase.from("proveedor_productos").update({ activo: false }).eq("id", id);
    if (seleccionado) loadCatalogo(seleccionado);
  }

  async function loadMovs(proveedorId: string) {
    const [{ data: m }, { data: compras }, { data: items }, { data: ops }] = await Promise.all([
      supabase.from("proveedor_movimientos").select("*").eq("proveedor_id", proveedorId).order("fecha", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("proveedor_movimientos").select("*").eq("proveedor_id", proveedorId).eq("tipo", "compra").order("fecha"),
      supabase.from("orden_pago_items").select("proveedor_movimiento_id, monto_aplicado"),
      supabase.from("ordenes_pago").select("*").eq("proveedor_id", proveedorId).order("fecha", { ascending: false }),
    ]);
    setMovs((m as ProveedorMovimiento[]) || []);
    setOrdenesPago(ops || []);
    const aplicadoPorMov: Record<string, number> = {};
    (items || []).forEach((it: any) => { aplicadoPorMov[it.proveedor_movimiento_id] = (aplicadoPorMov[it.proveedor_movimiento_id] || 0) + Number(it.monto_aplicado); });
    const pend = (compras || [])
      .map((c: any) => ({ ...c, pendiente: Number(c.monto) - (aplicadoPorMov[c.id] || 0) }))
      .filter((c: any) => c.pendiente > 0.01);
    setPendientes(pend);
    setSeleccion({});
    setRetenciones([]);
    setErrorOrden(null);
  }

  function toggleSeleccion(mov: any) {
    setSeleccion((s) => {
      const c = { ...s };
      if (c[mov.id] !== undefined) delete c[mov.id];
      else c[mov.id] = String(mov.pendiente);
      return c;
    });
  }

  function agregarRetencion() {
    setRetenciones((r) => [...r, { tipo: "iva", alicuota: "", monto: "" }]);
  }
  function actualizarRetencion(i: number, campo: string, valor: string) {
    setRetenciones((r) => r.map((x, idx) => (idx === i ? { ...x, [campo]: valor } : x)));
  }
  function quitarRetencion(i: number) {
    setRetenciones((r) => r.filter((_, idx) => idx !== i));
  }

  const totalBruto = Object.values(seleccion).reduce((s, v) => s + (Number(v) || 0), 0);
  const totalRetenciones = retenciones.reduce((s, r) => s + (Number(r.monto) || 0), 0);
  const totalNeto = totalBruto - totalRetenciones;

  async function crearOrdenPago() {
    setErrorOrden(null);
    if (!seleccionado || Object.keys(seleccion).length === 0) {
      setErrorOrden("Elegí al menos un comprobante de compra a cancelar.");
      return;
    }
    if (totalRetenciones > totalBruto) {
      setErrorOrden("Las retenciones no pueden superar el monto bruto seleccionado.");
      return;
    }
    setCreandoOrden(true);
    const tid = await tenantId();
    const { error } = await supabase.rpc("fn_crear_orden_pago", {
      p_tenant_id: tid,
      p_proveedor_id: seleccionado,
      p_fecha: ordenForm.fecha,
      p_medio_pago: ordenForm.medio_pago,
      p_banco_id: ordenForm.banco_id || null,
      p_items: Object.entries(seleccion).map(([id, monto]) => ({ proveedor_movimiento_id: id, monto_aplicado: Number(monto) })),
      p_retenciones: retenciones.filter((r) => Number(r.monto) > 0).map((r) => ({ tipo: r.tipo, alicuota: r.alicuota ? Number(r.alicuota) : null, monto: Number(r.monto) })),
      p_notas: ordenForm.notas || null,
    });
    if (error) {
      setErrorOrden(error.message.replace(/^.*?: /, ""));
    } else {
      setOrdenForm({ fecha: new Date().toISOString().slice(0, 10), medio_pago: "transferencia", banco_id: "", notas: "" });
      loadMovs(seleccionado);
    }
    setCreandoOrden(false);
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    const tid = await tenantId();
    await supabase.from("proveedores").insert({ tenant_id: tid, ...nuevo });
    setNuevo({ nombre: "", cuit: "", contacto: "", telefono: "", email: "", direccion: "", condicion_pago: "" });
    load();
  }

  async function crearMov(e: React.FormEvent) {
    e.preventDefault();
    if (!seleccionado || !nuevoMov.monto) return;
    const tid = await tenantId();
    await supabase.from("proveedor_movimientos").insert({
      tenant_id: tid,
      proveedor_id: seleccionado,
      tipo: nuevoMov.tipo,
      monto: Number(nuevoMov.monto),
      comprobante_ref: nuevoMov.comprobante_ref || null,
      descripcion: nuevoMov.descripcion || null,
    });
    setNuevoMov({ tipo: "compra", monto: "", comprobante_ref: "", descripcion: "" });
    loadMovs(seleccionado);
  }

  const saldoActual = movs[0]?.saldo_resultante ?? 0;

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="card">
        <h3 className="text-sm font-semibold text-navy mb-3">Nuevo proveedor</h3>
        <form onSubmit={crear} className="space-y-2">
          <input className="input" placeholder="Nombre / razón social" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} required />
          <input className="input" placeholder="CUIT" value={nuevo.cuit} onChange={(e) => setNuevo({ ...nuevo, cuit: e.target.value })} />
          <input className="input" placeholder="Contacto" value={nuevo.contacto} onChange={(e) => setNuevo({ ...nuevo, contacto: e.target.value })} />
          <input className="input" placeholder="Teléfono" value={nuevo.telefono} onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })} />
          <input className="input" type="email" placeholder="Email" value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} />
          <input className="input" placeholder="Dirección" value={nuevo.direccion} onChange={(e) => setNuevo({ ...nuevo, direccion: e.target.value })} />
          <input className="input" placeholder="Condición de pago (ej: 30 días)" value={nuevo.condicion_pago} onChange={(e) => setNuevo({ ...nuevo, condicion_pago: e.target.value })} />
          <button className="btn-primary">Crear proveedor</button>
        </form>

        <h3 className="text-sm font-semibold text-navy mt-6 mb-2">Proveedores</h3>
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <ul className="space-y-1 text-sm">
            {proveedores.map((p) => (
              <li key={p.id}>
                <button
                  className={`text-left w-full px-2 py-1.5 rounded ${seleccionado === p.id ? "bg-navy text-white" : "hover:bg-gray-100"}`}
                  onClick={() => { setSeleccionado(p.id); loadMovs(p.id); loadCatalogo(p.id); }}
                >
                  {p.nombre}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card md:col-span-2 overflow-x-auto">
        {!seleccionado ? (
          <p className="text-gray-400">Seleccioná un proveedor para ver su cuenta corriente.</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-navy">Cuenta corriente — {proveedores.find((p) => p.id === seleccionado)?.nombre}</h3>
              <span className={`badge ${saldoActual > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                Saldo: {fmtMoneda(saldoActual)}
              </span>
            </div>

            {(() => {
              const prov = proveedores.find((p) => p.id === seleccionado);
              if (!prov) return null;
              return (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 mb-4 bg-gray-50 rounded p-3">
                  <div><strong className="text-navy">CUIT:</strong> {prov.cuit || "—"}</div>
                  <div><strong className="text-navy">Contacto:</strong> {prov.contacto || "—"}</div>
                  <div><strong className="text-navy">Teléfono:</strong> {prov.telefono || "—"}</div>
                  <div><strong className="text-navy">Email:</strong> {prov.email || "—"}</div>
                  <div className="col-span-2"><strong className="text-navy">Dirección:</strong> {(prov as any).direccion || "—"}</div>
                  <div className="col-span-2"><strong className="text-navy">Condición de pago:</strong> {prov.condicion_pago || "—"}</div>
                </div>
              );
            })()}

            <div className="border border-gray-100 rounded p-3 mb-6 overflow-x-auto">
              <h4 className="text-sm font-semibold text-navy mb-2">Catálogo de productos de este proveedor</h4>
              <form onSubmit={agregarItemCatalogo} className="grid grid-cols-4 gap-2 mb-3">
                <select className="input col-span-2" value={nuevoItemCatalogo.producto_id} onChange={(e) => setNuevoItemCatalogo({ ...nuevoItemCatalogo, producto_id: e.target.value })} required>
                  <option value="">Producto…</option>
                  {productosDisponibles.map((pr) => <option key={pr.id} value={pr.id}>{pr.nombre}{pr.sku ? ` (${pr.sku})` : ""}</option>)}
                </select>
                <input className="input" type="number" step="0.01" placeholder="Costo" value={nuevoItemCatalogo.costo_unitario} onChange={(e) => setNuevoItemCatalogo({ ...nuevoItemCatalogo, costo_unitario: e.target.value })} />
                <input className="input" placeholder="Código del proveedor" value={nuevoItemCatalogo.codigo_proveedor} onChange={(e) => setNuevoItemCatalogo({ ...nuevoItemCatalogo, codigo_proveedor: e.target.value })} />
                <button className="btn-primary col-span-4 text-sm" disabled={guardandoItemCatalogo}>
                  {guardandoItemCatalogo ? "Guardando…" : "Agregar / actualizar producto"}
                </button>
              </form>
              {catalogo.length === 0 ? (
                <p className="text-xs text-gray-400">Sin productos cargados para este proveedor todavía. Se completa automáticamente cada vez que se le genera una orden de compra, o se puede cargar a mano acá.</p>
              ) : (
                <table className="tbl">
                  <thead><tr><th>Producto</th><th>Código proveedor</th><th>Costo vigente</th><th>Actualizado</th><th></th></tr></thead>
                  <tbody>
                    {catalogo.map((c) => (
                      <tr key={c.id}>
                        <td>{c.productos?.nombre || "—"}</td>
                        <td>{c.codigo_proveedor || "—"}</td>
                        <td>{c.costo_unitario != null ? fmtMoneda(c.costo_unitario) : "—"}</td>
                        <td>{fmtFecha(c.actualizado_en)}</td>
                        <td><button type="button" className="text-danger text-xs" onClick={() => quitarItemCatalogo(c.id)}>Quitar</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <form onSubmit={crearMov} className="grid grid-cols-2 gap-2 mb-6">
              <select className="input" value={nuevoMov.tipo} onChange={(e) => setNuevoMov({ ...nuevoMov, tipo: e.target.value as any })}>
                <option value="compra">Compra (aumenta deuda)</option>
                <option value="ajuste">Ajuste</option>
              </select>
              <input className="input" type="number" step="0.01" placeholder="Importe" value={nuevoMov.monto} onChange={(e) => setNuevoMov({ ...nuevoMov, monto: e.target.value })} required />
              <input className="input col-span-2" placeholder="Referencia de comprobante" value={nuevoMov.comprobante_ref} onChange={(e) => setNuevoMov({ ...nuevoMov, comprobante_ref: e.target.value })} />
              <input className="input col-span-2" placeholder="Descripción" value={nuevoMov.descripcion} onChange={(e) => setNuevoMov({ ...nuevoMov, descripcion: e.target.value })} />
              <button className="btn-primary col-span-2">Registrar movimiento</button>
            </form>
            <p className="text-xs text-gray-400 mb-2">
              Los pagos ya no se cargan sueltos acá — se generan como "Orden de pago" abajo, eligiendo qué compras se
              cancelan y aplicando retenciones si corresponde.
            </p>

            <div className="border border-gray-100 rounded p-3 mb-6 overflow-x-auto">
              <h4 className="text-sm font-semibold text-navy mb-2">Nueva orden de pago</h4>
              {pendientes.length === 0 ? (
                <p className="text-xs text-gray-400">No hay compras pendientes de pago para este proveedor.</p>
              ) : (
                <>
                  <table className="tbl mb-3">
                    <thead><tr><th></th><th>Fecha</th><th>Comprobante</th><th>Pendiente</th><th>Monto a aplicar</th></tr></thead>
                    <tbody>
                      {pendientes.map((p) => (
                        <tr key={p.id}>
                          <td><input type="checkbox" checked={seleccion[p.id] !== undefined} onChange={() => toggleSeleccion(p)} /></td>
                          <td>{fmtFecha(p.fecha)}</td>
                          <td>{p.comprobante_ref || "—"}</td>
                          <td>{fmtMoneda(p.pendiente)}</td>
                          <td>
                            {seleccion[p.id] !== undefined && (
                              <input
                                className="input w-28"
                                type="number" min="0.01" max={p.pendiente} step="0.01"
                                value={seleccion[p.id]}
                                onChange={(e) => setSeleccion({ ...seleccion, [p.id]: e.target.value })}
                              />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <input className="input" type="date" value={ordenForm.fecha} onChange={(e) => setOrdenForm({ ...ordenForm, fecha: e.target.value })} />
                    <select className="input" value={ordenForm.medio_pago} onChange={(e) => setOrdenForm({ ...ordenForm, medio_pago: e.target.value })}>
                      <option value="transferencia">Transferencia</option>
                      <option value="efectivo">Efectivo</option>
                      <option value="cheque">Cheque</option>
                      <option value="otro">Otro</option>
                    </select>
                    {ordenForm.medio_pago === "transferencia" && (
                      <select className="input" value={ordenForm.banco_id} onChange={(e) => setOrdenForm({ ...ordenForm, banco_id: e.target.value })}>
                        <option value="">Banco…</option>
                        {bancos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                      </select>
                    )}
                  </div>

                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-navy">Retenciones (opcional)</span>
                      <button type="button" className="btn-secondary text-xs" onClick={agregarRetencion}>+ Agregar retención</button>
                    </div>
                    {retenciones.map((r, i) => (
                      <div key={i} className="grid grid-cols-4 gap-2 mb-1">
                        <select className="input" value={r.tipo} onChange={(e) => actualizarRetencion(i, "tipo", e.target.value)}>
                          {TIPOS_RETENCION.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <input className="input" type="number" step="0.01" placeholder="Alícuota %" value={r.alicuota} onChange={(e) => actualizarRetencion(i, "alicuota", e.target.value)} />
                        <input className="input" type="number" step="0.01" placeholder="Importe" value={r.monto} onChange={(e) => actualizarRetencion(i, "monto", e.target.value)} />
                        <button type="button" className="text-danger text-xs" onClick={() => quitarRetencion(i)}>Quitar</button>
                      </div>
                    ))}
                  </div>

                  <input className="input mb-3" placeholder="Notas" value={ordenForm.notas} onChange={(e) => setOrdenForm({ ...ordenForm, notas: e.target.value })} />

                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      Bruto: <strong>{fmtMoneda(totalBruto)}</strong> — Retenciones: <strong>{fmtMoneda(totalRetenciones)}</strong> — Neto a pagar: <strong>{fmtMoneda(totalNeto)}</strong>
                    </div>
                    <button className="btn-primary" disabled={creandoOrden || totalBruto === 0} onClick={crearOrdenPago}>
                      {creandoOrden ? "Generando…" : "Generar orden de pago"}
                    </button>
                  </div>
                  {errorOrden && <p className="text-danger text-xs mt-2">{errorOrden}</p>}
                </>
              )}
            </div>

            {ordenesPago.length > 0 && (
              <div className="mb-6 overflow-x-auto">
                <h4 className="text-sm font-semibold text-navy mb-2">Órdenes de pago emitidas</h4>
                <table className="tbl">
                  <thead><tr><th>Fecha</th><th>Medio</th><th>Bruto</th><th>Retenciones</th><th>Neto pagado</th></tr></thead>
                  <tbody>
                    {ordenesPago.map((o) => (
                      <tr key={o.id}>
                        <td>{fmtFecha(o.fecha)}</td>
                        <td className="capitalize">{o.medio_pago}</td>
                        <td>{fmtMoneda(o.monto_bruto)}</td>
                        <td>{fmtMoneda(o.total_retenciones)}</td>
                        <td>{fmtMoneda(o.monto_neto_pagado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h4 className="text-sm font-semibold text-navy mb-2">Movimientos</h4>
            <table className="tbl">
              <thead><tr><th>Fecha</th><th>Tipo</th><th>Importe</th><th>Saldo</th><th>Descripción</th></tr></thead>
              <tbody>
                {movs.map((m) => (
                  <tr key={m.id}>
                    <td>{fmtFecha(m.fecha)}</td>
                    <td>{m.tipo}</td>
                    <td>{fmtMoneda(m.monto)}</td>
                    <td>{fmtMoneda(m.saldo_resultante || 0)}</td>
                    <td>{m.descripcion || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Cartera de valores (cheques / eCheqs)
// ============================================================================
function TabCartera() {
  const [valores, setValores] = useState<ValorCartera[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuevo, setNuevo] = useState({
    tipo: "cheque_fisico" as "cheque_fisico" | "echeq",
    numero: "", banco_emisor: "", librador: "", monto: "", fecha_emision: "", fecha_vencimiento: "", notas: "",
  });

  async function load() {
    const { data } = await supabase.from("valores_cartera").select("*").order("fecha_vencimiento");
    setValores((data as ValorCartera[]) || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevo.numero || !nuevo.monto || !nuevo.fecha_vencimiento) return;
    const tid = await tenantId();
    await supabase.from("valores_cartera").insert({
      tenant_id: tid,
      tipo: nuevo.tipo,
      numero: nuevo.numero,
      banco_emisor: nuevo.banco_emisor || null,
      librador: nuevo.librador || null,
      monto: Number(nuevo.monto),
      fecha_emision: nuevo.fecha_emision || null,
      fecha_vencimiento: nuevo.fecha_vencimiento,
      notas: nuevo.notas || null,
    });
    setNuevo({ tipo: "cheque_fisico", numero: "", banco_emisor: "", librador: "", monto: "", fecha_emision: "", fecha_vencimiento: "", notas: "" });
    load();
  }

  async function cambiarEstado(id: string, estado: ValorCartera["estado"]) {
    await supabase.from("valores_cartera").update({ estado }).eq("id", id);
    setValores((vs) => vs.map((v) => (v.id === id ? { ...v, estado } : v)));
  }

  const ESTADO_BADGE: Record<ValorCartera["estado"], string> = {
    en_cartera: "bg-blue-100 text-blue-700",
    depositado: "bg-amber-100 text-amber-700",
    endosado: "bg-purple-100 text-purple-700",
    cobrado: "bg-green-100 text-green-700",
    rechazado: "bg-red-100 text-red-700",
  };

  const totalEnCartera = valores.filter((v) => v.estado === "en_cartera").reduce((a, v) => a + Number(v.monto), 0);

  return (
    <div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Valores en cartera" value={String(valores.filter((v) => v.estado === "en_cartera").length)} />
        <StatCard label="Monto en cartera" value={fmtMoneda(totalEnCartera)} />
        <StatCard label="Total registrado" value={String(valores.length)} />
      </div>

      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Nuevo valor (cheque / eCheq)</h3>
        <form onSubmit={crear} className="grid grid-cols-3 gap-2">
          <select className="input" value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value as any })}>
            <option value="cheque_fisico">Cheque físico</option>
            <option value="echeq">eCheq</option>
          </select>
          <input className="input" placeholder="Número" value={nuevo.numero} onChange={(e) => setNuevo({ ...nuevo, numero: e.target.value })} required />
          <input className="input" placeholder="Banco emisor" value={nuevo.banco_emisor} onChange={(e) => setNuevo({ ...nuevo, banco_emisor: e.target.value })} />
          <input className="input" placeholder="Librador" value={nuevo.librador} onChange={(e) => setNuevo({ ...nuevo, librador: e.target.value })} />
          <input className="input" type="number" step="0.01" placeholder="Importe" value={nuevo.monto} onChange={(e) => setNuevo({ ...nuevo, monto: e.target.value })} required />
          <input className="input" type="date" placeholder="Emisión" value={nuevo.fecha_emision} onChange={(e) => setNuevo({ ...nuevo, fecha_emision: e.target.value })} />
          <input className="input" type="date" placeholder="Vencimiento" value={nuevo.fecha_vencimiento} onChange={(e) => setNuevo({ ...nuevo, fecha_vencimiento: e.target.value })} required />
          <input className="input col-span-2" placeholder="Notas" value={nuevo.notas} onChange={(e) => setNuevo({ ...nuevo, notas: e.target.value })} />
          <button className="btn-primary">Ingresar a cartera</button>
        </form>
      </div>

      <div className="card overflow-x-auto">
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead><tr><th>Tipo</th><th>Número</th><th>Banco</th><th>Librador</th><th>Importe</th><th>Vencimiento</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {valores.map((v) => (
                <tr key={v.id}>
                  <td>{v.tipo === "cheque_fisico" ? "Cheque físico" : "eCheq"}</td>
                  <td>{v.numero}</td>
                  <td>{v.banco_emisor || "—"}</td>
                  <td>{v.librador || "—"}</td>
                  <td>{fmtMoneda(v.monto)}</td>
                  <td>{fmtFecha(v.fecha_vencimiento)}</td>
                  <td><span className={`badge ${ESTADO_BADGE[v.estado]}`}>{ESTADO_VALOR_LABEL[v.estado]}</span></td>
                  <td>
                    <select className="input text-xs" value={v.estado} onChange={(e) => cambiarEstado(v.id, e.target.value as ValorCartera["estado"])}>
                      {Object.entries(ESTADO_VALOR_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                  </td>
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
// Billeteras Virtuales (Fase B, agosto 2026) — KPI 5 del Panel Principal.
// Catálogo abierto: se da de alta cualquier entidad (MercadoPago, MODO,
// etc.) sin límite de cantidad. Mismo patrón que Bancos.
// ============================================================================
function TabBilleteras() {
  const [billeteras, setBilleteras] = useState<Billetera[]>([]);
  const [movs, setMovs] = useState<(MovimientoBilletera & { billeteras_virtuales: { entidad: string } | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [nueva, setNueva] = useState({ entidad: "", alias_cuenta: "", moneda: "ARS" });
  const [nuevoMov, setNuevoMov] = useState({ billetera_id: "", tipo: "ingreso" as "ingreso" | "egreso", concepto: "", monto: "", comprobante_ref: "" });

  async function load() {
    const [{ data: b }, { data: m }] = await Promise.all([
      supabase.from("billeteras_virtuales").select("*").eq("activa", true).order("entidad"),
      supabase.from("movimientos_billetera").select("*, billeteras_virtuales(entidad)").order("fecha", { ascending: false }).limit(50),
    ]);
    setBilleteras((b as Billetera[]) || []);
    setMovs((m as any) || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function crearBilletera(e: React.FormEvent) {
    e.preventDefault();
    const tid = await tenantId();
    await supabase.from("billeteras_virtuales").insert({ tenant_id: tid, ...nueva });
    setNueva({ entidad: "", alias_cuenta: "", moneda: "ARS" });
    load();
  }

  async function crearMov(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevoMov.billetera_id || !nuevoMov.monto) return;
    const tid = await tenantId();
    await supabase.from("movimientos_billetera").insert({
      tenant_id: tid,
      billetera_id: nuevoMov.billetera_id,
      tipo: nuevoMov.tipo,
      concepto: nuevoMov.concepto,
      monto: Number(nuevoMov.monto),
      comprobante_ref: nuevoMov.comprobante_ref || null,
    });
    setNuevoMov({ billetera_id: "", tipo: "ingreso", concepto: "", monto: "", comprobante_ref: "" });
    load();
  }

  const totalPorMoneda = billeteras.reduce((acc, b) => {
    acc[b.moneda] = (acc[b.moneda] || 0) + Number(b.saldo_actual);
    return acc;
  }, {} as Record<string, number>);

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Billeteras" value={String(billeteras.length)} />
        {Object.entries(totalPorMoneda).map(([moneda, total]) => (
          <StatCard key={moneda} label={`Saldo consolidado (${moneda})`} value={fmtMoneda(total, moneda)} />
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="card">
          <h3 className="text-sm font-semibold text-navy mb-3">Nueva billetera virtual</h3>
          <form onSubmit={crearBilletera} className="space-y-2">
            <input className="input" placeholder="Entidad (ej: Mercado Pago, MODO)" value={nueva.entidad} onChange={(e) => setNueva({ ...nueva, entidad: e.target.value })} required />
            <div className="flex gap-2">
              <input className="input" placeholder="Alias / CVU / cuenta" value={nueva.alias_cuenta} onChange={(e) => setNueva({ ...nueva, alias_cuenta: e.target.value })} />
              <input className="input w-24" placeholder="Moneda" value={nueva.moneda} onChange={(e) => setNueva({ ...nueva, moneda: e.target.value })} />
            </div>
            <button className="btn-primary">Dar de alta</button>
          </form>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-navy mb-3">Registrar movimiento</h3>
          <form onSubmit={crearMov} className="space-y-2">
            <select className="input" value={nuevoMov.billetera_id} onChange={(e) => setNuevoMov({ ...nuevoMov, billetera_id: e.target.value })} required>
              <option value="">Billetera…</option>
              {billeteras.map((b) => <option key={b.id} value={b.id}>{b.entidad}{b.alias_cuenta ? ` — ${b.alias_cuenta}` : ""}</option>)}
            </select>
            <div className="flex gap-2">
              <select className="input" value={nuevoMov.tipo} onChange={(e) => setNuevoMov({ ...nuevoMov, tipo: e.target.value as any })}>
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
              </select>
              <input className="input" type="number" step="0.01" min="0.01" placeholder="Importe" value={nuevoMov.monto} onChange={(e) => setNuevoMov({ ...nuevoMov, monto: e.target.value })} required />
            </div>
            <input className="input" placeholder="Concepto" value={nuevoMov.concepto} onChange={(e) => setNuevoMov({ ...nuevoMov, concepto: e.target.value })} required />
            <input className="input" placeholder="Referencia (opcional)" value={nuevoMov.comprobante_ref} onChange={(e) => setNuevoMov({ ...nuevoMov, comprobante_ref: e.target.value })} />
            <button className="btn-primary">Registrar</button>
          </form>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <h3 className="text-sm font-semibold text-navy mb-3">Últimos movimientos</h3>
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead><tr><th>Fecha</th><th>Billetera</th><th>Tipo</th><th>Concepto</th><th>Importe</th></tr></thead>
            <tbody>
              {movs.map((m) => (
                <tr key={m.id}>
                  <td>{fmtFecha(m.fecha)}</td>
                  <td>{m.billeteras_virtuales?.entidad || "—"}</td>
                  <td><span className={`badge ${m.tipo === "ingreso" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{m.tipo}</span></td>
                  <td>{m.concepto}</td>
                  <td>{fmtMoneda(m.monto)}</td>
                </tr>
              ))}
              {movs.length === 0 && <tr><td colSpan={5} className="text-gray-400">Sin movimientos todavía.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Cheques Librados — propios (Fase C, agosto 2026) — KPI 9 del Panel
// Principal. Distinto de "Cartera de Valores" (cheques de terceros
// recibidos, un activo): esto son compromisos de pago emitidos, un pasivo.
// ============================================================================
function TabChequesPropios() {
  const [cheques, setCheques] = useState<(ChequePropio & { bancos: { nombre: string } | null })[]>([]);
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [loading, setLoading] = useState(true);
  const [nuevo, setNuevo] = useState({ banco_id: "", numero: "", beneficiario: "", monto: "", fecha_emision: new Date().toISOString().slice(0, 10), fecha_pago: "", notas: "" });

  async function load() {
    const [{ data: c }, { data: b }] = await Promise.all([
      supabase.from("cheques_propios").select("*, bancos(nombre)").order("fecha_pago"),
      supabase.from("bancos").select("*").order("nombre"),
    ]);
    setCheques((c as any) || []);
    setBancos((b as Banco[]) || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevo.numero || !nuevo.beneficiario || !nuevo.monto || !nuevo.fecha_pago) return;
    const tid = await tenantId();
    await supabase.from("cheques_propios").insert({
      tenant_id: tid,
      banco_id: nuevo.banco_id || null,
      numero: nuevo.numero,
      beneficiario: nuevo.beneficiario,
      monto: Number(nuevo.monto),
      fecha_emision: nuevo.fecha_emision,
      fecha_pago: nuevo.fecha_pago,
      notas: nuevo.notas || null,
    });
    setNuevo({ banco_id: "", numero: "", beneficiario: "", monto: "", fecha_emision: new Date().toISOString().slice(0, 10), fecha_pago: "", notas: "" });
    load();
  }

  async function cambiarEstado(id: string, estado: ChequePropio["estado"]) {
    await supabase.from("cheques_propios").update({ estado }).eq("id", id);
    setCheques((cs) => cs.map((c) => (c.id === id ? { ...c, estado } : c)));
  }

  const pendientes = cheques.filter((c) => c.estado === "pendiente");
  const totalPendiente = pendientes.reduce((a, c) => a + Number(c.monto), 0);

  return (
    <div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Cheques pendientes" value={String(pendientes.length)} />
        <StatCard label="Monto pendiente de pago" value={fmtMoneda(totalPendiente)} tech />
        <StatCard label="Total registrado" value={String(cheques.length)} />
      </div>

      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Nuevo cheque librado</h3>
        <form onSubmit={crear} className="grid grid-cols-3 gap-2">
          <select className="input" value={nuevo.banco_id} onChange={(e) => setNuevo({ ...nuevo, banco_id: e.target.value })}>
            <option value="">Banco (opcional)…</option>
            {bancos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
          </select>
          <input className="input" placeholder="Número" value={nuevo.numero} onChange={(e) => setNuevo({ ...nuevo, numero: e.target.value })} required />
          <input className="input" placeholder="Beneficiario" value={nuevo.beneficiario} onChange={(e) => setNuevo({ ...nuevo, beneficiario: e.target.value })} required />
          <input className="input" type="number" step="0.01" placeholder="Importe" value={nuevo.monto} onChange={(e) => setNuevo({ ...nuevo, monto: e.target.value })} required />
          <input className="input" type="date" placeholder="Emisión" value={nuevo.fecha_emision} onChange={(e) => setNuevo({ ...nuevo, fecha_emision: e.target.value })} />
          <input className="input" type="date" placeholder="Fecha de pago" value={nuevo.fecha_pago} onChange={(e) => setNuevo({ ...nuevo, fecha_pago: e.target.value })} required />
          <input className="input col-span-3" placeholder="Notas" value={nuevo.notas} onChange={(e) => setNuevo({ ...nuevo, notas: e.target.value })} />
          <button className="btn-primary col-span-3">Registrar cheque</button>
        </form>
      </div>

      <div className="card overflow-x-auto">
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead><tr><th>Número</th><th>Banco</th><th>Beneficiario</th><th>Importe</th><th>Fecha de pago</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {cheques.map((c) => (
                <tr key={c.id}>
                  <td>{c.numero}</td>
                  <td>{c.bancos?.nombre || "—"}</td>
                  <td>{c.beneficiario}</td>
                  <td>{fmtMoneda(c.monto)}</td>
                  <td>{fmtFecha(c.fecha_pago)}</td>
                  <td><span className={`badge ${ESTADO_CHEQUE_PROPIO_LABEL[c.estado] === "Pagado" ? "bg-green-100 text-green-700" : c.estado === "pendiente" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-600"}`}>{ESTADO_CHEQUE_PROPIO_LABEL[c.estado]}</span></td>
                  <td>
                    <select className="input text-xs" value={c.estado} onChange={(e) => cambiarEstado(c.id, e.target.value as ChequePropio["estado"])}>
                      {Object.entries(ESTADO_CHEQUE_PROPIO_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
              {cheques.length === 0 && <tr><td colSpan={7} className="text-gray-400">Sin cheques librados registrados.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Medios de pago
// ============================================================================
function TabMedios() {
  const [medios, setMedios] = useState<MedioPagoConfig[]>([]);
  const [bancos, setBancos] = useState<Banco[]>([]);
  const [loading, setLoading] = useState(true);
  const [guardandoTipo, setGuardandoTipo] = useState<string | null>(null);
  const [tarjetaPendiente, setTarjetaPendiente] = useState(0);
  const [tarjetaLiquidado, setTarjetaLiquidado] = useState(0);

  async function load() {
    const [{ data }, { data: b }] = await Promise.all([
      supabase.from("medios_pago_config").select("*").order("tipo"),
      supabase.from("bancos").select("*").order("nombre"),
    ]);
    setMedios((data as MedioPagoConfig[]) || []);
    setBancos((b as Banco[]) || []);
    setLoading(false);

    // KPI 6 (Fase B): Dinero en Tarjetas de Crédito — saldo consolidado
    // pendiente vs. ya acreditado. Nota: el sistema hoy modela "tarjeta"
    // como un único medio de pago, sin distinguir liquidadora (Visa/Prisma/
    // etc.) — ver limitación señalada en el documento de especificación.
    const { data: cobrosTarjeta } = await supabase.from("cobros").select("monto, monto_neto, acreditado").eq("medio_pago", "tarjeta");
    let pend = 0, liq = 0;
    (cobrosTarjeta || []).forEach((c: any) => {
      const neto = c.monto_neto ?? c.monto;
      if (c.acreditado) liq += Number(neto); else pend += Number(neto);
    });
    setTarjetaPendiente(pend);
    setTarjetaLiquidado(liq);
  }
  useEffect(() => { load(); }, []);

  async function toggle(tipo: MedioPagoConfig["tipo"], activo: boolean) {
    const existente = medios.find((m) => m.tipo === tipo);
    const tid = await tenantId();
    if (existente) {
      await supabase.from("medios_pago_config").update({ activo }).eq("id", existente.id);
    } else {
      await supabase.from("medios_pago_config").insert({ tenant_id: tid, tipo, activo });
    }
    load();
  }

  async function guardarConfig(tipo: MedioPagoConfig["tipo"], campo: string, valor: any) {
    const existente = medios.find((m) => m.tipo === tipo);
    setGuardandoTipo(tipo);
    if (existente) {
      await supabase.from("medios_pago_config").update({ [campo]: valor }).eq("id", existente.id);
    } else {
      const tid = await tenantId();
      await supabase.from("medios_pago_config").insert({ tenant_id: tid, tipo, activo: false, [campo]: valor });
    }
    await load();
    setGuardandoTipo(null);
  }

  const todos = Object.keys(MEDIO_PAGO_LABEL) as MedioPagoConfig["tipo"][];

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="text-sm font-semibold text-navy mb-1">Dinero en Tarjetas de Crédito — saldo consolidado</h3>
        <p className="text-xs text-gray-400 mb-4">
          Suma de cobros con medio "Tarjeta", separados por si ya se acreditaron o siguen pendientes de acreditación
          (según los días configurados abajo). Nota: hoy el sistema modela "Tarjeta" como un único medio de pago —
          no distingue todavía entre distintas liquidadoras (Visa, Prisma, etc.).
        </p>
        <div className="grid grid-cols-2 gap-4">
          <StatCard label="Pendiente de acreditación" value={fmtMoneda(tarjetaPendiente)} />
          <StatCard label="Ya acreditado" value={fmtMoneda(tarjetaLiquidado)} tech />
        </div>
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-navy mb-1">Medios de pago habilitados</h3>
        <p className="text-xs text-gray-400 mb-4">
          Registro de referencia para tu operación — no procesa pagos ni transferencias reales. Los cobros
          efectivos se siguen registrando manualmente, como hasta ahora, desde la pantalla de Cobro.
        </p>
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {todos.map((tipo) => {
              const cfg = medios.find((m) => m.tipo === tipo);
              const activo = cfg?.activo ?? false;
              return (
                <label key={tipo} className="flex items-center gap-2 border rounded-md px-3 py-2 text-sm">
                  <input type="checkbox" checked={activo} onChange={(e) => toggle(tipo, e.target.checked)} />
                  {MEDIO_PAGO_LABEL[tipo]}
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="card overflow-x-auto">
        <h3 className="text-sm font-semibold text-navy mb-1">Retención y acreditación por medio de pago</h3>
        <p className="text-xs text-gray-400 mb-4">
          Comisión/retención que descuenta cada medio (ej. Mercado Pago, MODO, QR interoperable) y los días hábiles
          que tarda en acreditarse. El sistema calcula automáticamente el monto neto de cada cobro y lo acredita en
          la cuenta bancaria elegida apenas se cumple el plazo.
        </p>
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead><tr><th>Medio</th><th>Retención %</th><th>Días de acreditación</th><th>Banco destino</th></tr></thead>
            <tbody>
              {todos.filter((t) => t !== "efectivo").map((tipo) => {
                const cfg = medios.find((m) => m.tipo === tipo);
                return (
                  <tr key={tipo}>
                    <td>{MEDIO_PAGO_LABEL[tipo]}</td>
                    <td>
                      <input
                        className="input w-24" type="number" min="0" max="100" step="0.01"
                        defaultValue={cfg?.retencion_pct ?? 0}
                        disabled={guardandoTipo === tipo}
                        onBlur={(e) => guardarConfig(tipo, "retencion_pct", Number(e.target.value) || 0)}
                      />
                    </td>
                    <td>
                      <input
                        className="input w-24" type="number" min="0" step="1"
                        defaultValue={cfg?.dias_acreditacion ?? 0}
                        disabled={guardandoTipo === tipo}
                        onBlur={(e) => guardarConfig(tipo, "dias_acreditacion", Number(e.target.value) || 0)}
                      />
                    </td>
                    <td>
                      <select
                        className="input" defaultValue={cfg?.banco_destino_id || ""}
                        disabled={guardandoTipo === tipo}
                        onChange={(e) => guardarConfig(tipo, "banco_destino_id", e.target.value || null)}
                      >
                        <option value="">Sin definir (no se acredita automáticamente)</option>
                        {bancos.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Escaneo de comprobantes con IA
// ============================================================================
function TabEscaneo() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [pendientes, setPendientes] = useState<any[]>([]);
  const [historial, setHistorial] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [ediciones, setEdiciones] = useState<Record<string, any>>({});
  const [duplicadoAdvertido, setDuplicadoAdvertido] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    const [{ data: prov }, { data: pend }, { data: hist }] = await Promise.all([
      supabase.from("proveedores").select("*").eq("activo", true).order("nombre"),
      supabase.from("comprobantes_escaneados").select("*").eq("estado", "pendiente").order("created_at", { ascending: false }),
      supabase.from("comprobantes_escaneados").select("*, proveedores(nombre)").neq("estado", "pendiente").order("created_at", { ascending: false }).limit(20),
    ]);
    setProveedores((prov as Proveedor[]) || []);
    setPendientes(pend || []);
    setHistorial(hist || []);
    const ed: Record<string, any> = {};
    (pend || []).forEach((p: any) => {
      ed[p.id] = {
        proveedor_id: p.proveedor_id || "",
        numero_comprobante: p.numero_comprobante || "",
        fecha: p.fecha || new Date().toISOString().slice(0, 10),
        neto: p.neto ?? "",
        alicuota: "21",
        iva_monto: p.iva_monto ?? "",
        total: p.total ?? "",
      };
    });
    setEdiciones(ed);
    setDuplicadoAdvertido({});
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function recalcularIva(ed: any, alicuota: string) {
    const neto = Number(ed.neto);
    if (!neto || alicuota === "") return ed.iva_monto;
    return (neto * (Number(alicuota) / 100)).toFixed(2);
  }

  // Supabase no publica un límite documentado de tamaño de request para Edge
  // Functions, pero en la práctica un archivo pesado (sobre todo un PDF
  // escaneado en alta resolución) puede hacer fallar el envío antes de que
  // llegue siquiera a analizarse — y ese fallo aparece como el mismo error
  // genérico de red, sin pista de la causa real. Este tope es una precaución
  // nuestra, no un límite oficial: si en la práctica hace falta subir algo
  // más pesado sin problema, se puede subir sin drama.
  const TAMANIO_MAXIMO_MB = 8;

  function elegirArchivo(f: File | null) {
    setError(null);
    if (f && f.size > TAMANIO_MAXIMO_MB * 1024 * 1024) {
      setArchivo(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setError(`El archivo pesa ${(f.size / (1024 * 1024)).toFixed(1)} MB — probá con uno de menos de ${TAMANIO_MAXIMO_MB} MB (comprimí el PDF o sacá la foto con menor resolución).`);
      return;
    }
    setArchivo(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  }

  function fileToBase64(f: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1] || "");
      };
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });
  }

  async function analizar() {
    if (!archivo) return;
    setAnalizando(true);
    setError(null);
    try {
      const base64 = await fileToBase64(archivo);
      const res = await invocarFuncion("escanear-comprobantes", { imagen_base64: base64, media_type: archivo.type || "image/jpeg" });
      if (!res.ok) {
        setError(res.motivo || "No se pudo analizar el archivo.");
      } else {
        const cantidad = (res as any).comprobantes?.length || 0;
        if (cantidad === 0) setError("No se detectó ningún comprobante en el archivo. Probá con una foto más clara o un PDF más nítido.");
        elegirArchivo(null);
        load();
      }
    } catch (e: any) {
      setError(e?.message || "Error inesperado al analizar el archivo.");
    }
    setAnalizando(false);
  }

  async function confirmar(p: any) {
    const ed = ediciones[p.id];
    if (!ed?.proveedor_id || !ed?.total) {
      setError("Elegí un proveedor y verificá el total antes de confirmar.");
      return;
    }

    if (!duplicadoAdvertido[p.id] && ed.numero_comprobante) {
      const { data: dup } = await supabase
        .from("proveedor_movimientos")
        .select("id, fecha, monto")
        .eq("proveedor_id", ed.proveedor_id)
        .eq("comprobante_ref", ed.numero_comprobante)
        .eq("tipo", "compra")
        .limit(1);
      if (dup && dup.length > 0) {
        setError(
          `Posible duplicado: ya existe una compra de este proveedor con el comprobante "${ed.numero_comprobante}" ` +
          `(${fmtMoneda(dup[0].monto)}, ${new Date(dup[0].fecha).toLocaleDateString("es-AR")}). ` +
          `Si de verdad es un comprobante distinto, tocá "Confirmar y cargar" otra vez para forzar la carga.`
        );
        setDuplicadoAdvertido({ ...duplicadoAdvertido, [p.id]: true });
        return;
      }
    }

    setConfirmando(p.id);
    const tid = await tenantId();
    const { data: mov, error: errMov } = await supabase.from("proveedor_movimientos").insert({
      tenant_id: tid,
      proveedor_id: ed.proveedor_id,
      tipo: "compra",
      monto: Number(ed.total),
      neto: ed.neto ? Number(ed.neto) : null,
      iva_monto: ed.iva_monto ? Number(ed.iva_monto) : null,
      iva_porcentaje: ed.alicuota !== "" && ed.alicuota != null ? Number(ed.alicuota) : null,
      comprobante_ref: ed.numero_comprobante || null,
      descripcion: "Cargado desde escaneo de comprobante (IA)",
      fecha: ed.fecha,
    }).select().single();

    if (errMov) {
      setError(errMov.message);
      setConfirmando(null);
      return;
    }

    await supabase.from("comprobantes_escaneados").update({
      estado: "confirmado",
      proveedor_id: ed.proveedor_id,
      proveedor_movimiento_id: mov.id,
    }).eq("id", p.id);

    setConfirmando(null);
    load();
  }

  async function descartar(id: string) {
    await supabase.from("comprobantes_escaneados").update({ estado: "descartado" }).eq("id", id);
    load();
  }

  return (
    <div>
      <div className="card mb-6 border-l-4 border-amber-400">
        <p className="text-sm text-gray-700">
          Sacá una foto o subí un PDF con uno o varios comprobantes de compra/gasto — la IA los detecta todos, extrae sus
          datos y los deja acá para que revises y confirmes <strong>uno a uno</strong> (nunca se cargan solos). Cada uno
          que confirmes se suma como una "compra" del proveedor correspondiente, y de ahí alimenta el Libro de IVA
          Compras en Tesorería y, si tenés la automatización configurada en Contabilidad, también genera su asiento.
        </p>
        <p className="text-xs text-gray-500 mt-2">
          Se aceptan fotos (JPG/PNG/WEBP) y archivos PDF. El OCR nunca es 100% confiable — revisá siempre los montos
          antes de confirmar. Si la función responde que no está activada, hace falta cargar la clave del proveedor de
          IA como secret en Supabase (paso único de configuración, no depende del código).
        </p>
      </div>

      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Analizar un comprobante nuevo</h3>
        <div className="flex items-center gap-4 flex-wrap">
          <input type="file" accept="image/*,application/pdf" onChange={(e) => elegirArchivo(e.target.files?.[0] || null)} />
          {previewUrl && (archivo?.type === "application/pdf" ? (
            <span className="text-xs text-gray-600 border rounded px-3 py-2 bg-gray-50">📄 {archivo.name}</span>
          ) : (
            <img src={previewUrl} alt="preview" className="h-20 rounded border" />
          ))}
          <button className="btn-primary" disabled={!archivo || analizando} onClick={analizar}>
            {analizando ? "Analizando…" : "Analizar comprobante"}
          </button>
        </div>
        {error && <p className="text-danger text-xs mt-2">{error}</p>}
      </div>

      {loading ? <p className="text-gray-400">Cargando…</p> : (
        <>
          {pendientes.length > 0 && (
            <div className="card mb-6">
              <h3 className="text-sm font-semibold text-navy mb-3">Comprobantes detectados — pendientes de revisión</h3>
              <div className="space-y-4">
                {pendientes.map((p) => {
                  const ed = ediciones[p.id] || {};
                  return (
                    <div key={p.id} className="border border-gray-200 rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-500">
                          Detectado: {p.proveedor_nombre_detectado || "proveedor no identificado"} {p.cuit_detectado ? `(${p.cuit_detectado})` : ""}
                        </span>
                        {p.confianza != null && (
                          <span className={`badge ${p.confianza >= 0.7 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                            Confianza: {(p.confianza * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                        <select className="input" value={ed.proveedor_id} onChange={(e) => setEdiciones({ ...ediciones, [p.id]: { ...ed, proveedor_id: e.target.value } })}>
                          <option value="">Proveedor…</option>
                          {proveedores.map((pr) => <option key={pr.id} value={pr.id}>{pr.nombre}</option>)}
                        </select>
                        <input className="input" placeholder="N° comprobante" value={ed.numero_comprobante} onChange={(e) => setEdiciones({ ...ediciones, [p.id]: { ...ed, numero_comprobante: e.target.value } })} />
                        <input className="input" type="date" value={ed.fecha} onChange={(e) => setEdiciones({ ...ediciones, [p.id]: { ...ed, fecha: e.target.value } })} />
                        <input className="input" type="number" step="0.01" placeholder="Neto" value={ed.neto} onChange={(e) => { const next = { ...ed, neto: e.target.value }; next.iva_monto = recalcularIva(next, ed.alicuota); setEdiciones({ ...ediciones, [p.id]: next }); }} />
                        <select className="input" value={ed.alicuota} onChange={(e) => { const next = { ...ed, alicuota: e.target.value }; next.iva_monto = recalcularIva(next, e.target.value); setEdiciones({ ...ediciones, [p.id]: next }); }}>
                          <option value="21">IVA 21%</option>
                          <option value="10.5">IVA 10,5%</option>
                          <option value="27">IVA 27%</option>
                          <option value="0">Exento / no gravado</option>
                        </select>
                        <input className="input" type="number" step="0.01" placeholder="IVA" value={ed.iva_monto} onChange={(e) => setEdiciones({ ...ediciones, [p.id]: { ...ed, iva_monto: e.target.value } })} />
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <input className="input w-40" type="number" step="0.01" placeholder="Total" value={ed.total} onChange={(e) => setEdiciones({ ...ediciones, [p.id]: { ...ed, total: e.target.value } })} />
                        <button className="btn-primary text-sm" disabled={confirmando === p.id} onClick={() => confirmar(p)}>
                          {confirmando === p.id ? "Cargando…" : "Confirmar y cargar"}
                        </button>
                        <button className="text-danger text-sm" onClick={() => descartar(p.id)}>Descartar</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="card overflow-x-auto">
            <h3 className="text-sm font-semibold text-navy mb-3">Historial reciente</h3>
            <table className="tbl">
              <thead><tr><th>Fecha detección</th><th>Proveedor</th><th>Total</th><th>Estado</th></tr></thead>
              <tbody>
                {historial.map((h) => (
                  <tr key={h.id}>
                    <td>{new Date(h.created_at).toLocaleString("es-AR")}</td>
                    <td>{h.proveedores?.nombre || h.proveedor_nombre_detectado || "—"}</td>
                    <td>{fmtMoneda(h.total)}</td>
                    <td>
                      <span className={`badge ${h.estado === "confirmado" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                        {h.estado === "confirmado" ? "Confirmado" : "Descartado"}
                      </span>
                    </td>
                  </tr>
                ))}
                {historial.length === 0 && <tr><td colSpan={4} className="text-gray-400">Sin historial todavía.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
