import { describe, it, expect } from "vitest";
import { buscarColumna, parsearFecha, parsearNumero, parsearNumeroOpcional } from "./importUtils";

describe("buscarColumna", () => {
  it("matchea por nombre exacto", () => {
    expect(buscarColumna(["Fecha", "Importe"], ["fecha"])).toBe(0);
  });

  it("es insensible a mayúsculas y tildes", () => {
    expect(buscarColumna(["Descripción", "Código de Barra"], ["descripcion"])).toBe(0);
    expect(buscarColumna(["Descripción", "Código de Barra"], ["codigo de barra"])).toBe(1);
  });

  it("prueba candidatos alternativos en orden hasta encontrar uno", () => {
    expect(buscarColumna(["Detalle", "Monto"], ["concepto", "descripcion", "detalle"])).toBe(0);
  });

  it("devuelve -1 si ninguna columna matchea", () => {
    expect(buscarColumna(["Foo", "Bar"], ["fecha", "importe"])).toBe(-1);
  });

  it("ignora espacios extra", () => {
    expect(buscarColumna(["  Rubro  "], ["rubro"])).toBe(0);
  });
});

describe("parsearFecha", () => {
  it("interpreta dd/mm/yyyy", () => {
    expect(parsearFecha("15/08/2026")).toBe("2026-08-15");
  });

  it("interpreta dd-mm-yy (año de 2 dígitos -> 20xx)", () => {
    expect(parsearFecha("5-8-26")).toBe("2026-08-05");
  });

  it("interpreta yyyy-mm-dd (ISO) tal cual", () => {
    expect(parsearFecha("2026-08-15")).toBe("2026-08-15");
  });

  it("interpreta un objeto Date (celda de excel con cellDates)", () => {
    expect(parsearFecha(new Date(Date.UTC(2026, 7, 15)))).toBe("2026-08-15");
  });

  it("devuelve null para vacío o valores no interpretables", () => {
    expect(parsearFecha("")).toBeNull();
    expect(parsearFecha(null)).toBeNull();
    expect(parsearFecha("no es una fecha")).toBeNull();
  });
});

describe("parsearNumero (default 0)", () => {
  it("interpreta formato argentino con miles y decimales", () => {
    expect(parsearNumero("1.234,56")).toBeCloseTo(1234.56);
  });

  it("interpreta un número simple sin separadores", () => {
    expect(parsearNumero("500")).toBe(500);
  });

  it("pasa un number tal cual", () => {
    expect(parsearNumero(42)).toBe(42);
  });

  it("devuelve 0 para vacío o inválido", () => {
    expect(parsearNumero("")).toBe(0);
    expect(parsearNumero(null)).toBe(0);
    expect(parsearNumero("abc")).toBe(0);
  });

  it("interpreta negativos", () => {
    expect(parsearNumero("-150,50")).toBeCloseTo(-150.5);
  });
});

describe("parsearNumeroOpcional (default null)", () => {
  it("distingue vacío/inválido (null) de cero real", () => {
    expect(parsearNumeroOpcional("")).toBeNull();
    expect(parsearNumeroOpcional(null)).toBeNull();
    expect(parsearNumeroOpcional("0")).toBe(0);
  });

  it("interpreta formato argentino igual que parsearNumero", () => {
    expect(parsearNumeroOpcional("2.000,50")).toBeCloseTo(2000.5);
  });
});
