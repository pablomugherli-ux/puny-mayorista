// Taxonomía de módulos de negocio — fuente única compartida entre:
//  - el checklist de permisos (Usuarios y Accesos / RBAC dinámico Fase 3),
//    donde ya vive el campo `modulo` de catalogo_permisos, y
//  - la navegación (Sidebar/Ribbon), que ahora agrupa visualmente los
//    accesos de cada rol usando esta misma lista — así el menú y los
//    permisos nunca se desincronizan.
// Ver PUNY_Propuesta_Reformulacion_Navegacion.docx, principio 2 (sección 5).
export const MODULO_LABEL: Record<string, string> = {
  ventas: "Ventas",
  finanzas: "Finanzas",
  stock: "Stock",
  personal: "Personal",
  comunicacion: "Comunicación",
  informes: "Informes y Reportes",
  sistema: "Sistema",
  campo: "Roles de Campo",
  b2b: "Portal Cliente B2B",
  proveedor: "Portal Proveedor",
};

export const MODULO_ORDEN = [
  "ventas", "finanzas", "stock", "personal", "comunicacion",
  "informes", "sistema", "campo", "b2b", "proveedor",
];
