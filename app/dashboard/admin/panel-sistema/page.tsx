"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const Empresa = dynamic(() => import("../empresa/page"), { ssr: false });
const Zonas = dynamic(() => import("../zonas/page"), { ssr: false });
const Usuarios = dynamic(() => import("../usuarios/page"), { ssr: false });
const Seguridad = dynamic(() => import("../seguridad/page"), { ssr: false });
const Integraciones = dynamic(() => import("../integraciones/page"), { ssr: false });
const WhatsappIA = dynamic(() => import("../whatsapp-ia/page"), { ssr: false });
const Sistema = dynamic(() => import("../sistema/page"), { ssr: false });

// Reformulación de navegación (agosto 2026): "Datos de la Empresa" y "Zonas
// y Circuitos" (antes en una pestaña "Configuración" aparte, con solo esos
// 2 destinos) se fusionan acá — no ameritaban su propia pestaña de primer
// nivel. También se retira "Vigilancia (vigiladores)" del grupo Accesos: era
// un botón con el mismo destino exacto que "PUNY Seguridad" (ambos abrían
// /panel-sistema?tab=seguridad), y "PUNY Seguridad" ya no se repite en
// Informes y Reportes — queda una sola puerta de entrada acá.
// Ver PUNY_Propuesta_Reformulacion_Navegacion.docx, secciones 3.3 y 6.
const TABS = [
  { key: "empresa", label: "Datos de la Empresa", Comp: Empresa },
  { key: "zonas", label: "Zonas y Circuitos", Comp: Zonas },
  { key: "usuarios", label: "Usuarios y Permisos", Comp: Usuarios },
  { key: "seguridad", label: "PUNY Seguridad", Comp: Seguridad },
  { key: "integraciones", label: "Integraciones", Comp: Integraciones },
  { key: "whatsapp-ia", label: "Agente IA de WhatsApp", Comp: WhatsappIA },
  { key: "sistema", label: "Sistema", Comp: Sistema },
];

export default function PanelSistema() {
  const [tab, setTab] = useState(TABS[0].key);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t && TABS.some((x) => x.key === t)) setTab(t);
  }, []);

  const activa = TABS.find((t) => t.key === tab);
  return (
    <div>
      <h1 className="text-xl font-bold text-navy mb-1">Sistema</h1>
      <p className="text-sm text-gray-500 mb-4">Datos de la empresa, zonas de venta, usuarios y permisos, seguridad, integraciones externas y mantenimiento de la plataforma.</p>
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
