"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Ruta renombrada a /dashboard/admin/cuentas-clave (el nombre "Inmuner" ya no
// se usa en ningún identificador técnico visible). Este archivo se mantiene
// solo como redirección para cualquier enlace o marcador viejo, porque el
// entorno de archivos montado no permitió borrar la carpeta original.
export default function InmunerRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/admin/cuentas-clave");
  }, [router]);
  return null;
}
