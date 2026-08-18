"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";
import ListaBadge from "@/components/ListaBadge";
import CheckIn from "@/components/CheckIn";
import { notificarDuenos, notificarCobroWhatsapp } from "@/lib/notify";
import { exportarExcel, exportarPDF } from "@/lib/reportes";

const MEDIOS = [
  { value: "efectivo", label: "Efectivo" },
  { value: "cheque", label: "Cheque físico" },
  { value: "echeq", label: "Cheque electrónico (ECHEQ)" },
  { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "qr", label: "QR / link de pago" },
];

// Pantalla de cobro para vendedor/entrega con el flag profiles.puede_cobrar
// activo (Admin -> Usuarios). A diferencia de la Hoja de Cobro del rol
// dedicado "cobrador" (que opera sobre toda la cartera del tenant), acá el
// alcance queda acotado a los propios clientes: cartera asignada
// (clientes.vendedor_id) para vendedor, o clientes de sus hojas de ruta /
// entregas para el repartidor. El acotamiento real lo hace la base de datos
// (RLS + es_cliente_propio) — este filtro en el cliente es solo para no
// mostrar comprobantes que igualmente la base rechazaría al cobrar.
export default function CobroClientesPropios() {
  const { profile, tenant, permisos } = useAuth();
  const [comprobantes, setComprobantes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [cobradoHoy, setCobradoHoy] = useState(0);

  // RBAC dinámico — Fase 5: profiles.puede_cobrar queda retirada; se lee
  // directo de mis_permisos_activos() (Fase 4), fuente de verdad única.
  const habilitado = !!profile && ["vendedor", "entrega"].includes(profile.role) && permisos.has("cobros.clientes_propios");

  async function idsClientesPropios(): Promise<string[]> {
    if (!profile) return [];
    if (profile.role === "vendedor") {
      const { data } = await supabase.from("clientes").select("id").eq("vendedor_id", profile.id);
      return (data || []).map((c) => c.id);
    }
    // entrega: clientes de sus hojas de ruta + clientes a los que ya entregó
    const [{ data: paradas }, { data: entregas }] = await Promise.all([
      supabase.from("hoja_ruta_paradas").select("cliente_id, hojas_ruta!inner(responsable_id)").eq("hojas_ruta.responsable_id", profile.id),
      supabase.from("entregas").select("pedidos!inner(cliente_id)").eq("repartidor_id", profile.id),
    ]);
    const ids = new Set<string>();
    (paradas || []).forEach((p: any) => p.cliente_id && ids.add(p.cliente_id));
    (entregas || []).forEach((e: any) => e.pedidos?.cliente_id && ids.add(e.pedidos.cliente_id));
    return Array.from(ids);
  }

  async function load() {
    if (!habilitado || !profile) { setLoading(false); return; }
    const ids = await idsClientesPropios();
    if (ids.length === 0) {
      setComprobantes([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("comprobantes")
      .select("*, clientes(*)")
      .in("cliente_id", ids)
      .gt("saldo_pendiente", 0)
      .order("fecha_vencimiento");
    setComprobantes(data || []);

    const hoy = new Date().toISOString().slice(0, 10);
    const filtroActor = profile.role === "vendedor" ? { vendedor_id: profile.id } : { repartidor_id: profile.id };
    const { data: cobros } = await supabase.from("cobros").select("monto").match(filtroActor).gte("fecha", hoy);
    setCobradoHoy((cobros || []).reduce((s, c) => s + Number(c.monto), 0));
    setLoading(false);
  }
  useEffect(() => { load(); }, [profile]);

  async function registrarCobro(c: any) {
    const f = form[c.id] || {};
    if (!profile || !f.monto) return;
    const monto = Number(f.monto);
    let referencia_pago = f.referencia || null;
    if (f.medio === "qr") referencia_pago = `QR-DEMO-${Date.now()}`;

    const { data: cobroCreado, error } = await supabase.from("cobros").insert({
      tenant_id: profile.tenant_id,
      cliente_id: c.cliente_id,
      vendedor_id: profile.role === "vendedor" ? profile.id : null,
      repartidor_id: profile.role === "entrega" ? profile.id : null,
      lista: c.lista,
      comprobante_id: c.id,
      medio_pago: f.medio || "efectivo",
      monto,
      referencia_pago,
    }).select().single();

    if (error) {
      alert("No se pudo registrar el cobro: " + error.message.replace(/^.*?: /, ""));
      return;
    }

    const fechaHoy = new Date().toLocaleDateString("es-AR");
    await supabase.from("notificaciones").insert({
      tenant_id: profile.tenant_id, cliente_id: c.cliente_id, canal: "whatsapp", tipo: "recibo_cobro",
      mensaje: `Recibimos tu pago de $${monto.toFixed(0)} correspondiente al comprobante #${c.numero}. ¡Gracias!`,
      estado: "simulado",
    });
    await notificarDuenos(
      profile.tenant_id!,
      "aviso_cobro_interno",
      `Cobro registrado por ${profile.nombre} a ${c.clientes?.nombre} — $${monto.toFixed(0)} (comprobante #${c.numero}) el ${fechaHoy}.`
    );
    if (cobroCreado?.id) notificarCobroWhatsapp(cobroCreado.id);

    setAbierto(null);
    setForm({});
    load();
  }

  const fmt = (n: number) => Number(n).toLocaleString("es-AR", { style: "currency", currency: "ARS" });

  if (profile && !habilitado) {
    return (
      <div>
        <PageHeader title="Cobrar" subtitle="Permiso no habilitado" />
        <p className="text-sm text-gray-500">
          Todavía no tenés habilitado el cobro a tus clientes. Pedile al dueño/administrador que lo active
          desde Admin → Usuarios → "Puede cobrar".
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Cobrar a mis clientes"
        subtitle={profile?.role === "vendedor" ? "Comprobantes pendientes de tu cartera" : "Comprobantes pendientes de clientes en tus entregas"}
        live
      />

      <div className="card mb-4 flex justify-between items-center flex-wrap gap-3">
        <div>
          <div className="text-xs text-gray-500">Cobrado hoy</div>
          <div className="text-xl font-bold text-navy">{fmt(cobradoHoy)}</div>
        </div>
        {comprobantes.length > 0 && (
          <div className="flex gap-2">
            <button className="btn-secondary text-xs" onClick={() => exportarPDF(
              "Comprobantes pendientes",
              [{ header: "Cliente", key: "cliente" }, { header: "N°", key: "numero" }, { header: "Vence", key: "fecha_vencimiento" }, { header: "Saldo", key: "saldo_pendiente", formato: fmt }],
              comprobantes.map((c) => ({ ...c, cliente: c.clientes?.nombre })), "comprobantes_pendientes", { nombre: tenant?.nombre, logoUrl: tenant?.logo_url }
            )}>Exportar PDF</button>
            <button className="btn-secondary text-xs" onClick={() => exportarExcel(
              "Comprobantes",
              [{ header: "Cliente", key: "cliente" }, { header: "N°", key: "numero" }, { header: "Vence", key: "fecha_vencimiento" }, { header: "Saldo", key: "saldo_pendiente", formato: fmt }],
              comprobantes.map((c) => ({ ...c, cliente: c.clientes?.nombre })), "comprobantes_pendientes"
            )}>Exportar Excel</button>
          </div>
        )}
      </div>

      {loading ? <p className="text-gray-400">Cargando…</p> : (
        <div className="space-y-3">
          {comprobantes.map((c) => (
            <div key={c.id} className="card">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold text-navy">{c.clientes?.nombre}</div>
                  <div className="text-xs text-gray-500">Comprobante #{c.numero} · vence {c.fecha_vencimiento ? new Date(c.fecha_vencimiento).toLocaleDateString("es-AR") : "—"}</div>
                  <div className="mt-1 flex items-center gap-2"><ListaBadge lista={c.lista} /><span className="text-sm font-semibold">{fmt(c.saldo_pendiente)}</span></div>
                </div>
                <button className="text-xs text-accent underline" onClick={() => setAbierto(abierto === c.id ? null : c.id)}>
                  {abierto === c.id ? "Cerrar" : "Registrar cobro"}
                </button>
              </div>

              {abierto === c.id && (
                <div className="mt-3 space-y-3 border-t pt-3">
                  <CheckIn cliente={c.clientes} tipo="cobro" />
                  <div className="grid grid-cols-2 gap-2">
                    <select className="input" value={form[c.id]?.medio || "efectivo"} onChange={(e) => setForm({ ...form, [c.id]: { ...form[c.id], medio: e.target.value } })}>
                      {MEDIOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <input className="input" type="number" placeholder="Monto" value={form[c.id]?.monto || ""} onChange={(e) => setForm({ ...form, [c.id]: { ...form[c.id], monto: e.target.value } })} />
                  </div>
                  <input className="input" placeholder="Referencia (N° cheque / operación)" value={form[c.id]?.referencia || ""} onChange={(e) => setForm({ ...form, [c.id]: { ...form[c.id], referencia: e.target.value } })} />
                  <button className="btn-primary" onClick={() => registrarCobro(c)}>Confirmar cobro</button>
                </div>
              )}
            </div>
          ))}
          {comprobantes.length === 0 && <p className="text-gray-400">No hay comprobantes pendientes de tus clientes.</p>}
        </div>
      )}
    </div>
  );
}
