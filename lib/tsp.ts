// Motor de optimización de rutas: heurística Nearest Neighbor + mejora 2-opt.
// Aproximación real y funcional al problema del viajante (TSP) para reordenar
// paradas de reparto/cobranza. No requiere credenciales ni servicios externos.
import { distanciaMetros } from "./geo";

export type Parada = { id: string; lat: number; lng: number };

function distanciaTotal(orden: Parada[]): number {
  let total = 0;
  for (let i = 0; i < orden.length - 1; i++) {
    total += distanciaMetros(orden[i].lat, orden[i].lng, orden[i + 1].lat, orden[i + 1].lng) || 0;
  }
  return total;
}

function nearestNeighbor(origen: Parada, paradas: Parada[]): Parada[] {
  const restantes = [...paradas];
  const ruta: Parada[] = [];
  let actual = origen;
  while (restantes.length) {
    let mejorIdx = 0;
    let mejorDist = Infinity;
    restantes.forEach((p, idx) => {
      const d = distanciaMetros(actual.lat, actual.lng, p.lat, p.lng) || Infinity;
      if (d < mejorDist) {
        mejorDist = d;
        mejorIdx = idx;
      }
    });
    actual = restantes.splice(mejorIdx, 1)[0];
    ruta.push(actual);
  }
  return ruta;
}

function twoOpt(origen: Parada, ruta: Parada[]): Parada[] {
  let mejorRuta = [...ruta];
  let mejorado = true;
  let iteraciones = 0;
  while (mejorado && iteraciones < 200) {
    mejorado = false;
    iteraciones++;
    for (let i = 0; i < mejorRuta.length - 1; i++) {
      for (let j = i + 1; j < mejorRuta.length; j++) {
        const nueva = [...mejorRuta.slice(0, i), ...mejorRuta.slice(i, j + 1).reverse(), ...mejorRuta.slice(j + 1)];
        const dActual = distanciaTotal([origen, ...mejorRuta]);
        const dNueva = distanciaTotal([origen, ...nueva]);
        if (dNueva < dActual) {
          mejorRuta = nueva;
          mejorado = true;
        }
      }
    }
  }
  return mejorRuta;
}

export function optimizarRuta(origen: Parada, paradas: Parada[]) {
  if (paradas.length <= 1) {
    return { ruta: paradas, distanciaKm: distanciaTotal([origen, ...paradas]) / 1000 };
  }
  const inicial = nearestNeighbor(origen, paradas);
  const optimizada = twoOpt(origen, inicial);
  const distanciaKm = distanciaTotal([origen, ...optimizada]) / 1000;
  return { ruta: optimizada, distanciaKm };
}
