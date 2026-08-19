"use client";
import { useEffect, useState } from "react";
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

export default function PanelStock() {
  const [tab, setTab] = useState(TABS[0].key);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t && TABS.some((x) => x.key === t)) setTab(t);
  }, []);

  const activa = TABS.find((t) => t.key === tab);
  return (
    <div>
      <h1 className="text-xl font-bold text-navy mb-1">Stock</h1>
      <p className="text-sm text-gray-500 mb-4">Stock mínimo, órdenes de compra, depósitos, importaciones y logística de reparto.</p>
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
