"use client";
import { useEffect, useState } from "react";
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

export default function PanelPersonal() {
  const [tab, setTab] = useState(TABS[0].key);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t && TABS.some((x) => x.key === t)) setTab(t);
  }, []);

  const activa = TABS.find((t) => t.key === tab);
  return (
    <div>
      <h1 className="text-xl font-bold text-navy mb-1">Personal</h1>
      <p className="text-sm text-gray-500 mb-4">Legajos, liquidación de sueldos, vacaciones y licencias, y accesos de empleados.</p>
      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded text-sm font-medium ${tab === t.key ? "bg-navy text-white" : "bg-gray-100 text-gray-600"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {activa && <activa.Comp />}
    </div>
  );
}
