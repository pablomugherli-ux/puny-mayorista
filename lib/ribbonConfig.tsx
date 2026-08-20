import {
  Home, PlusCircle, ClipboardList, Package, Store, Star, Users, Wallet, MapPin,
  Landmark, TrendingUp, Calculator, Banknote, Ship, MessageCircle, Share2, Bell,
  LayoutDashboard, PieChart, FileText, ShieldCheck, Building2, Tag, Percent, Target,
  UserCheck, Plug, Bot, RotateCcw, Wrench, BarChart3, ShoppingCart, Truck,
  MessageSquare, CalendarDays, FolderOpen,
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
        { label: "Ver Caja", href: "/dashboard/admin/panel-finanzas?tab=caja", icon: Wallet },
        { label: "Stock por vencer", href: "/dashboard/admin/panel-stock?tab=depositos", icon: Package },
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
    // Antes "Finanzas & Stock" era una sola pestaña con 6 destinos —
    // plata y mercadería mezcladas. Se separa en dos conceptos de negocio
    // distintos: acá solo la plata (bancos, caja, contabilidad, proyección).
    // Ver PUNY_Propuesta_Reformulacion_Navegacion.docx, sección 6.
    key: "finanzas", label: "Finanzas", icon: Landmark, href: "/dashboard/admin/panel-finanzas",
    groups: [
      { label: "Caja y Bancos", buttons: [
        { label: "Bancos/Proveedores/Cartera", href: "/dashboard/admin/panel-finanzas?tab=finanzas", icon: Landmark },
        { label: "Caja Diaria", href: "/dashboard/admin/panel-finanzas?tab=caja", icon: Banknote },
        { label: "Libro de IVA", href: "/dashboard/admin/panel-finanzas?tab=iva", icon: FileText },
      ] },
      { label: "Contabilidad y Proyección", buttons: [
        { label: "Contabilidad", href: "/dashboard/admin/panel-finanzas?tab=contabilidad", icon: Calculator },
        { label: "Cash Flow Proyectado", href: "/dashboard/admin/panel-finanzas?tab=cashflow", icon: TrendingUp },
      ] },
    ],
  },
  {
    // La mitad "mercadería" de lo que antes era "Finanzas & Stock".
    key: "stock", label: "Stock", icon: Package, href: "/dashboard/admin/panel-stock",
    groups: [
      { label: "Mercadería", buttons: [
        { label: "Compras", href: "/dashboard/admin/panel-stock?tab=compras", icon: ShoppingCart },
        { label: "Depósitos", href: "/dashboard/admin/panel-stock?tab=depositos", icon: Package },
      ] },
      { label: "Cadena de abastecimiento", buttons: [
        { label: "Importaciones", href: "/dashboard/admin/panel-stock?tab=importaciones", icon: Ship },
        { label: "Logística (todas las rutas)", href: "/dashboard/admin/panel-stock?tab=logistica", icon: Truck },
      ] },
    ],
  },
  {
    // Antes era una solapa más adentro de "Tesorería", que a su vez estaba
    // adentro de "Finanzas & Stock" — 3 niveles para algo que ya es su
    // propio módulo en el catálogo de permisos (personal.*). Pasa a tener
    // jerarquía propia.
    key: "personal", label: "Personal", icon: Users, href: "/dashboard/admin/panel-personal",
    groups: [
      { label: "Empleados", buttons: [
        { label: "Legajos y SICOSS", href: "/dashboard/admin/panel-personal?tab=legajos", icon: FileText },
        { label: "Empleados y Accesos", href: "/dashboard/admin/panel-personal?tab=accesos", icon: UserCheck },
      ] },
      { label: "Liquidación", buttons: [
        { label: "Liquidación de Sueldos", href: "/dashboard/admin/panel-personal?tab=sueldos", icon: Banknote },
        { label: "Vacaciones y Licencias", href: "/dashboard/admin/panel-personal?tab=licencias", icon: ClipboardList },
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
      { label: "Equipo interno", buttons: [
        { label: "Intercomunicador", href: "/dashboard/admin/panel-comunicacion?tab=intercomunicador", icon: MessageSquare },
        { label: "Agenda Personal", href: "/dashboard/admin/panel-comunicacion?tab=agenda", icon: CalendarDays },
        { label: "Gestor Documental", href: "/dashboard/admin/panel-comunicacion?tab=documentos", icon: FolderOpen },
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
      // "PUNY Seguridad" se retira de acá — antes tenía 3 puertas de entrada
      // distintas en este mismo menú (acá, y dos veces más en "Sistema").
      // Queda una sola, en Sistema → Accesos.
    ],
  },
  {
    // Antes convivía con "Configuración" (datos técnicos de la empresa).
    // Son decisiones comerciales del día a día, no un ajuste de una sola
    // vez — se separan para que tengan su propia visibilidad.
    key: "comercial", label: "Comercial", icon: Target, href: "/dashboard/admin/panel-comercial",
    groups: [
      { label: "Ventas y equipo", buttons: [
        { label: "Esquemas de Comisión", href: "/dashboard/admin/panel-comercial?tab=comisiones", icon: Percent },
        { label: "Objetivos Comerciales", href: "/dashboard/admin/panel-comercial?tab=objetivos", icon: Target },
        { label: "Ofertas vigentes", href: "/dashboard/admin/panel-comercial?tab=ofertas", icon: Tag },
        { label: "Vincular Cobradores", href: "/dashboard/admin/panel-comercial?tab=cobradores", icon: UserCheck },
      ] },
    ],
  },
  {
    // "Configuración" (Datos de la Empresa, Zonas) se fusiona acá — dos
    // botones sueltos no ameritaban su propia pestaña de primer nivel.
    key: "sistema", label: "Sistema", icon: Wrench, href: "/dashboard/admin/panel-sistema",
    groups: [
      { label: "Empresa", buttons: [
        { label: "Datos de la Empresa", href: "/dashboard/admin/panel-sistema?tab=empresa", icon: Building2 },
        { label: "Zonas y Circuitos", href: "/dashboard/admin/panel-sistema?tab=zonas", icon: MapPin },
      ] },
      { label: "Accesos", buttons: [
        { label: "Usuarios y Permisos", href: "/dashboard/admin/panel-sistema?tab=usuarios", icon: Users },
        { label: "PUNY Seguridad", href: "/dashboard/admin/panel-sistema?tab=seguridad", icon: ShieldCheck },
      ] },
      { label: "Plataforma", buttons: [
        { label: "Integraciones", href: "/dashboard/admin/panel-sistema?tab=integraciones", icon: Plug },
        { label: "Agente IA de WhatsApp", href: "/dashboard/admin/panel-sistema?tab=whatsapp-ia", icon: Bot },
        { label: "Sistema", href: "/dashboard/admin/panel-sistema?tab=sistema", icon: RotateCcw },
      ] },
    ],
  },
];
