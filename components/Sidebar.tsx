"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import { ROLE_LABEL } from "@/lib/types";
import { supabase } from "@/lib/supabaseClient";
import Logo from "./Logo";

type LinkDef = { href: string; label: string; claves: string[] };

// ============================================================================
// RBAC dinámico — Fase 4: el Sidebar ya no deriva los enlaces de role/permiso_*
// a mano (LINKS_BY_ROLE + cadena de ifs) — pasa a filtrar este catálogo
// declarativo de "qué existe" contra mis_permisos_activos() (RBAC Fase 4),
// que ya viene resuelto en el contexto de auth. "claves" son de
// catalogo_permisos; basta con que UNA esté activa (OR) para mostrar el
// enlace — así conviven, por ejemplo, un Vendedor y un Vendedor+Cobrador
// (superposición de plantillas, RBAC Fase 3) sin necesitar dos catálogos.
//
// El Usuario Maestro queda fuera de este catálogo (no participa del sistema
// de permisos dinámicos) — se resuelve aparte, como siempre.
// ============================================================================
const LINK_CATALOG: LinkDef[] = [
  // Campo — Vendedor
  { href: "/dashboard/campo/vendedor", label: "Mis Clientes", claves: ["campo.vendedor.mis_clientes"] },
  { href: "/dashboard/campo/vendedor/nuevo-pedido", label: "Nuevo Pedido", claves: ["campo.vendedor.nuevo_pedido"] },
  { href: "/dashboard/campo/vendedor/pedidos", label: "Mis Pedidos", claves: ["campo.vendedor.mis_pedidos"] },
  // Campo — Entrega
  { href: "/dashboard/campo/repartidor", label: "Hoja de Ruta", claves: ["campo.entrega.hoja_ruta"] },
  // Campo — Cobrador
  { href: "/dashboard/campo/cobrador", label: "Hoja de Cobro", claves: ["campo.cobrador.hoja_cobro"] },
  // Campo — Vigilador
  { href: "/dashboard/campo/vigilador", label: "Mi Ronda", claves: ["campo.vigilador.mi_ronda"] },
  // Campo — común a todos los roles de campo
  { href: "/dashboard/campo/comisiones", label: "Mis Comisiones y Objetivos", claves: ["campo.comun.comisiones"] },
  { href: "/dashboard/campo/mi-portal", label: "Mi Portal (Recibos y Licencias)", claves: ["campo.comun.mi_portal"] },
  // Cobro de cartera propia (Vendedor/Entrega con el permiso puntual sumado)
  { href: "/dashboard/campo/cobro-clientes", label: "Cobrar a mis clientes", claves: ["cobros.clientes_propios"] },
  // Portal Cliente B2B
  { href: "/dashboard/b2b", label: "Catálogo y Pedido", claves: ["b2b.catalogo_pedido"] },
  { href: "/dashboard/b2b/pedidos", label: "Mis Pedidos", claves: ["b2b.mis_pedidos"] },
  { href: "/dashboard/b2b/cuenta-corriente", label: "Cuenta Corriente", claves: ["b2b.cuenta_corriente"] },
  // Supervisor — Informes en solo lectura
  { href: "/dashboard/admin/panel-inicio", label: "Inicio", claves: ["informes.panel_inicio_supervisor"] },
  { href: "/dashboard/admin/panel-informes", label: "Informes y Reportes", claves: ["informes.panel_informes_supervisor"] },
  { href: "/dashboard/admin/seguridad?tab=vigilancia", label: "Vigilancia (lectura)", claves: ["seguridad.vigilancia_lectura"] },
  // Canales de venta especiales
  { href: "/dashboard/admin/masivo", label: "Punto de Venta", claves: ["masivo.pos"] },
  { href: "/dashboard/admin/cuentas-clave", label: "Mis Cuentas Clave", claves: ["cuentas_clave.mis_cuentas"] },
  { href: "/dashboard/admin/whatsapp-wp", label: "Bandeja de WhatsApp", claves: ["comunicacion.bandeja_wp"] },
  // Portal Proveedor
  { href: "/dashboard/proveedor", label: "Mis Órdenes de Compra", claves: ["proveedor.ordenes_compra"] },
  { href: "/dashboard/proveedor/cuenta-corriente", label: "Cuenta Corriente", claves: ["proveedor.cuenta_corriente"] },
  { href: "/dashboard/proveedor/comprobantes", label: "Subir Comprobantes", claves: ["proveedor.comprobantes"] },
  // Módulos administrativos delegables (antes permiso_finanzas/stock/etc.)
  { href: "/dashboard/admin/finanzas", label: "Finanzas (Bancos/Proveedores/Cartera)", claves: ["finanzas.acceso"] },
  { href: "/dashboard/admin/contabilidad", label: "Contabilidad", claves: ["finanzas.acceso"] },
  { href: "/dashboard/admin/cashflow", label: "Cash Flow Proyectado", claves: ["finanzas.acceso"] },
  { href: "/dashboard/admin/stock", label: "Stock y Compras", claves: ["stock.acceso"] },
  { href: "/dashboard/admin/importaciones", label: "Importaciones", claves: ["stock.acceso"] },
  { href: "/dashboard/admin/tesoreria", label: "Tesorería y Sueldos", claves: ["rrhh.acceso", "caja.acceso"] },
  { href: "/dashboard/admin/seguridad", label: "PUNY Seguridad", claves: ["seguridad.acceso"] },
  { href: "/dashboard/admin/redes-sociales", label: "PUNY Redes Sociales", claves: ["marketing.acceso"] },
  { href: "/dashboard/admin/stock", label: "Depósitos y Stock", claves: ["depositos.acceso"] },
  { href: "/dashboard/admin/logistica", label: "Logística", claves: ["logistica.acceso"] },
];

