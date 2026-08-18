import { describe, it, expect } from "vitest";
import { regresionLineal } from "./stats";

describe("regresionLineal", () => {
  it("devuelve null con menos de 2 puntos", () => {
    expect(regresionLineal([])).toBeNull();
    expect(regresionLineal([100])).toBeNull();
  });

  it("detecta tendencia creciente perfecta y proyecta el siguiente punto", () => {
    // y = 100 + 50x -> puntos 100, 150, 200, próximo esperado 250
    const r = regresionLineal([100, 150, 200]);
    expect(r).not.toBeNull();
    expect(r!.pendiente).toBeCloseTo(50);
    expect(r!.proyeccion).toBeCloseTo(250);
  });

  it("detecta tendencia decreciente", () => {
    const r = regresionLineal([300, 200, 100]);
    expect(r!.pendiente).toBeLessThan(0);
    expect(r!.proyeccion).toBeCloseTo(0);
  });

  it("con valores constantes, pendiente ~0 y proyección = el mismo valor", () => {
    const r = regresionLineal([500, 500, 500, 500]);
    expect(r!.pendiente).toBeCloseTo(0);
    expect(r!.proyeccion).toBeCloseTo(500);
  });
});
