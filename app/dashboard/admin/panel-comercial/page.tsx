"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";

const Comisiones = dynamic(() => import("../comisiones/page"), { ssr: false });
const Objetivos = dynamic(() => import("../objetivos/page"), { ssr: false });
const Ofertas = dynamic(() => import("../ofertas/page"), { ssr: false });
const Cobradores = dynamic(() => import("../cobradores/page"), { ssr: false });

// Reformulación de navegación (agosto 2026): antes convivía dentro de
// "Configuración" junto con datos técnicos de la empresa (CUIT, zonas) que
// se cargan una sola vez. Esto en cambio son decisiones comerciales del día
// a día — se separa para que tenga su propia visibilidad.
// Ver PUNY_Propuesta_Reformulacion_Navegacion.docx, sección 6.
const TABS = [
  { key: "comisiones", label: "Esquemas de Comisión", Comp: Comisiones },
  { key: "objetivos", label: "Objetivos Comerciales", Comp: Objetivos },
  { key: "ofertas", label: "Ofertas vigentes", Comp: Ofertas },
  { key: "cobradores", label: "Vincular Cobradores", Comp: Cobradores },
];

// El tab activo se lee de la URL con useSearchParams (reactivo a cambios de
// query string), no de estado local + efecto de una sola corrida — ver
// components/Ribbon.tsx para el detalle del bug que esto corrige.
function PanelComercialInner() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  const activa = TABS.find((t) => t.key === tab) || TABS[0];
  return (
    <div>
      <h1 className="text-xl font-bold text-navy mb-1">Comercial</h1>
      <p className="text-sm text-gray-500 mb-4">Comisiones del equipo de ventas, objetivos comerciales, ofertas vigentes y vínculos de cobranza.</p>
      {/* La fila de botones para cambiar de solapa se retiró de acá (agosto 2026):
          duplicaba la cinta de accesos directos del Ribbon (nivel 2), que ya navega
          a estos mismos destinos con su propio resaltado de "activo" — tener las dos
          filas obligaba a clickear dos veces lo mismo para que se notara la selección.
          El Ribbon es sticky, así que sigue disponible en todo momento. */}
      {activa && <activa.Comp />}
    </div>
  );
}

export default function PanelComercial() {
  return (
    <Suspense fallback={null}>
      <PanelComercialInner />
    </Suspense>
  );
}
