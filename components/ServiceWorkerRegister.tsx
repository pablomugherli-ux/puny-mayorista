"use client";
import { useEffect } from "react";

// Registra el Service Worker (public/sw.js) apenas carga la app. Es lo que
// habilita: (a) que el navegador ofrezca "Instalar app" en celular/PC, y
// (b) que las pantallas ya visitadas sigan abriendo sin conexión.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Si falla el registro (ej. navegador viejo), la app sigue funcionando
      // normal, solo sin capacidad offline/instalación.
    });
  }, []);
  return null;
}
