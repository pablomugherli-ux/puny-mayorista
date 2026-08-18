"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";

const fmt = (n: number) => Number(n || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" });
const fmtFecha = (s: string | null) => (s ? new Date(s).toLocaleDateString("es-AR") : "—");

export default function ProveedorCuentaCorriente() {
  const { profile } = useAuth();
  const [movs, setMovs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.proveedor_id) { setLoading(false); return; }
    supabase
      .from("proveedor_movimientos")
      .select("*")
      .eq("proveedor_id", profile.proveedor_id)
      .order("fecha", { ascending: false })
      .then(({ data }) => { setMovs(data || []); setLoading(false); });
  }, [profile]);

  const saldo = movs[0]?.saldo_resultante ?? 0;

  return (
    <div>
      <PageHeader title="Cuenta Corriente" subtitle="Tus compras, pagos recibidos y saldo con la distribuidora" />
      {loading ? <p className="text-gray-400">Cargando…</p> : !profile?.proveedor_id ? (
        <p className="text-sm text-red-600">Tu usuario no está vinculado a ningún proveedor todavía.</p>
      ) : (
        <>
          <div className="card mb-6 max-w-xs">
            <div className="text-xs text-gray-500">Saldo actual</div>
            <div className="text-xl font-bold text-navy">{fmt(saldo)}</div>
          </div>
          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Saldo resultante</th><th>Comprobante</th><th>Descripción</th></tr></thead>
              <tbody>
                {movs.map((m) => (
                  <tr key={m.id}>
                    <td>{fmtFecha(m.fecha)}</td>
                    <td className="capitalize">{m.tipo}</td>
                    <td className={m.tipo === "compra" ? "text-red-600" : "text-green-600"}>{fmt(m.monto)}</td>
                    <td>{fmt(m.saldo_resultante)}</td>
                    <td>{m.comprobante_ref || "—"}</td>
                    <td>{m.descripcion || "—"}</td>
                  </tr>
                ))}
                {movs.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-6">Sin movimientos todavía</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
