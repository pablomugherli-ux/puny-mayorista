"use client";
// Motor de sincronización offline.
// ----------------------------------------------------------------------------
// Cómo se usa desde una pantalla (ver ejemplo real en
// app/dashboard/campo/vendedor/nuevo-pedido/page.tsx):
//
//   const id = crypto.randomUUID();                    // el cliente genera el id
//   const fecha = new Date().toISOString();             // y el timestamp real
//   const ok = await ejecutarOEncolar({
//     tabla: "pedidos", tipo: "insert",
//     payload: { id, fecha, ...resto },
//     descripcion: `Pedido a ${cliente.nombre}`,
//   });
//   // "ok" es true tanto si se mandó directo como si quedó en cola: la UI
//   // sigue su flujo normal (limpiar formulario, mostrar "Pedido cargado")
//   // en los dos casos — la diferencia solo se nota en el banner de arriba.
//
// Reglas duras:
//  - El id SIEMPRE lo genera el cliente (crypto.randomUUID()), nunca se deja
//    que Supabase lo genere con gen_random_uuid(). Así, si la fila que crea
//    el pedido se sube bien pero después se corta la luz antes de confirmar,
//    un reintento no duplica el pedido (Postgres rechaza el id repetido y
//    encuertaOEncolar lo trata como éxito).
//  - Cada fila offline manda su propio "fecha"/"creado_en_cliente" con el
//    momento real de la acción — nunca se deja que la columna use su default
//    now() de la base, porque ese default reflejaría el momento de la
//    sincronización, no el de la venta/cobro/entrega real.
//  - La cola se procesa en orden de creación (FIFO): si una pantalla encola
//    primero el pedido y después sus ítems, se suben en ese orden y la
//    referencia (pedido_id) ya existe para cuando le toca al ítem.
// ----------------------------------------------------------------------------
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { offlineDb, type OperacionPendiente } from "./offlineDb";

export function estaOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

// Un error se considera "de red" (candidato a cola) y no "de datos" (fallo
// real que no tiene sentido reintentar) mirando el tipo de excepción que
// tira fetch/supabase-js cuando no hay conexión.
function esErrorDeRed(e: any): boolean {
  if (!estaOnline()) return true;
  const msg = String(e?.message || e || "").toLowerCase();
  return msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("network request failed") || msg.includes("load failed");
}

