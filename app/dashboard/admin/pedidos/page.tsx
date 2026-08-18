"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PageHeader from "@/components/PageHeader";
import ListaBadge from "@/components/ListaBadge";

const ESTADO_COLOR: Record<string, string> = {
  pendiente: "bg-gray-100 text-gray-700",
  aprobado: "bg-blue-100 text-blue-700",
  en_preparacion: "bg-amber-100 text-amber-700",
  despachado: "bg-purple-100 text-purple-700",
  entregado: "bg-green-100 text-green-700",
  rechazado: "bg-red-100 text-red-700",
  cancelado: "bg-red-100 text-red-700",
};

export default function PedidosAdmin() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const PAGE_SIZE = 50;
  const [pagina, setPagina] = useState(0);
  const [hayMas, setHayMas] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);

  async function load(reset = true) {
    const desde = reset ? 0 : pagina * PAGE_SIZE;
    const hasta = desde + PAGE_SIZE - 1;
    const { data } = await supabase
      .from("pedidos")
      .select("id, numero, estado, lista, total, origen, fecha, clientes(nombre), profiles:vendedor_id(nombre)")
      .order("fecha", { ascending: false })
      .range(desde, hasta);
    if (reset) {
      setRows(data || []);
      setPagina(1);
    } else {
      setRows((prev) => [...prev, ...(data || [])]);
      setPagina((p) => p + 1);
    }
    setHayMas((data || []).length === PAGE_SIZE);
    setLoading(false);
  }
  useEffect(() => { load(true); }, []);

  const fmt = (n: number) => Number(n).toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

  return (
    <div>
      <PageHeader title="Pedidos" subtitle="Vista consolidada de pedidos de todos los canales (campo, B2B, backoffice)" />
      <div className="card overflow-x-auto">
        {loading ? (
          <p className="text-gray-400">Cargando…</p>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>N°</th>
                <th>Cliente</th>
                <th>Vendedor</th>
                <th>Lista</th>
                <th>Origen</th>
                <th>Estado</th>
                <th>Total</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>#{r.numero}</td>
                  <td>{r.clientes?.nombre}</td>
                  <td>{r.profiles?.nombre || "—"}</td>
                  <td><ListaBadge lista={r.lista} /></td>
                  <td className="capitalize">{r.origen}</td>
                  <td><span className={`badge ${ESTADO_COLOR[r.estado]}`}>{r.estado.replace("_", " ")}</span></td>
                  <td>{fmt(r.total)}</td>
                  <td>{new Date(r.fecha).toLocaleDateString("es-AR")}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="text-center text-gray-400 py-6">Sin pedidos registrados</td></tr>
              )}
            </tbody>
          </table>
        )}
        {!loading && hayMas && (
          <div className="text-center mt-3">
            <button
              className="btn-secondary text-xs"
              disabled={cargandoMas}
              onClick={async () => { setCargandoMas(true); await load(false); setCargandoMas(false); }}
            >
              {cargandoMas ? "Cargando…" : "Cargar más"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
