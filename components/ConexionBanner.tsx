"use client";
import { useEstadoOffline } from "@/lib/offlineSync";

// Barra fija que avisa cuando no hay conexión y cuántas operaciones quedaron
// guardadas localmente esperando para subirse. Se muestra en toda la app
// (está en el layout raíz) porque cualquier pantalla puede quedarse sin señal,
// no solo la App de Campo.
export default function ConexionBanner() {
  const { online, pendientes } = useEstadoOffline();

  if (online && pendientes === 0) return null;

  return (
    <div
      className={`sticky top-0 z-50 w-full text-center text-xs font-semibold py-1.5 px-3 ${
        !online ? "bg-amber-500 text-white" : "bg-navy text-white"
      }`}
    >
      {!online
        ? pendientes > 0
          ? `Sin conexión — ${pendientes} operación${pendientes === 1 ? "" : "es"} guardada${pendientes === 1 ? "" : "s"} en el equipo, se van a subir solas al reconectar.`
          : "Sin conexión a internet — lo que cargues se guarda en el equipo y se sube solo al reconectar."
        : `Conectado — sincronizando ${pendientes} operación${pendientes === 1 ? "" : "es"} pendiente${pendientes === 1 ? "" : "s"}…`}
    </div>
  );
}
