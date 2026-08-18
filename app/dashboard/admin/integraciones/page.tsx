"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import PageHeader from "@/components/PageHeader";

type Tipo = "afip" | "tango" | "balanza" | "lector_codigo_barras" | "impresora_tickets";

const TIPO_LABEL: Record<Tipo, string> = {
  afip: "AFIP — Facturación Electrónica (WSFE)",
  tango: "Tango ERP",
  balanza: "Balanza comercial",
  lector_codigo_barras: "Lector de código de barras",
  impresora_tickets: "Impresora de tickets",
};

const ESTADO_LABEL: Record<string, string> = { no_configurado: "No configurado", configurado: "Configurado (sin activar)", activo: "Activo" };
const ESTADO_BADGE: Record<string, string> = {
  no_configurado: "bg-gray-100 text-gray-600",
  configurado: "bg-amber-100 text-amber-700",
  activo: "bg-green-100 text-green-700",
};

async function tenantId() {
  const { data: u } = await supabase.auth.getUser();
  const { data: p } = await supabase.from("profiles").select("tenant_id").eq("id", u.user?.id).single();
  return p?.tenant_id as string;
}
async function miId() {
  const { data: u } = await supabase.auth.getUser();
  return u.user?.id as string;
}

export default function IntegracionesAdmin() {
  const [rows, setRows] = useState<Record<Tipo, any>>({} as any);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data } = await supabase.from("integraciones_config").select("*");
    const porTipo: Record<string, any> = {};
    (data || []).forEach((r: any) => (porTipo[r.tipo] = r));
    setRows(porTipo as any);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function guardar(tipo: Tipo, config: any, estado: string, notas: string) {
    const tid = await tenantId();
    const uid = await miId();
    const existente = rows[tipo];
    const payload = { tenant_id: tid, tipo, config, estado, notas, actualizado_en: new Date().toISOString(), actualizado_por: uid };
    if (existente) {
      await supabase.from("integraciones_config").update(payload).eq("id", existente.id);
    } else {
      await supabase.from("integraciones_config").insert(payload);
    }
    load();
  }

  if (loading) return <p className="text-gray-400">Cargando…</p>;

  return (
    <div>
      <PageHeader
        title="Integraciones"
        subtitle="Configuración de AFIP, Tango y periféricos. No se solicitan credenciales reales acá salvo que ya las tengas — el sistema queda preparado para cargarlas cuando estén disponibles."
      />

      <div className="card mb-4 bg-gray-50">
        <p className="text-xs text-gray-600">
          WhatsApp Business API (token, Phone Number ID, WABA ID y plantillas) se administra desde{" "}
          <Link href="/dashboard/admin/whatsapp-ia" className="text-brand underline">Agente IA de WhatsApp</Link>, no en esta pantalla.
        </p>
      </div>

      <BloqueAfip data={rows.afip} onGuardar={guardar} />
      <BloqueTango data={rows.tango} onGuardar={guardar} />
      <BloquePeriferico tipo="balanza" data={rows.balanza} onGuardar={guardar} />
      <BloqueLectorCodigoBarras data={rows.lector_codigo_barras} onGuardar={guardar} />
      <BloquePeriferico tipo="impresora_tickets" data={rows.impresora_tickets} onGuardar={guardar} />
    </div>
  );
}

function Header({ tipo, estado }: { tipo: Tipo; estado?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-navy">{TIPO_LABEL[tipo]}</h3>
      <span className={`badge ${ESTADO_BADGE[estado || "no_configurado"]}`}>{ESTADO_LABEL[estado || "no_configurado"]}</span>
    </div>
  );
}

function BloqueAfip({ data, onGuardar }: { data: any; onGuardar: (t: Tipo, c: any, e: string, n: string) => void }) {
  const [cuit, setCuit] = useState(data?.config?.cuit || "");
  const [entorno, setEntorno] = useState(data?.config?.entorno || "testing");
  const [puntoVenta, setPuntoVenta] = useState(data?.config?.punto_venta || "");
  const [notas, setNotas] = useState(data?.notas || "");

  useEffect(() => {
    setCuit(data?.config?.cuit || ""); setEntorno(data?.config?.entorno || "testing");
    setPuntoVenta(data?.config?.punto_venta || ""); setNotas(data?.notas || "");
  }, [data]);

  return (
    <div className="card mb-4">
      <Header tipo="afip" estado={data?.estado} />
      <p className="text-xs text-gray-500 mb-3">
        Requiere Certificado Digital (.crt) y Clave Privada (.key) emitidos por AFIP para el CUIT de cada
        distribuidora, generados en el sitio de AFIP (Administración de Certificados Digitales → Web Service WSFE).
        Esos archivos NO se cargan en esta pantalla — son credenciales de altísima sensibilidad que requieren un
        mecanismo de carga dedicado (Supabase Storage privado o secreto de Edge Function) que se activa recién
        cuando confirmes que los tenés disponibles, para no manipular ni pedir esos archivos antes de tiempo.
      </p>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <input className="input" placeholder="CUIT" value={cuit} onChange={(e) => setCuit(e.target.value)} />
        <select className="input" value={entorno} onChange={(e) => setEntorno(e.target.value)}>
          <option value="testing">Testing / Homologación</option>
          <option value="produccion">Producción</option>
        </select>
        <input className="input" placeholder="Punto de venta" value={puntoVenta} onChange={(e) => setPuntoVenta(e.target.value)} />
      </div>
      <textarea className="input mb-3" rows={2} placeholder="Notas (ej: certificado solicitado, en trámite, contacto del contador, etc.)" value={notas} onChange={(e) => setNotas(e.target.value)} />
      <button className="btn-secondary text-xs" onClick={() => onGuardar("afip", { cuit, entorno, punto_venta: puntoVenta }, cuit && puntoVenta ? "configurado" : "no_configurado", notas)}>
        Guardar datos de AFIP
      </button>
    </div>
  );
}

