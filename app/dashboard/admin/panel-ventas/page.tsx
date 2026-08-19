"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
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

// La fila de botones para cambiar de solapa se retiró de acá (agosto
// 2026): duplicaba exactamente la cinta de accesos directos del Ribbon
// (nivel 2), que ya navega a cada uno de estos mismos destinos con su
// propio resaltado de "activo" — tener las dos filas obligaba a
// clickear dos veces lo mismo para que se notara la selección. El Ribbon
// sigue siendo sticky arriba de la pantalla, así que la navegación entre
// solapas de este módulo sigue disponible en todo momento.
//
// El tab activo se lee directamente de la URL con useSearchParams (no con
// estado local + efecto de una sola corrida): así, si el usuario ya está
// en esta página y clickea otra solapa del Ribbon (nivel 2), el cambio de
// query string re-renderiza este componente y se ve el cambio al toque —
// antes había que salir y volver a entrar para que se notara.
function PanelVentasInner() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  const activa = TABS.find((t) => t.key === tab) || TABS[0];
  return (
    <div>
      <h1 className="text-xl font-bold text-navy mb-1">Ventas</h1>
      <p className="text-sm text-gray-500 mb-4">Los tres canales de venta (Mayorista, Masivo y Cuentas Clave), catálogo y clientes.</p>
      {activa && <activa.Comp />}
    </div>
  );
}

export default function PanelVentas() {
  return (
    <Suspense fallback={null}>
      <PanelVentasInner />
    </Suspense>
  );
}
