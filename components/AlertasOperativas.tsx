"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";

type Item = { texto: string; nivel: "amber" | "red" };

// Beep corto vía Web Audio API — sin archivos externos, sin dependencias.
function beep() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // Silencioso si el navegador bloquea audio sin interacción previa del usuario.
  }
}

// Alertas globales visuales (y sonoras al aparecer) para el Dueño y el
// personal con permisos delegados de Stock / Finanzas: stock bajo mínimo,
// productos por vencer, pagos a proveedores por vencer y clientes en mora o
// por encima de su límite de crédito.
export default function AlertasOperativas() {
  const { profile, tenant, permisos } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [cerrado, setCerrado] = useState(false);
  const sonoAlYaEmitido = useRef(false);

  useEffect(() => {
    if (!profile) return;
    const esDueno = profile.role === "dueno";
    const esSupervisor = profile.role === "supervisor";
    // RBAC dinámico — Fase 5: profiles.permiso_stock/permiso_finanzas quedan
    // retiradas; se lee directo de mis_permisos_activos() (Fase 4).
    const vePStock = esDueno || permisos.has("stock.acceso");
    const veFinanzas = esDueno || permisos.has("finanzas.acceso");
    const veCampo = esDueno || esSupervisor;
    if (!vePStock && !veFinanzas && !veCampo) return;

    (async () => {
      const nuevos: Item[] = [];
      const hoy = new Date();
      const diasAnticipacion = tenant?.dias_alerta_vencimiento_stock || 30;
      const enAnticipacion = new Date(hoy.getTime() + diasAnticipacion * 86400000).toISOString().slice(0, 10);
      const en7 = new Date(hoy.getTime() + 7 * 86400000).toISOString();

      if (vePStock) {
        const { data: prods } = await supabase.from("productos").select("nombre, stock, stock_minimo, unidad_medida");
        (prods || []).forEach((p: any) => {
          if (p.stock_minimo > 0 && Number(p.stock) <= Number(p.stock_minimo)) {
            nuevos.push({ texto: `Stock bajo mínimo: ${p.nombre} (${p.stock} ${p.unidad_medida}, mínimo ${p.stock_minimo})`, nivel: "amber" });
          }
        });
        const { data: vencen } = await supabase.from("productos").select("nombre, fecha_vencimiento").not("fecha_vencimiento", "is", null).lte("fecha_vencimiento", enAnticipacion);
        (vencen || []).forEach((p: any) => {
          nuevos.push({ texto: `Producto por vencer: ${p.nombre} (${new Date(p.fecha_vencimiento).toLocaleDateString("es-AR")})`, nivel: "red" });
        });
        const { data: lotesVencen } = await supabase
          .from("lotes_producto")
          .select("numero_lote, cantidad, fecha_vencimiento, productos(nombre)")
          .not("fecha_vencimiento", "is", null)
          .lte("fecha_vencimiento", enAnticipacion);
        (lotesVencen || []).forEach((l: any) => {
          nuevos.push({ texto: `Lote por vencer: ${l.productos?.nombre || "—"} — lote ${l.numero_lote || "s/n"} (${l.cantidad}) vence ${new Date(l.fecha_vencimiento).toLocaleDateString("es-AR")}`, nivel: "red" });
        });
      }

      if (veFinanzas) {
        const { data: pagos } = await supabase
          .from("proveedor_movimientos")
          .select("monto, fecha_vencimiento, proveedores(nombre)")
          .eq("tipo", "compra")
          .not("fecha_vencimiento", "is", null)
          .lte("fecha_vencimiento", en7);
        (pagos || []).forEach((m: any) => {
          nuevos.push({ texto: `Pago a proveedor por vencer: ${m.proveedores?.nombre || "—"} — ${new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(m.monto)}`, nivel: "amber" });
        });

        const { data: vencidos } = await supabase
          .from("comprobantes")
          .select("numero, saldo_pendiente, fecha_vencimiento, clientes(nombre)")
          .gt("saldo_pendiente", 0)
          .lt("fecha_vencimiento", hoy.toISOString());
        (vencidos || []).forEach((c: any) => {
          nuevos.push({ texto: `Cliente en mora: ${c.clientes?.nombre || "—"} — comprobante #${c.numero} vencido`, nivel: "red" });
        });

        const { data: deudas } = await supabase.from("comprobantes").select("cliente_id, saldo_pendiente, clientes(nombre, limite_credito)").gt("saldo_pendiente", 0);
        const porCliente: Record<string, { nombre: string; total: number; limite: number }> = {};
        (deudas || []).forEach((d: any) => {
          const id = d.cliente_id;
          if (!porCliente[id]) porCliente[id] = { nombre: d.clientes?.nombre || "—", total: 0, limite: Number(d.clientes?.limite_credito || 0) };
          porCliente[id].total += Number(d.saldo_pendiente);
        });
        Object.values(porCliente).forEach((c) => {
          if (c.limite > 0 && c.total > c.limite) {
            nuevos.push({ texto: `Cliente excede límite de crédito: ${c.nombre} (deuda ${new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(c.total)} / límite ${new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(c.limite)})`, nivel: "red" });
          }
        });

        // Fase E (agosto 2026): cheques propios por vencer — parte del
        // Centro de Alertas del KPI 13 del Panel Principal.
        const { data: chequesPorVencer } = await supabase
          .from("cheques_propios")
          .select("numero, beneficiario, monto, fecha_pago")
          .eq("estado", "pendiente")
          .lte("fecha_pago", enAnticipacion);
        (chequesPorVencer || []).forEach((c: any) => {
          nuevos.push({
            texto: `Cheque propio por vencer: #${c.numero} a ${c.beneficiario} — ${new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(c.monto)} (${new Date(c.fecha_pago).toLocaleDateString("es-AR")})`,
            nivel: "amber",
          });
        });
      }

      if (veCampo) {
        const { data: incumplimientos } = await supabase.rpc("fn_incumplimientos_visita", { p_dias_atras: 3 });
        (incumplimientos || []).forEach((i: any) => {
          nuevos.push({
            texto: `Incumplimiento de visita: ${i.vendedor_nombre} no visitó a ${i.cliente_nombre} (programado ${new Date(i.fecha_programada).toLocaleDateString("es-AR")})`,
            nivel: "amber",
          });
        });

        const desde3d = new Date(hoy.getTime() - 3 * 86400000).toISOString();
        const { data: fueraZona } = await supabase
          .from("visitas")
          .select("distancia_m, fecha, clientes(nombre), profiles!visitas_usuario_id_fkey(nombre)")
          .eq("tipo", "venta")
          .eq("dentro_geofence", false)
          .gte("fecha", desde3d)
          .order("fecha", { ascending: false })
          .limit(20);
        (fueraZona || []).forEach((v: any) => {
          nuevos.push({
            texto: `Intento de pedido fuera de zona: ${v.profiles?.nombre || "Vendedor"} en ${v.clientes?.nombre || "cliente"} (${v.distancia_m != null ? Math.round(v.distancia_m) + " m" : "sin distancia"}, ${new Date(v.fecha).toLocaleString("es-AR")})`,
            nivel: "red",
          });
        });
      }

      setItems(nuevos);
      if (nuevos.length > 0 && !sonoAlYaEmitido.current) {
        sonoAlYaEmitido.current = true;
        beep();
      }
    })();
  }, [profile]);

  if (!items.length || cerrado) return null;

  const hayRojas = items.some((i) => i.nivel === "red");

  return (
    <div className={`mb-4 rounded-md border px-4 py-3 ${hayRojas ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className={`text-sm font-semibold ${hayRojas ? "text-red-800" : "text-amber-800"}`}>
          {items.length} alerta{items.length !== 1 ? "s" : ""} operativa{items.length !== 1 ? "s" : ""}
        </div>
        <button className={`text-xs shrink-0 ${hayRojas ? "text-red-700/70 hover:text-red-900" : "text-amber-700/70 hover:text-amber-900"}`} onClick={() => setCerrado(true)}>
          Cerrar
        </button>
      </div>
      <ul className={`text-sm mt-1 space-y-0.5 ${hayRojas ? "text-red-800" : "text-amber-800"}`}>
        {items.slice(0, 8).map((it, i) => <li key={i}>• {it.texto}</li>)}
        {items.length > 8 && <li>… y {items.length - 8} más.</li>}
      </ul>
    </div>
  );
}
