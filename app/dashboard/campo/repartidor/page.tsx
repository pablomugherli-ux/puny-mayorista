"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";
import CheckIn from "@/components/CheckIn";
import SignaturePad from "@/components/SignaturePad";
import { optimizarRuta } from "@/lib/tsp";
import { obtenerPosicionActual } from "@/lib/geo";
import { notificarDuenos, notificarCobroWhatsapp } from "@/lib/notify";
import { ejecutarOEncolar, estaOnline, leerConCache } from "@/lib/offlineSync";

const MEDIOS = [
  { value: "efectivo", label: "Efectivo" },
  { value: "transferencia", label: "Transferencia" },
  { value: "qr", label: "QR / link de pago" },
];

export default function RepartidorHome() {
  const { profile } = useAuth();
  const [hoja, setHoja] = useState<any>(null);
  const [paradas, setParadas] = useState<any[]>([]);
  const [motivos, setMotivos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [optimizando, setOptimizando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [cobroAbierto, setCobroAbierto] = useState<string | null>(null);
  const [dentroGeofence, setDentroGeofence] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState<Record<string, any>>({});
  const [cobroForm, setCobroForm] = useState<Record<string, any>>({});
  const [rechazoCant, setRechazoCant] = useState<Record<string, Record<string, number>>>({});
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function load() {
    if (!profile) return;
    const hoy = new Date().toISOString().slice(0, 10);
    // Se cachea localmente para que la Hoja de Ruta se pueda seguir viendo (y
    // trabajando) sin conexión — el repartidor la necesita en la calle.
    const h = await leerConCache(`hoja_ruta:${profile.id}:${hoy}`, () =>
      supabase.from("hojas_ruta").select("*").eq("responsable_id", profile.id).eq("tipo", "despacho").eq("fecha", hoy).maybeSingle()
    );
    setHoja(h);
    if (h) {
      const p = await leerConCache(`paradas:${h.id}`, () =>
        supabase
          .from("hoja_ruta_paradas")
          .select("*, clientes(*), pedidos(id, numero, estado, lista, total, pedido_items(id, producto_id, cantidad, precio_unitario, productos(nombre)))")
          .eq("hoja_ruta_id", h.id)
          .order("orden")
      );
      setParadas(p || []);
    }
    const m = await leerConCache("motivos_rechazo:entrega", () => supabase.from("motivos_rechazo").select("*").eq("aplica_a", "entrega"));
    setMotivos(m || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [profile]);

  async function optimizar() {
    if (!hoja || paradas.length < 2) return;
    setOptimizando(true);
    try {
      const pos = await obtenerPosicionActual();
      const origen = { id: "origen", lat: pos.coords.latitude, lng: pos.coords.longitude };
      const puntos = paradas.filter((p) => p.clientes?.lat).map((p) => ({ id: p.id, lat: p.clientes.lat, lng: p.clientes.lng }));
      const { ruta, distanciaKm } = optimizarRuta(origen, puntos);
      let fallas = 0;
      for (let i = 0; i < ruta.length; i++) {
        const { error } = await supabase.from("hoja_ruta_paradas").update({ orden: i + 1 }).eq("id", ruta[i].id);
        if (error) fallas++;
      }
      const { error: errorHoja } = await supabase
        .from("hojas_ruta")
        .update({ optimizada_ia: true, distancia_km_estimada: distanciaKm, estado: "optimizada" })
        .eq("id", hoja.id);
      if (fallas > 0 || errorHoja) {
        alert(`La ruta se optimizó pero ${fallas > 0 ? `${fallas} parada(s) no se pudieron reordenar` : "no se pudo guardar el estado de la hoja"} — revisá el orden antes de salir.`);
      }
      await load();
    } catch {
      alert("No se pudo obtener tu ubicación para calcular el origen de la ruta.");
    }
    setOptimizando(false);
  }

  async function confirmarEntrega(parada: any) {
    const f = form[parada.id] || {};
    const estado = f.estado || "total";
    if (!profile) return;

    let firma_url: string | null = null;
    let foto_url: string | null = null;

    // La firma y la foto se suben a Supabase Storage, que requiere conexión
    // — no forman parte de la cola offline (esa cola es solo para filas de
    // base de datos, no archivos). Si no hay señal, la entrega igual se
    // confirma y queda encolada; la firma/foto quedan sin subir para esa
    // entrega puntual (gap conocido, ver reporte).
    if (estaOnline()) {
      if (f.firmaDataUrl) {
        const blob = await (await fetch(f.firmaDataUrl)).blob();
        const path = `firmas/${parada.id}-${Date.now()}.png`;
        const { data } = await supabase.storage.from("pod").upload(path, blob, { contentType: "image/png" });
        if (data) firma_url = supabase.storage.from("pod").getPublicUrl(data.path).data.publicUrl;
      }
      if (f.fotoFile) {
        const path = `fotos/${parada.id}-${Date.now()}-${f.fotoFile.name}`;
        const { data } = await supabase.storage.from("pod").upload(path, f.fotoFile);
        if (data) foto_url = supabase.storage.from("pod").getPublicUrl(data.path).data.publicUrl;
      }
    }

    // Igual que en Nuevo Pedido y Hoja de Cobro: id y fecha real los genera
    // el celular, no la base.
    const entregaId = crypto.randomUUID();
    const fecha = new Date().toISOString();

    const resEntrega = await ejecutarOEncolar({
      tabla: "entregas", tipo: "insert",
      payload: {
        id: entregaId,
        tenant_id: profile.tenant_id,
        pedido_id: parada.pedido_id,
        repartidor_id: profile.id,
        estado,
        motivo_rechazo_id: f.motivoId || null,
        firma_url, foto_url,
        dentro_geofence: dentroGeofence[parada.id] ?? null,
        fecha,
      },
      descripcion: `Entrega a ${parada.clientes?.nombre}`,
      tenantId: profile.tenant_id,
    });

    if (!resEntrega.ok) {
      alert("No se pudo registrar la entrega: " + (resEntrega.error || "").replace(/^.*?: /, ""));
      return;
    }

    // Devolución: rechazo total o parcial → registrar cantidades rechazadas por ítem.
    // Esto dispara en la base la restitución automática de stock (trigger sobre entrega_item_rechazos).
    if (estado === "rechazada" || estado === "parcial") {
      const cantidades = rechazoCant[parada.id] || {};
      const items = parada.pedidos?.pedido_items || [];
      const rechazos = items
        .map((it: any) => {
          // El input de cantidad rechazada solo tiene "max" en el HTML (no
          // bloquea nada de verdad) — hay que volver a acotarlo acá antes de
          // mandarlo, porque una cantidad rechazada mayor a la pedida
          // dispara una restitución de stock incorrecta (el trigger de la
          // base confía en este valor).
          const cantIngresada = estado === "rechazada" ? Number(it.cantidad) : Number(cantidades[it.id] || 0);
          const cant = Math.min(Math.max(cantIngresada, 0), Number(it.cantidad));
          if (cant <= 0) return null;
          return {
            id: crypto.randomUUID(),
            tenant_id: profile.tenant_id,
            entrega_id: entregaId,
            pedido_item_id: it.id,
            producto_id: it.producto_id,
            cantidad_rechazada: cant,
            motivo_rechazo_id: f.motivoId || null,
          };
        })
        .filter(Boolean);
      if (rechazos.length > 0) {
        await ejecutarOEncolar({
          tabla: "entrega_item_rechazos", tipo: "insert",
          payload: rechazos,
          descripcion: `Rechazos de entrega a ${parada.clientes?.nombre}`,
          tenantId: profile.tenant_id,
        });
      }
    }

    // pedidos.estado se sincroniza automáticamente en la base (trigger sobre
    // el insert de "entregas" arriba) — el rol "entrega" no tiene permiso de
    // UPDATE directo sobre pedidos, por diseño.
    await ejecutarOEncolar({
      tabla: "hoja_ruta_paradas", tipo: "update",
      payload: { estado: estado === "rechazada" ? "fallida" : "completada" },
      filtro: { id: parada.id },
      descripcion: `Estado de parada — ${parada.clientes?.nombre}`,
      tenantId: profile.tenant_id,
    });

    if (parada.clientes?.telefono && estaOnline()) {
      await supabase.from("notificaciones").insert({
        tenant_id: profile.tenant_id, cliente_id: parada.clientes.id, canal: "whatsapp", tipo: "entrega",
        mensaje: estado === "rechazada"
          ? `Tu pedido en ${parada.clientes.nombre} no pudo entregarse. Nos contactaremos para coordinar la devolución.`
          : estado === "parcial"
          ? `Tu pedido en ${parada.clientes.nombre} se entregó de forma parcial. Los ítems no entregados se acreditan automáticamente.`
          : `Tu pedido fue entregado en ${parada.clientes.nombre}. ¡Gracias por tu compra!`,
        estado: "simulado",
      });
    }

    setMensaje(resEntrega.encolado ? "Sin conexión: la entrega quedó guardada en el equipo y se sube sola apenas vuelva la señal." : "Entrega registrada correctamente.");
    setTimeout(() => setMensaje(null), 4000);
    setAbierto(null);
    load();
  }

  async function confirmarCobroContraEntrega(parada: any) {
    const f = cobroForm[parada.id] || {};
    if (!profile || !f.monto || Number(f.monto) <= 0) return;
    const monto = Number(f.monto);

    const cobroId = crypto.randomUUID();
    const fecha = new Date().toISOString();

    const resCobro = await ejecutarOEncolar({
      tabla: "cobros", tipo: "insert",
      payload: {
        id: cobroId,
        tenant_id: profile.tenant_id,
        cliente_id: parada.clientes.id,
        repartidor_id: profile.id,
        lista: parada.pedidos?.lista || 1,
        comprobante_id: null,
        medio_pago: f.medio || "efectivo",
        monto,
        referencia_pago: f.referencia || null,
        fecha,
      },
      descripcion: `Cobro contra-entrega a ${parada.clientes.nombre}`,
      tenantId: profile.tenant_id,
    });
    if (!resCobro.ok) {
      alert("No se pudo registrar el cobro: " + (resCobro.error || "").replace(/^.*?: /, ""));
      return;
    }

    if (estaOnline()) {
      const fechaHoy = new Date().toLocaleDateString("es-AR");
      await supabase.from("notificaciones").insert({
        tenant_id: profile.tenant_id, cliente_id: parada.clientes.id, canal: "whatsapp", tipo: "recibo_cobro",
        mensaje: `Recibimos tu pago contra-entrega de $${monto.toFixed(0)} el ${fechaHoy}. ¡Gracias!`,
        estado: "simulado",
      });
      await notificarDuenos(
        profile.tenant_id!,
        "aviso_cobro_interno",
        `Cobro contra-entrega registrado por ${profile.nombre} a ${parada.clientes.nombre} — $${monto.toFixed(0)} el ${fechaHoy}.`
      );
      // Envío real de WhatsApp (best effort): no bloquea el flujo si todavía
      // no están cargadas las credenciales de Meta en la Edge Function.
      notificarCobroWhatsapp(cobroId);
    }

    setCobroAbierto(null);
    setCobroForm({ ...cobroForm, [parada.id]: {} });
    setMensaje(resCobro.encolado ? "Sin conexión: el cobro quedó guardado en el equipo y se sube solo apenas vuelva la señal." : "Cobro contra-entrega registrado.");
    setTimeout(() => setMensaje(null), 4000);
  }

  return (
    <div>
      <PageHeader title="Hoja de Ruta — Despacho" subtitle={hoja ? `Fecha: ${hoja.fecha} · Estado: ${hoja.estado}` : "Sin hoja de ruta asignada para hoy"} live />

      {mensaje && <p className="text-sm text-green-700 mb-3">{mensaje}</p>}

      {hoja && (
        <div className="mb-4 flex items-center gap-3">
          <button className="btn-secondary text-xs" onClick={optimizar} disabled={optimizando}>
            {optimizando ? "Calculando ruta óptima…" : "Optimizar ruta con IA (TSP)"}
          </button>
          {hoja.optimizada_ia && (
            <span className="text-xs text-green-700">✓ Ruta optimizada — {Number(hoja.distancia_km_estimada).toFixed(1)} km estimados</span>
          )}
        </div>
      )}

      {loading ? <p className="text-gray-400">Cargando…</p> : !hoja ? (
        <p className="text-gray-400">No hay hoja de ruta de despacho asignada para hoy.</p>
      ) : (
        <div className="space-y-3">
          {paradas.map((p) => (
            <div key={p.id} className="card">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-xs text-gray-400">Parada #{p.orden}</div>
                  <div className="font-semibold text-navy">{p.clientes?.nombre}</div>
                  <div className="text-xs text-gray-500">{p.clientes?.direccion}</div>
                  {p.pedidos && <div className="text-xs mt-1">Pedido #{p.pedidos.numero} — {Number(p.pedidos.total).toLocaleString("es-AR", { style: "currency", currency: "ARS" })}</div>}
                </div>
                <span className={`badge ${p.estado === "completada" ? "bg-green-100 text-green-700" : p.estado === "fallida" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
                  {p.estado}
                </span>
              </div>

              {p.estado === "pendiente" && (
                <div className="mt-3">
                  <div className="flex items-center gap-3 mb-2">
                    <button className="text-xs text-accent underline" onClick={() => setAbierto(abierto === p.id ? null : p.id)}>
                      {abierto === p.id ? "Cerrar" : "Registrar entrega"}
                    </button>
                    <button className="text-xs text-accent underline" onClick={() => setCobroAbierto(cobroAbierto === p.id ? null : p.id)}>
                      {cobroAbierto === p.id ? "Cerrar cobro" : "Cobro contra-entrega"}
                    </button>
                  </div>

                  {cobroAbierto === p.id && (
                    <div className="mb-3 space-y-3 border-t pt-3 bg-gray-50 -mx-4 px-4 py-3">
                      <div className="grid grid-cols-2 gap-2">
                        <select className="input" value={cobroForm[p.id]?.medio || "efectivo"} onChange={(e) => setCobroForm({ ...cobroForm, [p.id]: { ...cobroForm[p.id], medio: e.target.value } })}>
                          {MEDIOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                        <input className="input" type="number" placeholder="Monto" value={cobroForm[p.id]?.monto || ""} onChange={(e) => setCobroForm({ ...cobroForm, [p.id]: { ...cobroForm[p.id], monto: e.target.value } })} />
                      </div>
                      <input className="input" placeholder="Referencia (opcional)" value={cobroForm[p.id]?.referencia || ""} onChange={(e) => setCobroForm({ ...cobroForm, [p.id]: { ...cobroForm[p.id], referencia: e.target.value } })} />
                      <button className="btn-primary text-xs" onClick={() => confirmarCobroContraEntrega(p)}>Confirmar cobro contra-entrega</button>
                    </div>
                  )}

                  {abierto === p.id && (
                    <div className="mt-3 space-y-3 border-t pt-3">
                      <CheckIn cliente={p.clientes} tipo="entrega" onDone={(dentro) => setDentroGeofence((s) => ({ ...s, [p.id]: dentro }))} />
                      <select className="input" value={form[p.id]?.estado || "total"} onChange={(e) => setForm({ ...form, [p.id]: { ...form[p.id], estado: e.target.value } })}>
                        <option value="total">Entrega total</option>
                        <option value="parcial">Entrega parcial</option>
                        <option value="rechazada">Rechazada</option>
                      </select>
                      {form[p.id]?.estado && form[p.id]?.estado !== "total" && (
                        <select className="input" value={form[p.id]?.motivoId || ""} onChange={(e) => setForm({ ...form, [p.id]: { ...form[p.id], motivoId: e.target.value } })}>
                          <option value="">Motivo…</option>
                          {motivos.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                        </select>
                      )}

                      {form[p.id]?.estado === "parcial" && (
                        <div className="border rounded-md p-3 bg-amber-50">
                          <div className="text-xs font-semibold text-gray-700 mb-2">Cantidad rechazada por ítem (se restituye stock y se ajusta cuenta corriente)</div>
                          <div className="space-y-2">
                            {(p.pedidos?.pedido_items || []).map((it: any) => (
                              <div key={it.id} className="flex items-center justify-between gap-2 text-xs">
                                <span>{it.productos?.nombre} <span className="text-gray-400">(pedido: {it.cantidad})</span></span>
                                <input
                                  type="number" min={0} max={it.cantidad} className="input w-20"
                                  value={rechazoCant[p.id]?.[it.id] ?? ""}
                                  onChange={(e) => setRechazoCant({
                                    ...rechazoCant,
                                    [p.id]: { ...(rechazoCant[p.id] || {}), [it.id]: Number(e.target.value) },
                                  })}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="text-xs font-semibold text-gray-600">Firma del cliente (PoD)</label>
                        <SignaturePad onChange={(url) => setForm({ ...form, [p.id]: { ...form[p.id], firmaDataUrl: url } })} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-gray-600">Foto del remito/comprobante</label>
                        <input type="file" accept="image/*" capture="environment" className="input"
                          onChange={(e) => setForm({ ...form, [p.id]: { ...form[p.id], fotoFile: e.target.files?.[0] } })} />
                      </div>
                      <button className="btn-primary" onClick={() => confirmarEntrega(p)}>Confirmar entrega</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
