/**
 * Utilidades estadísticas compartidas — sin dependencias externas.
 * Todas las proyecciones son tendencias lineales simples (mínimos cuadrados),
 * pensadas como orientación comercial, no como pronóstico certero.
 */

export function regresionLineal(puntos: number[]) {
  const n = puntos.length;
  if (n < 2) return null;
  const xs = puntos.map((_, i) => i);
  const mediaX = xs.reduce((a, b) => a + b, 0) / n;
  const mediaY = puntos.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - mediaX) * (puntos[i] - mediaY), 0);
  const den = xs.reduce((s, x) => s + (x - mediaX) ** 2, 0);
  if (den === 0) return null;
  const pendiente = num / den;
  const ordenada = mediaY - pendiente * mediaX;
  const proyeccion = pendiente * n + ordenada;
  return { proyeccion: Math.max(0, proyeccion), pendiente };
}

/** Proyección de cierre de mes en base al ritmo transcurrido (run-rate simple). */
export function proyeccionRunRate(acumuladoHastaHoy: number, diaDelMes: number, diasDelMes: number) {
  if (diaDelMes <= 0) return acumuladoHastaHoy;
  const ritmoDiario = acumuladoHastaHoy / diaDelMes;
  return ritmoDiario * diasDelMes;
}

export function diasEnMes(anio: number, mes0: number) {
  return new Date(anio, mes0 + 1, 0).getDate();
}

export function periodoActual() {
  const hoy = new Date();
  return { anio: hoy.getFullYear(), mes0: hoy.getMonth(), diaDelMes: hoy.getDate(), diasDelMes: diasEnMes(hoy.getFullYear(), hoy.getMonth()) };
}

export function periodoStr(anio: number, mes0: number) {
  return `${anio}-${String(mes0 + 1).padStart(2, "0")}-01`;
}