function BloqueTango({ data, onGuardar }: { data: any; onGuardar: (t: Tipo, c: any, e: string, n: string) => void }) {
  const [endpoint, setEndpoint] = useState(data?.config?.endpoint_url || "");
  const [formato, setFormato] = useState(data?.config?.formato || "archivo");
  const [notas, setNotas] = useState(data?.notas || "");

  useEffect(() => {
    setEndpoint(data?.config?.endpoint_url || ""); setFormato(data?.config?.formato || "archivo"); setNotas(data?.notas || "");
  }, [data]);

  return (
    <div className="card mb-4">
      <Header tipo="tango" estado={data?.estado} />
      <p className="text-xs text-gray-500 mb-3">
        Tango expone dos vías típicas de integración: por archivo (exportación/importación en el formato de
        interfaz de Tango, módulo por módulo) o por su Tango API / RemoteObjects (requiere la licencia de API de
        tu instalación de Tango y el endpoint específico). El mapeo exacto de campos depende de qué módulos de
        Tango uses (Ventas, Stock, Contabilidad) — cargá acá el dato que ya tengas disponible.
      </p>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <select className="input" value={formato} onChange={(e) => setFormato(e.target.value)}>
          <option value="archivo">Intercambio por archivo (exportación/importación)</option>
          <option value="api">Tango API / RemoteObjects</option>
        </select>
        <input className="input" placeholder="Endpoint / ruta de intercambio (si aplica)" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
      </div>
      <textarea className="input mb-3" rows={2} placeholder="Notas (ej: versión de Tango, módulos a integrar, licencia API)" value={notas} onChange={(e) => setNotas(e.target.value)} />
      <button className="btn-secondary text-xs" onClick={() => onGuardar("tango", { endpoint_url: endpoint, formato }, endpoint ? "configurado" : "no_configurado", notas)}>
        Guardar datos de Tango
      </button>
    </div>
  );
}

function BloquePeriferico({ tipo, data, onGuardar }: { tipo: "balanza" | "impresora_tickets"; data: any; onGuardar: (t: Tipo, c: any, e: string, n: string) => void }) {
  const [puerto, setPuerto] = useState(data?.config?.puerto || "");
  const [ip, setIp] = useState(data?.config?.ip || "");
  const [marca, setMarca] = useState(data?.config?.marca || "");
  const [notas, setNotas] = useState(data?.notas || "");

  useEffect(() => {
    setPuerto(data?.config?.puerto || ""); setIp(data?.config?.ip || ""); setMarca(data?.config?.marca || ""); setNotas(data?.notas || "");
  }, [data]);

  return (
    <div className="card mb-4">
      <Header tipo={tipo} estado={data?.estado} />
      {tipo === "balanza" && (
        <p className="text-xs text-gray-500 mb-3">
          El navegador puede conectarse directamente a una balanza por puerto serie (Web Serial API, ya
          implementado como botón "Conectar balanza" en Nuevo Pedido) — pero el protocolo de lectura de peso
          varía por marca/modelo (Toledo, CAS, Dibal, etc.). Indicá acá la marca/modelo real para poder cargar el
          parser correcto; mientras tanto, el peso se puede seguir ingresando a mano sin bloquear la operación.
        </p>
      )}
      {tipo === "impresora_tickets" && (
        <p className="text-xs text-gray-500 mb-3">
          Impresoras térmicas de tickets suelen conectarse por IP (red) o por USB con un driver del fabricante.
          Cargá acá la IP/puerto para dejarlo listo; el envío de impresión en sí se conecta cuando confirmes marca/modelo.
        </p>
      )}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <input className="input" placeholder="Marca / modelo" value={marca} onChange={(e) => setMarca(e.target.value)} />
        <input className="input" placeholder="Puerto (ej: COM3, /dev/ttyUSB0)" value={puerto} onChange={(e) => setPuerto(e.target.value)} />
        <input className="input" placeholder="IP (si es de red)" value={ip} onChange={(e) => setIp(e.target.value)} />
      </div>
      <textarea className="input mb-3" rows={2} placeholder="Notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
      <button className="btn-secondary text-xs" onClick={() => onGuardar(tipo, { puerto, ip, marca }, marca ? "configurado" : "no_configurado", notas)}>
        Guardar
      </button>
    </div>
  );
}

function BloqueLectorCodigoBarras({ data, onGuardar }: { data: any; onGuardar: (t: Tipo, c: any, e: string, n: string) => void }) {
  return (
    <div className="card mb-4">
      <Header tipo="lector_codigo_barras" estado="activo" />
      <p className="text-xs text-gray-500">
        Ya funciona sin configuración adicional: cualquier lector USB/Bluetooth estándar (modo teclado / HID, que es
        el modo por defecto de prácticamente todos los lectores comerciales) queda detectado automáticamente en la
        pantalla de Nuevo Pedido — escaneá un código y el producto con ese SKU se agrega solo, sin tocar el mouse.
      </p>
    </div>
  );
}
