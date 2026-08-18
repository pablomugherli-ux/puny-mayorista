"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";
import CheckIn from "@/components/CheckIn";
import { optimizarRuta } from "@/lib/tsp";
import { obtenerPosicionActual, distanciaMetros } from "@/lib/geo";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const hoyNombre = DIAS[new Date().getDay()];

export default function VendedorHome() {
  const { profile } = useAuth();
  const [clientes, setClientes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [ordenando, setOrdenando] = useState(false);
  const [rutaError, setRutaError] = useState<string | null>(null);
  const [visitasHoyOrdenadas, setVisitasHoyOrdenadas] = useState<any[] | null>(null);
  const [distanciaTotalKm, setDistanciaTotalKm] = useState<number | null>(null);
  const [sinCoordenadas, setSinCoordenadas] = useState<any[]>([]);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from("clientes")
      .select("*, circuitos(nombre, dias_semana)")
      .eq("vendedor_id", profile.id)
      .order("nombre")
      .then(({ data }) => { setClientes(data || []); setLoading(false); });
  }, [profile]);

  const visitasHoy = clientes.filter((c) => c.circuitos && (c.circuitos.dias_semana || []).includes(hoyNombre));
  const fueraDeZona = clientes.filter((c) => !c.circuito_id);
  const otrosDias = clientes.filter((c) => c.circuito_id && !(c.circuitos?.dias_semana || []).includes(hoyNombre));

  async function calcularRuta() {
    setOrdenando(true);
    setRutaError(null);
    try {
      const pos = await obtenerPosicionActual();
      const origen = { id: "yo", lat: pos.coords.latitude, lng: pos.coords.longitude };
      const conCoordenadas = visitasHoy.filter((c) => c.lat && c.lng);
      setSinCoordenadas(visitasHoy.filter((c) => !c.lat || !c.lng));
      const { ruta, distanciaKm } = optimizarRuta(
        origen,
        conCoordenadas.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng }))
      );
      const ordenadas = ruta.map((r) => conCoordenadas.find((c) => c.id === r.id));
      setVisitasHoyOrdenadas(ordenadas);
      setDistanciaTotalKm(distanciaKm);
    } catch {
      setRutaError("No se pudo obtener tu ubicación para calcular la ruta óptima. Verificá el permiso de geolocalización del navegador.");
    }
    setOrdenando(false);
  }

  function ClienteCard({ c, index, requiereZona }: { c: any; index?: number; requiereZona: boolean }) {
    return (
      <div className="card">
        <div className="flex justify-between items-start">
          <div>
            {index != null && (
              <div className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-navy text-white text-xs font-bold mb-1">
                {index + 1}
              </div>
            )}
            <div className="font-semibold text-navy">{c.nombre}</div>
            <div className="text-xs text-gray-500">{c.direccion}</div>
            <div className="text-xs text-gray-400 mt-1">
              {[c.lista_1_habilitada && "Lista 1", c.lista_2_habilitada && "Lista 2"].filter(Boolean).join(" · ")}
              {c.circuitos?.nombre ? ` · ${c.circuitos.nombre}` : ""}
            </div>
            {requiereZona ? (
              <div className="text-[11px] text-amber-700 mt-1">Requiere estar en la ubicación del cliente para cargar pedido</div>
            ) : (
              <div className="text-[11px] text-gray-400 mt-1">Fuera de zona — no requiere geolocalización</div>
            )}
          </div>
          <Link href={`/dashboard/campo/vendedor/nuevo-pedido?cliente=${c.id}`} className="btn-primary text-xs shrink-0">
            Nuevo pedido
          </Link>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Link href={`/dashboard/campo/vendedor/cliente?id=${c.id}`} className="text-xs text-accent underline">
            Ver ficha, historial y sugerencias
          </Link>
          <button className="text-xs text-accent underline" onClick={() => setAbierto(abierto === c.id ? null : c.id)}>
            {abierto === c.id ? "Ocultar check-in" : "Registrar visita"}
          </button>
          {abierto === c.id && <div className="mt-2"><CheckIn cliente={c} tipo="venta" /></div>}
        </div>
      </div>
    );
  }

  // Los clientes sin coordenadas no entran en el cálculo de ruta óptima, pero
  // igual tienen que seguir viéndose en "Visitas de hoy" — antes desaparecían
  // por completo de la lista al ordenar por distancia.
  const listaAMostrar = visitasHoyOrdenadas ? [...visitasHoyOrdenadas, ...sinCoordenadas] : visitasHoy;

  return (
    <div>
      <PageHeader title={`Mi cartera — ${profile?.nombre}`} subtitle={`Circuitos asignados para hoy (${hoyNombre})`} live />

      <div className="mb-5 flex items-center gap-3">
        <button className="btn-secondary text-xs" onClick={calcularRuta} disabled={ordenando || visitasHoy.length === 0}>
          {ordenando ? "Calculando ruta…" : "Ordenar visitas por distancia (IA)"}
        </button>
        {distanciaTotalKm != null && (
          <span className="text-xs text-green-700">✓ Ruta optimizada — {distanciaTotalKm.toFixed(1)} km estimados</span>
        )}
      </div>
      {rutaError && <p className="text-xs text-red-600 mb-4">{rutaError}</p>}
      {sinCoordenadas.length > 0 && (
        <p className="text-xs text-amber-700 mb-4">
          ⚠ {sinCoordenadas.length} cliente{sinCoordenadas.length > 1 ? "s" : ""} sin coordenadas cargadas — quedan
          al final de la lista, sin entrar en el cálculo de la ruta óptima.
        </p>
      )}

      <h3 className="text-sm font-semibold text-navy mb-2">Visitas de hoy ({visitasHoy.length})</h3>
      {loading ? <p className="text-gray-400">Cargando…</p> : (
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          {listaAMostrar.map((c, i) => (
            <ClienteCard
              key={c.id}
              c={c}
              index={visitasHoyOrdenadas && i < visitasHoyOrdenadas.length ? i : undefined}
              requiereZona
            />
          ))}
          {visitasHoy.length === 0 && <p className="text-gray-400 col-span-2">No tenés clientes en circuito para hoy ({hoyNombre}).</p>}
        </div>
      )}

      {fueraDeZona.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-navy mb-2">Fuera de zona ({fueraDeZona.length})</h3>
          <p className="text-xs text-gray-400 mb-3">Clientes sin circuito asignado — se puede cargar pedido sin importar la geolocalización.</p>
          <div className="grid md:grid-cols-2 gap-4 mb-8">
            {fueraDeZona.map((c) => <ClienteCard key={c.id} c={c} requiereZona={false} />)}
          </div>
        </>
      )}

      {otrosDias.length > 0 && (
        <details className="mb-8">
          <summary className="text-sm font-semibold text-navy mb-2 cursor-pointer">Otros clientes de mi cartera ({otrosDias.length}) — no visitan hoy</summary>
          <div className="grid md:grid-cols-2 gap-4 mt-3">
            {otrosDias.map((c) => <ClienteCard key={c.id} c={c} requiereZona />)}
          </div>
        </details>
      )}
    </div>
  );
}
