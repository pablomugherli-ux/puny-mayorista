"use client";
import { useEffect, useState } from "react";
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

export default function PanelFinanzas() {
  const [tab, setTab] = useState(TABS[0].key);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t && TABS.some((x) => x.key === t)) setTab(t);
  }, []);

  const activa = TABS.find((t) => t.key === tab);
  return (
    <div>
      <h1 className="text-xl font-bold text-navy mb-1">Finanzas</h1>
      <p className="text-sm text-gray-500 mb-4">Bancos, proveedores, cartera de valores, caja diaria, IVA, contabilidad y proyección de caja.</p>
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
