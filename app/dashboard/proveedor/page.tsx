"use client";
import { Fragment, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";

const ESTADO_LABEL: Record<string, string> = {
  sugerida: "Sugerida",
  confirmada: "Confirmada",
  recibida: "Recibida",
  cancelada: "Cancelada",
};
const ESTADO_BADGE: Record<string, string> = {
  sugerida: "bg-amber-100 text-amber-700",
  confirmada: "bg-blue-100 text-blue-700",
  recibida: "bg-green-100 text-green-700",
  cancelada: "bg-red-100 text-red-700",
};

const fmt = (n: number) => Number(n || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" });
const fmtFecha = (s: string | null) => (s ? new Date(s).toLocaleDateString("es-AR") : "—");

export default function ProveedorHome() {
  const { profile } = useAuth();
  const [ordenes, setOrdenes] = useState<any[]>([]);
  const [items, setItems] = useState<Record<string, any[]>>({});
  const [expandida, setExpandida] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.proveedor_id) { setLoading(false); return; }
    supabase
      .from("ordenes_compra")
      .select("*")
      .eq("proveedor_id", profile.proveedor_id)
      .order("fecha", { ascending: false })
      .then(({ data }) => { setOrdenes(data || []); setLoading(false); });
  }, [profile]);

  async function verItems(ordenId: string) {
    if (expandida === ordenId) { setExpandida(null); return; }
    setExpandida(ordenId);
    if (!items[ordenId]) {
      const { data } = await supabase
        .from("orden_compra_items")
        .select("*, productos(nombre)")
        .eq("orden_id", ordenId);
      setItems((it) => ({ ...it, [ordenId]: data || [] }));
    }
  }

  if (!profile?.proveedor_id) {
    return (
      <div>
        <PageHeader title="Mis Órdenes de Compra" subtitle="Portal de proveedor" />
        <p className="text-sm text-red-600">
          Tu usuario no está vinculado a ningún proveedor todavía. Pedile al Dueño/Administrador que revise tu alta en
          Usuarios y Permisos.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Mis Órdenes de Compra" subtitle="Órdenes de compra que te generó la distribuidora" />
      <div className="card overflow-x-auto">
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead><tr><th>Fecha</th><th>Estado</th><th>Origen</th><th>Notas</th><th></th></tr></thead>
            <tbody>
              {ordenes.map((o) => (
                <Fragment key={o.id}>
                  <tr>
                    <td>{fmtFecha(o.fecha)}</td>
                    <td><span className={`badge ${ESTADO_BADGE[o.estado] || ""}`}>{ESTADO_LABEL[o.estado] || o.estado}</span></td>
                    <td>{o.generada_automaticamente ? "Automática (stock mínimo)" : "Manual"}</td>
                    <td>{o.notas || "—"}</td>
                    <td><button className="text-xs text-accent underline" onClick={() => verItems(o.id)}>{expandida === o.id ? "Ocultar" : "Ver ítems"}</button></td>
                  </tr>
                  {expandida === o.id && (
                    <tr>
                      <td colSpan={5} className="bg-gray-50">
                        <div className="overflow-x-auto">
                          <table className="tbl">
                            <thead><tr><th>Producto</th><th>Cantidad</th><th>Costo unitario</th></tr></thead>
                            <tbody>
                              {(items[o.id] || []).map((it) => (
                                <tr key={it.id}>
                                  <td>{it.productos?.nombre || "—"}</td>
                                  <td>{it.cantidad}</td>
                                  <td>{it.costo_unitario ? fmt(it.costo_unitario) : "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {ordenes.length === 0 && <tr><td colSpan={5} className="text-center text-gray-400 py-6">Sin órdenes de compra todavía</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
