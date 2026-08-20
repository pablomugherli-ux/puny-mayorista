"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";

const WhatsappWp = dynamic(() => import("../whatsapp-wp/page"), { ssr: false });
const RedesSociales = dynamic(() => import("../redes-sociales/page"), { ssr: false });
const Notificaciones = dynamic(() => import("../notificaciones/page"), { ssr: false });
const Intercomunicador = dynamic(() => import("../intercomunicador/page"), { ssr: false });
const Agenda = dynamic(() => import("../agenda/page"), { ssr: false });
const Documentos = dynamic(() => import("../documentos/page"), { ssr: false });

// Dashboard, PUNY BI y Reportes se mudaron a la pestaña "Informes y Reportes"
// (panel-informes) — acá queda la mensajería con clientes (WhatsApp, redes,
// notificaciones) más el grupo "Equipo interno" (Fase G, agosto 2026):
// intercomunicador, agenda personal y gestor documental — comunicación
// interna de la distribuidora, no con clientes externos.
const TABS = [
  { key: "whatsapp-wp", label: "PUNY WP (WhatsApp)", Comp: WhatsappWp },
  { key: "redes-sociales", label: "PUNY Redes Sociales", Comp: RedesSociales },
  { key: "notificaciones", label: "Notificaciones", Comp: Notificaciones },
  { key: "intercomunicador", label: "Intercomunicador", Comp: Intercomunicador },
  { key: "agenda", label: "Agenda Personal", Comp: Agenda },
  { key: "documentos", label: "Gestor Documental", Comp: Documentos },
];

// El tab activo se lee de la URL con useSearchParams (reactivo a cambios de
// query string), no de estado local + efecto de una sola corrida — ver
// components/Ribbon.tsx para el detalle del bug que esto corrige.
function PanelComunicacionInner() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  const activa = TABS.find((t) => t.key === tab) || TABS[0];
  return (
    <div>
      <h1 className="text-xl font-bold text-navy mb-1">Comunicación</h1>
      <p className="text-sm text-gray-500 mb-4">Todos los canales de mensajería con clientes: WhatsApp, redes sociales y notificaciones.</p>
      {/* La fila de botones para cambiar de solapa se retiró de acá (agosto 2026):
          duplicaba la cinta de accesos directos del Ribbon (nivel 2), que ya navega
          a estos mismos destinos con su propio resaltado de "activo" — tener las dos
          filas obligaba a clickear dos veces lo mismo para que se notara la selección.
          El Ribbon es sticky, así que sigue disponible en todo momento. */}
      {activa && <activa.Comp />}
    </div>
  );
}

export default function PanelComunicacion() {
  return (
    <Suspense fallback={null}>
      <PanelComunicacionInner />
    </Suspense>
  );
}
