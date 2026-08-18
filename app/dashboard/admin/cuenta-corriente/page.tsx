"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PageHeader from "@/components/PageHeader";
import ListaBadge from "@/components/ListaBadge";

export default function CuentaCorrienteAdmin() {
  const [clientes, setClientes] = useState<any[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [movs, setMovs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("clientes").select("id, nombre").order("nombre").then(({ data }) => setClientes(data || []));
  }, []);

  useEffect(() => {
    if (!clienteId) { setMovs([]); return; }
    setLoading(true);
    supabase
      .from("cuenta_corriente_movimientos")
      .select("*")
      .eq("cliente_id", clienteId)
      .order("fecha", { ascending: false })
      .then(({ data }) => { setMovs(data || []); setLoading(false); });
  }, [clienteId]);

  const fmt = (n: number) => Number(n).toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  const saldo1 = movs.filter((m) => m.lista === 1)[0]?.saldo_resultante ?? 0;
  const saldo2 = movs.filter((m) => m.lista === 2)[0]?.saldo_resultante ?? 0;

  return (
    <div>
      <PageHeader title="Cuenta Corriente" subtitle="Vista consolidada — segregada por Lista 1 (facturado) y Lista 2 (gestión interna)" />

      <div className="card mb-6">
        <label className="text-xs font-semibold text-gray-600">Cliente</label>
        <select className="input" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
          <option value="">Seleccionar cliente…</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>

      {clienteId && (
        <>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="card"><div className="text-xs text-gray-500">Saldo Lista 1</div><div className="text-xl font-bold text-navy">{fmt(saldo1)}</div></div>
            <div className="card"><div className="text-xs text-gray-500">Saldo Lista 2</div><div className="text-xl font-bold text-navy">{fmt(saldo2)}</div></div>
          </div>

          <div className="card overflow-x-auto">
            {loading ? <p className="text-gray-400">Cargando…</p> : (
              <table className="tbl">
                <thead><tr><th>Fecha</th><th>Lista</th><th>Tipo</th><th>Descripción</th><th>Monto</th><th>Saldo</th></tr></thead>
                <tbody>
                  {movs.map((m) => (
                    <tr key={m.id}>
                      <td>{new Date(m.fecha).toLocaleDateString("es-AR")}</td>
                      <td><ListaBadge lista={m.lista} /></td>
                      <td className="capitalize">{m.tipo}</td>
                      <td>{m.descripcion}</td>
                      <td className={m.tipo === "debe" ? "text-red-600" : "text-green-600"}>{m.tipo === "debe" ? "+" : "-"}{fmt(m.monto)}</td>
                      <td>{fmt(m.saldo_resultante)}</td>
                    </tr>
                  ))}
                  {movs.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-6">Sin movimientos</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
