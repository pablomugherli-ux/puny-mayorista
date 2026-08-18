"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const Finanzas = dynamic(() => import("../finanzas/page"), { ssr: false });
const Contabilidad = dynamic(() => import("../contabilidad/page"), { ssr: false });
const CashFlow = dynamic(() => import("../cashflow/page"), { ssr: false });
const Stock = dynamic(() => import("../stock/page"), { ssr: false });
const Importaciones = dynamic(() => import("../importaciones/page"), { ssr: false });
const Tesoreria = dynamic(() => import("../tesoreria/page"), { ssr: false });

const TABS = [
  { key: "finanzas", label: "Bancos/Proveedores/Cartera", Comp: Finanzas },
  { key: "contabilidad", label: "Contabilidad", Comp: Contabilidad },
  { key: "cashflow", label: "Cash Flow Proyectado", Comp: CashFlow },
  { key: "stock", label: "Stock y Compras", Comp: Stock },
  { key: "importaciones", label: "Importaciones", Comp: Importaciones },
  { key: "tesoreria", label: "Tesorería y Sueldos", Comp: Tesoreria },
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
      <h1 className="text-xl font-bold text-navy mb-1">Finanzas &amp; Stock</h1>
      <p className="text-sm text-gray-500 mb-4">Bancos, proveedores, contabilidad, proyección de caja, inventario e importaciones.</p>
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
