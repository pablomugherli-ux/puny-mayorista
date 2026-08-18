"use client";
import { Fragment, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";

const ESTADO_BADGE: Record<string, string> = {
  pendiente: "bg-gray-100 text-gray-600",
  optimizada: "bg-blue-100 text-blue-700",
  en_curso: "bg-amber-100 text-amber-700",
  cerrada: "bg-green-100 text-green-700",
};

// Vista consolidada para Encargado de Logística (y Dueño/Administrador):
// muestra las hojas de ruta de TODOS los repartidores del día y permite
// reasignar una parada de una hoja a otra del mismo día (por ejemplo, si un
// repartidor falta o se recarga la ruta de otro). El backend valida con un
// trigger que no se pueda mover una parada a una hoja de otra fecha.
export default function LogisticaAdmin() {
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [hojas, setHojas] = useState<any[]>([]);
  const [paradas, setParadas] = useState<Record<string, any[]>>({});
  const [expandida, setExpandida] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [moviendo, setMoviendo] = useState<string | null>(null);
  const [destino, setDestino] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("hojas_ruta")
      .select("*, profiles!hojas_ruta_responsable_id_fkey(nombre)")
      .eq("fecha", fecha)
      .order("created_at");
    setHojas(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [fecha]);

  async function verParadas(hojaId: string) {
    if (expandida === hojaId) { setExpandida(null); return; }
    setExpandida(hojaId);
    if (!paradas[hojaId]) {
      const { data } = await supabase
        .from("hoja_ruta_paradas")
        .select("*, clientes(nombre, direccion), pedidos(numero, estado, total)")
        .eq("hoja_ruta_id", hojaId)
        .order("orden");
      setParadas((p) => ({ ...p, [hojaId]: data || [] }));
    }
  }

  const totalParadas = (h: any) => (paradas[h.id]?.length ?? null);
  const completadas = (h: any) => (paradas[h.id] || []).filter((p) => p.pedidos?.estado === "entregado").length;

  async function moverParada(paradaId: string, hojaOrigenId: string, nuevaHojaId: string) {
    if (!nuevaHojaId || nuevaHojaId === hojaOrigenId) return;
    setMoviendo(paradaId);
    const { error } = await supabase.from("hoja_ruta_paradas").update({ hoja_ruta_id: nuevaHojaId }).eq("id", paradaId);
    setMoviendo(null);
    if (error) {
      alert("No se pudo reasignar: " + error.message);
      return;
    }
    // Refrescar ambas hojas involucradas (origen y destino) si ya estaban cargadas
    const { data: dataOrigen } = await supabase
      .from("hoja_ruta_paradas")
      .select("*, clientes(nombre, direccion), pedidos(numero, estado, total)")
      .eq("hoja_ruta_id", hojaOrigenId)
      .order("orden");
    const { data: dataDestino } = await supabase
      .from("hoja_ruta_paradas")
      .select("*, clientes(nombre, direccion), pedidos(numero, estado, total)")
      .eq("hoja_ruta_id", nuevaHojaId)
      .order("orden");
    setParadas((p) => ({ ...p, [hojaOrigenId]: dataOrigen || [], [nuevaHojaId]: dataDestino || [] }));
    setDestino((d) => ({ ...d, [paradaId]: "" }));
  }

  return (
    <div>
      <PageHeader title="Logística" subtitle="Hojas de ruta de todos los repartidores del día — vista consolidada, con reasignación de paradas entre repartidores" />

      <div className="flex items-center gap-3 mb-5">
        <label className="text-xs text-gray-500">Fecha</label>
        <input type="date" className="input max-w-[180px]" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Hojas de ruta" value={String(hojas.length)} />
        <StatCard label="Repartidores en calle" value={String(new Set(hojas.map((h) => h.responsable_id)).size)} />
        <StatCard label="Km estimados totales" value={hojas.reduce((s, h) => s + (h.distancia_km_estimada || 0), 0).toFixed(1)} />
      </div>

      <div className="card overflow-x-auto">
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead><tr><th>Repartidor</th><th>Tipo</th><th>Estado</th><th>Optimizada IA</th><th>Km estimados</th><th></th></tr></thead>
            <tbody>
              {hojas.map((h) => (
                <Fragment key={h.id}>
                  <tr>
                    <td>{h.profiles?.nombre || "—"}</td>
                    <td className="capitalize">{h.tipo}</td>
                    <td><span className={`badge ${ESTADO_BADGE[h.estado] || ""}`}>{h.estado}</span></td>
                    <td>{h.optimizada_ia ? "Sí" : "No"}</td>
                    <td>{h.distancia_km_estimada ? `${h.distancia_km_estimada} km` : "—"}</td>
                    <td><button className="text-xs text-accent underline" onClick={() => verParadas(h.id)}>{expandida === h.id ? "Ocultar" : "Ver paradas"}</button></td>
                  </tr>
                  {expandida === h.id && (
                    <tr>
                      <td colSpan={6} className="bg-gray-50">
                        <div className="overflow-x-auto">
                          <table className="tbl">
                            <thead><tr><th>Orden</th><th>Cliente</th><th>Dirección</th><th>Pedido</th><th>Estado pedido</th><th>Reasignar a otro repartidor</th></tr></thead>
                            <tbody>
                              {(paradas[h.id] || []).map((p) => (
                                <tr key={p.id}>
                                  <td>{p.orden}</td>
                                  <td>{p.clientes?.nombre || "—"}</td>
                                  <td>{p.clientes?.direccion || "—"}</td>
                                  <td>{p.pedidos ? `#${p.pedidos.numero} — $${p.pedidos.total}` : "—"}</td>
                                  <td className="capitalize">{p.pedidos?.estado || "—"}</td>
                                  <td>
                                    <div className="flex items-center gap-1.5">
                                      <select
                                        className="input text-xs py-1"
                                        value={destino[p.id] || ""}
                                        onChange={(e) => setDestino((d) => ({ ...d, [p.id]: e.target.value }))}
                                      >
                                        <option value="">Elegir hoja de ruta…</option>
                                        {hojas.filter((ho) => ho.id !== h.id).map((ho) => (
                                          <option key={ho.id} value={ho.id}>{ho.profiles?.nombre || "—"} ({ho.tipo})</option>
                                        ))}
                                      </select>
                                      <button
                                        className="text-xs text-accent underline shrink-0 disabled:opacity-40"
                                        disabled={!destino[p.id] || moviendo === p.id}
                                        onClick={() => moverParada(p.id, h.id, destino[p.id])}
                                      >
                                        {moviendo === p.id ? "Moviendo…" : "Mover"}
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                              {(paradas[h.id] || []).length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-4">Sin paradas</td></tr>}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {hojas.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-6">Sin hojas de ruta para esta fecha</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
