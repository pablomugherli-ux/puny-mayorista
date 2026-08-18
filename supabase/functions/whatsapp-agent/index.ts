// ============================================================================
// Supabase Edge Function — Agente de IA para WhatsApp
// ESTADO: código deployado. Requiere que el usuario cargue las credenciales
// reales de Meta WhatsApp Cloud API y el proveedor de IA como secretos antes
// de poder operar en producción (ver lista abajo).
//
// Por qué vive acá (y no en el bundle de Next.js): esta es la ÚNICA capa de
// este proyecto con acceso a un entorno de ejecución server-side. Todos los
// secretos (token de WhatsApp, app secret, API key de IA, service role de
// Supabase) se leen de variables de entorno de la función — jamás llegan al
// navegador del cliente.
//
// Secretos requeridos (cargar con `supabase secrets set NOMBRE=valor`):
//   WHATSAPP_TOKEN            token de acceso de WhatsApp Cloud API
//   WHATSAPP_VERIFY_TOKEN     string arbitrario elegido por el usuario,
//                             debe coincidir con el configurado en Meta
//   WHATSAPP_APP_SECRET       para validar la firma de los webhooks entrantes
//   ANTHROPIC_API_KEY         proveedor de IA que redacta las respuestas
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY
//                             (ya provistos automáticamente por Supabase)
//
// El "phone_number_id" de WhatsApp Cloud API (identificador técnico del
// número de negocio, NO el número visible) se guarda por tenant en
// whatsapp_config.telefono_negocio y se usa para rutear cada webhook
// entrante al distribuidor correcto (multi-tenant: cada uno tiene su
// propio número de WhatsApp Business).
//
// Endpoints que expone:
//   GET  ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
//        → handshake de verificación de webhook exigido por Meta.
//   POST (sin header x-manual-send) → webhook de mensajes entrantes de Meta.
//   POST (con header x-manual-send: true, y JWT de un usuario dueño/master)
//        → envío manual desde el panel admin cuando un humano toma la
//        conversación.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const WHATSAPP_VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const WHATSAPP_APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function validarFirmaMeta(rawBody: string, firmaHeader: string | null): Promise<boolean> {
  if (!WHATSAPP_APP_SECRET) return true; // secreto aún no cargado: no bloquear en desarrollo
  if (!firmaHeader) return false;
  const esperado = firmaHeader.replace("sha256=", "");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WHATSAPP_APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const firmaHex = Array.from(new Uint8Array(firma)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return firmaHex === esperado;
}

async function enviarWhatsApp(phoneNumberId: string, telefono: string, texto: string) {
  const resp = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: telefono, text: { body: texto } }),
  });
  if (!resp.ok) throw new Error(`Error enviando WhatsApp: ${resp.status} ${await resp.text()}`);
  return resp.json();
}

