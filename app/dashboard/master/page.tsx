"use client";
import { Fragment, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { invocarFuncion, type RespuestaFuncion } from "@/lib/invocarFuncion";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import { ESTADO_TENANT_LABEL, ESQUEMA_COBRO_LABEL, TIPO_AVISO_LABEL, type Tenant, type PagoLicencia, type AvisoMaster } from "@/lib/types";

const ESTADO_BADGE: Record<Tenant["estado"], string> = {
  activo: "bg-green-100 text-green-700",
  pausado: "bg-amber-100 text-amber-700",
  suspendido: "bg-red-100 text-red-700",
};

type RespuestaAccion = RespuestaFuncion;

async function invocar(accion: string, body: Record<string, unknown>): Promise<RespuestaAccion> {
  return invocarFuncion("master-cuentas", body, { "x-accion": accion });
}

export default function MasterHome() {
  const { profile } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({ nombre: "", slug: "", dueno_email: "", dueno_password: "" });
  const [creando, setCreando] = useState(false);
  const [avisoAlta, setAvisoAlta] = useState<string | null>(null);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);

  const [gestionando, setGestionando] = useState<string | null>(null);
  const [nuevaPassword, setNuevaPassword] = useState("");
  const [nuevoVencimiento, setNuevoVencimiento] = useState("");
  const [motivoEstado, setMotivoEstado] = useState("");
  const [accionando, setAccionando] = useState(false);
  const [avisoFila, setAvisoFila] = useState<{ id: string; texto: string; error?: boolean } | null>(null);

  const [licencia, setLicencia] = useState({
    esquema_cobro: "abono_mensual" as Tenant["esquema_cobro"],
    monto_licencia: "0",
    moneda: "ARS",
    dia_vencimiento_mensual: "",
    proximo_aumento_monto: "",
    proximo_aumento_vigencia: "",
  });

  // Fase H — historial de pagos de licencia (checklist de confirmación de
  // cobro) dentro de la fila "Gestionar" de cada distribuidora.
  const [pagos, setPagos] = useState<PagoLicencia[]>([]);
  const [nuevoPago, setNuevoPago] = useState({ fecha_pago: new Date().toISOString().slice(0, 10), monto: "", moneda: "ARS", periodo_cubierto: "", notas: "" });
  const [registrandoPago, setRegistrandoPago] = useState(false);

  // Fase H — centro de avisos a distribuidoras (mensajería masiva/selectiva).
  const [avisos, setAvisos] = useState<AvisoMaster[]>([]);
  const [formAviso, setFormAviso] = useState({ titulo: "", mensaje: "", tipo: "info" as AvisoMaster["tipo"], destinatarios: [] as string[] });
  const [enviandoAviso, setEnviandoAviso] = useState(false);
  const [avisoEnvioMsg, setAvisoEnvioMsg] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("tenants").select("*").order("created_at", { ascending: false });
    setTenants((data as Tenant[]) || []);
    setLoading(false);
  }
  async function cargarAvisos() {
    const { data } = await supabase.from("avisos_master").select("*").order("fecha_envio", { ascending: false }).limit(20);
    setAvisos((data as AvisoMaster[]) || []);
  }
  useEffect(() => { load(); cargarAvisos(); }, []);

  async function cargarPagos(tenantId: string) {
    const { data } = await supabase.from("pagos_licencia").select("*").eq("tenant_id", tenantId).order("fecha_pago", { ascending: false });
    setPagos((data as PagoLicencia[]) || []);
  }

  async function registrarPago(t: Tenant) {
    const monto = Number(nuevoPago.monto);
    if (Number.isNaN(monto) || monto <= 0) {
      setAvisoFila({ id: t.id, texto: "El importe del pago no es válido.", error: true });
      return;
    }
    if (!nuevoPago.periodo_cubierto.trim()) {
      setAvisoFila({ id: t.id, texto: "Indicá el período cubierto por el pago (ej: agosto 2026).", error: true });
      return;
    }
    setRegistrandoPago(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("pagos_licencia").insert({
      tenant_id: t.id,
      fecha_pago: nuevoPago.fecha_pago,
      monto,
      moneda: nuevoPago.moneda || "ARS",
      periodo_cubierto: nuevoPago.periodo_cubierto.trim(),
      registrado_por: u.user?.id,
      notas: nuevoPago.notas || null,
    });
    setRegistrandoPago(false);
    if (error) {
      setAvisoFila({ id: t.id, texto: error.message, error: true });
    } else {
      setAvisoFila({ id: t.id, texto: "Pago registrado." });
      setNuevoPago({ fecha_pago: new Date().toISOString().slice(0, 10), monto: "", moneda: nuevoPago.moneda, periodo_cubierto: "", notas: "" });
      await cargarPagos(t.id);
    }
  }

  function toggleDestinatario(tenantId: string) {
    setFormAviso((f) => ({ ...f, destinatarios: f.destinatarios.includes(tenantId) ? f.destinatarios.filter((x) => x !== tenantId) : [...f.destinatarios, tenantId] }));
  }

  async function enviarAviso(e: React.FormEvent) {
    e.preventDefault();
    if (!formAviso.titulo.trim() || !formAviso.mensaje.trim()) return;
    setEnviandoAviso(true);
    setAvisoEnvioMsg(null);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("avisos_master").insert({
      creado_por: u.user?.id,
      destinatarios: formAviso.destinatarios.length > 0 ? formAviso.destinatarios : null,
      titulo: formAviso.titulo.trim(),
      mensaje: formAviso.mensaje.trim(),
      tipo: formAviso.tipo,
    });
    setEnviandoAviso(false);
    if (error) {
      setAvisoEnvioMsg(error.message);
    } else {
      setAvisoEnvioMsg(formAviso.destinatarios.length > 0 ? `Aviso enviado a ${formAviso.destinatarios.length} distribuidora(s).` : "Aviso enviado a todas las distribuidoras.");
      setFormAviso({ titulo: "", mensaje: "", tipo: "info", destinatarios: [] });
      await cargarAvisos();
    }
  }

  function generarPassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let out = "";
    for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
    setForm((f) => ({ ...f, dueno_password: out }));
  }

  async function crearDistribuidora(e: React.FormEvent) {
    e.preventDefault();
    setCreando(true);
    setAvisoAlta(null);
    setErrorAlta(null);
    const res = await invocar("crear_distribuidora", form);
    if (res.ok) {
      setAvisoAlta(
        `Distribuidora "${form.nombre}" creada. Entregá estas credenciales al Dueño — email: ${form.dueno_email} · contraseña: ${form.dueno_password} (puede cambiarla luego).`
      );
      setForm({ nombre: "", slug: "", dueno_email: "", dueno_password: "" });
      await load();
    } else {
      setErrorAlta(res.motivo || "No se pudo crear la distribuidora.");
    }
    setCreando(false);
  }

  function abrirGestion(t: Tenant) {
    const abriendo = gestionando !== t.id;
    setGestionando(abriendo ? t.id : null);
    setNuevaPassword("");
    setNuevoVencimiento(t.plan_vencimiento || "");
    setMotivoEstado("");
    setAvisoFila(null);
    setPagos([]);
    setNuevoPago({ fecha_pago: new Date().toISOString().slice(0, 10), monto: "", moneda: t.moneda || "ARS", periodo_cubierto: "", notas: "" });
    if (abriendo) cargarPagos(t.id);
    setLicencia({
      esquema_cobro: t.esquema_cobro || "abono_mensual",
      monto_licencia: String(t.monto_licencia ?? 0),
      moneda: t.moneda || "ARS",
      dia_vencimiento_mensual: t.dia_vencimiento_mensual != null ? String(t.dia_vencimiento_mensual) : "",
      proximo_aumento_monto: t.proximo_aumento_monto != null ? String(t.proximo_aumento_monto) : "",
      proximo_aumento_vigencia: t.proximo_aumento_vigencia || "",
    });
  }

  async function resetearPassword(t: Tenant) {
    if (nuevaPassword.length < 8) {
      setAvisoFila({ id: t.id, texto: "La contraseña debe tener al menos 8 caracteres.", error: true });
      return;
    }
    setAccionando(true);
    const res = await invocar("resetear_password_dueno", { tenant_id: t.id, nueva_password: nuevaPassword });
    setAccionando(false);
    if (res.ok) {
      setAvisoFila({ id: t.id, texto: `Contraseña restablecida para ${res.dueno_email}: ${nuevaPassword}` });
      setNuevaPassword("");
    } else {
      setAvisoFila({ id: t.id, texto: res.motivo || "No se pudo resetear la contraseña.", error: true });
    }
  }

  async function cambiarEstado(t: Tenant, estado: Tenant["estado"]) {
    setAccionando(true);
    const res = await invocar("cambiar_estado", { tenant_id: t.id, estado, motivo: motivoEstado || null });
    setAccionando(false);
    if (res.ok) {
      setAvisoFila({ id: t.id, texto: `Estado actualizado a "${ESTADO_TENANT_LABEL[estado]}". Usuarios afectados: ${res.usuarios_afectados}.` });
      await load();
    } else {
      setAvisoFila({ id: t.id, texto: res.motivo || "No se pudo cambiar el estado.", error: true });
    }
  }

  async function extenderPlazo(t: Tenant) {
    setAccionando(true);
    const res = await invocar("extender_plazo", { tenant_id: t.id, nueva_fecha_vencimiento: nuevoVencimiento || null });
    setAccionando(false);
    if (res.ok) {
      setAvisoFila({ id: t.id, texto: "Vencimiento actualizado." });
      await load();
    } else {
      setAvisoFila({ id: t.id, texto: res.motivo || "No se pudo actualizar el vencimiento.", error: true });
    }
  }

  async function actualizarLicencia(t: Tenant) {
    if (licencia.esquema_cobro === "abono_mensual") {
      const dia = Number(licencia.dia_vencimiento_mensual);
      if (!licencia.dia_vencimiento_mensual || !Number.isInteger(dia) || dia < 1 || dia > 28) {
        setAvisoFila({ id: t.id, texto: "Para abono mensual, indicá un día de vencimiento entre 1 y 28.", error: true });
        return;
      }
    }
    const monto = Number(licencia.monto_licencia);
    if (Number.isNaN(monto) || monto < 0) {
      setAvisoFila({ id: t.id, texto: "El importe de la licencia no es válido.", error: true });
      return;
    }
    if (licencia.proximo_aumento_monto && Number.isNaN(Number(licencia.proximo_aumento_monto))) {
      setAvisoFila({ id: t.id, texto: "El importe del próximo aumento no es válido.", error: true });
      return;
    }

    setAccionando(true);
    const res = await invocar("actualizar_licencia", {
      tenant_id: t.id,
      esquema_cobro: licencia.esquema_cobro,
      monto_licencia: monto,
      moneda: licencia.moneda || "ARS",
      dia_vencimiento_mensual: licencia.esquema_cobro === "abono_mensual" ? Number(licencia.dia_vencimiento_mensual) : null,
      proximo_aumento_monto: licencia.proximo_aumento_monto ? Number(licencia.proximo_aumento_monto) : null,
      proximo_aumento_vigencia: licencia.proximo_aumento_vigencia || null,
    });
    setAccionando(false);
    if (res.ok) {
      setAvisoFila({ id: t.id, texto: "Esquema de licenciamiento y cobro actualizado." });
      await load();
    } else {
      setAvisoFila({ id: t.id, texto: res.motivo || "No se pudo actualizar el esquema de licenciamiento.", error: true });
    }
  }

  const fmtFecha = (s: string | null) => (s ? new Date(s).toLocaleDateString("es-AR") : "—");

  if (profile && profile.role !== "master") {
    return <p className="text-red-600 text-sm">No autorizado. Esta sección es exclusiva del Usuario Maestro de la plataforma.</p>;
  }

  return (
    <div>
      <PageHeader
        title="Distribuidoras (Tenants)"
        subtitle="Gestión de cuenta — alta, credenciales y estado de acceso. No incluye visibilidad de pedidos, clientes ni usuarios de cada distribuidora: eso es responsabilidad exclusiva de cada Dueño."
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Distribuidoras" value={String(tenants.length)} />
        <StatCard label="Activas" value={String(tenants.filter((t) => t.estado === "activo").length)} />
        <StatCard label="Pausadas / Suspendidas" value={String(tenants.filter((t) => t.estado !== "activo").length)} />
      </div>

      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Nueva distribuidora (onboarding)</h3>
        <form onSubmit={crearDistribuidora} className="grid grid-cols-2 gap-3">
          <input className="input" placeholder="Nombre de la empresa" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
          <input className="input" placeholder="slug (ej: mi-distribuidora)" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required />
          <input className="input" type="email" placeholder="Email del Dueño" value={form.dueno_email} onChange={(e) => setForm({ ...form, dueno_email: e.target.value })} required />
          <div className="flex gap-2">
            <input className="input" placeholder="Contraseña inicial (mín. 8)" value={form.dueno_password} onChange={(e) => setForm({ ...form, dueno_password: e.target.value })} required minLength={8} />
            <button type="button" className="btn-secondary shrink-0" onClick={generarPassword}>Generar</button>
          </div>
          <button className="btn-primary col-span-2" disabled={creando}>{creando ? "Creando…" : "Crear distribuidora"}</button>
        </form>
        {avisoAlta && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2 mt-3">{avisoAlta}</p>}
        {errorAlta && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 mt-3">{errorAlta}</p>}
        <p className="text-xs text-gray-400 mt-2">
          Esta es la única credencial que entregás vos: el email y la contraseña inicial del Dueño. El Dueño puede cambiar su
          propia contraseña luego; vos podés volver a resetearla en cualquier momento desde la fila de la distribuidora.
        </p>
      </div>

      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Centro de avisos a distribuidoras</h3>
        <form onSubmit={enviarAviso} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Título" value={formAviso.titulo} onChange={(e) => setFormAviso((f) => ({ ...f, titulo: e.target.value }))} required />
            <select className="input" value={formAviso.tipo} onChange={(e) => setFormAviso((f) => ({ ...f, tipo: e.target.value as AvisoMaster["tipo"] }))}>
              {Object.entries(TIPO_AVISO_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <textarea className="input" rows={3} placeholder="Mensaje" value={formAviso.mensaje} onChange={(e) => setFormAviso((f) => ({ ...f, mensaje: e.target.value }))} required />
          <div>
            <label className="text-xs text-gray-500 block mb-1">Destinatarios (dejá todo sin marcar para enviar a todas las distribuidoras)</label>
            <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
              {tenants.map((t) => (
                <label key={t.id} className="flex items-center gap-1 text-xs border rounded-md px-2 py-1">
                  <input type="checkbox" checked={formAviso.destinatarios.includes(t.id)} onChange={() => toggleDestinatario(t.id)} /> {t.nombre}
                </label>
              ))}
            </div>
          </div>
          <button className="btn-primary" disabled={enviandoAviso || !formAviso.titulo.trim() || !formAviso.mensaje.trim()}>
            {enviandoAviso ? "Enviando…" : "Enviar aviso"}
          </button>
        </form>
        {avisoEnvioMsg && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2 mt-3">{avisoEnvioMsg}</p>}

        {avisos.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-semibold text-navy mb-1">Últimos avisos enviados</div>
            <ul className="space-y-1 text-xs text-gray-600 max-h-40 overflow-y-auto">
              {avisos.map((a) => (
                <li key={a.id} className="border-b border-gray-100 pb-1">
                  <span className="font-medium">{a.titulo}</span> — {a.destinatarios && a.destinatarios.length > 0 ? `${a.destinatarios.length} distribuidora(s)` : "todas"} · {new Date(a.fecha_envio).toLocaleString("es-AR")}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="card overflow-x-auto">
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead><tr><th>Distribuidora</th><th>Slug</th><th>Estado</th><th>Licencia</th><th>Vencimiento</th><th>Creada</th><th></th></tr></thead>
            <tbody>
              {tenants.map((t) => (
                <Fragment key={t.id}>
                  <tr>
                    <td className="font-medium">{t.nombre}</td>
                    <td>{t.slug}</td>
                    <td><span className={`badge ${ESTADO_BADGE[t.estado]}`}>{ESTADO_TENANT_LABEL[t.estado]}</span></td>
                    <td className="text-xs">
                      {ESQUEMA_COBRO_LABEL[t.esquema_cobro]}
                      <br />
                      {t.monto_licencia} {t.moneda}
                      {t.esquema_cobro === "abono_mensual" && t.dia_vencimiento_mensual ? ` · día ${t.dia_vencimiento_mensual}` : ""}
                    </td>
                    <td>{fmtFecha(t.plan_vencimiento)}</td>
                    <td>{fmtFecha(t.created_at || null)}</td>
                    <td>
                      <button className="btn-secondary" onClick={() => abrirGestion(t)}>
                        {gestionando === t.id ? "Cerrar" : "Gestionar"}
                      </button>
                    </td>
                  </tr>
                  {gestionando === t.id && (
                    <tr>
                      <td colSpan={7} className="bg-gray-50">
                        <div className="p-4 space-y-4">
                          {avisoFila && avisoFila.id === t.id && (
                            <p className={`text-sm rounded-md px-3 py-2 border ${avisoFila.error ? "text-red-700 bg-red-50 border-red-200" : "text-green-700 bg-green-50 border-green-200"}`}>
                              {avisoFila.texto}
                            </p>
                          )}

                          <div>
                            <div className="text-xs font-semibold text-navy mb-1">Restablecer contraseña del Dueño</div>
                            <div className="flex gap-2">
                              <input className="input" placeholder="Nueva contraseña (mín. 8)" value={nuevaPassword} onChange={(e) => setNuevaPassword(e.target.value)} minLength={8} />
                              <button className="btn-primary shrink-0" disabled={accionando} onClick={() => resetearPassword(t)}>Restablecer</button>
                            </div>
                          </div>

                          <div>
                            <div className="text-xs font-semibold text-navy mb-1">Esquema de cobro y licencia</div>
                            <div className="grid grid-cols-3 gap-2">
                              <select
                                className="input"
                                value={licencia.esquema_cobro}
                                onChange={(e) => setLicencia((l) => ({ ...l, esquema_cobro: e.target.value as Tenant["esquema_cobro"] }))}
                              >
                                {Object.entries(ESQUEMA_COBRO_LABEL).map(([v, label]) => (
                                  <option key={v} value={v}>{label}</option>
                                ))}
                              </select>
                              <input
                                className="input" type="number" min={0} step="0.01" placeholder="Importe del servicio"
                                value={licencia.monto_licencia}
                                onChange={(e) => setLicencia((l) => ({ ...l, monto_licencia: e.target.value }))}
                              />
                              <input
                                className="input" placeholder="Moneda (ej: ARS)"
                                value={licencia.moneda}
                                onChange={(e) => setLicencia((l) => ({ ...l, moneda: e.target.value }))}
                              />
                              {licencia.esquema_cobro === "abono_mensual" ? (
                                <input
                                  className="input" type="number" min={1} max={28} placeholder="Día de vencimiento mensual (1-28)"
                                  value={licencia.dia_vencimiento_mensual}
                                  onChange={(e) => setLicencia((l) => ({ ...l, dia_vencimiento_mensual: e.target.value }))}
                                />
                              ) : (
                                <input
                                  className="input" type="date" placeholder="Fecha de vencimiento"
                                  value={nuevoVencimiento}
                                  onChange={(e) => setNuevoVencimiento(e.target.value)}
                                />
                              )}
                              <input
                                className="input" type="number" min={0} step="0.01" placeholder="Próximo aumento — nuevo importe (opcional)"
                                value={licencia.proximo_aumento_monto}
                                onChange={(e) => setLicencia((l) => ({ ...l, proximo_aumento_monto: e.target.value }))}
                              />
                              <input
                                className="input" type="date" placeholder="Próximo aumento — vigencia desde"
                                value={licencia.proximo_aumento_vigencia}
                                onChange={(e) => setLicencia((l) => ({ ...l, proximo_aumento_vigencia: e.target.value }))}
                              />
                            </div>
                            <div className="flex gap-2 mt-2">
                              <button
                                className="btn-primary"
                                disabled={accionando}
                                onClick={async () => {
                                  if (licencia.esquema_cobro === "pago_unico") await extenderPlazo(t);
                                  await actualizarLicencia(t);
                                }}
                              >
                                Guardar esquema de cobro
                              </button>
                            </div>
                            <p className="text-xs text-gray-400 mt-2">
                              El Dueño ve, dentro de su panel, una alerta automática el último día del mes previo al
                              vencimiento (con fecha exacta e importe) y, si cargás un próximo aumento, un aviso 30 días
                              antes de que entre en vigencia.
                            </p>
                          </div>

                          <div>
                            <div className="text-xs font-semibold text-navy mb-1">Historial de pagos (checklist de confirmación de cobro)</div>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-2">
                              <input className="input" type="date" value={nuevoPago.fecha_pago} onChange={(e) => setNuevoPago((p) => ({ ...p, fecha_pago: e.target.value }))} />
                              <input className="input" type="number" min={0} step="0.01" placeholder="Importe" value={nuevoPago.monto} onChange={(e) => setNuevoPago((p) => ({ ...p, monto: e.target.value }))} />
                              <input className="input" placeholder="Moneda" value={nuevoPago.moneda} onChange={(e) => setNuevoPago((p) => ({ ...p, moneda: e.target.value }))} />
                              <input className="input" placeholder="Período (ej: agosto 2026)" value={nuevoPago.periodo_cubierto} onChange={(e) => setNuevoPago((p) => ({ ...p, periodo_cubierto: e.target.value }))} />
                              <input className="input" placeholder="Notas (opcional)" value={nuevoPago.notas} onChange={(e) => setNuevoPago((p) => ({ ...p, notas: e.target.value }))} />
                            </div>
                            <button className="btn-primary mb-3" disabled={registrandoPago} onClick={() => registrarPago(t)}>
                              {registrandoPago ? "Registrando…" : "Confirmar pago recibido"}
                            </button>
                            {pagos.length > 0 && (
                              <div className="overflow-x-auto">
                                <table className="tbl">
                                  <thead><tr><th>Fecha</th><th>Importe</th><th>Período</th><th>Notas</th></tr></thead>
                                  <tbody>
                                    {pagos.map((p) => (
                                      <tr key={p.id}>
                                        <td>{fmtFecha(p.fecha_pago)}</td>
                                        <td>{p.monto} {p.moneda}</td>
                                        <td>{p.periodo_cubierto}</td>
                                        <td className="text-xs text-gray-500">{p.notas || "—"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            {pagos.length === 0 && <p className="text-xs text-gray-400">Sin pagos registrados todavía para esta distribuidora.</p>}
                          </div>

                          <div>
                            <div className="text-xs font-semibold text-navy mb-1">Estado de acceso (por falta de pago o baja del servicio)</div>
                            <input
                              className="input mb-2"
                              placeholder="Motivo (opcional, queda registrado)"
                              value={motivoEstado}
                              onChange={(e) => setMotivoEstado(e.target.value)}
                            />
                            <div className="flex gap-2 flex-wrap">
                              {t.estado !== "activo" && (
                                <button className="btn-primary" disabled={accionando} onClick={() => cambiarEstado(t, "activo")}>Reactivar</button>
                              )}
                              {t.estado !== "pausado" && (
                                <button className="btn-secondary" disabled={accionando} onClick={() => cambiarEstado(t, "pausado")}>Pausar</button>
                              )}
                              {t.estado !== "suspendido" && (
                                <button className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50" disabled={accionando} onClick={() => cambiarEstado(t, "suspendido")}>
                                  Suspender (cortar acceso)
                                </button>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 mt-2">
                              Pausar o suspender bloquea el ingreso de TODOS los usuarios de esta distribuidora (Dueño, vendedores,
                              logística, cobradores y clientes B2B) de inmediato para nuevos inicios de sesión, y en un máximo de 1
                              hora para sesiones ya abiertas. Reactivar restaura el acceso al instante.
                            </p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
