"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";
import { distanciaMetros, obtenerPosicionActual } from "@/lib/geo";
import { ejecutarOEncolar, estaOnline, leerConCache } from "@/lib/offlineSync";

function NuevoPedidoInner() {
  const { profile } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const clienteIdParam = params.get("cliente") || "";

  const [clientes, setClientes] = useState<any[]>([]);
  const [clienteId, setClienteId] = useState(clienteIdParam);
  const [lista, setLista] = useState<1 | 2>(1);
  const [productos, setProductos] = useState<any[]>([]);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [descuentos, setDescuentos] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [errorPedido, setErrorPedido] = useState<string | null>(null);

  const [ubicando, setUbicando] = useState(false);
  const [geo, setGeo] = useState<{ lat: number; lng: number; distancia: number | null; dentro: boolean } | null>(null);
  const [errorGeo, setErrorGeo] = useState<string | null>(null);

  const [codigoEscaneado, setCodigoEscaneado] = useState("");
  const [avisoScan, setAvisoScan] = useState<string | null>(null);
  const [balanzaConectada, setBalanzaConectada] = useState(false);
  const [pesoBalanza, setPesoBalanza] = useState<string | null>(null);

  // Los tres catálogos de acá abajo se guardan en el equipo (leerConCache) la
  // primera vez que cargan con conexión, para que esta pantalla se pueda
  // seguir usando sin señal — sin esto, el vendedor abriría "Nuevo pedido"
  // en la calle y vería todo vacío aunque la carga offline esté resuelta.
  useEffect(() => {
    if (!profile) return;
    leerConCache(`clientes:${profile.id}`, () =>
      supabase.from("clientes").select("*, circuitos(nombre)").eq("vendedor_id", profile.id)
    ).then((data) => setClientes(data || []));
  }, [profile]);

  useEffect(() => {
    leerConCache("productos:catalogo", () =>
      supabase.from("productos").select("*, listas_precio(lista, precio)").eq("activo", true).order("nombre")
    ).then((data) => setProductos(data || []));
    leerConCache("descuentos_volumen", () => supabase.from("descuentos_volumen").select("*")).then((data) => setDescuentos(data || []));
  }, []);

  // Al cambiar de cliente, se resetea la validación de ubicación previa
  useEffect(() => {
    setGeo(null);
    setErrorGeo(null);
    setErrorPedido(null);
  }, [clienteId]);

  const cliente = clientes.find((c) => c.id === clienteId);
  const requiereZona = !!cliente?.circuito_id;
  const ubicacionConfirmada = !requiereZona || (geo != null && geo.dentro);

  async function confirmarUbicacion() {
    if (!cliente) return;
    setUbicando(true);
    setErrorGeo(null);
    try {
      const pos = await obtenerPosicionActual();
      const { latitude, longitude } = pos.coords;
      const distancia = distanciaMetros(latitude, longitude, cliente.lat, cliente.lng);
      const dentro = distancia != null ? distancia <= (cliente.radio_geofence_m || 150) : false;
      setGeo({ lat: latitude, lng: longitude, distancia, dentro });
      // Se deja constancia de todo intento de confirmación de ubicación (dentro o
      // fuera del geofence) en `visitas`, igual que el check-in de CheckIn.tsx. Esto
      // es lo que le permite al Dueño ver, en Alertas Operativas, cuándo un vendedor
      // intentó cargar un pedido estando fuera de la ubicación del cliente.
      if (profile) {
        await ejecutarOEncolar({
          tabla: "visitas", tipo: "insert",
          payload: {
            tenant_id: profile.tenant_id, cliente_id: cliente.id, usuario_id: profile.id,
            tipo: "venta", dentro_geofence: dentro, distancia_m: distancia, lat: latitude, lng: longitude,
            novedad: dentro ? null : "Intento de carga de pedido fuera del geofence del cliente",
            fecha: new Date().toISOString(),
          },
          descripcion: `Check-in de ubicación — ${cliente.nombre}`,
          tenantId: profile.tenant_id,
        });
      }
    } catch {
      setErrorGeo("No se pudo obtener tu ubicación. Verificá que el navegador tenga permiso de geolocalización.");
    }
    setUbicando(false);
  }

  // Lector de código de barras: cualquier lector USB/Bluetooth estándar
  // funciona en modo teclado (HID) — "tipea" el código y termina con Enter.
  // No requiere driver ni configuración: solo escuchamos ese patrón acá.
  function onScanKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const codigo = codigoEscaneado.trim();
    setCodigoEscaneado("");
    if (!codigo) return;
    const prod = productos.find((p) => p.sku === codigo);
    if (!prod) {
      setAvisoScan(`Sin coincidencia para el código "${codigo}".`);
      return;
    }
    setCantidades((c) => ({ ...c, [prod.id]: (c[prod.id] || 0) + 1 }));
    setAvisoScan(`+1 ${prod.nombre}`);
  }

  // Balanza comercial vía Web Serial API (Chrome/Edge, requiere HTTPS).
  // El protocolo de lectura de peso es específico de cada marca/modelo — acá
  // se deja el scaffold de conexión listo; el parseo de bytes se completa en
  // Admin > Integraciones una vez confirmada la marca/modelo real.
  async function conectarBalanza() {
    const serial = (navigator as any).serial;
    if (!serial) {
      setAvisoScan("Este navegador no soporta Web Serial API (usá Chrome o Edge por HTTPS).");
      return;
    }
    try {
      await serial.requestPort();
      setBalanzaConectada(true);
      setAvisoScan("Balanza conectada. El parseo del protocolo de peso queda pendiente de confirmar marca/modelo en Integraciones — por ahora, cargá el peso manualmente abajo.");
    } catch {
      setAvisoScan("No se pudo conectar la balanza (¿cancelaste el selector de puerto?).");
    }
  }

  function precioDe(prod: any, lista: number) {
    return prod.listas_precio?.find((l: any) => l.lista === lista)?.precio || 0;
  }
  function descuentoDe(productoId: string, lista: number, cantidad: number) {
    const aplicables = descuentos.filter((d) => d.producto_id === productoId && d.lista === lista && cantidad >= d.cantidad_minima);
    if (!aplicables.length) return 0;
    return Math.max(...aplicables.map((d) => d.descuento_pct));
  }

  const items = productos
    .map((p) => {
      const cant = cantidades[p.id] || 0;
      if (cant <= 0) return null;
      const precio = precioDe(p, lista);
      const desc = descuentoDe(p.id, lista, cant);
      const subtotal = cant * precio * (1 - desc / 100);
      return { producto: p, cantidad: cant, precio, descuento: desc, subtotal };
    })
    .filter(Boolean) as any[];

  const total = items.reduce((s, i) => s + i.subtotal, 0);
  const itemsSinStock = items.filter((i) => i.cantidad > (i.producto.stock ?? 0));
  const stockSuficiente = itemsSinStock.length === 0;

  async function confirmarPedido() {
    if (!cliente || !profile || items.length === 0 || !ubicacionConfirmada || !stockSuficiente) return;
    setSaving(true);
    setErrorPedido(null);

    // El id del pedido lo genera el celular, no la base — así, si se corta la
    // conexión a mitad de camino y el pedido queda en la cola offline, un
    // reintento posterior no lo puede duplicar (ver lib/offlineSync.ts).
    const pedidoId = crypto.randomUUID();
    const fecha = new Date().toISOString();

    const resPedido = await ejecutarOEncolar({
      tabla: "pedidos", tipo: "insert",
      payload: {
        id: pedidoId,
        tenant_id: profile.tenant_id,
        cliente_id: cliente.id,
        vendedor_id: profile.id,
        lista,
        estado: "pendiente",
        origen: "campo",
        lat_carga: geo?.lat ?? null,
        lng_carga: geo?.lng ?? null,
        fecha,
      },
      descripcion: `Pedido a ${cliente.nombre} — $${total.toFixed(0)}`,
      tenantId: profile.tenant_id,
    });

    if (!resPedido.ok) {
      // Solo llega acá si hubo conexión y el rechazo fue real (ej. el trigger
      // de geofencing en la base detectó que no estás donde decís) — no es
      // un problema de red, así que no tiene sentido reintentar solo.
      setErrorPedido((resPedido.error || "").replace(/^.*?: /, ""));
      setSaving(false);
      return;
    }

    await ejecutarOEncolar({
      tabla: "pedido_items", tipo: "insert",
      payload: items.map((i) => ({
        id: crypto.randomUUID(), pedido_id: pedidoId, producto_id: i.producto.id, cantidad: i.cantidad,
        precio_unitario: i.precio, descuento_pct: i.descuento, subtotal: i.subtotal,
      })),
      descripcion: `Ítems del pedido a ${cliente.nombre}`,
      tenantId: profile.tenant_id,
    });

    // La notificación de WhatsApp es de cortesía (está simulada igual) — si
    // no hay conexión no vale la pena encolarla, se omite sin más.
    if (estaOnline()) {
      await supabase.from("notificaciones").insert({
        tenant_id: profile.tenant_id, cliente_id: cliente.id, canal: "whatsapp", tipo: "confirmacion_pedido",
        mensaje: `Hola ${cliente.nombre}, confirmamos tu pedido por un total de $${total.toFixed(0)}. Te avisaremos cuando esté en camino.`,
        estado: "simulado",
      });
    }

    setMensaje(resPedido.encolado ? "Sin conexión: el pedido quedó guardado en el equipo y se sube solo apenas vuelva la señal." : "Pedido registrado correctamente.");
    setTimeout(() => router.push("/dashboard/campo/vendedor/pedidos"), 1400);
    setSaving(false);
  }

  return (
    <div>
      <PageHeader title="Nuevo pedido" subtitle="Catálogo interactivo con stock, descuentos por volumen y doble lista de precio" />

      <div className="card mb-4 grid md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-semibold text-gray-600">Cliente</label>
          <select className="input" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Seleccionar…</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.circuitos ? "" : " (fuera de zona)"}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-600">Lista de precio</label>
          <select className="input" value={lista} onChange={(e) => setLista(Number(e.target.value) as 1 | 2)}>
            {(!cliente || cliente.lista_1_habilitada) && <option value={1}>Lista 1 — Oficial / Facturado</option>}
            {cliente?.lista_2_habilitada && <option value={2}>Lista 2 — Gestión interna</option>}
          </select>
        </div>
        {cliente && (
          <div className="text-xs text-gray-500 self-end">
            Límite de crédito: {Number(cliente.limite_credito).toLocaleString("es-AR", { style: "currency", currency: "ARS" })}
          </div>
        )}
      </div>

      {cliente && requiereZona && (
        <div className={`card mb-4 ${geo?.dentro ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
          <p className="text-sm font-semibold text-navy mb-1">
            {geo?.dentro ? "✓ Ubicación confirmada" : "Confirmación de ubicación requerida"}
          </p>
          <p className="text-xs text-gray-600 mb-2">
            {cliente.nombre} pertenece al circuito <strong>{cliente.circuitos?.nombre}</strong>: para cargar el pedido tenés que
            estar físicamente en la dirección del cliente (dentro de {cliente.radio_geofence_m || 150} m).
          </p>
          <button className="btn-secondary text-xs" onClick={confirmarUbicacion} disabled={ubicando}>
            {ubicando ? "Obteniendo ubicación…" : geo ? "Volver a confirmar ubicación" : "Confirmar mi ubicación (GPS)"}
          </button>
          {errorGeo && <p className="text-xs text-red-600 mt-2">{errorGeo}</p>}
          {geo && !geo.dentro && (
            <p className="text-xs text-red-600 mt-2">
              Estás a {geo.distancia != null ? `${geo.distancia.toFixed(0)} m` : "una distancia desconocida"} del cliente —
              superás el radio permitido de {cliente.radio_geofence_m || 150} m. No se puede cargar el pedido desde acá.
            </p>
          )}
        </div>
      )}
      {cliente && !requiereZona && (
        <div className="card mb-4 bg-gray-50">
          <p className="text-xs text-gray-500">
            Este cliente está fuera de zona (sin circuito asignado): se puede cargar el pedido sin importar la geolocalización.
          </p>
        </div>
      )}

      {cliente && (
        <div className="card overflow-x-auto">
          <div className="flex flex-wrap items-center gap-3 mb-4 bg-gray-50 rounded-md px-3 py-2">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-600">Escanear código de barras</label>
              <input
                className="input w-40" placeholder="Código…"
                value={codigoEscaneado}
                onChange={(e) => setCodigoEscaneado(e.target.value)}
                onKeyDown={onScanKeyDown}
              />
            </div>
            <button className="btn-secondary text-xs" onClick={conectarBalanza}>
              {balanzaConectada ? "Balanza conectada" : "Conectar balanza"}
            </button>
            {balanzaConectada && (
              <input className="input w-28 text-xs" type="number" step="0.001" placeholder="Peso (kg) manual" value={pesoBalanza || ""} onChange={(e) => setPesoBalanza(e.target.value)} />
            )}
            {avisoScan && <span className="text-xs text-gray-500">{avisoScan}</span>}
          </div>

          <table className="tbl">
            <thead><tr><th>Producto</th><th>Stock</th><th>Precio</th><th>Cantidad</th><th>Desc. %</th><th>Subtotal</th></tr></thead>
            <tbody>
              {productos.map((p) => {
                const precio = precioDe(p, lista);
                const cant = cantidades[p.id] || 0;
                const desc = descuentoDe(p.id, lista, cant);
                return (
                  <tr key={p.id}>
                    <td>{p.nombre}</td>
                    <td>{p.stock}</td>
                    <td>{precio.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}</td>
                    <td>
                      <input
                        type="number" min={0} className="input w-20"
                        value={cant || ""}
                        onChange={(e) => setCantidades({ ...cantidades, [p.id]: Number(e.target.value) })}
                      />
                    </td>
                    <td>{desc}%</td>
                    <td>{(cant * precio * (1 - desc / 100)).toLocaleString("es-AR", { style: "currency", currency: "ARS" })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex justify-between items-center mt-4 border-t pt-4">
            <div className="text-lg font-bold text-navy">
              Total: {total.toLocaleString("es-AR", { style: "currency", currency: "ARS" })}
            </div>
            <button
              className="btn-primary"
              disabled={saving || items.length === 0 || !ubicacionConfirmada || !stockSuficiente}
              title={!ubicacionConfirmada ? "Confirmá tu ubicación dentro del radio del cliente para habilitar la carga" : !stockSuficiente ? "Hay ítems que superan el stock disponible" : undefined}
              onClick={confirmarPedido}
            >
              {saving ? "Guardando…" : !ubicacionConfirmada ? "Confirmá tu ubicación primero" : !stockSuficiente ? "Stock insuficiente" : "Confirmar pedido"}
            </button>
          </div>
          {!stockSuficiente && (
            <p className="text-sm text-red-600 mt-2">
              Sin stock suficiente: {itemsSinStock.map((i) => `${i.producto.nombre} (pedís ${i.cantidad}, hay ${i.producto.stock})`).join(", ")}.
            </p>
          )}
          {errorPedido && <p className="text-sm text-red-600 mt-2">{errorPedido}</p>}
          {mensaje && <p className="text-sm text-green-700 mt-2">{mensaje}</p>}
        </div>
      )}
    </div>
  );
}

export default function NuevoPedido() {
  return (
    <Suspense fallback={<p className="text-gray-400">Cargando…</p>}>
      <NuevoPedidoInner />
    </Suspense>
  );
}
