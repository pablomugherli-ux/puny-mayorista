"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PageHeader from "@/components/PageHeader";

export default function NotificacionesAdmin() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("notificaciones").select("*, clientes(nombre, telefono)").order("fecha", { ascending: false }).limit(100)
      .then(({ data }) => { setRows(data || []); setLoading(false); });
  }, []);

  return (
    <div>
      <PageHeader
        title="Notificaciones WhatsApp"
        subtitle="Registro simulado — se activa con credenciales reales de WhatsApp Business API"
      />
      <div className="card mb-4 bg-amber-50 border-amber-200 text-amber-800 text-xs">
        Integración en modo stub: los mensajes se generan y quedan registrados aquí en lugar de enviarse por la
        API real de Meta/WhatsApp Business, que requiere cuenta verificada y plantillas aprobadas.
      </div>
      <div className="card overflow-x-auto">
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead><tr><th>Fecha</th><th>Cliente</th><th>Teléfono</th><th>Tipo</th><th>Mensaje</th><th>Estado</th></tr></thead>
            <tbody>
              {rows.map((n) => (
                <tr key={n.id}>
                  <td>{new Date(n.fecha).toLocaleString("es-AR")}</td>
                  <td>{n.clientes?.nombre}</td>
                  <td>{n.clientes?.telefono}</td>
                  <td className="capitalize">{n.tipo.replace("_", " ")}</td>
                  <td className="max-w-md">{n.mensaje}</td>
                  <td><span className="badge bg-gray-100 text-gray-600">{n.estado}</span></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-6">Sin notificaciones aún</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
