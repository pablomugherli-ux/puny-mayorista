import {
  Home, PlusCircle, ClipboardList, Package, Store, Star, Users, Wallet, MapPin,
  Landmark, TrendingUp, Calculator, Banknote, Ship, MessageCircle, Share2, Bell,
  LayoutDashboard, PieChart, FileText, ShieldCheck, Building2, Tag, Percent, Target,
  UserCheck, Plug, Bot, RotateCcw, Settings, Wrench, BarChart3, ShoppingCart, Radar, Truck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type RibbonButton = { label: string; href: string; icon: LucideIcon };
export type RibbonGroup = { label: string; buttons: RibbonButton[] };
export type RibbonTab = { key: string; label: string; icon: LucideIcon; href: string; groups: RibbonGroup[] };

export const RIBBON_TABS: RibbonTab[] = [
  {
    key: "inicio", label: "Inicio", icon: Home, href: "/dashboard/admin/panel-inicio",
    groups: [
      { label: "Panorama del día", buttons: [
        { label: "Nuevo Pedido", href: "/dashboard/admin/panel-ventas?tab=pedidos", icon: PlusCircle },
        { label: "Ver Caja", href: "/dashboard/admin/panel-finanzas?tab=finanzas", icon: Wallet },
        { label: "Stock por vencer", href: "/dashboard/admin/panel-finanzas?tab=stock", icon: Package },
        { label: "Dashboard Ejecutivo", href: "/dashboard/admin/panel-informes?tab=ejecutivo", icon: LayoutDashboard },
      ] },
    ],
  },
  {
    key: "ventas", label: "Ventas", icon: ShoppingCart, href: "/dashboard/admin/panel-ventas",
    groups: [
      { label: "Pedidos", buttons: [
        { label: "Nuevo / Ver Pedidos", href: "/dashboard/admin/panel-ventas?tab=pedidos", icon: ClipboardList },
        { label: "Catálogo", href: "/dashboard/admin/panel-ventas?tab=catalogo", icon: Package },
      ] },
      { label: "Canales", buttons: [
        { label: "POS Masivo", href: "/dashboard/admin/panel-ventas?tab=masivo", icon: Store },
        { label: "Cuentas Clave", href: "/dashboard/admin/panel-ventas?tab=cuentas-clave", icon: Star },
      ] },
      { label: "Clientes", buttons: [
        { label: "Clientes", href: "/dashboard/admin/panel-ventas?tab=clientes", icon: Users },
        { label: "Cuenta Corriente", href: "/dashboard/admin/panel-ventas?tab=cuenta-corriente", icon: Wallet },
        { label: "Mapa en Vivo", href: "/dashboard/admin/panel-ventas?tab=mapa", icon: MapPin },
      ] },
    ],
  },
  {
    key: "finanzas", label: "Finanzas & Stock", icon: Landmark, href: "/dashboard/admin/panel-finanzas",
    groups: [
      { label: "Caja y Bancos", buttons: [
        { label: "Bancos/Proveedores/Cartera", href: "/dashboard/admin/panel-finanzas?tab=finanzas", icon: Landmark },
        { label: "Cash Flow", href: "/dashboard/admin/panel-finanzas?tab=cashflow", icon: TrendingUp },
      ] },
      { label: "Contabilidad", buttons: [
        { label: "Contabilidad", href: "/dashboard/admin/panel-finanzas?tab=contabilidad", icon: Calculator },
        { label: "Tesorería y Sueldos", href: "/dashboard/admin/panel-finanzas?tab=tesoreria", icon: Banknote },
      ] },
      { label: "Inventario", buttons: [
        { label: "Stock y Compras", href: "/dashboard/admin/panel-finanzas?tab=stock", icon: Package },
        { label: "Importaciones", href: "/dashboard/admin/panel-finanzas?tab=importaciones", icon: Ship },
        { label: "Logística (todas las rutas)", href: "/dashboard/admin/logistica", icon: Truck },
      ] },
    ],
  },
  {
    key: "comunicacion", label: "Comunicación", icon: MessageCircle, href: "/dashboard/admin/panel-comunicacion",
    groups: [
      { label: "Mensajería", buttons: [
        { label: "PUNY WP (WhatsApp)", href: "/dashboard/admin/panel-comunicacion?tab=whatsapp-wp", icon: MessageCircle },
        { label: "PUNY Redes Sociales", href: "/dashboard/admin/panel-comunicacion?tab=redes-sociales", icon: Share2 },
      ] },
      { label: "Avisos", buttons: [
        { label: "Notificaciones", href: "/dashboard/admin/panel-comunicacion?tab=notificaciones", icon: Bell },
      ] },
    ],
  },
  {
    key: "informes", label: "Informes y Reportes", icon: BarChart3, href: "/dashboard/admin/panel-informes",
    groups: [
      { label: "Ejecutivo", buttons: [
        { label: "Dashboard Ejecutivo", href: "/dashboard/admin/panel-informes?tab=ejecutivo", icon: LayoutDashboard },
        { label: "PUNY BI", href: "/dashboard/admin/panel-informes?tab=bi", icon: PieChart },
      ] },
      { label: "Por módulo", buttons: [
        { label: "Informe de Ventas", href: "/dashboard/admin/panel-informes?tab=ventas", icon: ShoppingCart },
        { label: "Informe de Cobranzas", href: "/dashboard/admin/panel-informes?tab=cobranzas", icon: Wallet },
        { label: "Informe de Stock", href: "/dashboard/admin/panel-informes?tab=stock", icon: Package },
        { label: "Informe de RRHH", href: "/dashboard/admin/panel-informes?tab=rrhh", icon: Users },
      ] },
      { label: "Auditoría", buttons: [
        { label: "PUNY Seguridad", href: "/dashboard/admin/panel-informes?tab=seguridad", icon: ShieldCheck },
      ] },
    ],
  },
  {
    key: "configuracion", label: "Configuración", icon: Settings, href: "/dashboard/admin/panel-configuracion",
    groups: [
      { label: "Empresa", buttons: [
        { label: "Datos de la Empresa", href: "/dashboard/admin/panel-configuracion?tab=empresa", icon: Building2 },
        { label: "Zonas y Circuitos", href: "/dashboard/admin/panel-configuracion?tab=zonas", icon: MapPin },
      ] },
      { label: "Comercial", buttons: [
        { label: "Esquemas de Comisión", href: "/dashboard/admin/panel-configuracion?tab=comisiones", icon: Percent },
        { label: "Objetivos", href: "/dashboard/admin/panel-configuracion?tab=objetivos", icon: Target },
        { label: "Ofertas vigentes", href: "/dashboard/admin/panel-configuracion?tab=ofertas", icon: Tag },
        { label: "Vincular Cobradores", href: "/dashboard/admin/panel-configuracion?tab=cobradores", icon: UserCheck },
      ] },
    ],
  },
  {
    key: "sistema", label: "Sistema", icon: Wrench, href: "/dashboard/admin/panel-sistema",
    groups: [
      { label: "Accesos", buttons: [
        { label: "Usuarios y Permisos", href: "/dashboard/admin/panel-sistema?tab=usuarios", icon: Users },
        { label: "PUNY Seguridad", href: "/dashboard/admin/panel-sistema?tab=seguridad", icon: ShieldCheck },
        { label: "Vigilancia (vigiladores)", href: "/dashboard/admin/panel-sistema?tab=seguridad", icon: Radar },
      ] },
      { label: "Plataforma", buttons: [
        { label: "Integraciones", href: "/dashboard/admin/panel-sistema?tab=integraciones", icon: Plug },
        { label: "Agente IA de WhatsApp", href: "/dashboard/admin/panel-sistema?tab=whatsapp-ia", icon: Bot },
        { label: "Sistema", href: "/dashboard/admin/panel-sistema?tab=sistema", icon: RotateCcw },
      ] },
    ],
  },
];
