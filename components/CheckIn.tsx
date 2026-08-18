"use client";
import { useState } from "react";
import { distanciaMetros, obtenerPosicionActual } from "@/lib/geo";
import { useAuth } from "@/lib/useAuth";
import { ejecutarOEncolar } from "@/lib/offlineSync";

export default function CheckIn({
  cliente, tipo, onDone,
}: {
  cliente: { id: string; nombre: string; lat: number | null; lng: number | null; radio_geofence_m: number | null };
  tipo: "venta" | "entrega" | "cobro";
  onDone?: (dentro: boolean) => void;
}) {
  const { profile } = useAuth();
  const [estado, setEstado] = useState<"idle" | "buscando" | "ok" | "error">("idle");
  const [resultado, setResultado] = useState<{ dentro: boolean; distancia: number | null } | null>(null);
  const [avisoRegistro, setAvisoRegistro] = useState<string | null>(null);

  async function hacerCheckIn() {
    setEstado("buscando");
    setAvisoRegistro(null);
    let latitude: number, longitude: number;
    try {
      const pos = await obtenerPosicionActual();
      latitude = pos.coords.latitude;
      longitude = pos.coords.longitude;
    } catch (e) {
      // Esto sí es un fallo real de GPS/permiso — acá el mensaje es correcto.
      setEstado("error");
      return;
    }

    const distancia = distanciaMetros(latitude, longitude, cliente.lat, cliente.lng);
    const dentro = distancia != null ? distancia <= (cliente.radio_geofence_m || 150) : false;

    // El resultado del geofence ya es válido en este punto (cálculo local).
    // Lo que sigue es solo dejar constancia — si falla, no debe hacer parecer
    // que el check-in en sí falló, pero tampoco debe ocultarse el problema.
    if (profile) {
      const resPos = await ejecutarOEncolar({
        tabla: "posiciones_gps", tipo: "insert",
        payload: { tenant_id: profile.tenant_id, usuario_id: profile.id, lat: latitude, lng: longitude },
        descripcion: "Posición GPS de check-in", tenantId: profile.tenant_id,
      });
      const resVisita = await ejecutarOEncolar({
        tabla: "visitas", tipo: "insert",
        payload: {
          tenant_id: profile.tenant_id, cliente_id: cliente.id, usuario_id: profile.id,
          tipo, dentro_geofence: dentro, distancia_m: distancia, lat: latitude, lng: longitude,
        },
        descripcion: `Visita (${tipo}) a ${cliente.nombre}`, tenantId: profile.tenant_id,
      });
      if (!resVisita.ok) {
        setAvisoRegistro(`El check-in se calculó bien, pero no se pudo registrar la visita: ${resVisita.error || "error desconocido"}.`);
      } else if (!resPos.ok) {
        setAvisoRegistro("El check-in se registró, pero no se pudo guardar la posición GPS de referencia.");
      }
    }
    setResultado({ dentro, distancia });
    setEstado("ok");
    onDone?.(dentro);
  }

  return (
    <div className="border rounded-md p-3 bg-gray-50">
      <button type="button" className="btn-secondary text-xs" onClick={hacerCheckIn} disabled={estado === "buscando"}>
        {estado === "buscando" ? "Obteniendo ubicación…" : "Check-in geolocalizado"}
      </button>
      {estado === "error" && <p className="text-xs text-red-600 mt-2">No se pudo obtener la ubicación del dispositivo.</p>}
      {avisoRegistro && <p className="text-xs text-amber-700 mt-2">⚠ {avisoRegistro}</p>}
      {resultado && (
        <p className={`text-xs mt-2 ${resultado.dentro ? "text-green-700" : "text-amber-700"}`}>
          {resultado.dentro
            ? `✓ Dentro del geofence de ${cliente.nombre} (${resultado.distancia?.toFixed(0)} m)`
            : `⚠ Fuera del geofence de ${cliente.nombre} (${resultado.distancia != null ? resultado.distancia.toFixed(0) + " m" : "sin coordenadas"}) — queda registrado como excepción`}
        </p>
      )}
    </div>
  );
}
