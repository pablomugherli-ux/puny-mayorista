"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";

const HOME_BY_ROLE: Record<string, string> = {
  master: "/dashboard/master",
  dueno: "/dashboard/admin/panel-inicio",
  administrador: "/dashboard/admin/panel-inicio",
  supervisor: "/dashboard/admin/panel-inicio",
  vendedor: "/dashboard/campo/vendedor",
  entrega: "/dashboard/campo/repartidor",
  cobrador: "/dashboard/campo/cobrador",
  cliente_b2b: "/dashboard/b2b",
  vigilador: "/dashboard/campo/vigilador",
  // Bug encontrado en la ronda de pruebas: estos 3 roles (ya existentes)
  // nunca habían tenido entrada acá — un login con ellos caía en el
  // fallback "/login" y quedaba en loop. Se completan junto con los roles
  // nuevos de esta expansión.
  vendedor_masivo: "/dashboard/admin/masivo",
  asesor_inmuner: "/dashboard/admin/cuentas-clave",
  operador_wp: "/dashboard/admin/whatsapp-wp",
  tesorero: "/dashboard/admin/finanzas",
  jefe_personal: "/dashboard/admin/tesoreria",
  encargado_caja: "/dashboard/admin/tesoreria",
  cajero: "/dashboard/admin/tesoreria",
  encargado_depositos: "/dashboard/admin/stock",
  encargado_logistica: "/dashboard/admin/logistica",
  proveedor: "/dashboard/proveedor",
};

export default function DashboardHome() {
  const { profile } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (profile) router.replace(HOME_BY_ROLE[profile.role] || "/login");
  }, [profile, router]);
  return null;
}
