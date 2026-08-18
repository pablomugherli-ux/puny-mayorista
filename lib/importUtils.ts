// ============================================================================
// Helpers compartidos de importación de Excel/CSV (extracto bancario, listas
// de precios, y cualquier futura importación tabular). Estaban duplicados
// inline en cada página — se centralizan acá para no repetir lógica y para
// poder testearlos (ver lib/importUtils.test.ts).
// ============================================================================

/** Busca en `headers` la primera columna que matchee alguno de `candidatos`,
 * normalizando mayúsculas/tildes/espacios. Devuelve el índice, o -1 si ninguna matchea. */
export function buscarColumna(headers: string[], candidatos: string[]): number {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const hs = headers.map(norm);
  for (const c of candidatos) {
    const idx = hs.indexOf(norm(c));
    if (idx !== -1) return idx;
  }
  return -1;
}

/** Parsea una fecha en formato dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, objeto Date
 * (xlsx con cellDates), o cualquier string que Date() pueda interpretar.
 * Devuelve "YYYY-MM-DD" o null si no se pudo interpretar. */
export function parsearFecha(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    let [, d, m, y] = dmy;
    if (y.length === 2) y = "20" + y;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Parsea un número en formato argentino ("1.234,56" -> 1234.56). Devuelve 0
 * si está vacío o no se pudo interpretar — para campos donde "sin dato" y
 * "cero" son equivalentes (ej. importe de un extracto bancario). */
export function parsearNumero(v: any): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** Igual que parsearNumero, pero devuelve null en vez de 0 cuando está vacío
 * o no se pudo interpretar — para campos donde hay que distinguir "no vino
 * en el archivo" de "vino con valor cero" (ej. costo, precio, % de ganancia). */
export function parsearNumeroOpcional(v: any): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
