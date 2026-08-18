import { describe, it, expect } from "vitest";
import { distanciaMetros } from "./geo";

// distanciaMetros es la base del control de geofence (Nuevo Pedido, CheckIn,
// GateUbicacion) y de la optimización de ruta (lib/tsp.ts) — un error acá
// afecta silenciosamente "¿este vendedor está o no en lo del cliente?" y
// "¿cuánto le falta recorrer?", así que vale la pena testearlo aislado.
describe("distanciaMetros", () => {
  it("devuelve null si falta cualquiera de las 4 coordenadas", () => {
    expect(distanciaMetros(null, 0, 0, 0)).toBeNull();
    expect(distanciaMetros(0, null, 0, 0)).toBeNull();
    expect(distanciaMetros(0, 0, null, 0)).toBeNull();
    expect(distanciaMetros(0, 0, 0, null)).toBeNull();
    expect(distanciaMetros(undefined, 0, 0, 0)).toBeNull();
  });

  it("devuelve 0 para el mismo punto", () => {
    expect(distanciaMetros(-32.4, -58.2, -32.4, -58.2)).toBe(0);
  });

  it("1 grado de latitud son ~111.2 km, en cualquier lugar del planeta", () => {
    // A diferencia de la longitud, un grado de latitud no depende de dónde
    // estés parado — es el chequeo más simple y confiable de que la fórmula
    // de Haversine está bien aplicada.
    const d = distanciaMetros(0, 0, 1, 0)!;
    expect(d).toBeGreaterThan(110_500);
    expect(d).toBeLessThan(111_500);
  });

  it("es simétrica (A→B == B→A)", () => {
    const ab = distanciaMetros(-32.41, -58.21, -32.415, -58.215);
    const ba = distanciaMetros(-32.415, -58.215, -32.41, -58.21);
    expect(ab).toBeCloseTo(ba!, 6);
  });

  it("un radio de geofence típico (150m) distingue casos reales", () => {
    // ~0.00135° de latitud son ~150m — un punto apenas adentro y otro apenas
    // afuera del radio default usado en CheckIn/nuevo-pedido.
    const cliente = { lat: -32.41, lng: -58.21 };
    const adentro = distanciaMetros(cliente.lat + 0.001, cliente.lng, cliente.lat, cliente.lng)!;
    const afuera = distanciaMetros(cliente.lat + 0.003, cliente.lng, cliente.lat, cliente.lng)!;
    expect(adentro).toBeLessThan(150);
    expect(afuera).toBeGreaterThan(150);
  });
});