export default function Sidebar() {
  const { profile, tenant, permisos, signOut } = useAuth();
  const pathname = usePathname();

  const links: LinkDef[] = profile?.role === "master"
    ? [{ href: "/dashboard/master", label: "Distribuidoras (Tenants)", claves: [] }]
    : LINK_CATALOG.filter((l) => l.claves.some((c) => permisos.has(c)));

  const [erroresContablesPendientes, setErroresContablesPendientes] = useState(0);
  // Mobile: el Sidebar pasa a ser un drawer off-canvas (fixed, oculto por
  // defecto) que se abre con el botón hamburguesa de la barra superior. En
  // md+ vuelve a comportarse como aside fijo en el flujo normal.
  const [open, setOpen] = useState(false);

  const accedeAContabilidad = permisos.has("finanzas.acceso");
  useEffect(() => {
    if (!accedeAContabilidad) { setErroresContablesPendientes(0); return; }
    supabase
      .from("config_contable_errores")
      .select("id", { count: "exact", head: true })
      .eq("resuelta", false)
      .then(({ count }) => setErroresContablesPendientes(count || 0));
  }, [accedeAContabilidad]);

  // Cerrar el drawer al cambiar de página (navegación, back/forward, etc.)
  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <>
      {/* Barra superior solo mobile: hamburguesa + nombre del tenant */}
      <div className="md:hidden flex items-center gap-3 bg-navy text-white px-4 py-3 sticky top-0 z-30">
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menú"
          className="p-2 -ml-2 shrink-0"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <span className="text-sm font-semibold truncate">{tenant?.nombre || "PUNY"}</span>
      </div>

      {/* Overlay para cerrar el drawer tocando afuera */}
      {open && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
      )}

      <aside
        className={`w-64 bg-navy text-white flex flex-col shrink-0 fixed md:static inset-y-0 left-0 z-50 overflow-y-auto transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
        style={{ minHeight: "calc(100vh - 26px)" }}
      >
        <div className="px-5 py-5 border-b border-white/10 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Logo
              variant="on-dark" size="sm"
              nombre={tenant?.nombre || undefined}
              subtitulo={tenant?.eslogan || undefined}
              logoUrl={tenant?.logo_url}
              colorFondo={tenant?.logo_color_fondo}
              colorTexto={tenant?.logo_color_texto}
            />
            <div className="text-xs text-white/60 mt-2">{profile ? ROLE_LABEL[profile.role] : ""}</div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
            className="md:hidden p-1 -mr-1 -mt-1 shrink-0 text-white/70 hover:text-white"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 py-3">
          {links.map((l) => {
            const active = pathname === l.href;
            const esContabilidad = l.href === "/dashboard/admin/panel-finanzas";
            return (
              <Link
                key={l.href + l.label}
                href={l.href}
                onClick={() => setOpen(false)}
                className={`flex items-center justify-between px-5 py-3 md:py-2.5 text-sm ${
                  active ? "bg-white/15 font-semibold" : "text-white/80 hover:bg-white/10"
                }`}
              >
                <span>{l.label}</span>
                {esContabilidad && erroresContablesPendientes > 0 && (
                  <span className="bg-red-500 text-white text-[10px] leading-none rounded-full px-1.5 py-1" title="Errores de automatización contable pendientes">
                    {erroresContablesPendientes}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-4 border-t border-white/10 text-xs">
          <div className="mb-2 truncate">{profile?.email}</div>
          <button onClick={() => signOut()} className="text-white/70 hover:text-white underline py-1">
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
