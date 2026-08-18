export type UserRole = "master" | "dueno" | "supervisor" | "vendedor" | "entrega" | "cobrador" | "cliente_b2b" | "vendedor_masivo" | "asesor_inmuner" | "operador_wp" | "vigilador" | "administrador" | "tesorero" | "jefe_personal" | "encargado_caja" | "cajero" | "encargado_depositos" | "encargado_logistica" | "proveedor";

// RBAC dinámico — Fase 5: las 13 columnas de permiso/alcance viejas
// (permiso_finanzas/rrhh/stock/seguridad/marketing/caja/depositos/logistica,
// ver_lista_1/2, operar_lista_1/2, ver_consolidado, puede_cobrar) se
// retiraron de profiles — usuario_permisos + mis_permisos_activos() (en
// useAuth().permisos) son la fuente de verdad desde la Fase 2/4.
// caja_nombre_asignada NO es un permiso, es asignación de datos (qué caja
// opera un Cajero) — sigue viva y la sigue leyendo puedo_ver_caja().
export type Profile = {
  id: string;
  tenant_id: string | null;
  role: UserRole;
  nombre: string;
  email: string;
  cliente_id: string | null;
  proveedor_id: string | null;
  caja_nombre_asignada: string | null;
};

export type Banco = {
  id: string;
  tenant_id: string;
  nombre: string;
  cbu: string | null;
  alias: string | null;
  moneda: string;
  saldo_actual: number;
  activo: boolean;
  created_at: string;
};

export type MovimientoBancario = {
  id: string;
  tenant_id: string;
  banco_id: string;
  fecha: string;
  tipo: "ingreso" | "egreso";
  concepto: string;
  monto: number;
  conciliado: boolean;
  comprobante_ref: string | null;
  created_at: string;
};

export type Proveedor = {
  id: string;
  tenant_id: string;
  nombre: string;
  cuit: string | null;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  condicion_pago: string | null;
  activo: boolean;
  created_at: string;
};

export type ProveedorProducto = {
  id: string;
  tenant_id: string;
  proveedor_id: string;
  producto_id: string;
  costo_unitario: number | null;
  codigo_proveedor: string | null;
  es_preferido: boolean;
  activo: boolean;
  actualizado_en: string;
  created_at: string;
};

export type ProveedorMovimiento = {
  id: string;
  tenant_id: string;
  proveedor_id: string;
  fecha: string;
  tipo: "compra" | "pago" | "ajuste";
  monto: number;
  saldo_resultante: number | null;
  comprobante_ref: string | null;
  descripcion: string | null;
  created_at: string;
};

export type ValorCartera = {
  id: string;
  tenant_id: string;
  tipo: "cheque_fisico" | "echeq";
  numero: string;
  banco_emisor: string | null;
  librador: string | null;
  monto: number;
  fecha_emision: string | null;
  fecha_vencimiento: string;
  estado: "en_cartera" | "depositado" | "endosado" | "rechazado" | "cobrado";
  cliente_id: string | null;
  proveedor_id: string | null;
  notas: string | null;
  created_at: string;
};

export const ESTADO_VALOR_LABEL: Record<ValorCartera["estado"], string> = {
  en_cartera: "En cartera",
  depositado: "Depositado",
  endosado: "Endosado",
  rechazado: "Rechazado",
  cobrado: "Cobrado",
};

export type MedioPagoConfig = {
  id: string;
  tenant_id: string;
  tipo: "efectivo" | "cheque" | "echeq" | "transferencia" | "tarjeta" | "qr" | "mercado_pago" | "modo";
  alias: string | null;
  activo: boolean;
  notas: string | null;
  retencion_pct: number;
  dias_acreditacion: number;
  banco_destino_id: string | null;
  created_at: string;
};

export const MEDIO_PAGO_LABEL: Record<MedioPagoConfig["tipo"], string> = {
  efectivo: "Efectivo",
  cheque: "Cheque físico",
  echeq: "eCheq",
  transferencia: "Transferencia bancaria",
  tarjeta: "Tarjeta (crédito/débito)",
  qr: "QR",
  mercado_pago: "Mercado Pago",
  modo: "MODO",
};

export type CostoBancario = {
  id: string;
  tenant_id: string;
  banco_id: string;
  tipo: "mantenimiento_cuenta" | "chequera" | "impuesto" | "retencion" | "otro";
  descripcion: string;
  monto: number | null;
  porcentaje: number | null;
  periodicidad: "mensual" | "unica";
  activo: boolean;
  created_at: string;
};

export const COSTO_BANCARIO_TIPO_LABEL: Record<CostoBancario["tipo"], string> = {
  mantenimiento_cuenta: "Mantenimiento de cuenta",
  chequera: "Chequera",
  impuesto: "Impuesto",
  retencion: "Retención",
  otro: "Otro",
};

export type Tenant = {
  id: string;
  nombre: string;
  slug: string;
  razon_social: string | null;
  cuit: string | null;
  direccion: string | null;
  telefono: string | null;
  email_contacto: string | null;
  sitio_web: string | null;
  eslogan: string;
  logo_url: string | null;
  logo_color_fondo: string;
  logo_color_texto: string;
  estado: "activo" | "pausado" | "suspendido";
  motivo_estado: string | null;
  estado_actualizado_en: string;
  plan_vencimiento: string | null;
  esquema_cobro: "pago_unico" | "abono_mensual";
  monto_licencia: number;
  moneda: string;
  dia_vencimiento_mensual: number | null;
  dias_alerta_vencimiento_stock: number;
  proximo_aumento_monto: number | null;
  proximo_aumento_vigencia: string | null;
  created_at?: string;
};

export const ESQUEMA_COBRO_LABEL: Record<Tenant["esquema_cobro"], string> = {
  pago_unico: "Pago único (fecha fija)",
  abono_mensual: "Abono / mantenimiento mensual",
};

export const ESTADO_TENANT_LABEL: Record<Tenant["estado"], string> = {
  activo: "Activo",
  pausado: "Pausado",
  suspendido: "Suspendido",
};

export const ROLE_LABEL: Record<UserRole, string> = {
  master: "Usuario Maestro (plataforma)",
  dueno: "Dueño",
  supervisor: "Supervisor (lectura de Informes)",
  vendedor: "Vendedor",
  entrega: "Entrega (logística)",
  cobrador: "Cobrador",
  cliente_b2b: "Cliente B2B",
  vendedor_masivo: "Vendedor Masivo (POS)",
  asesor_inmuner: "Asesor de Cuentas Clave",
  operador_wp: "Operador WhatsApp (WP)",
  vigilador: "Vigilador / Sereno",
  administrador: "Administrador / Gerencia",
  tesorero: "Tesorero",
  jefe_personal: "Jefe de Personal",
  encargado_caja: "Encargado de Caja",
  cajero: "Cajero",
  encargado_depositos: "Encargado de Depósitos",
  encargado_logistica: "Encargado de Logística",
  proveedor: "Proveedor (portal)",
};
