"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";

export default function CobradoresAdmin() {
  const { profile } = useAuth();
  const [cobradores, setCobradores] = useState<any[]>([]);
  const [asignables, setAsignables] = useState<any[]>([]);
  const [vinculos, setVinculos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    const [{ data: cob }, { data: asig }, { data: v }] = await Promise.all([
      supabase.from("profiles").select("id, nombre").eq("role", "cobrador").order("nombre"),
      supabase.from("profiles").select("id, nombre, role").in("role", ["vendedor", "entrega"]).order("nombre"),
      supabase.from("cobrador_vinculos").select("*"),
    ]);
    setCobradores(cob || []);
    setAsignables(asig || []);
    setVinculos(v || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function estaVinculado(cobradorId: string, asignadoId: string) {
    return vinculos.some((v) => v.cobrador_id === cobradorId && v.vinculado_a_id === asignadoId);
  }

  async function toggle(cobradorId: string, asignadoId: string) {
    if (!profile) return;
    const key = `${cobradorId}-${asignadoId}`;
    setSaving(key);
    const existente = vinculos.find((v) => v.cobrador_id === cobradorId && v.vinculado_a_id === asignadoId);
    if (existente) {
      await supabase.from("cobrador_vinculos").delete().eq("id", existente.id);
    } else {
      await supabase.from("cobrador_vinculos").insert({ tenant_id: profile.tenant_id, cobrador_id: cobradorId, vinculado_a_id: asignadoId });
    }
    await load();
    setSaving(null);
  }

  return (
    <div>
      <PageHeader
        title="Vincular Cobradores"
        subtitle="Pool compartido muchos-a-muchos: un cobrador puede trabajar para varios vendedores y/o repartos (entrega), y cada uno puede tener más de un cobrador"
      />
      <div className="card overflow-x-auto">
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Cobrador</th>
                {asignables.map((a) => (
                  <th key={a.id}>{a.nombre}<div className="text-[10px] font-normal opacity-70">{a.role === "vendedor" ? "Vendedor" : "Entrega"}</div></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cobradores.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium">{c.nombre}</td>
                  {asignables.map((a) => {
                    const key = `${c.id}-${a.id}`;
                    return (
                      <td key={a.id} className="text-center">
                        <input
                          type="checkbox"
                          disabled={saving === key}
                          checked={estaVinculado(c.id, a.id)}
                          onChange={() => toggle(c.id, a.id)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
              {cobradores.length === 0 && (
                <tr><td colSpan={asignables.length + 1} className="text-center text-gray-400 py-6">No hay cobradores cargados</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-3">
        Un cobrador solo puede cobrar comprobantes de clientes que pertenecen a un vendedor o reparto con el que
        está vinculado — se aplica automáticamente vía permisos a nivel de base de datos (RLS).
      </p>
    </div>
  );
}
