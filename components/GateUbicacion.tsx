"use client";
import { useEffect, useRef, useState } from "react";
import { obtenerPosicionActual } from "@/lib/geo";

type Estado = "verificando" | "ok" | "bloqueado";

// Gate obligatorio de ubicación para roles de campo (vendedor/entrega/cobrador).
// No permite ver ni usar ninguna pantalla del rol si el dispositivo no tiene la
// ubicación activa y con permiso concedido — se revisa al entrar, al volver a
// primer plano (visibilitychange) y cada 60s mientras la app está abierta, por
// si el usuario apaga el GPS o revoca el permiso a mitad de sesión.
export default function GateUbicacion({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<Estado>("verificando");
  const [motivo, setMotivo] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Una vez que hubo un chequeo exitoso, un fallo posterior (revisión cada 60s
  // o al volver a primer plano) NO debe desmontar children — eso perdería
  // cualquier formulario en curso (carrito de un pedido, cobro o entrega sin
  // guardar). En ese caso mostramos un aviso superpuesto pero dejamos todo
  // montado; solo el primer chequeo (antes de tener nada que perder) bloquea
  // la pantalla por completo.
  const tuvoExitoRef = useRef(false);

  async function verificar() {
    try {
      await obtenerPosicionActual();
      tuvoExitoRef.current = true;
      setEstado("ok");
      setMotivo("");
    } catch (e: any) {
      const mensaje =
        e?.code === 1
          ? "Denegaste el permiso de ubicación para esta app."
          : e?.code === 2
          ? "No se pudo obtener tu ubicación (GPS apagado o sin señal)."
          : e?.code === 3
          ? "La ubicación tardó demasiado en responder — probá de nuevo con mejor señal."
          : e?.message || "No se pudo verificar tu ubicación.";
      setMotivo(mensaje);
      setEstado(tuvoExitoRef.current ? "ok" : "bloqueado");
    }
  }

  useEffect(() => {
    verificar();
    const onVisible = () => { if (document.visibilityState === "visible") verificar(); };
    document.addEventListener("visibilitychange", onVisible);
    intervalRef.current = setInterval(verificar, 60000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (estado === "verificando") {
    return (
      <div className="flex items-center justify-center text-gray-500" style={{ minHeight: "60vh" }}>
        Verificando ubicación…
      </div>
    );
  }

  if (estado === "bloqueado") {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-3 px-6" style={{ minHeight: "60vh" }}>
        <div className="text-4xl">📍</div>
        <h2 className="text-lg font-semibold text-navy">Ubicación requerida</h2>
        <p className="text-sm text-gray-600 max-w-md">
          {motivo} Esta app requiere que la ubicación del dispositivo esté activa mientras la usás en la calle: la
          necesita para el check-in en clientes, el control de geofence al cargar pedidos y el armado de tu ruta del día.
        </p>
        <p className="text-xs text-gray-400 max-w-md">
          Activá el GPS del teléfono y dale permiso de "Ubicación" a esta app/navegador en la configuración del
          sistema operativo, después tocá "Reintentar".
        </p>
        <button className="btn-primary" onClick={verificar}>Reintentar</button>
      </div>
    );
  }

  return (
    <>
      {motivo && (
        <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-xs px-3 py-2 mb-3 flex items-center justify-between gap-2">
          <span>📍 {motivo} Los datos que ya cargaste en pantalla no se perdieron, pero un nuevo check-in o pedido va a necesitar ubicación de vuelta.</span>
          <button type="button" className="underline shrink-0" onClick={verificar}>Reintentar</button>
        </div>
      )}
      {children}
    </>
  );
}
