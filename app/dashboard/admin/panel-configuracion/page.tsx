"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const Empresa = dynamic(() => import("../empresa/page"), { ssr: false });
const Zonas = dynamic(() => import("../zonas/page"), { ssr: false });
const Cobradores = dynamic(() => import("../cobradores/page"), { ssr: false });
const Comisiones = dynamic(() => import("../comisiones/page"), { ssr: false });
const Objetivos = dynamic(() => import("../objetivos/page"), { ssr: false });
const Ofertas = dynamic(() => import("../ofertas/page"), { ssr: false });

const TABS = [
  { key: "empresa", label: "Datos de la Empresa", Comp: Empresa },
  { key: "zonas", label: "Zonas y Circuitos", Comp: Zonas },
  { key: "cobradores", label: "Vincular Cobradores", Comp: Cobradores },
  { key: "comisiones", label: "Esquemas de Comisión", Comp: Comisiones },
  { key: "objetivos", label: "Objetivos Comerciales", Comp: Objetivos },
  { key: "ofertas", label: "Ofertas vigentes", Comp: Ofertas },
];

export default function PanelConfiguracion() {
  const [tab, setTab] = useState(TABS[0].key);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t && TABS.some((x) => x.key === t)) setTab(t);
  }, []);

  const activa = TABS.find((t) => t.key === tab);
  return (
    <div>
      <h1 className="text-xl font-bold text-navy mb-1">Configuración</h1>
      <p className="text-sm text-gray-500 mb-4">Datos de la empresa, zonas de venta, vínculos de cobranza y reglas comerciales de fondo.</p>
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
