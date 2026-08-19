"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Reformulación de navegación (agosto 2026): "Configuración" se disolvió —
// Datos de la Empresa/Zonas pasaron a "Sistema" y Comisiones/Objetivos/
// Ofertas/Vincular Cobradores pasaron a "Comercial" (pestaña propia, ya no
// mezclados con configuración técnica de una sola vez).
// Ver PUNY_Propuesta_Reformulacion_Navegacion.docx, sección 6.
// Esta ruta ya no está enlazada desde ningún menú; se deja como redirect (en
// vez de borrarla) por si alguien la tenía guardada como favorito.
export default function PanelConfiguracionRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/admin/panel-sistema?tab=empresa");
  }, [router]);
  return null;
}
