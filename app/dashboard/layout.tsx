"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";
import Sidebar from "@/components/Sidebar";
import Ribbon from "@/components/Ribbon";
import AlertaLicencia from "@/components/AlertaLicencia";
import AlertasOperativas from "@/components/AlertasOperativas";
import GateUbicacion from "@/components/GateUbicacion";

const ROLES_CAMPO = ["vendedor", "entrega", "cobrador", "vigilador"];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  if (loading || !session || !profile) {
    return (
      <div className="flex items-center justify-center text-gray-500" style={{ minHeight: "calc(100vh - 26px)" }}>
        Cargando…
      </div>
    );
  }

  // El rol Dueño usa navegación tipo Ribbon (barra superior); Administrador
  // tiene paridad total de acceso con el Dueño y comparte la misma
  // navegación. El resto de los roles (incluido el personal administrativo
  // con permisos delegados puntuales) sigue con el Sidebar lateral.
  if (profile.role === "dueno" || profile.role === "administrador") {
    return (
      <div className="flex flex-col" style={{ minHeight: "calc(100vh - 26px)" }}>
        <Ribbon />
        <main className="flex-1 p-6 max-w-[1400px] mx-auto w-full">
          <AlertaLicencia />
          <AlertasOperativas />
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row" style={{ minHeight: "calc(100vh - 26px)" }}>
      <Sidebar />
      <main className="flex-1 p-4 md:p-6 max-w-[1400px]">
        <AlertaLicencia />
        <AlertasOperativas />
        {ROLES_CAMPO.includes(profile.role) ? <GateUbicacion>{children}</GateUbicacion> : children}
      </main>
    </div>
  );
}
