"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import StatCard from "@/components/StatCard";
import { PlusCircle, Wallet, PackageSearch, LayoutDashboard } from "lucide-react";

const fmtMoneda = (n: number) => Number(n || 0).toLocaleString("es-AR", { style: "currency", currency: "ARS" });

function hoyRango() {
  const inicio = new Date(); inicio.setHours(0, 0, 0, 0);
  const fin = new Date(); fin.setHours(23, 59, 59, 999);
  return { inicio: inicio.toISOString(), fin: fin.toISOString() };
}

export default function PanelInicio() {
  const [ventasHoy, setVentasHoy] = useState(0);
  const [cobranzaHoy, setCobranzaHoy] = useState(0);
  const [pedidosPendientes, setPedidosPendientes] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { inicio, fin } = hoyRango();
      const [{ data: pedidos }, { data: cobros }, { count }] = await Promise.all([
        supabase.from("pedidos").select("total").gte("fecha", inicio).lte("fecha", fin),
        supabase.from("cobros").select("monto").gte("fecha", inicio).lte("fecha", fin),
        supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
      ]);
      setVentasHoy((pedidos || []).reduce((s: number, p: any) => s + Number(p.total || 0), 0));
      setCobranzaHoy((cobros || []).reduce((s: number, c: any) => s + Number(c.monto || 0), 0));
      setPedidosPendientes(count || 0);
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      <h1 className="text-xl font-bold text-navy mb-1">Inicio</h1>
      <p className="text-sm text-gray-500 mb-4">Panorama del día. Las alertas operativas (stock, vencimientos, mora) se muestran arriba de esta página cuando corresponde.</p>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Ventas de hoy" value={loading ? "…" : fmtMoneda(ventasHoy)} tech />
        <StatCard label="Cobranza de hoy" value={loading ? "…" : fmtMoneda(cobranzaHoy)} />
        <StatCard label="Pedidos pendientes" value={loading ? "…" : String(pedidosPendientes)} />
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-navy mb-3">Accesos rápidos</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link href="/dashboard/admin/panel-ventas?tab=pedidos" className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-100 hover:bg-gray-50 text-center">
            <PlusCircle size={22} className="text-navy" />
            <span className="text-xs font-medium text-gray-700">Nuevo Pedido</span>
          </Link>
          <Link href="/dashboard/admin/panel-finanzas?tab=finanzas" className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-100 hover:bg-gray-50 text-center">
            <Wallet size={22} className="text-navy" />
            <span className="text-xs font-medium text-gray-700">Ver Caja</span>
          </Link>
          <Link href="/dashboard/admin/panel-finanzas?tab=stock" className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-100 hover:bg-gray-50 text-center">
            <PackageSearch size={22} className="text-navy" />
            <span className="text-xs font-medium text-gray-700">Stock por vencer</span>
          </Link>
          <Link href="/dashboard/admin/panel-informes?tab=ejecutivo" className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-100 hover:bg-gray-50 text-center">
            <LayoutDashboard size={22} className="text-navy" />
            <span className="text-xs font-medium text-gray-700">Dashboard Ejecutivo</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
