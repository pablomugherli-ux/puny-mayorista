"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";

const Tesoreria = dynamic(() => import("../tesoreria/page"), { ssr: false });

// Reformulación de navegación (agosto 2026): antes era una solapa más
// adentro de "Tesorería", que a su vez estaba adentro de "Finanzas & Stock"
// — 3 niveles para llegar a algo que ya es su propio módulo ("personal") en
// el catálogo de permisos. Pasa a tener jerarquía propia de primer nivel.
// Sigue siendo la misma página/tabla de permisos que Finanzas → Caja/IVA;
// `soloTabs` restringe qué solapas ofrece cada punto de entrada.
// Ver PUNY_Propuesta_Reformulacion_Navegacion.docx, sección 6.
const TABS = [
  { key: "legajos", label: "Legajos y SICOSS", Comp: () => <Tesoreria soloTabs={["legajos"]} initialTab="legajos" /> },
  { key: "sueldos", label: "Liquidación de Sueldos", Comp: () => <Tesoreria soloTabs={["sueldos"]} initialTab="sueldos" /> },
  { key: "licencias", label: "Vacaciones y Licencias", Comp: () => <Tesoreria soloTabs={["licencias"]} initialTab="licencias" /> },
  { key: "accesos", label: "Empleados y Accesos", Comp: () => <Tesoreria soloTabs={["accesos"]} initialTab="accesos" /> },
];

// El tab activo se lee de la URL con useSearchParams (reactivo a cambios de
// query string), no de estado local + efecto de una sola corrida — ver
// components/Ribbon.tsx para el detalle del bug que esto corrige.
function PanelPersonalInner() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  const activa = TABS.find((t) => t.key === tab) || TABS[0];
  return (
    <div>
      <h1 className="text-xl font-bold text-navy mb-1">Personal</h1>
      <p className="text-sm text-gray-500 mb-4">Legajos, liquidación de sueldos, vacaciones y licencias, y accesos de empleados.</p>
      {/* La fila de botones para cambiar de solapa se retiró de acá (agosto 2026):
          duplicaba la cinta de accesos directos del Ribbon (nivel 2), que ya navega
          a estos mismos destinos con su propio resaltado de "activo" — tener las dos
          filas obligaba a clickear dos veces lo mismo para que se notara la selección.
          El Ribbon es sticky, así que sigue disponible en todo momento. */}
      {activa && <activa.Comp />}
    </div>
  );
}

export default function PanelPersonal() {
  return (
    <Suspense fallback={null}>
      <PanelPersonalInner />
    </Suspense>
  );
}
