"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";
import ListaBadge from "@/components/ListaBadge";

export default function B2BCuentaCorriente() {
  const { profile } = useAuth();
  const [movs, setMovs] = useState<any[]>([]);
  const [comprobantes, setComprobantes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.cliente_id) return;
    Promise.all([
      supabase.from("cuenta_corriente_movimientos").select("*").eq("cliente_id", profile.cliente_id).order("fecha", { ascending: false }),
      supabase.from("comprobantes").select("*").eq("cliente_id", profile.cliente_id).order("fecha", { ascending: false }),
    ]).then(([{ data: m }, { data: c }]) => { setMovs(m || []); setComprobantes(c || []); setLoading(false); });
  }, [profile]);

  function descargar(c: any) {
    const contenido = `PUNY MAYORISTA\nComprobante #${c.numero} — Tipo: ${c.tipo}\nLista: ${c.lista}\nTotal: $${c.total}\nSaldo pendiente: $${c.saldo_pendiente}\nFecha: ${new Date(c.fecha).toLocaleDateString("es-AR")}\nVencimiento: ${c.fecha_vencimiento ? new Date(c.fecha_vencimiento).toLocaleDateString("es-AR") : "-"}\n\n(Documento de demostración — no válido como comprobante fiscal)`;
    const blob = new Blob([contenido], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `comprobante-${c.numero}.txt`; a.click();
    URL.revokeObjectURL(url);
  }

  const fmt = (n: number) => Number(n).toLocaleString("es-AR", { style: "currency", currency: "ARS" });
  const saldo1 = movs.filter((m) => m.lista === 1)[0]?.saldo_resultante ?? 0;
  const saldo2 = movs.filter((m) => m.lista === 2)[0]?.saldo_resultante ?? 0;

  return (
    <div>
      <PageHeader title="Cuenta Corriente" subtitle="Saldos, vencimientos y comprobantes según tu lista habilitada" />
      {loading ? <p className="text-gray-400">Cargando…</p> : (
        <>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="card"><div className="text-xs text-gray-500">Saldo Lista 1</div><div className="text-xl font-bold text-navy">{fmt(saldo1)}</div></div>
            <div className="card"><div className="text-xs text-gray-500">Saldo Lista 2</div><div className="text-xl font-bold text-navy">{fmt(saldo2)}</div></div>
          </div>

          <div className="card overflow-x-auto mb-6">
            <h3 className="text-sm font-semibold text-navy mb-3">Comprobantes</h3>
            <table className="tbl">
              <thead><tr><th>N°</th><th>Tipo</th><th>Lista</th><th>Total</th><th>Saldo</th><th>Vencimiento</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {comprobantes.map((c) => (
                  <tr key={c.id}>
                    <td>#{c.numero}</td>
                    <td className="capitalize">{c.tipo.replace("_", " ")}</td>
                    <td><ListaBadge lista={c.lista} /></td>
                    <td>{fmt(c.total)}</td>
                    <td>{fmt(c.saldo_pendiente)}</td>
                    <td>{c.fecha_vencimiento ? new Date(c.fecha_vencimiento).toLocaleDateString("es-AR") : "—"}</td>
                    <td className="capitalize">{c.estado.replace("_", " ")}</td>
                    <td><button className="text-xs text-accent underline" onClick={() => descargar(c)}>Descargar</button></td>
                  </tr>
                ))}
                {comprobantes.length === 0 && <tr><td colSpan={8} className="text-center text-gray-400 py-6">Sin comprobantes</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="card overflow-x-auto">
            <h3 className="text-sm font-semibold text-navy mb-3">Movimientos</h3>
            <table className="tbl">
              <thead><tr><th>Fecha</th><th>Lista</th><th>Tipo</th><th>Descripción</th><th>Monto</th></tr></thead>
              <tbody>
                {movs.map((m) => (
                  <tr key={m.id}>
                    <td>{new Date(m.fecha).toLocaleDateString("es-AR")}</td>
                    <td><ListaBadge lista={m.lista} /></td>
                    <td className="capitalize">{m.tipo}</td>
                    <td>{m.descripcion}</td>
                    <td className={m.tipo === "debe" ? "text-red-600" : "text-green-600"}>{m.tipo === "debe" ? "+" : "-"}{fmt(m.monto)}</td>
                  </tr>
                ))}
                {movs.length === 0 && <tr><td colSpan={5} className="text-center text-gray-400 py-6">Sin movimientos</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