async function ejecutarOperacion(op: OperacionPendiente): Promise<{ ok: boolean; error?: string }> {
  try {
    if (op.tipo === "insert") {
      const { error } = await supabase.from(op.tabla).insert(op.payload);
      if (error && !esErrorDuplicado(error)) throw error;
    } else if (op.tipo === "update") {
      let q = supabase.from(op.tabla).update(op.payload);
      for (const [col, val] of Object.entries(op.filtro || {})) q = q.eq(col, val as any);
      const { error } = await q;
      if (error) throw error;
    } else if (op.tipo === "rpc") {
      const { error } = await supabase.rpc(op.payload.fn, op.payload.args);
      if (error) throw error;
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function esErrorDuplicado(error: any): boolean {
  // 23505 = unique_violation en Postgres — significa que este id ya se
  // había subido en un intento anterior. Se trata como éxito (idempotencia).
  return error?.code === "23505";
}

/**
 * Intenta ejecutar la operación ahora mismo. Si no hay conexión, o si falla
 * por un error de red, la deja en la cola local para reintentar sola más
 * tarde. Devuelve siempre { ok: true } salvo un error real de datos (ej. RLS,
 * validación) mientras SÍ había conexión — en ese caso el llamador debe
 * mostrar el error, porque reintentarlo no lo va a arreglar.
 */
export async function ejecutarOEncolar(args: {
  tabla: string;
  tipo: "insert" | "update" | "rpc";
  payload: any;
  filtro?: any;
  descripcion: string;
  tenantId?: string | null;
}): Promise<{ ok: boolean; encolado: boolean; error?: string }> {
  // El payload puede ser una sola fila o un array de filas (ej. los ítems de
  // un pedido). Para arrays, cada fila ya tiene que traer su propio "id"
  // puesto por el llamador (evita duplicados en un reintento); para una sola
  // fila, si no trae id se le genera acá.
  const esArray = Array.isArray(args.payload);
  const payload = args.tipo === "insert" && !esArray && !args.payload?.id
    ? { ...args.payload, id: crypto.randomUUID() }
    : args.payload;
  const outboxId = crypto.randomUUID(); // clave de ESTA operación en la cola, no de las filas que contiene
  const creadoEn = new Date().toISOString();
  const opBase: OperacionPendiente = {
    id: outboxId, tabla: args.tabla, tipo: args.tipo, payload, filtro: args.filtro,
    creadoEn, intentos: 0, tenantId: args.tenantId ?? null, descripcion: args.descripcion,
  };

  if (estaOnline()) {
    const res = await ejecutarOperacion(opBase);
    if (res.ok) return { ok: true, encolado: false };
    if (!esErrorDeRed(res.error)) return { ok: false, encolado: false, error: res.error };
    // era de red aunque navigator.onLine decía que sí había conexión (wifi con portal cautivo, etc.) — encolar igual
  }

  if (!offlineDb) return { ok: false, encolado: false, error: "No disponible sin navegador" };
  await offlineDb.outbox.put(opBase);
  notificarCambioCola();
  return { ok: true, encolado: true };
}

// Tablas que tienen la columna de auditoría "sincronizado_en" (migraciones 82
// y 83) — se completa sola al subir, para poder distinguir "cuándo pasó de
// verdad" ("fecha", siempre puesta por el cliente) de "cuándo se sincronizó"
// (esto). Best-effort: si falla (tabla sin la columna, red cortada de nuevo a
// mitad de camino, etc.) no afecta el resultado de la operación ya subida.
const TABLAS_CON_SINCRONIZADO_EN = new Set([
  "pedidos", "cobros", "comprobantes", "checkins_vigilancia", "novedades_vigilancia", "caja_movimientos", "entregas", "visitas",
]);
async function marcarSincronizado(op: OperacionPendiente) {
  if (op.tipo !== "insert" || !TABLAS_CON_SINCRONIZADO_EN.has(op.tabla)) return;
  const filas = Array.isArray(op.payload) ? op.payload : [op.payload];
  const ids = filas.map((f: any) => f?.id).filter(Boolean);
  if (ids.length === 0) return;
  try {
    await supabase.from(op.tabla).update({ sincronizado_en: new Date().toISOString() }).in("id", ids);
  } catch {
    // no bloquea nada — es solo un dato de auditoría
  }
}

let sincronizando = false;
export async function procesarCola(): Promise<{ subidas: number; pendientes: number }> {
  if (!offlineDb || sincronizando || !estaOnline()) {
    return { subidas: 0, pendientes: (await offlineDb?.outbox.count()) || 0 };
  }
  sincronizando = true;
  let subidas = 0;
  try {
    const pendientes = await offlineDb.outbox.orderBy("creadoEn").toArray();
    for (const op of pendientes) {
      const res = await ejecutarOperacion(op);
      if (res.ok) {
        await offlineDb.outbox.delete(op.id);
        subidas++;
        marcarSincronizado(op); // fire-and-forget, no bloquea el resto de la cola
      } else if (esErrorDeRed(res.error)) {
        break; // se cortó la conexión de nuevo a mitad de la sincronización — frenar y esperar el próximo "online"
      } else {
        // error real de datos: lo dejamos registrado en la cola (visible para el usuario) en vez de reintentarlo infinito
        await offlineDb.outbox.update(op.id, { intentos: op.intentos + 1, ultimoError: res.error });
      }
    }
  } finally {
    sincronizando = false;
    notificarCambioCola();
  }
  return { subidas, pendientes: (await offlineDb.outbox.count()) || 0 };
}

// --- notificación simple para que el banner/hook se refresque solo -------
type Listener = () => void;
const listeners = new Set<Listener>();
function notificarCambioCola() {
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => { procesarCola(); });
  // Reintento periódico por si "online" no dispara bien (algunos navegadores móviles son poco confiables con ese evento)
  setInterval(() => { if (estaOnline()) procesarCola(); }, 30000);
}

/**
 * Envuelve una lectura de Supabase con caché local: si hay conexión, trae
 * los datos frescos y los deja guardados; si no hay conexión (o la lectura
 * falla), sirve la última copia que haya en el equipo. Se usa para los
 * catálogos que las pantallas de campo necesitan para poder armar un pedido/
 * cobro/entrega sin señal (productos, clientes, listas de precio, etc.) —
 * sin esto, la cola de escritura offline serviría de poco porque la pantalla
 * ni siquiera podría dibujar el formulario sin conexión.
 */
export async function leerConCache<T>(clave: string, consulta: () => PromiseLike<{ data: T | null; error: any }>): Promise<T | null> {
  if (estaOnline()) {
    try {
      const { data, error } = await consulta();
      if (!error && data != null) {
        await offlineDb?.cache.put({ clave, datos: data, actualizadoEn: new Date().toISOString() });
        return data;
      }
    } catch {
      // sigue abajo a leer de caché
    }
  }
  const entry = await offlineDb?.cache.get(clave);
  return entry ? (entry.datos as T) : null;
}

export function useEstadoOffline() {
  const [online, setOnline] = useState(true);
  const [pendientes, setPendientes] = useState(0);

  useEffect(() => {
    setOnline(estaOnline());
    const refrescarCola = () => { offlineDb?.outbox.count().then(setPendientes); };
    refrescarCola();
    listeners.add(refrescarCola);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    procesarCola();
    return () => {
      listeners.delete(refrescarCola);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return { online, pendientes };
}
