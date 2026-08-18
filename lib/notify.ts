import { supabase } from "./supabaseClient";

/**
 * Notifica (registro in-app, canal "whatsapp") a todos los perfiles "dueno"
 * del tenant. Se usa cuando se registra un cobro para que el dueño/
 * administrador tenga aviso inmediato de fecha e importe, incluso si el
 * envío real de WhatsApp todavía no está configurado (ver notificarCobro).
 */
export async function notificarDuenos(tenantId: string, tipo: string, mensaje: string) {
  const { data: duenos } = await supabase.from("profiles").select("id").eq("tenant_id", tenantId).eq("role", "dueno");
  if (!duenos || duenos.length === 0) return;
  await supabase.from("notificaciones").insert(
    duenos.map((d) => ({
      tenant_id: tenantId,
      destinatario_profile_id: d.id,
      canal: "whatsapp",
      tipo,
      mensaje,
      estado: "simulado",
    }))
  );
}

/**
 * Intenta el envío REAL de WhatsApp (cliente + dueños del tenant) para un
 * cobro recién registrado, invocando la Edge Function whatsapp-agent.
 * Es "best effort": si la Edge Function no está deployada, o el tenant
 * todavía no cargó su número de WhatsApp Business / token de Meta, no
 * rompe el flujo de cobro — el aviso in-app (notificarDuenos + el insert
 * en "notificaciones" que ya hace la pantalla de cobro) queda registrado
 * de todas formas.
 */
export async function notificarCobroWhatsapp(cobroId: string): Promise<
  { ok: true; enviado_cliente: boolean; enviados_duenos: number; errores: string[] } | { ok: false; motivo: string }
> {
  try {
    const { data, error } = await supabase.functions.invoke("whatsapp-agent", {
      headers: { "x-notificar-cobro": "true" },
      body: { cobro_id: cobroId },
    });
    if (error) return { ok: false, motivo: error.message };
    return data;
  } catch (e: any) {
    // Función no deployada, sin conexión, etc. — no debe frenar el cobro.
    return { ok: false, motivo: e?.message || "error desconocido" };
  }
}
