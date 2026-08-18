"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";
import ListaBadge from "@/components/ListaBadge";

const PASOS = ["pendiente", "aprobado", "en_preparacion", "despachado", "entregado"];
const PASO_LABEL: Record<string, string> = {
  pendiente: "Recibido", aprobado: "Aprobado", en_preparacion: "En preparación",
  despachado: "En camino", entregado: "Entregado", rechazado: "Rechazado", cancelado: "Cancelado",
};

export default function B2BPedidos() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.cliente_id) return;
    supabase.from("pedidos").select("*").eq("cliente_id", profile.cliente_id).order("fecha", { ascending: false })
      .then(({ data }) => { setRows(data || []); setLoading(false); });
  }, [profile]);

  return (
    <div>
      <PageHeader title="Mis Pedidos" subtitle="Estado en tiempo real de tus pedidos" />
      {loading ? <p className="text-gray-400">Cargando…</p> : (
        <div className="space-y-3">
          {rows.map((r) => {
            const idx = PASOS.indexOf(r.estado);
            const rechazado = ["rechazado", "cancelado"].includes(r.estado);
            return (
              <div key={r.id} className="card">
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <span className="font-semibold text-navy">Pedido #{r.numero}</span>
                    <ListaBadge lista={r.lista} />
                  </div>
                  <span className="text-sm font-semibold">{Number(r.total).toLocaleString("es-AR", { style: "currency", currency: "ARS" })}</span>
                </div>
                {rechazado ? (
                  <span className="badge bg-red-100 text-red-700">{PASO_LABEL[r.estado]}</span>
                ) : (
                  <div className="flex items-center gap-1">
                    {PASOS.map((p, i) => (
                      <div key={p} className="flex items-center flex-1">
                        <div className={`h-2 flex-1 rounded ${i <= idx ? "bg-accent" : "bg-gray-200"}`} />
                      </div>
                    ))}
                  </div>
                )}
                {!rechazado && <div className="text-xs text-gray-500 mt-1">{PASO_LABEL[r.estado]}</div>}
              </div>
            );
          })}
          {rows.length === 0 && <p className="text-gray-400">Todavía no realizaste pedidos.</p>}
        </div>
      )}
    </div>
  );
}