async function generarRespuestaIA(instrucciones: string, historial: { autor: string; contenido: string }[]) {
  const mensajes = historial.map((m) => ({
    role: m.autor === "cliente" ? "user" : "assistant",
    content: m.contenido,
  }));
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 400,
      system: instrucciones,
      messages: mensajes,
    }),
  });
  if (!resp.ok) throw new Error(`Error IA: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  return data.content?.[0]?.text || "Disculpá, no pude procesar tu consulta. En breve te contacta una persona del equipo.";
}

async function obtenerOCrearConversacion(tenantId: string, numeroTelefono: string) {
  const { data: existente } = await admin
    .from("whatsapp_conversaciones")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("numero_telefono", numeroTelefono)
    .maybeSingle();
  if (existente) return existente;

  const { data: cliente } = await admin
    .from("clientes")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("telefono", numeroTelefono)
    .maybeSingle();

  const { data: nueva } = await admin
    .from("whatsapp_conversaciones")
    .insert({ tenant_id: tenantId, numero_telefono: numeroTelefono, cliente_id: cliente?.id ?? null })
    .select()
    .single();
  return nueva;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // --- Handshake de verificación de Meta ---
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Verificación fallida", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // --- Notificación automática de cobro (cliente + dueños/administradores) ---
  // La invoca el frontend inmediatamente después de insertar en "cobros"
  // (cobrador o repartidor con cobro contra-entrega). Cualquier usuario
  // autenticado puede llamarla, pero solo puede notificar cobros de SU
  // PROPIO tenant (se verifica contra el cobro real, no contra lo que
  // declare el cliente).
  if (req.headers.get("x-notificar-cobro") === "true") {
    const authHeader = req.headers.get("authorization") || "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return new Response("No autorizado", { status: 401 });

    const { data: perfil } = await admin.from("profiles").select("tenant_id").eq("id", userData.user.id).single();
    if (!perfil?.tenant_id) return new Response("Perfil no encontrado", { status: 403 });

    const { cobro_id } = await req.json();
    const { data: cobro } = await admin
      .from("cobros")
      .select("*, clientes(nombre, telefono), comprobantes(numero)")
      .eq("id", cobro_id)
      .single();
    if (!cobro || cobro.tenant_id !== perfil.tenant_id) {
      return new Response("Cobro no encontrado", { status: 404 });
    }

    const { data: config } = await admin
      .from("whatsapp_config")
      .select("telefono_negocio")
      .eq("tenant_id", perfil.tenant_id)
      .maybeSingle();

    if (!config?.telefono_negocio || !WHATSAPP_TOKEN) {
      // Todavía no se cargaron las credenciales/número: no es un error, el
      // aviso in-app (tabla notificaciones) ya quedó registrado igual.
      return new Response(JSON.stringify({ ok: true, enviado: false, motivo: "whatsapp_no_configurado" }), { status: 200 });
    }

    const monto = Number(cobro.monto).toLocaleString("es-AR");
    const fecha = new Date(cobro.fecha).toLocaleDateString("es-AR");
    const refComprobante = cobro.comprobantes?.numero ? ` (comprobante #${cobro.comprobantes.numero})` : "";
    const textoCliente = `Hola ${cobro.clientes?.nombre || ""}! Registramos tu pago de $${monto} el ${fecha}${refComprobante}. ¡Gracias!`;
    const textoDueno = `Cobro registrado: ${cobro.clientes?.nombre || "cliente"} — $${monto} el ${fecha}${refComprobante}.`;

    let enviadoCliente = false;
    let enviadosDuenos = 0;
    const errores: string[] = [];

    if (cobro.clientes?.telefono) {
      try {
        await enviarWhatsApp(config.telefono_negocio, cobro.clientes.telefono, textoCliente);
        enviadoCliente = true;
      } catch (e) {
        errores.push(`cliente: ${(e as Error).message}`);
      }
    }

    const { data: duenos } = await admin
      .from("profiles")
      .select("telefono")
      .eq("tenant_id", perfil.tenant_id)
      .eq("role", "dueno")
      .not("telefono", "is", null);
    for (const d of duenos || []) {
      try {
        await enviarWhatsApp(config.telefono_negocio, d.telefono as string, textoDueno);
        enviadosDuenos++;
      } catch (e) {
        errores.push(`dueno: ${(e as Error).message}`);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, enviado_cliente: enviadoCliente, enviados_duenos: enviadosDuenos, errores }),
      { status: 200 },
    );
  }

  // --- Envío manual desde el panel admin (un humano toma la conversación) ---
  if (req.headers.get("x-manual-send") === "true") {
    const authHeader = req.headers.get("authorization") || "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return new Response("No autorizado", { status: 401 });

    const { data: perfil } = await admin.from("profiles").select("role, tenant_id").eq("id", userData.user.id).single();
    if (!perfil || (perfil.role !== "dueno" && perfil.role !== "master")) {
      return new Response("No autorizado", { status: 403 });
    }

    const { conversacion_id, texto } = await req.json();
    const { data: conv } = await admin.from("whatsapp_conversaciones").select("*").eq("id", conversacion_id).single();
    if (!conv || (perfil.role !== "master" && conv.tenant_id !== perfil.tenant_id)) {
      return new Response("Conversación no encontrada", { status: 404 });
    }

    const { data: config } = await admin.from("whatsapp_config").select("telefono_negocio").eq("tenant_id", conv.tenant_id).single();
    if (!config?.telefono_negocio) return new Response("Falta configurar el número de WhatsApp del tenant", { status: 409 });

    await enviarWhatsApp(config.telefono_negocio, conv.numero_telefono, texto);
    await admin.from("whatsapp_mensajes").insert({
      tenant_id: conv.tenant_id, conversacion_id, direccion: "saliente", autor: "humano", contenido: texto,
    });
    await admin.from("whatsapp_conversaciones").update({
      agente_activo: false, ultimo_mensaje_at: new Date().toISOString(),
    }).eq("id", conversacion_id);

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  // --- Webhook de mensajes entrantes de Meta ---
  const rawBody = await req.text();
  const firmaValida = await validarFirmaMeta(rawBody, req.headers.get("x-hub-signature-256"));
  if (!firmaValida) return new Response("Firma inválida", { status: 401 });

  const body = JSON.parse(rawBody);
  const entry = body?.entry?.[0]?.changes?.[0]?.value;
  const mensaje = entry?.messages?.[0];
  if (!mensaje) return new Response("ok", { status: 200 }); // eventos que no son mensajes (status updates, etc.)

  const numeroTelefono = mensaje.from;
  const texto = mensaje.text?.body || "";
  const phoneNumberId = entry.metadata?.phone_number_id;

  // El tenant se resuelve por el número de WhatsApp Business que recibió el
  // mensaje (multi-tenant: cada distribuidora tiene su propio número).
  const { data: config } = await admin
    .from("whatsapp_config")
    .select("*")
    .eq("telefono_negocio", phoneNumberId)
    .maybeSingle();
  if (!config || !config.agente_activo) return new Response("ok", { status: 200 });

  const conv = await obtenerOCrearConversacion(config.tenant_id, numeroTelefono);
  await admin.from("whatsapp_mensajes").insert({
    tenant_id: config.tenant_id, conversacion_id: conv.id, direccion: "entrante", autor: "cliente", contenido: texto,
  });

  if (!conv.agente_activo) {
    // Un humano tomó el control de esta conversación puntual: no responde la IA.
    return new Response("ok", { status: 200 });
  }

  const { data: historial } = await admin
    .from("whatsapp_mensajes")
    .select("autor, contenido")
    .eq("conversacion_id", conv.id)
    .order("created_at")
    .limit(20);

  const respuesta = await generarRespuestaIA(config.instrucciones_agente, historial || []);

  await enviarWhatsApp(phoneNumberId, numeroTelefono, respuesta);
  await admin.from("whatsapp_mensajes").insert({
    tenant_id: config.tenant_id, conversacion_id: conv.id, direccion: "saliente", autor: "ia", contenido: respuesta,
  });
  await admin.from("whatsapp_conversaciones").update({
    ultimo_mensaje_at: new Date().toISOString(),
  }).eq("id", conv.id);

  return new Response("ok", { status: 200 });
});
