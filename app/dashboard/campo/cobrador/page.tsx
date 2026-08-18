"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";
import ListaBadge from "@/components/ListaBadge";
import CheckIn from "@/components/CheckIn";
import { notificarDuenos, notificarCobroWhatsapp } from "@/lib/notify";
import { exportarExcel, exportarPDF } from "@/lib/reportes";
import { ejecutarOEncolar, estaOnline, leerConCache } from "@/lib/offlineSync";

const MEDIOS = [
  { value: "efectivo", label: "Efectivo" },
  { value: "cheque", label: "Cheque físico" },
  { value: "echeq", label: "Cheque electrónico (ECHEQ)" },
  { value: "transferencia", label: "Transferencia" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "qr", label: "QR / link de pago" },
];

export default function CobradorHome() {
  const { profile, tenant } = useAuth();
  const [comprobantes, setComprobantes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [cobradoHoy, setCobradoHoy] = useState(0);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [errorCobro, setErrorCobro] = useState<string | null>(null);

  async function load() {
    // Se cachea localmente para que la Hoja de Cobro se pueda seguir viendo
    // (y usando) sin conexión — es la lista de comprobantes pendientes que el
    // cobrador necesita en la calle.
    const data = await leerConCache("comprobantes:pendientes", () =>
      supabase.from("comprobantes").select("*, clientes(*)").gt("saldo_pendiente", 0).order("fecha_vencimiento")
    );
    setComprobantes(data || []);

    // "Cobrado hoy" es solo informativo y requiere una consulta en vivo — si
    // no hay conexión, se omite sin romper el resto de la pantalla.
    if (profile && estaOnline()) {
      const hoy = new Date().toISOString().slice(0, 10);
      const { data: cobros } = await supabase.from("cobros").select("monto").eq("cobrador_id", profile.id).gte("fecha", hoy);
      setCobradoHoy((cobros || []).reduce((s, c) => s + Number(c.monto), 0));
    }
    setLoading(false);
  }
  useEffect(() => { load(); }, [profile]);

  async function registrarCobro(c: any) {
    const f = form[c.id] || {};
    if (!profile || !f.monto) return;
    const monto = Number(f.monto);
    let referencia_pago = f.referencia || null;
    if (f.medio === "qr") referencia_pago = `QR-DEMO-${Date.now()}`;
    setErrorCobro(null);

    // Igual que en Nuevo Pedido: el id y la fecha real del cobro los genera
    // el celular, no la base, para que quede la hora real del cobro (no la
    // de sincronización) y para que un reintento no duplique el cobro.
    const cobroId = crypto.randomUUID();
    const fecha = new Date().toISOString();

    const resCobro = await ejecutarOEncolar({
      tabla: "cobros", tipo: "insert",
      payload: {
        id: cobroId,
        tenant_id: profile.tenant_id,
        cliente_id: c.cliente_id,
        cobrador_id: profile.id,
        lista: c.lista,
        comprobante_id: c.id,
        medio_pago: f.medio || "efectivo",
        monto,
        referencia_pago,
        fecha,
      },
      descripcion: `Cobro a ${c.clientes?.nombre} — $${monto.toFixed(0)}`,
      tenantId: profile.tenant_id,
    });

    if (!resCobro.ok) {
      setErrorCobro((resCobro.error || "").replace(/^.*?: /, ""));
      return;
    }

    // Notificaciones (WhatsApp al cliente, aviso interno a Dueños): son de
    // cortesía y requieren conexión — si no hay, se omiten sin más, igual
    // que en Nuevo Pedido.
    if (estaOnline()) {
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
      // Envío real de WhatsApp (best effort): no bloquea el flujo si todavía
      // no están cargadas las credenciales de Meta en la Edge Function.
      notificarCobroWhatsapp(cobroId);
    }

    setMensaje(resCobro.encolado ? "Sin conexión: el cobro quedó guardado en el equipo y se sube solo apenas vuelva la señal." : "Cobro registrado correctamente.");
    setTimeout(() => setMensaje(null), 4000);
    setAbierto(null);
    setForm({});
    load();
  }

  const fmt = (n: number) => Number(n).toLocaleString("es-AR", { style: "currency", currency: "ARS" });

  return (
    <div>
      <PageHeader title="Hoja de Cobro" subtitle="Comprobantes pendientes imputables por medio de pago" live />

      {mensaje && <p className="text-sm text-green-700 mb-3">{mensaje}</p>}

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
                  {errorCobro && abierto === c.id && <p className="text-sm text-red-600">{errorCobro}</p>}
                </div>
              )}
            </div>
          ))}
          {comprobantes.length === 0 && <p className="text-gray-400">No hay comprobantes pendientes visibles con tus permisos actuales.</p>}
        </div>
      )}
    </div>
  );
}
