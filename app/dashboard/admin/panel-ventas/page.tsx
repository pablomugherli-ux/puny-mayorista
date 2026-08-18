"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const Pedidos = dynamic(() => import("../pedidos/page"), { ssr: false });
const Catalogo = dynamic(() => import("../catalogo/page"), { ssr: false });
const Masivo = dynamic(() => import("../masivo/page"), { ssr: false });
const CuentasClave = dynamic(() => import("../cuentas-clave/page"), { ssr: false });
const Clientes = dynamic(() => import("../clientes/page"), { ssr: false });
const CuentaCorriente = dynamic(() => import("../cuenta-corriente/page"), { ssr: false });
const Mapa = dynamic(() => import("../mapa/page"), { ssr: false });

const TABS = [
  { key: "pedidos", label: "Pedidos (Mayorista)", Comp: Pedidos },
  { key: "catalogo", label: "Catálogo", Comp: Catalogo },
  { key: "masivo", label: "PUNY Masivo (POS)", Comp: Masivo },
  { key: "cuentas-clave", label: "Cuentas Clave", Comp: CuentasClave },
  { key: "clientes", label: "Clientes", Comp: Clientes },
  { key: "cuenta-corriente", label: "Cuenta Corriente", Comp: CuentaCorriente },
  { key: "mapa", label: "Mapa en Vivo", Comp: Mapa },
];

export default function PanelVentas() {
  const [tab, setTab] = useState(TABS[0].key);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t && TABS.some((x) => x.key === t)) setTab(t);
  }, []);

  const activa = TABS.find((t) => t.key === tab);
  return (
    <div>
      <h1 className="text-xl font-bold text-navy mb-1">Ventas</h1>
      <p className="text-sm text-gray-500 mb-4">Los tres canales de venta (Mayorista, Masivo y Cuentas Clave), catálogo y clientes.</p>
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
