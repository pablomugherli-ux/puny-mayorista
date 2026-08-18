"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";
import ListaBadge from "@/components/ListaBadge";
import { exportarExcel, exportarPDF } from "@/lib/reportes";

export default function MisPedidosVendedor() {
  const { profile, tenant } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    supabase.from("pedidos").select("*, clientes(nombre)").eq("vendedor_id", profile.id).order("fecha", { ascending: false })
      .then(({ data }) => { setRows(data || []); setLoading(false); });
  }, [profile]);

  const columnas = [
    { header: "N°", key: "numero" },
    { header: "Cliente", key: "cliente" },
    { header: "Lista", key: "lista" },
    { header: "Estado", key: "estado" },
    { header: "Total", key: "total", formato: (n: number) => Number(n).toLocaleString("es-AR", { style: "currency", currency: "ARS" }) },
    { header: "Fecha", key: "fecha", formato: (v: string) => new Date(v).toLocaleDateString("es-AR") },
  ];
  const datosExport = rows.map((r) => ({ ...r, cliente: r.clientes?.nombre }));

  return (
    <div>
      <PageHeader title="Mis Pedidos" subtitle="Historial de pedidos cargados en campo" />
      {rows.length > 0 && (
        <div className="flex gap-2 mb-4">
          <button className="btn-secondary text-xs" onClick={() => exportarPDF("Mis Pedidos", columnas, datosExport, "mis_pedidos", { nombre: tenant?.nombre, logoUrl: tenant?.logo_url })}>Exportar PDF</button>
          <button className="btn-secondary text-xs" onClick={() => exportarExcel("Mis Pedidos", columnas, datosExport, "mis_pedidos")}>Exportar Excel</button>
        </div>
      )}
      <div className="card overflow-x-auto">
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead><tr><th>N°</th><th>Cliente</th><th>Lista</th><th>Estado</th><th>Total</th><th>Fecha</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>#{r.numero}</td>
                  <td>{r.clientes?.nombre}</td>
                  <td><ListaBadge lista={r.lista} /></td>
                  <td className="capitalize">{r.estado.replace("_"," ")}</td>
                  <td>{Number(r.total).toLocaleString("es-AR", { style: "currency", currency: "ARS" })}</td>
                  <td>{new Date(r.fecha).toLocaleDateString("es-AR")}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-6">Sin pedidos</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
