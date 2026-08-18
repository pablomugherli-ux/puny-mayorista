export const APP_NAME = "PUNY 2026 INTEGRAL";
export const APP_VERSION = "1.0.0";
export const APP_AUTOR = "Pablo M. Mugherli";
export const APP_TELEFONO = "+54 3442 503007";
export const APP_EMAIL = "pablomugherli@gmail.com";

export function creditoLinea(anio: number) {
  return `${APP_NAME} · Desarrollado por ${APP_AUTOR} · Todos los derechos reservados · ${APP_TELEFONO} · ${APP_EMAIL} · © ${anio} · v${APP_VERSION}`;
}
