"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Pantalla de Reportes vieja, reemplazada por los informes por módulo
// dentro de /dashboard/admin/panel-informes (Informe de Ventas, Cobranzas,
// Stock, RRHH) más el Dashboard Ejecutivo y PUNY BI. Ya no está enlazada
// desde ningún menú. Se deja como redirect por si alguien la tenía guardada.
// Ver PUNY_Propuesta_Reformulacion_Navegacion.docx, sección 3.6.
export default function ReportesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/admin/panel-informes");
  }, [router]);
  return null;
}
