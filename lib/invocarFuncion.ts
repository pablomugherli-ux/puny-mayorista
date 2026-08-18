import { supabase } from "./supabaseClient";

export type RespuestaFuncion = { ok: boolean; motivo?: string; [k: string]: unknown };

/**
 * Wrapper de supabase.functions.invoke() que muestra el motivo real del
 * error en vez del mensaje genérico de la librería.
 *
 * Bug de origen (supabase-js 2.x): cuando el Edge Function responde con un
 * status distinto de 2xx, `data` viene SIEMPRE null — aunque el Edge
 * Function haya devuelto un JSON explicativo tipo { ok:false, motivo:"..." }
 * — y el único mensaje que queda a mano es el genérico y fijo de la
 * librería: "Edge Function returned a non-2xx status code". El cuerpo real
 * de la respuesta sigue estando disponible en error.context (la Response
 * cruda), pero hay que leerlo a mano — este helper hace esa lectura una sola
 * vez para que ninguna pantalla repita el mismo problema.
 */
export async function invocarFuncion(
  nombre: string,
  body: Record<string, unknown>,
  headers?: Record<string, string>
): Promise<RespuestaFuncion> {
  const { data, error } = await supabase.functions.invoke(nombre, { body, headers });
  if (!error) return (data as RespuestaFuncion) ?? { ok: true };

  let motivo = error.message;
  const contexto = (error as any)?.context;
  if (contexto && typeof contexto.json === "function") {
    // Se clona la Response antes de leerla: el cuerpo de un Response solo se
    // puede consumir una vez, y si falla el .json() (porque no era JSON)
    // hace falta el texto crudo del clon para el mensaje de respaldo.
    try {
      const cuerpo = await contexto.clone().json();
      if (cuerpo?.motivo) motivo = cuerpo.motivo;
      else motivo = `Error del servidor (código ${contexto.status}).`;
    } catch {
      // El cuerpo no era JSON — pasa, por ejemplo, cuando el pedido nunca
      // llega a nuestro código y lo rechaza antes la infraestructura de
      // Supabase (ej. archivo demasiado pesado, tiempo de espera agotado).
      // Mostramos el código HTTP real en vez del mensaje genérico e inútil.
      try {
        const texto = (await contexto.text())?.slice(0, 200);
        motivo = `Error del servidor (código ${contexto.status}${texto ? `: ${texto}` : ""}).`;
      } catch {
        motivo = `Error del servidor (código ${contexto.status ?? "desconocido"}).`;
      }
    }
  }
  return { ok: false, motivo };
}
