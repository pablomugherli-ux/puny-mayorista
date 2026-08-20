"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import { TIPO_AVISO_LABEL, type AvisoMaster } from "@/lib/types";

const TIPO_ESTILO: Record<AvisoMaster["tipo"], string> = {
  info: "border-blue-300",
  advertencia: "border-amber-300",
  critico: "border-red-300",
};
const TIPO_BADGE: Record<AvisoMaster["tipo"], string> = {
  info: "bg-blue-100 text-blue-700",
  advertencia: "bg-amber-100 text-amber-700",
  critico: "bg-red-100 text-red-700",
};

// Fase H (agosto 2026) — modal overlay con los avisos del Usuario Maestro
// (masivos o selectivos) sin leer todavía por este usuario. Ver
// PUNY_Especificacion_Maestro_Dueno.docx, sección 3.3.d. Solo se muestra a
// Dueño/Administrador — son quienes gestionan la relación con el Maestro.
export default function AvisosMaster() {
  const { profile } = useAuth();
  const [pendientes, setPendientes] = useState<AvisoMaster[]>([]);
  const [idx, setIdx] = useState(0);
  const [marcando, setMarcando] = useState(false);

  useEffect(() => {
    if (!profile || !["dueno", "administrador"].includes(profile.role)) return;
    (async () => {
      const ahora = new Date().toISOString();
      const { data: avisos } = await supabase
        .from("avisos_master")
        .select("*")
        .or(`expira_en.is.null,expira_en.gte.${ahora}`)
        .order("fecha_envio", { ascending: false });
      if (!avisos || avisos.length === 0) return;

      const { data: leidos } = await supabase.from("avisos_master_lecturas").select("aviso_id").eq("profile_id", profile.id);
      const idsLeidos = new Set((leidos || []).map((l: any) => l.aviso_id));
      setPendientes((avisos as AvisoMaster[]).filter((a) => !idsLeidos.has(a.id)));
    })();
  }, [profile?.id]);

  async function marcarLeido() {
    const aviso = pendientes[idx];
    if (!aviso || !profile) return;
    setMarcando(true);
    const { data: u } = await supabase.auth.getUser();
    const { data: p } = await supabase.from("profiles").select("tenant_id").eq("id", u.user?.id).single();
    await supabase.from("avisos_master_lecturas").insert({ aviso_id: aviso.id, tenant_id: p?.tenant_id, profile_id: profile.id });
    setMarcando(false);
    if (idx + 1 < pendientes.length) {
      setIdx(idx + 1);
    } else {
      setPendientes([]);
    }
  }

  if (pendientes.length === 0) return null;
  const aviso = pendientes[idx];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className={`bg-white rounded-lg shadow-xl max-w-md w-full border-t-4 ${TIPO_ESTILO[aviso.tipo]} p-5`}>
        <div className="flex items-center justify-between mb-2">
          <span className={`badge ${TIPO_BADGE[aviso.tipo]}`}>{TIPO_AVISO_LABEL[aviso.tipo]}</span>
          {pendientes.length > 1 && <span className="text-xs text-gray-400">{idx + 1} de {pendientes.length}</span>}
        </div>
        <h3 className="text-base font-semibold text-navy mb-2">{aviso.titulo}</h3>
        <p className="text-sm text-gray-700 whitespace-pre-wrap mb-4">{aviso.mensaje}</p>
        <div className="flex justify-end">
          <button className="btn-primary" disabled={marcando} onClick={marcarLeido}>
            {marcando ? "…" : idx + 1 < pendientes.length ? "Siguiente" : "Entendido"}
          </button>
        </div>
      </div>
    </div>
  );
}
