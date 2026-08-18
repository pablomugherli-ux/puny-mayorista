"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabaseClient";
import PageHeader from "@/components/PageHeader";

const LiveMap = dynamic(() => import("@/components/LiveMap"), { ssr: false });

export default function MapaAdmin() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [posiciones, setPosiciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [{ data: c }, { data: pos }] = await Promise.all([
      supabase.from("clientes").select("id, nombre, direccion, lat, lng, radio_geofence_m").not("lat", "is", null),
      supabase.from("posiciones_gps").select("usuario_id, lat, lng, ts, profiles(nombre)").order("ts", { ascending: false }).limit(300),
    ]);
    setClientes(c || []);
    const map = new Map<string, any>();
    (pos || []).forEach((p: any) => {
      if (!map.has(p.usuario_id)) map.set(p.usuario_id, { usuario_id: p.usuario_id, lat: p.lat, lng: p.lng, ts: p.ts, nombre: p.profiles?.nombre });
    });
    setPosiciones(Array.from(map.values()));
    setLoading(false);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <PageHeader title="Mapa en Vivo" subtitle="Clientes (geofence) y última posición conocida de vendedores/repartidores/cobradores" />
      {loading ? <p className="text-gray-400">Cargando mapa…</p> : <LiveMap clientes={clientes} posiciones={posiciones} />}
      {posiciones.length === 0 && !loading && (
        <p className="text-xs text-gray-400 mt-3">
          Aún no hay posiciones GPS reportadas. Se generan cuando un usuario de campo abre jornada o registra check-in
          desde la App de Campo (botón "Compartir mi ubicación").
        </p>
      )}
    </div>
  );
}
