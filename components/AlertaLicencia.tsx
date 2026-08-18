"use client";
import { useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { alertaVencimiento, alertaAumento, fmtMoneda, fmtFechaLarga } from "@/lib/licencia";

// Alerta automática de licenciamiento para el Dueño de la distribuidora:
//  - Vencimiento: visible desde el último día del mes previo al vencimiento
//    hasta la fecha exacta de vencimiento, con importe y fecha.
//  - Aumento futuro: visible desde 30 días antes de la fecha de vigencia de
//    un nuevo importe, hasta esa fecha.
// Solo se muestra al rol "dueno" — es quien administra el pago del servicio.
export default function AlertaLicencia() {
  const { profile, tenant } = useAuth();
  const [cerradas, setCerradas] = useState<Record<string, boolean>>({});

  if (!profile || profile.role !== "dueno" || !tenant) return null;

  const venc = alertaVencimiento(tenant);
  const aum = alertaAumento(tenant);

  const mostrarVenc = venc?.activa && !cerradas.venc;
  const mostrarAum = aum?.activa && !cerradas.aum;

  if (!mostrarVenc && !mostrarAum) return null;

  return (
    <div className="mb-4 space-y-2">
      {mostrarVenc && venc && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="text-sm text-amber-800">
            <span className="font-semibold">Vencimiento del servicio: </span>
            vence el <span className="font-semibold">{fmtFechaLarga(venc.fecha)}</span> por un importe de{" "}
            <span className="font-semibold">{fmtMoneda(venc.monto, venc.moneda)}</span>. Coordiná el pago para evitar
            interrupciones en el acceso.
          </div>
          <button
            className="text-amber-700/70 hover:text-amber-900 text-xs shrink-0"
            onClick={() => setCerradas((c) => ({ ...c, venc: true }))}
          >
            Cerrar
          </button>
        </div>
      )}
      {mostrarAum && aum && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-blue-300 bg-blue-50 px-4 py-3">
          <div className="text-sm text-blue-800">
            <span className="font-semibold">Aviso de aumento: </span>
            a partir del <span className="font-semibold">{fmtFechaLarga(aum.vigencia)}</span> el importe del servicio
            pasa a ser <span className="font-semibold">{fmtMoneda(aum.monto, aum.moneda)}</span>.
          </div>
          <button
            className="text-blue-700/70 hover:text-blue-900 text-xs shrink-0"
            onClick={() => setCerradas((c) => ({ ...c, aum: true }))}
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
}
