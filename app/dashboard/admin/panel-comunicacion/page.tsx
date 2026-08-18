"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const WhatsappWp = dynamic(() => import("../whatsapp-wp/page"), { ssr: false });
const RedesSociales = dynamic(() => import("../redes-sociales/page"), { ssr: false });
const Notificaciones = dynamic(() => import("../notificaciones/page"), { ssr: false });

// Dashboard, PUNY BI y Reportes se mudaron a la pestaña "Informes y Reportes"
// (panel-informes) — acá queda solo la mensajería con clientes.
const TABS = [
  { key: "whatsapp-wp", label: "PUNY WP (WhatsApp)", Comp: WhatsappWp },
  { key: "redes-sociales", label: "PUNY Redes Sociales", Comp: RedesSociales },
  { key: "notificaciones", label: "Notificaciones", Comp: Notificaciones },
];

export default function PanelComunicacion() {
  const [tab, setTab] = useState(TABS[0].key);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t && TABS.some((x) => x.key === t)) setTab(t);
  }, []);

  const activa = TABS.find((t) => t.key === tab);
  return (
    <div>
      <h1 className="text-xl font-bold text-navy mb-1">Comunicación</h1>
      <p className="text-sm text-gray-500 mb-4">Todos los canales de mensajería con clientes: WhatsApp, redes sociales y notificaciones.</p>
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
