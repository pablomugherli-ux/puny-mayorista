"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Dashboard viejo, previo al rediseño de navegación tipo Ribbon (RBAC
// dinámico Fase 4, agosto 2026). Ya no está enlazado desde ningún menú —
// Dueño/Administrador entran por /dashboard/admin/panel-inicio. Se deja
// como redirect (no se borra la ruta) por si alguien la tenía guardada.
// Ver PUNY_Propuesta_Reformulacion_Navegacion.docx, sección 3.6.
export default function AdminIndexRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/admin/panel-inicio");
  }, [router]);
  return null;
}
