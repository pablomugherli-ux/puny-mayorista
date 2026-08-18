import { describe, it, expect } from "vitest";
import { optimizarRuta, type Parada } from "./tsp";

// optimizarRuta arma la "ruta del día" del Vendedor y el orden de paradas de
// Entrega/Cobrador. Un bug acá no rompe nada visiblemente (la app sigue
// andando), simplemente hace perder tiempo real en la calle todos los días
// — por eso conviene un regression test aunque sea heurístico.
const origen: Parada = { id: "yo", lat: 0, lng: 0 };

describe("optimizarRuta", () => {
  it("con 0 paradas devuelve ruta vacía y distancia 0", () => {
    const { ruta, distanciaKm } = optimizarRuta(origen, []);
    expect(ruta).toEqual([]);
    expect(distanciaKm).toBe(0);
  });

  it("con 1 parada la devuelve tal cual, sin optimizar", () => {
    const p: Parada = { id: "a", lat: 0, lng: 1 };
    const { ruta, distanciaKm } = optimizarRuta(origen, [p]);
    expect(ruta).toEqual([p]);
    expect(distanciaKm).toBeGreaterThan(0);
  });

  it("devuelve exactamente las mismas paradas recibidas (ningún id se pierde ni se duplica)", () => {
    const paradas: Parada[] = [
      { id: "a", lat: 0, lng: 3 },
      { id: "b", lat: 0, lng: 1 },
      { id: "c", lat: 0, lng: 5 },
      { id: "d", lat: 0, lng: 2 },
    ];
    const { ruta } = optimizarRuta(origen, paradas);
    expect(ruta.map((p) => p.id).sort()).toEqual(paradas.map((p) => p.id).sort());
    expect(ruta.length).toBe(paradas.length);
  });

  it("puntos alineados en fila: la ruta óptima es visitarlos en orden de distancia creciente", () => {
    // Todos sobre la misma longitud (lng=0), a distinta latitud desde el
    // origen — el orden óptimo real es inequívoco: de más cerca a más lejos.
    const paradas: Parada[] = [
      { id: "lejos", lat: 3, lng: 0 },
      { id: "cerca", lat: 1, lng: 0 },
      { id: "medio", lat: 2, lng: 0 },
    ];
    const { ruta } = optimizarRuta(origen, paradas);
    expect(ruta.map((p) => p.id)).toEqual(["cerca", "medio", "lejos"]);
  });

  it("la distancia optimizada nunca es peor que visitar las paradas en el orden recibido", () => {
    const paradas: Parada[] = [
      { id: "a", lat: 2, lng: 3 },
      { id: "b", lat: -1, lng: 4 },
      { id: "c", lat: 3, lng: -2 },
      { id: "d", lat: -2, lng: -1 },
      { id: "e", lat: 1, lng: 1 },
    ];
    const { distanciaKm } = optimizarRuta(origen, paradas);

    // Distancia de visitar en el orden original, sin optimizar — la
    // optimizada nunca puede ser peor que esta (2-opt garantiza mejora o
    // igualdad frente al punto de partida de nearest-neighbor, que a su vez
    // suele ganarle al orden arbitrario en instancias como esta).
    function distanciaOrdenOriginal(): number {
      const { distanciaMetros } = require("./geo");
      let total = 0;
      let anterior = origen;
      for (const p of paradas) {
        total += distanciaMetros(anterior.lat, anterior.lng, p.lat, p.lng) || 0;
        anterior = p;
      }
      return total / 1000;
    }

    expect(distanciaKm).toBeLessThanOrEqual(distanciaOrdenOriginal() + 1e-9);
  });
});
