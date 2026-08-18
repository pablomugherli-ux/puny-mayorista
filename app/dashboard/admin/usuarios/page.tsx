"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { invocarFuncion, type RespuestaFuncion } from "@/lib/invocarFuncion";
import PageHeader from "@/components/PageHeader";
import { ROLE_LABEL } from "@/lib/types";

// ============================================================================
// RBAC dinámico — Fase 3: checklist de permisos + alta multi-plantilla.
// ----------------------------------------------------------------------------
// Reemplaza la matriz plana de 13 columnas booleanas por el panel descripto
// en las secciones 3 y 5 de la propuesta ("PUNY - Propuesta RBAC Dinamico"):
// lista de empleados a la izquierda + checklist agrupado por módulo/submódulo
// a la derecha, con autosave, badge Estándar/Personalizado, aplicar plantilla
// multi-selección y pie de auditoría.
//
// Toda escritura de permisos pasa ahora por dos funciones SQL (otorgar_permiso
// / aplicar_plantilla_usuario, RBAC Fase 3) que escriben en usuario_permisos
// (fuente de verdad de RLS desde la Fase 2) — un trigger en la base espeja el
// resultado hacia las columnas viejas de profiles.permiso_* para que el
// Sidebar/Ribbon actual (todavía no dinámico, eso es Fase 4) siga mostrando
// los accesos correctos mientras tanto.
// ============================================================================

const ROLES_CREABLES = [
  "vendedor", "entrega", "cobrador", "cliente_b2b",
  "supervisor", "vendedor_masivo", "asesor_inmuner", "operador_wp", "vigilador",
  "administrador", "tesorero", "jefe_personal", "encargado_caja", "cajero",
  "encargado_depositos", "encargado_logistica", "proveedor",
] as const;

const MODULO_LABEL: Record<string, string> = {
  ventas: "Ventas",
  finanzas: "Finanzas & Stock",
  personal: "Personal (RRHH)",
  comunicacion: "Comunicación",
  informes: "Informes y Reportes",
  sistema: "Sistema",
  campo: "Roles de Campo",
  b2b: "Portal Cliente B2B",
  proveedor: "Portal Proveedor",
};
const MODULO_ORDEN = ["ventas", "finanzas", "personal", "comunicacion", "informes", "sistema", "campo", "b2b", "proveedor"];

// Claves que ya tienen columna espejo en profiles (ver trigger de sincronización
// en la migración 89) — informativo nomás, para no prometer en el tooltip algo
// que el módulo todavía no consume.
const CLAVES_CON_EFECTO_HOY = new Set([
  "finanzas.acceso", "rrhh.acceso", "stock.acceso", "seguridad.acceso", "marketing.acceso",
  "caja.acceso", "depositos.acceso", "logistica.acceso",
  "ventas.lista1.ver", "ventas.lista1.operar", "ventas.lista2.ver", "ventas.lista2.operar",
  "ventas.consolidado.ver", "cobros.clientes_propios",
]);

type Respuesta = RespuestaFuncion;
async function invocar(accion: string, body: Record<string, unknown>): Promise<Respuesta> {
  return invocarFuncion("dueno-usuarios", body, { "x-accion": accion });
}

type CatalogoItem = { clave: string; modulo: string; submodulo: string | null; etiqueta: string; descripcion: string | null; orden: number };
type PermisoRow = { permiso_clave: string; habilitado: boolean; vigente_hasta: string | null; origen: "plantilla" | "manual"; otorgado_por: string | null; otorgado_en: string };

