"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { RIBBON_TABS } from "@/lib/ribbonConfig";
import Logo from "./Logo";

// useSearchParams() (usado más abajo para saber qué botón de nivel 2 está
// activo) exige estar envuelto en Suspense en Next — de lo contrario el
// export estático falla en build. RibbonInner hace el trabajo real; este
// wrapper es solo el boundary. El fallback no debería verse nunca en la
// práctica (la navegación es instantánea, client-side).
export default function Ribbon() {
  return (
    <Suspense fallback={<div className="h-[92px] md:h-[84px] border-b border-gray-200 bg-white" />}>
      <RibbonInner />
    </Suspense>
  );
}

function RibbonInner() {
  const { profile, tenant, signOut } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tabHover, setTabHover] = useState<string | null>(null);

  const tabActivaKey = RIBBON_TABS.find((t) => pathname.startsWith(t.href))?.key || RIBBON_TABS[0].key;
  const tabMostrada = RIBBON_TABS.find((t) => t.key === (tabHover || tabActivaKey)) || RIBBON_TABS[0];

  // Bug reportado por Pablo (agosto 2026): al hacer clic en una pestaña, los
  // botones de la cinta de abajo (nivel 2) no mostraban cuál estaba activo
  // — no tenían ningún estilo "seleccionado", solo hover. Como el panel de
  // abajo (nivel 3) sí tenía su propia fila de solapas con ese resaltado,
  // duplicando exactamente las mismas opciones, el usuario terminaba
  // clickeando dos veces lo mismo para "confirmar" la selección. Se agrega
  // el resaltado acá (comparando path + query real contra cada botón) y se
  // retira la fila duplicada de cada panel-*.tsx — ver esos archivos.
  const queryActual = searchParams.toString();
  const hrefActual = queryActual ? `${pathname}?${queryActual}` : pathname;
  // Sin query en la URL (recién se hizo clic en la pestaña de nivel 1, sin
  // pasar por un botón específico), el panel muestra su primera solapa por
  // defecto — así que el primer botón del primer grupo es el "activo" real.
  const primerBotonDeLaTab = tabMostrada.groups[0]?.buttons[0]?.href;
  function botonActivo(href: string) {
    if (href === hrefActual) return true;
    if (!queryActual && href === primerBotonDeLaTab && pathname === tabMostrada.href) return true;
    return false;
  }

  return (
    <div className="border-b border-gray-200 bg-white sticky top-0 z-20">
      {/* Zona A — barra de marca */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-navy">
        <Logo
          variant="on-dark" size="sm"
          nombre={tenant?.nombre || undefined}
          subtitulo={tenant?.eslogan || undefined}
          logoUrl={tenant?.logo_url}
          colorFondo={tenant?.logo_color_fondo}
          colorTexto={tenant?.logo_color_texto}
        />
        <div className="flex items-center gap-3 text-xs text-white/80">
          <span className="truncate max-w-[220px]">{profile?.email}</span>
          <button onClick={() => signOut()} className="text-white/70 hover:text-white underline shrink-0">
            Cerrar sesión
          </button>
        </div>
      </div>

      {/* Zona B — fila de pestañas. El hover solo es un preview de desktop:
          la pestaña que se muestra por defecto (tabActivaKey, según la URL)
          ya funciona sin hover, así que en touch no queda nada inalcanzable
          — el tap navega directo y listo. overflow-x-auto + whitespace-nowrap
          evitan que la fila se corte en pantallas chicas. */}
      <div className="flex overflow-x-auto px-2 border-b border-gray-100">
        {RIBBON_TABS.map((t) => {
          const Icon = t.icon;
          const activa = t.key === tabActivaKey;
          return (
            <Link
              key={t.key}
              href={t.href}
              onMouseEnter={() => setTabHover(t.key)}
              onMouseLeave={() => setTabHover(null)}
              className={`flex items-center gap-1.5 px-3.5 py-3 md:py-2 text-sm font-medium border-b-2 transition-colors shrink-0 whitespace-nowrap ${
                activa ? "border-navy text-navy" : "border-transparent text-gray-500 hover:text-navy hover:bg-gray-50"
              }`}
            >
              <Icon size={15} />
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Zona B — cinta de grupos de la pestaña activa/hover */}
      <div className="flex items-stretch gap-0 px-3 py-2 overflow-x-auto bg-gray-50">
        {tabMostrada.groups.map((g, gi) => (
          <div key={g.label} className={`flex flex-col px-3 shrink-0 ${gi > 0 ? "border-l border-gray-200" : ""}`}>
            <div className="flex gap-1.5">
              {g.buttons.map((b) => {
                const BIcon = b.icon;
                const activo = botonActivo(b.href);
                return (
                  <Link
                    key={b.label}
                    href={b.href}
                    className={`flex flex-col items-center gap-1 px-2.5 py-2.5 md:py-1.5 rounded text-center min-w-[72px] shrink-0 ${
                      activo ? "bg-white shadow-sm ring-1 ring-navy/20" : "hover:bg-white hover:shadow-sm"
                    }`}
                  >
                    <BIcon size={18} className="text-navy" />
                    <span className={`text-[10.5px] leading-tight ${activo ? "text-navy font-semibold" : "text-gray-600"}`}>{b.label}</span>
                  </Link>
                );
              })}
            </div>
            <div className="text-center text-[10px] text-gray-400 mt-1 uppercase tracking-wide">{g.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
