// ============================================================================
// Lógica de cálculo de vencimiento y alertas del Módulo de Licenciamiento.
// ----------------------------------------------------------------------------
// Reglas (definidas por el negocio):
//  1) Alerta de vencimiento: se enciende el ÚLTIMO DÍA del mes previo al mes
//     en que cae el próximo vencimiento, y permanece visible hasta la fecha
//     exacta de vencimiento (inclusive). Muestra la fecha exacta y el importe.
//     - Abono mensual: el vencimiento es "dia_vencimiento_mensual" del mes que
//       corresponda (el actual, si todavía no pasó; si no, el que sigue).
//     - Pago único: el vencimiento es la fecha fija "plan_vencimiento".
//  2) Alerta de aumento futuro: se enciende 30 días antes de
//     "proximo_aumento_vigencia" y permanece visible hasta esa fecha
//     (inclusive). Muestra el nuevo importe y la fecha en que entra en vigencia.
// Todas las comparaciones son por FECHA (sin hora), en la zona horaria local
// del navegador del usuario — suficientemente preciso para este caso de uso.
// ============================================================================

import type { Tenant } from "./types";

function soloFecha(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseFecha(s: string): Date {
  // Los campos vienen como "YYYY-MM-DD" (input type=date) o timestamptz.
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function ultimoDiaDelMesAnterior(fecha: Date): Date {
  // Día 0 del mes de "fecha" = último día del mes anterior.
  return new Date(fecha.getFullYear(), fecha.getMonth(), 0);
}

function sumarDias(fecha: Date, dias: number): Date {
  const r = new Date(fecha);
  r.setDate(r.getDate() + dias);
  return r;
}

/** Próxima fecha de vencimiento del servicio, según el esquema de cobro. Null si no hay datos suficientes. */
export function calcularVencimiento(tenant: Tenant, hoy: Date = new Date()): Date | null {
  const h = soloFecha(hoy);

  if (tenant.esquema_cobro === "pago_unico") {
    if (!tenant.plan_vencimiento) return null;
    return parseFecha(tenant.plan_vencimiento);
  }

  // abono_mensual
  if (!tenant.dia_vencimiento_mensual) return null;
  const dia = tenant.dia_vencimiento_mensual;
  let candidato = new Date(h.getFullYear(), h.getMonth(), dia);
  if (candidato < h) {
    candidato = new Date(h.getFullYear(), h.getMonth() + 1, dia);
  }
  return candidato;
}

export type AlertaVencimiento = {
  activa: boolean;
  fecha: Date;
  monto: number;
  moneda: string;
};

/** Alerta de vencimiento: activa desde el último día del mes previo al vencimiento hasta el vencimiento inclusive. */
export function alertaVencimiento(tenant: Tenant, hoy: Date = new Date()): AlertaVencimiento | null {
  const vencimiento = calcularVencimiento(tenant, hoy);
  if (!vencimiento) return null;

  const h = soloFecha(hoy);
  const inicioAviso = ultimoDiaDelMesAnterior(vencimiento);
  const activa = h >= inicioAviso && h <= vencimiento;

  return { activa, fecha: vencimiento, monto: tenant.monto_licencia, moneda: tenant.moneda };
}

export type AlertaAumento = {
  activa: boolean;
  monto: number;
  vigencia: Date;
  moneda: string;
};

/** Alerta de aumento futuro: activa desde 30 días antes de la vigencia hasta la vigencia inclusive. */
export function alertaAumento(tenant: Tenant, hoy: Date = new Date()): AlertaAumento | null {
  if (!tenant.proximo_aumento_vigencia || tenant.proximo_aumento_monto == null) return null;

  const h = soloFecha(hoy);
  const vigencia = parseFecha(tenant.proximo_aumento_vigencia);
  const inicioAviso = sumarDias(vigencia, -30);
  const activa = h >= inicioAviso && h <= vigencia;

  return { activa, monto: tenant.proximo_aumento_monto, vigencia, moneda: tenant.moneda };
}

export function fmtMoneda(monto: number, moneda: string): string {
  try {
    return new Intl.NumberFormat("es-AR", { style: "currency", currency: moneda || "ARS" }).format(monto);
  } catch {
    return `${moneda} ${monto.toFixed(2)}`;
  }
}

export function fmtFechaLarga(d: Date): string {
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
}
