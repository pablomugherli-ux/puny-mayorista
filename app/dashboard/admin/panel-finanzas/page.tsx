"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";

const Finanzas = dynamic(() => import("../finanzas/page"), { ssr: false });
const Contabilidad = dynamic(() => import("../contabilidad/page"), { ssr: false });
const CashFlow = dynamic(() => import("../cashflow/page"), { ssr: false });
const Tesoreria = dynamic(() => import("../tesoreria/page"), { ssr: false });

// Reformulación de navegación (agosto 2026): "Finanzas & Stock" se separó en
// dos pestañas del Ribbon — acá solo queda la plata (bancos, caja, IVA,
// contabilidad, proyección). El inventario pasó a su propia pestaña "Stock"
// (panel-stock). "Caja Diaria" y "Libro de IVA" son la misma página que
// Personal (Tesorería), restringida a esas dos solapas con `soloTabs`.
// Ver PUNY_Propuesta_Reformulacion_Navegacion.docx, sección 6.
const TABS = [
  { key: "finanzas", label: "Bancos/Proveedores/Cartera", Comp: Finanzas },
  { key: "caja", label: "Caja Diaria", Comp: () => <Tesoreria soloTabs={["caja"]} initialTab="caja" /> },
  { key: "iva", label: "Libro de IVA", Comp: () => <Tesoreria soloTabs={["iva"]} initialTab="iva" /> },
  { key: "contabilidad", label: "Contabilidad", Comp: Contabilidad },
  { key: "cashflow", label: "Cash Flow Proyectado", Comp: CashFlow },
];

// El tab activo se lee de la URL con useSearchParams (reactivo a cambios de
// query string), no de estado local + efecto de una sola corrida — ver
// components/Ribbon.tsx para el detalle del bug que esto corrige.
function PanelFinanzasInner() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  const activa = TABS.find((t) => t.key === tab) || TABS[0];
  return (
    <div>
      <h1 className="text-xl font-bold text-navy mb-1">Finanzas</h1>
      <p className="text-sm text-gray-500 mb-4">Bancos, proveedores, cartera de valores, caja diaria, IVA, contabilidad y proyección de caja.</p>
      {/* La fila de botones para cambiar de solapa se retiró de acá (agosto 2026):
          duplicaba la cinta de accesos directos del Ribbon (nivel 2), que ya navega
          a estos mismos destinos con su propio resaltado de "activo" — tener las dos
          filas obligaba a clickear dos veces lo mismo para que se notara la selección.
          El Ribbon es sticky, así que sigue disponible en todo momento. */}
      {activa && <activa.Comp />}
    </div>
  );
}

export default function PanelFinanzas() {
  return (
    <Suspense fallback={null}>
      <PanelFinanzasInner />
    </Suspense>
  );
}
