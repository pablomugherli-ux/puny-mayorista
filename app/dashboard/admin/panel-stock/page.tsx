"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";

const Stock = dynamic(() => import("../stock/page"), { ssr: false });
const Importaciones = dynamic(() => import("../importaciones/page"), { ssr: false });
const Logistica = dynamic(() => import("../logistica/page"), { ssr: false });

// Reformulación de navegación (agosto 2026): mitad "mercadería" de lo que
// antes era "Finanzas & Stock" — separado porque plata e inventario son dos
// preguntas de negocio distintas. Ver PUNY_Propuesta_Reformulacion_Navegacion.docx.
const TABS = [
  { key: "compras", label: "Compras", Comp: () => <Stock soloTabs={["compras"]} initialTab="compras" /> },
  { key: "depositos", label: "Depósitos", Comp: () => <Stock soloTabs={["depositos"]} initialTab="depositos" /> },
  { key: "importaciones", label: "Importaciones", Comp: Importaciones },
  { key: "logistica", label: "Logística (todas las rutas)", Comp: Logistica },
];

// El tab activo se lee de la URL con useSearchParams (reactivo a cambios de
// query string), no de estado local + efecto de una sola corrida — ver
// components/Ribbon.tsx para el detalle del bug que esto corrige.
function PanelStockInner() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  const activa = TABS.find((t) => t.key === tab) || TABS[0];
  return (
    <div>
      <h1 className="text-xl font-bold text-navy mb-1">Stock</h1>
      <p className="text-sm text-gray-500 mb-4">Stock mínimo, órdenes de compra, depósitos, importaciones y logística de reparto.</p>
      {/* La fila de botones para cambiar de solapa se retiró de acá (agosto 2026):
          duplicaba la cinta de accesos directos del Ribbon (nivel 2), que ya navega
          a estos mismos destinos con su propio resaltado de "activo" — tener las dos
          filas obligaba a clickear dos veces lo mismo para que se notara la selección.
          El Ribbon es sticky, así que sigue disponible en todo momento. */}
      {activa && <activa.Comp />}
    </div>
  );
}

export default function PanelStock() {
  return (
    <Suspense fallback={null}>
      <PanelStockInner />
    </Suspense>
  );
}