const fmtFecha = (s: string | null) => (s ? new Date(s).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export default function UsuariosAdmin() {
  const [rows, setRows] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [cajasDisponibles, setCajasDisponibles] = useState<string[]>([]);
  const [catalogo, setCatalogo] = useState<CatalogoItem[]>([]);
  const [rolDefaults, setRolDefaults] = useState<Record<string, Set<string>>>({});
  const [personalizados, setPersonalizados] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    nombre: "", email: "", password: "",
    role: "vendedor" as (typeof ROLES_CREABLES)[number],
    rolesAdicionales: [] as string[],
    cliente_id: "", proveedor_id: "",
  });
  const [creando, setCreando] = useState(false);
  const [avisoAlta, setAvisoAlta] = useState<string | null>(null);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);

  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [busquedaEmpleado, setBusquedaEmpleado] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<"activos" | "suspendidos" | "todos">("activos");

  async function load() {
    const [{ data: p }, { data: c }, { data: pr }, { data: cj }, { data: cat }, { data: rpd }, { data: manual }] = await Promise.all([
      supabase.from("profiles").select("*").order("role"),
      supabase.from("clientes").select("id, nombre").order("nombre"),
      supabase.from("proveedores").select("id, nombre").order("nombre"),
      supabase.from("cajas_diarias").select("nombre"),
      supabase.from("catalogo_permisos").select("*").order("modulo").order("orden"),
      supabase.from("rol_permisos_default").select("*"),
      supabase.from("usuario_permisos").select("usuario_id").eq("origen", "manual"),
    ]);
    setRows(p || []);
    setClientes(c || []);
    setProveedores(pr || []);
    setCajasDisponibles(Array.from(new Set((cj || []).map((c: any) => c.nombre))).sort());
    setCatalogo(cat || []);
    const rd: Record<string, Set<string>> = {};
    (rpd || []).forEach((r: any) => { (rd[r.rol] ||= new Set()).add(r.permiso_clave); });
    setRolDefaults(rd);
    setPersonalizados(new Set((manual || []).map((m: any) => m.usuario_id)));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function generarPassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let out = "";
    for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
    setForm((f) => ({ ...f, password: out }));
  }

  async function toggleCajaAsignada(id: string, valor: string | null) {
    await supabase.from("profiles").update({ caja_nombre_asignada: valor }).eq("id", id);
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, caja_nombre_asignada: valor } : r)));
  }

  async function crearUsuario(e: React.FormEvent) {
    e.preventDefault();
    setCreando(true);
    setAvisoAlta(null);
    setErrorAlta(null);
    // RBAC dinámico — Fase 5: ya no se mandan ver_lista_1/operar_lista_1/etc.
    // a mano — el edge function siembra los permisos reales desde
    // rol_permisos_default (RBAC Fase 3), que ya trae, por ejemplo, la
    // combinación ver_lista_1+operar_lista_1 correcta para cliente_b2b (el
    // bug histórico de "operar_lista_1 en false" quedó resuelto ahí, en el
    // catálogo, no acá).
    const res = await invocar("crear_usuario", {
      nombre: form.nombre, email: form.email, password: form.password, role: form.role,
      cliente_id: form.cliente_id, proveedor_id: form.proveedor_id,
      roles_adicionales: form.rolesAdicionales,
    });
    if (res.ok) {
      const extra = (res as any).aviso_plantillas ? ` ${(res as any).aviso_plantillas}` : "";
      setAvisoAlta(`Usuario "${form.nombre}" creado. Entregale estas credenciales — email: ${form.email} · contraseña: ${form.password} (puede cambiarla luego cuando exista esa opción de autogestión).${extra}`);
      setForm({ nombre: "", email: "", password: "", role: "vendedor", rolesAdicionales: [], cliente_id: "", proveedor_id: "" });
      await load();
    } else {
      setErrorAlta(res.motivo || "No se pudo crear el usuario.");
    }
    setCreando(false);
  }

  const empleadosFiltrados = useMemo(() => {
    return rows.filter((u) => {
      if (["master"].includes(u.role)) return false;
      if (filtroEstado === "activos" && u.activo === false) return false;
      if (filtroEstado === "suspendidos" && u.activo !== false) return false;
      if (busquedaEmpleado.trim()) {
        const q = busquedaEmpleado.trim().toLowerCase();
        if (!u.nombre?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, filtroEstado, busquedaEmpleado]);

  const empleado = rows.find((u) => u.id === seleccionado) || null;

  return (
    <div>
      <PageHeader title="Usuarios y Permisos" subtitle="Alta de personal (con superposición de plantillas) y checklist granular de accesos por módulo." />

      <div className="card mb-6">
        <h3 className="text-sm font-semibold text-navy mb-3">Nuevo empleado</h3>
        <form onSubmit={crearUsuario} className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <input className="input" placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
          <input className="input" type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as any })}>
            {ROLES_CREABLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
          {form.role === "cliente_b2b" && (
            <select className="input" value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value })} required>
              <option value="">Vincular a cliente…</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          )}
          {form.role === "proveedor" && (
            <select className="input" value={form.proveedor_id} onChange={(e) => setForm({ ...form, proveedor_id: e.target.value })} required>
              <option value="">Vincular a proveedor…</option>
              {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          )}
          <div className="flex gap-2 col-span-2 md:col-span-1">
            <input className="input" placeholder="Contraseña inicial (mín. 8)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
            <button type="button" className="btn-secondary shrink-0" onClick={generarPassword}>Generar</button>
          </div>

          <div className="col-span-2 md:col-span-3">
            <label className="text-xs text-gray-500 block mb-1.5">
              Plantillas adicionales (superposición de funciones — opcional, ej. sumarle Cobrador a un Vendedor)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {ROLES_CREABLES.filter((r) => r !== form.role).map((r) => {
                const activo = form.rolesAdicionales.includes(r);
                return (
                  <button
                    key={r} type="button"
                    onClick={() => setForm((f) => ({
                      ...f,
                      rolesAdicionales: activo ? f.rolesAdicionales.filter((x) => x !== r) : [...f.rolesAdicionales, r],
                    }))}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${activo ? "bg-navy text-white border-navy" : "bg-white text-gray-600 border-gray-300 hover:border-navy"}`}
                  >
                    {ROLE_LABEL[r]}
                  </button>
                );
              })}
            </div>
          </div>

          <button className="btn-primary col-span-2 md:col-span-3" disabled={creando}>{creando ? "Creando…" : "Crear usuario"}</button>
        </form>
        {avisoAlta && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2 mt-3">{avisoAlta}</p>}
        {errorAlta && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 mt-3">{errorAlta}</p>}
      </div>

      {loading ? <p className="text-gray-400">Cargando…</p> : (
        <div className="grid md:grid-cols-[280px_1fr] gap-4">
          {/* Columna izquierda — lista de empleados */}
          <div className="card !p-0 overflow-hidden self-start">
            <div className="p-3 border-b border-gray-100 space-y-2">
              <input className="input text-sm" placeholder="Buscar…" value={busquedaEmpleado} onChange={(e) => setBusquedaEmpleado(e.target.value)} />
              <div className="flex gap-1">
                {(["activos", "suspendidos", "todos"] as const).map((f) => (
                  <button key={f} onClick={() => setFiltroEstado(f)} className={`text-[11px] px-2 py-1 rounded ${filtroEstado === f ? "bg-navy text-white" : "bg-gray-100 text-gray-500"}`}>
                    {f === "activos" ? "Activos" : f === "suspendidos" ? "Suspendidos" : "Todos"}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              {empleadosFiltrados.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setSeleccionado(u.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition-colors ${seleccionado === u.id ? "bg-amber-50" : ""}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-medium truncate">{u.nombre}</span>
                    {u.activo === false && <span className="badge bg-amber-100 text-amber-700 shrink-0 text-[10px]">Suspendido</span>}
                  </div>
                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <span className="text-[11px] text-gray-400 truncate">{ROLE_LABEL[u.role as keyof typeof ROLE_LABEL]}</span>
                    {!["dueno", "administrador"].includes(u.role) && (
                      <span className={`text-[10px] shrink-0 ${personalizados.has(u.id) ? "text-amber-600" : "text-gray-300"}`}>
                        {personalizados.has(u.id) ? "● Personalizado" : "Estándar"}
                      </span>
                    )}
                  </div>
                </button>
              ))}
              {empleadosFiltrados.length === 0 && <p className="text-xs text-gray-400 p-3">Sin resultados.</p>}
            </div>
          </div>

          {/* Columna derecha — ficha + checklist */}
          <div>
            {!empleado ? (
              <div className="card text-sm text-gray-400">Elegí un empleado de la lista para ver y editar su checklist de permisos.</div>
            ) : (
              <FichaEmpleado
                key={empleado.id}
                empleado={empleado}
                catalogo={catalogo}
                rolDefaults={rolDefaults}
                cajasDisponibles={cajasDisponibles}
                onCajaAsignada={(v) => toggleCajaAsignada(empleado.id, v)}
                onEstadoCambiado={load}
                onPermisosCambiados={load}
                rows={rows}
              />
            )}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-4">
        Cada cambio en el checklist se guarda al instante (autosave) contra usuario_permisos y queda auditado (quién,
        qué permiso, cuándo). Dueño y Administrador siempre tienen acceso total y no aparecen en el checklist — es un
        permiso no delegable, igual que hoy. Un permiso marcado "sin efecto en el menú todavía" ya rige de verdad a
        nivel de seguridad (RLS), pero el enlace correspondiente en el menú lateral recién se muestra dinámicamente
        cuando esa pantalla pase por la Fase 4 del rediseño de permisos.
      </p>
    </div>
  );
}

// ============================================================================
// Ficha de un empleado — acciones de cuenta + checklist de permisos
// ============================================================================
function FichaEmpleado({
  empleado, catalogo, rolDefaults, cajasDisponibles, onCajaAsignada, onEstadoCambiado, onPermisosCambiados, rows,
}: {
  empleado: any; catalogo: CatalogoItem[]; rolDefaults: Record<string, Set<string>>; cajasDisponibles: string[];
  onCajaAsignada: (v: string | null) => void; onEstadoCambiado: () => void; onPermisosCambiados: () => void; rows: any[];
}) {
  const esSuperusuario = ["dueno", "administrador"].includes(empleado.role);
  const [permisos, setPermisos] = useState<Record<string, PermisoRow>>({});
  const [loadingPermisos, setLoadingPermisos] = useState(true);
  const [busquedaPermiso, setBusquedaPermiso] = useState("");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState<string | null>(null);
  const [nuevaPassword, setNuevaPassword] = useState("");
  const [aviso, setAviso] = useState<{ texto: string; error?: boolean } | null>(null);
  const [plantillasAplicar, setPlantillasAplicar] = useState<string[]>([]);
  const [aplicandoPlantilla, setAplicandoPlantilla] = useState(false);

  // RBAC dinámico — Fase 5: coberturas temporales (alcance de datos, sección
  // 3.6/2.5 de la propuesta) — distinto del checklist de permisos de arriba.
  const [coberturas, setCoberturas] = useState<any[]>([]);
  const [loadingCoberturas, setLoadingCoberturas] = useState(true);
  const [nuevaCobertura, setNuevaCobertura] = useState({ usuario_cubre: "", desde: "", hasta: "", motivo: "" });
  const [creandoCobertura, setCreandoCobertura] = useState(false);
  const [avisoCobertura, setAvisoCobertura] = useState<{ texto: string; error?: boolean } | null>(null);

  const nombrePorId = useMemo(() => {
    const m: Record<string, string> = {};
    rows.forEach((r) => (m[r.id] = r.nombre));
    return m;
  }, [rows]);

  async function cargarCoberturas() {
    setLoadingCoberturas(true);
    const { data } = await supabase
      .from("coberturas_temporales")
      .select("*")
      .or(`usuario_cubierto.eq.${empleado.id},usuario_cubre.eq.${empleado.id}`)
      .order("desde", { ascending: false });
    setCoberturas(data || []);
    setLoadingCoberturas(false);
  }
  useEffect(() => { cargarCoberturas(); }, [empleado.id]);

  async function crearCobertura(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevaCobertura.usuario_cubre || !nuevaCobertura.desde || !nuevaCobertura.hasta) return;
    setCreandoCobertura(true);
    setAvisoCobertura(null);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("coberturas_temporales").insert({
      tenant_id: empleado.tenant_id,
      usuario_cubierto: empleado.id,
      usuario_cubre: nuevaCobertura.usuario_cubre,
      desde: nuevaCobertura.desde,
      hasta: nuevaCobertura.hasta,
      motivo: nuevaCobertura.motivo || null,
      creado_por: u.user?.id,
    });
    if (!error) {
      setNuevaCobertura({ usuario_cubre: "", desde: "", hasta: "", motivo: "" });
      await cargarCoberturas();
    } else {
      setAvisoCobertura({ texto: error.message, error: true });
    }
    setCreandoCobertura(false);
  }

  async function finalizarCoberturaAhora(id: string) {
    const hoy = new Date().toISOString().slice(0, 10);
    await supabase.from("coberturas_temporales").update({ hasta: hoy }).eq("id", id);
    await cargarCoberturas();
  }

  async function cargarPermisos() {
    setLoadingPermisos(true);
    const { data } = await supabase.from("usuario_permisos").select("*").eq("usuario_id", empleado.id);
    const map: Record<string, PermisoRow> = {};
    (data || []).forEach((p: any) => (map[p.permiso_clave] = p));
    setPermisos(map);
    setLoadingPermisos(false);
  }
  useEffect(() => { cargarPermisos(); setAviso(null); setPlantillasAplicar([]); }, [empleado.id]);

  const defaults = rolDefaults[empleado.role] || new Set<string>();

  const modulos = useMemo(() => {
    const q = busquedaPermiso.trim().toLowerCase();
    const filtrado = q
      ? catalogo.filter((c) => c.etiqueta.toLowerCase().includes(q) || (c.descripcion || "").toLowerCase().includes(q) || c.clave.toLowerCase().includes(q))
      : catalogo;
    const porModulo: Record<string, Record<string, CatalogoItem[]>> = {};
    filtrado.forEach((c) => {
      const sub = c.submodulo || "General";
      ((porModulo[c.modulo] ||= {})[sub] ||= []).push(c);
    });
    return MODULO_ORDEN.filter((m) => porModulo[m]).map((m) => ({ modulo: m, submodulos: porModulo[m] }));
  }, [catalogo, busquedaPermiso]);

  useEffect(() => {
    if (busquedaPermiso.trim()) setAbiertos(new Set(modulos.map((m) => m.modulo)));
  }, [busquedaPermiso]);

  useEffect(() => {
    if (!loadingPermisos) {
      const conActivos = new Set<string>();
      catalogo.forEach((c) => { if (permisos[c.clave]?.habilitado) conActivos.add(c.modulo); });
      setAbiertos(conActivos);
    }
  }, [loadingPermisos, empleado.id]);

  async function toggle(clave: string, habilitado: boolean, vigenteHasta: string | null) {
    setGuardando(clave);
    const { error } = await supabase.rpc("otorgar_permiso", {
      p_usuario_id: empleado.id, p_clave: clave, p_habilitado: habilitado, p_vigente_hasta: vigenteHasta,
    });
    if (!error) {
      setPermisos((prev) => ({
        ...prev,
        [clave]: { permiso_clave: clave, habilitado, vigente_hasta: vigenteHasta, origen: "manual", otorgado_por: null, otorgado_en: new Date().toISOString() },
      }));
      onPermisosCambiados();
    } else {
      setAviso({ texto: error.message, error: true });
    }
    setGuardando(null);
  }

  async function aplicarPlantillas() {
    if (plantillasAplicar.length === 0) return;
    setAplicandoPlantilla(true);
    const { error } = await supabase.rpc("aplicar_plantilla_usuario", { p_usuario_id: empleado.id, p_roles: plantillasAplicar });
    if (!error) {
      setAviso({ texto: `Plantilla${plantillasAplicar.length > 1 ? "s" : ""} aplicada${plantillasAplicar.length > 1 ? "s" : ""}. Se sumaron los permisos correspondientes sin apagar ningún ajuste manual existente.` });
      await cargarPermisos();
      onPermisosCambiados();
      setPlantillasAplicar([]);
    } else {
      setAviso({ texto: error.message, error: true });
    }
    setAplicandoPlantilla(false);
  }

  async function resetearPassword() {
    if (nuevaPassword.length < 8) { setAviso({ texto: "La contraseña debe tener al menos 8 caracteres.", error: true }); return; }
    const res = await invocar("resetear_password", { profile_id: empleado.id, nueva_password: nuevaPassword });
    if (res.ok) { setAviso({ texto: `Contraseña restablecida: ${nuevaPassword}` }); setNuevaPassword(""); }
    else setAviso({ texto: res.motivo || "No se pudo resetear la contraseña.", error: true });
  }

  async function cambiarEstado(activo: boolean) {
    const res = await invocar("cambiar_estado", { profile_id: empleado.id, activo });
    if (res.ok) { setAviso({ texto: activo ? "Usuario reactivado." : "Acceso desactivado." }); onEstadoCambiado(); }
    else setAviso({ texto: res.motivo || "No se pudo cambiar el estado.", error: true });
  }

  if (esSuperusuario) {
    return (
      <div className="card text-sm text-gray-500">
        {ROLE_LABEL[empleado.role as keyof typeof ROLE_LABEL]} tiene acceso total automático por rol — no es un
        permiso delegable ni editable desde este panel, para evitar quedarse sin acceso al propio sistema por error.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div>
            <h3 className="text-base font-semibold text-navy">{empleado.nombre}</h3>
            <p className="text-xs text-gray-400">{empleado.email} · {ROLE_LABEL[empleado.role as keyof typeof ROLE_LABEL]}</p>
          </div>
          <span className={`badge ${empleado.activo === false ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"}`}>
            {empleado.activo === false ? "Suspendido" : "Activo"}
          </span>
        </div>

        {aviso && <p className={`text-sm rounded-md px-3 py-2 border mb-3 ${aviso.error ? "text-red-700 bg-red-50 border-red-200" : "text-green-700 bg-green-50 border-green-200"}`}>{aviso.texto}</p>}

        {empleado.role === "cajero" && (
          <div className="flex items-center gap-2 mb-3">
            <label className="text-xs text-gray-500 shrink-0">Caja asignada (solo ve/opera esta caja):</label>
            <select className="input max-w-xs text-sm" value={empleado.caja_nombre_asignada || ""} onChange={(e) => onCajaAsignada(e.target.value || null)}>
              <option value="">Sin asignar (no verá ninguna caja)</option>
              {cajasDisponibles.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-center">
          <input className="input text-sm max-w-[220px]" placeholder="Nueva contraseña (mín. 8)" value={nuevaPassword} onChange={(e) => setNuevaPassword(e.target.value)} minLength={8} />
          <button className="btn-secondary text-xs" onClick={resetearPassword}>Restablecer contraseña</button>
          {empleado.activo === false ? (
            <button className="btn-primary text-xs" onClick={() => cambiarEstado(true)}>Reactivar acceso</button>
          ) : (
            <button className="bg-red-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-red-700 transition-colors" onClick={() => cambiarEstado(false)}>
              Suspender acceso
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-navy mb-1">Cobertura temporal (vacaciones / licencias)</h3>
        <p className="text-xs text-gray-400 mb-3">
          Mientras dure el rango, el reemplazante ve la cartera de clientes, hoja de ruta y cobros de {empleado.nombre.split(" ")[0]}
          {" "}además de la propia — no es un permiso de función, es alcance de datos. Se revierte solo al vencer.
        </p>
        {avisoCobertura && <p className={`text-sm rounded-md px-3 py-2 border mb-3 ${avisoCobertura.error ? "text-red-700 bg-red-50 border-red-200" : "text-green-700 bg-green-50 border-green-200"}`}>{avisoCobertura.texto}</p>}
        <form onSubmit={crearCobertura} className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          <select className="input text-sm col-span-2" value={nuevaCobertura.usuario_cubre} onChange={(e) => setNuevaCobertura({ ...nuevaCobertura, usuario_cubre: e.target.value })} required>
            <option value="">Reemplazante…</option>
            {rows.filter((r) => r.id !== empleado.id && !["dueno", "administrador", "master"].includes(r.role) && r.activo !== false).map((r) => (
              <option key={r.id} value={r.id}>{r.nombre} ({ROLE_LABEL[r.role as keyof typeof ROLE_LABEL]})</option>
            ))}
          </select>
          <input className="input text-sm" type="date" value={nuevaCobertura.desde} onChange={(e) => setNuevaCobertura({ ...nuevaCobertura, desde: e.target.value })} required title="Desde" />
          <input className="input text-sm" type="date" value={nuevaCobertura.hasta} onChange={(e) => setNuevaCobertura({ ...nuevaCobertura, hasta: e.target.value })} required title="Hasta" />
          <input className="input text-sm col-span-2 md:col-span-3" placeholder="Motivo (ej. Vacaciones)" value={nuevaCobertura.motivo} onChange={(e) => setNuevaCobertura({ ...nuevaCobertura, motivo: e.target.value })} />
          <button className="btn-secondary text-xs" disabled={creandoCobertura}>{creandoCobertura ? "Asignando…" : "Asignar cobertura"}</button>
        </form>
        {!loadingCoberturas && coberturas.length > 0 && (
          <div className="space-y-1.5">
            {coberturas.map((c) => {
              const vigente = new Date(c.hasta) >= new Date(new Date().toDateString());
              const esCubierto = c.usuario_cubierto === empleado.id;
              return (
                <div key={c.id} className="flex items-center justify-between gap-2 text-xs bg-gray-50 rounded-md px-3 py-2">
                  <span>
                    {esCubierto ? "Cubierto por " : "Cubre a "}
                    <strong>{nombrePorId[esCubierto ? c.usuario_cubre : c.usuario_cubierto] || "—"}</strong>
                    {" "}· {new Date(c.desde).toLocaleDateString("es-AR")} → {new Date(c.hasta).toLocaleDateString("es-AR")}
                    {c.motivo && ` · ${c.motivo}`}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`badge ${vigente ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{vigente ? "Vigente" : "Finalizada"}</span>
                    {vigente && esCubierto && (
                      <button className="text-danger" onClick={() => finalizarCoberturaAhora(c.id)}>Finalizar ahora</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="text-xs text-gray-500 shrink-0">Aplicar plantilla de rol (suma permisos, no apaga ajustes manuales):</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {ROLES_CREABLES.filter((r) => rolDefaults[r]).map((r) => {
            const activo = plantillasAplicar.includes(r);
            return (
              <button
                key={r} type="button"
                onClick={() => setPlantillasAplicar((prev) => activo ? prev.filter((x) => x !== r) : [...prev, r])}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${activo ? "bg-navy text-white border-navy" : "bg-white text-gray-600 border-gray-300 hover:border-navy"}`}
              >
                {ROLE_LABEL[r]}
              </button>
            );
          })}
        </div>
        <button className="btn-secondary text-xs" disabled={plantillasAplicar.length === 0 || aplicandoPlantilla} onClick={aplicarPlantillas}>
          {aplicandoPlantilla ? "Aplicando…" : "Aplicar plantilla(s) seleccionada(s)"}
        </button>
      </div>

      <div className="card">
        <input className="input text-sm mb-3" placeholder="Buscar permiso… (ej. cobrar, editar asientos, exportar)" value={busquedaPermiso} onChange={(e) => setBusquedaPermiso(e.target.value)} />
        {loadingPermisos ? <p className="text-gray-400 text-sm">Cargando checklist…</p> : (
          <div className="space-y-2">
            {modulos.map(({ modulo, submodulos }) => (
              <ModuloAccordion
                key={modulo}
                modulo={modulo}
                submodulos={submodulos}
                permisos={permisos}
                defaults={defaults}
                abierto={abiertos.has(modulo)}
                onToggleAbierto={() => setAbiertos((prev) => { const n = new Set(prev); n.has(modulo) ? n.delete(modulo) : n.add(modulo); return n; })}
                onCambiar={toggle}
                guardando={guardando}
                nombrePorId={nombrePorId}
              />
            ))}
            {modulos.length === 0 && <p className="text-sm text-gray-400">Sin coincidencias.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Acordeón de un módulo — encabezado con checkbox de tres estados + contador
// ============================================================================
function ModuloAccordion({
  modulo, submodulos, permisos, defaults, abierto, onToggleAbierto, onCambiar, guardando, nombrePorId,
}: {
  modulo: string; submodulos: Record<string, CatalogoItem[]>; permisos: Record<string, PermisoRow>; defaults: Set<string>;
  abierto: boolean; onToggleAbierto: () => void; onCambiar: (clave: string, habilitado: boolean, vigenteHasta: string | null) => void;
  guardando: string | null; nombrePorId: Record<string, string>;
}) {
  const items = Object.values(submodulos).flat();
  const activos = items.filter((i) => permisos[i.clave]?.habilitado).length;
  const checkboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = activos > 0 && activos < items.length;
  }, [activos, items.length]);

  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 cursor-pointer" onClick={onToggleAbierto}>
        <input
          ref={checkboxRef} type="checkbox" checked={activos === items.length && items.length > 0}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { e.stopPropagation(); items.forEach((i) => onCambiar(i.clave, e.target.checked, null)); }}
        />
        <span className="text-sm font-semibold text-navy flex-1">{MODULO_LABEL[modulo] || modulo}</span>
        <span className="text-[11px] text-gray-400">{activos} de {items.length} activos</span>
        <span className="text-gray-400 text-xs">{abierto ? "▲" : "▼"}</span>
      </div>
      {abierto && (
        <div className="p-3 space-y-3">
          {Object.entries(submodulos).map(([sub, subItems]) => (
            <div key={sub}>
              <h4 className="text-[11px] uppercase tracking-wide text-gray-400 mb-1.5">{sub}</h4>
              <div className="space-y-1.5">
                {subItems.map((item) => {
                  const p = permisos[item.clave];
                  const activo = !!p?.habilitado;
                  const vencido = p?.vigente_hasta && new Date(p.vigente_hasta) < new Date();
                  const efectivo = activo && !vencido;
                  return (
                    <div key={item.clave} className={`flex items-start gap-2 py-1 ${guardando === item.clave ? "opacity-60" : ""}`}>
                      {p?.origen === "manual" && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" title="Ajustado a mano — difiere de la plantilla del rol" />}
                      {p?.origen !== "manual" && <span className="w-1.5 h-1.5 shrink-0" />}
                      <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                        <input
                          type="checkbox" className="sr-only peer" checked={efectivo}
                          disabled={guardando === item.clave}
                          onChange={(e) => onCambiar(item.clave, e.target.checked, p?.vigente_hasta && !vencido ? p.vigente_hasta : null)}
                        />
                        <div className="w-8 h-4 bg-gray-200 rounded-full peer peer-checked:bg-navy transition-colors" />
                        <div className="absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                      </label>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm text-gray-700">{item.etiqueta}</span>
                          {item.descripcion && <span className="text-gray-300 text-xs cursor-help" title={item.descripcion}>ⓘ</span>}
                          {!CLAVES_CON_EFECTO_HOY.has(item.clave) && (
                            <span className="text-[10px] text-gray-400 italic">sin efecto en el menú todavía</span>
                          )}
                          {vencido && <span className="text-[10px] text-red-400">(cobertura vencida)</span>}
                        </div>
                        {activo && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] text-gray-400">Vence:</span>
                            <input
                              type="date" className="text-[11px] border border-gray-200 rounded px-1 py-0.5"
                              value={p?.vigente_hasta ? p.vigente_hasta.slice(0, 10) : ""}
                              onChange={(e) => onCambiar(item.clave, true, e.target.value ? new Date(e.target.value + "T23:59:59").toISOString() : null)}
                            />
                            <span className="text-[10px] text-gray-300">(vacío = permanente)</span>
                          </div>
                        )}
                        {p?.origen === "manual" && p.otorgado_en && (
                          <p className="text-[10px] text-gray-300 mt-0.5">
                            Último cambio: {p.otorgado_por && nombrePorId[p.otorgado_por] ? nombrePorId[p.otorgado_por] : "—"} · {fmtFecha(p.otorgado_en)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
