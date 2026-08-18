"use client";
import ProgressRing from "./ProgressRing";
import AnimatedNumber from "./AnimatedNumber";

const fmtMoneda = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const fmtNum = (n: number) => Math.round(n).toLocaleString("es-AR");

/**
 * Tarjeta de objetivo comercial: meta, alcanzado, resta y % de cumplimiento,
 * con anillo de progreso animado. `unidad` = "moneda" | "numero".
 */
export default function GoalCard({
  titulo, alcanzado, meta, unidad = "moneda", proyeccion,
}: {
  titulo: string; alcanzado: number; meta: number; unidad?: "moneda" | "numero"; proyeccion?: number | null;
}) {
  const pct = meta > 0 ? (alcanzado / meta) * 100 : 0;
  const resta = Math.max(0, meta - alcanzado);
  const fmt = unidad === "moneda" ? fmtMoneda : fmtNum;
  const cumplido = alcanzado >= meta && meta > 0;

  return (
    <div className="card flex items-center gap-4">
      <ProgressRing pct={pct} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-navy truncate">{titulo}</h4>
          {cumplido && <span className="badge bg-green-100 text-green-700 shrink-0">✓ Objetivo cumplido</span>}
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-gray-400">Alcanzado</div>
            <div className="font-bold text-navy"><AnimatedNumber value={alcanzado} format={fmt} /></div>
          </div>
          <div>
            <div className="text-gray-400">Objetivo</div>
            <div className="font-semibold text-gray-700">{fmt(meta)}</div>
          </div>
          <div>
            <div className="text-gray-400">Resta</div>
            <div className={`font-semibold ${cumplido ? "text-green-700" : "text-amber-700"}`}>{cumplido ? "—" : fmt(resta)}</div>
          </div>
        </div>
        {proyeccion != null && (
          <div className="text-[11px] text-gray-400 mt-2">
            Proyección de cierre (ritmo actual): <span className="font-semibold text-gray-600">{fmt(proyeccion)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
