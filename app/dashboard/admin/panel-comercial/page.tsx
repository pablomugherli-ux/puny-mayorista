"use client";
import { useEffect, useState } from "react";
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

export default function PanelComercial() {
  const [tab, setTab] = useState(TABS[0].key);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t && TABS.some((x) => x.key === t)) setTab(t);
  }, []);

  const activa = TABS.find((t) => t.key === tab);
  return (
    <div>
      <h1 className="text-xl font-bold text-navy mb-1">Comercial</h1>
      <p className="text-sm text-gray-500 mb-4">Comisiones del equipo de ventas, objetivos comerciales, ofertas vigentes y vínculos de cobranza.</p>
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
