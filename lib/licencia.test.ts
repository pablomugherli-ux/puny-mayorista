import { describe, it, expect } from "vitest";
import { calcularVencimiento, alertaVencimiento, alertaAumento } from "./licencia";
import type { Tenant } from "./types";

function tenantBase(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: "t1",
    nombre: "Distribuidora Test",
    slug: "test",
    razon_social: null,
    cuit: null,
    direccion: null,
    telefono: null,
    email_contacto: null,
    sitio_web: null,
    eslogan: "",
    logo_url: null,
    logo_color_fondo: "#000",
    logo_color_texto: "#fff",
    estado: "activo",
    motivo_estado: null,
    estado_actualizado_en: "2026-01-01",
    plan_vencimiento: null,
    esquema_cobro: "abono_mensual",
    monto_licencia: 10000,
    moneda: "ARS",
    dia_vencimiento_mensual: 10,
    dias_alerta_vencimiento_stock: 30,
    proximo_aumento_monto: null,
    proximo_aumento_vigencia: null,
    ...overrides,
  };
}

describe("calcularVencimiento — abono mensual", () => {
  it("si el día del mes todavía no pasó, el vencimiento es este mes", () => {
    const tenant = tenantBase({ dia_vencimiento_mensual: 20 });
    const hoy = new Date(2026, 7, 15); // 15/ago, vence el 20/ago
    const v = calcularVencimiento(tenant, hoy);
    expect(v?.getMonth()).toBe(7);
    expect(v?.getDate()).toBe(20);
  });

  it("si el día del mes ya pasó, el vencimiento salta al mes siguiente", () => {
    const tenant = tenantBase({ dia_vencimiento_mensual: 10 });
    const hoy = new Date(2026, 7, 15); // 15/ago, el día 10 ya pasó
    const v = calcularVencimiento(tenant, hoy);
    expect(v?.getMonth()).toBe(8); // septiembre
    expect(v?.getDate()).toBe(10);
  });

  it("null si no hay día configurado", () => {
    const tenant = tenantBase({ dia_vencimiento_mensual: null as any });
    expect(calcularVencimiento(tenant, new Date(2026, 7, 15))).toBeNull();
  });
});

describe("calcularVencimiento — pago único", () => {
  it("usa la fecha fija de plan_vencimiento", () => {
    const tenant = tenantBase({ esquema_cobro: "pago_unico", plan_vencimiento: "2026-12-01" });
    const v = calcularVencimiento(tenant, new Date(2026, 7, 15));
    expect(v?.getFullYear()).toBe(2026);
    expect(v?.getMonth()).toBe(11);
    expect(v?.getDate()).toBe(1);
  });

  it("null si no hay plan_vencimiento", () => {
    const tenant = tenantBase({ esquema_cobro: "pago_unico", plan_vencimiento: null });
    expect(calcularVencimiento(tenant, new Date(2026, 7, 15))).toBeNull();
  });
});

describe("alertaVencimiento", () => {
  it("activa desde el último día del mes previo hasta el vencimiento inclusive", () => {
    const tenant = tenantBase({ dia_vencimiento_mensual: 10 });
    // Vencimiento: 10/ago/2026. Aviso arranca el último día de julio (31/jul).
    expect(alertaVencimiento(tenant, new Date(2026, 6, 31))!.activa).toBe(true);
    expect(alertaVencimiento(tenant, new Date(2026, 7, 5))!.activa).toBe(true);
    expect(alertaVencimiento(tenant, new Date(2026, 7, 10))!.activa).toBe(true); // inclusive
  });

  it("no activa antes del último día del mes previo", () => {
    const tenant = tenantBase({ dia_vencimiento_mensual: 10 });
    expect(alertaVencimiento(tenant, new Date(2026, 6, 20))!.activa).toBe(false);
  });

  it("no activa después del vencimiento (ya pasó y calcularVencimiento saltó al próximo mes)", () => {
    const tenant = tenantBase({ dia_vencimiento_mensual: 10 });
    // 15/ago: calcularVencimiento ya devuelve el 10/sep como próximo vencimiento,
    // y el aviso de ESE vencimiento recién arranca el 31/ago — 15/ago debe estar apagada.
    expect(alertaVencimiento(tenant, new Date(2026, 7, 15))!.activa).toBe(false);
  });
});

describe("alertaAumento", () => {
  it("activa desde 30 días antes de la vigencia hasta la vigencia inclusive", () => {
    const tenant = tenantBase({ proximo_aumento_monto: 15000, proximo_aumento_vigencia: "2026-09-01" });
    expect(alertaAumento(tenant, new Date(2026, 7, 2))!.activa).toBe(true); // exactamente 30 días antes
    expect(alertaAumento(tenant, new Date(2026, 8, 1))!.activa).toBe(true); // el mismo día, inclusive
    expect(alertaAumento(tenant, new Date(2026, 7, 1))!.activa).toBe(false); // 31 días antes, todavía no
  });

  it("null si no hay aumento configurado", () => {
    const tenant = tenantBase({ proximo_aumento_monto: null, proximo_aumento_vigencia: null });
    expect(alertaAumento(tenant, new Date(2026, 7, 15))).toBeNull();
  });
});
