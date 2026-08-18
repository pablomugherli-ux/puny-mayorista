"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import PageHeader from "@/components/PageHeader";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export default function ZonasAdmin() {
  const [zonas, setZonas] = useState<any[]>([]);
  const [circuitos, setCircuitos] = useState<any[]>([]);
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [nuevaZona, setNuevaZona] = useState("");
  const [nuevoCircuito, setNuevoCircuito] = useState({ nombre: "", zona_id: "", vendedor_id: "", dias: [] as string[] });
  const [loading, setLoading] = useState(true);

  async function load() {
    const [{ data: z }, { data: c }, { data: v }] = await Promise.all([
      supabase.from("zonas").select("*").order("nombre"),
      supabase.from("circuitos").select("*, zonas(nombre), profiles:vendedor_id(nombre)").order("nombre"),
      supabase.from("profiles").select("id, nombre").eq("role", "vendedor"),
    ]);
    setZonas(z || []);
    setCircuitos(c || []);
    setVendedores(v || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function tenantId() {
    const { data: u } = await supabase.auth.getUser();
    const { data: p } = await supabase.from("profiles").select("tenant_id").eq("id", u.user?.id).single();
    return p?.tenant_id;
  }

  async function crearZona(e: React.FormEvent) {
    e.preventDefault();
    const tid = await tenantId();
    await supabase.from("zonas").insert({ tenant_id: tid, nombre: nuevaZona });
    setNuevaZona("");
    load();
  }

  async function crearCircuito(e: React.FormEvent) {
    e.preventDefault();
    const tid = await tenantId();
    await supabase.from("circuitos").insert({
      tenant_id: tid,
      nombre: nuevoCircuito.nombre,
      zona_id: nuevoCircuito.zona_id || null,
      vendedor_id: nuevoCircuito.vendedor_id || null,
      dias_semana: nuevoCircuito.dias,
    });
    setNuevoCircuito({ nombre: "", zona_id: "", vendedor_id: "", dias: [] });
    load();
  }

  function toggleDia(d: string) {
    setNuevoCircuito((f) => ({
      ...f,
      dias: f.dias.includes(d) ? f.dias.filter((x) => x !== d) : [...f.dias, d],
    }));
  }

  return (
    <div>
      <PageHeader title="Zonas y Circuitos" subtitle="Planificación geográfica: Zona > Circuito, asignación de vendedor y días de visita" />

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <div className="card">
          <h3 className="text-sm font-semibold text-navy mb-3">Nueva zona</h3>
          <form onSubmit={crearZona} className="flex gap-2">
            <input className="input" placeholder="Nombre de zona" value={nuevaZona} onChange={(e) => setNuevaZona(e.target.value)} required />
            <button className="btn-primary shrink-0">Crear</button>
          </form>
          <ul className="mt-4 text-sm space-y-1">
            {zonas.map((z) => <li key={z.id} className="text-gray-700">• {z.nombre}</li>)}
          </ul>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-navy mb-3">Nuevo circuito</h3>
          <form onSubmit={crearCircuito} className="space-y-2">
            <input className="input" placeholder="Nombre del circuito" value={nuevoCircuito.nombre} onChange={(e) => setNuevoCircuito({ ...nuevoCircuito, nombre: e.target.value })} required />
            <select className="input" value={nuevoCircuito.zona_id} onChange={(e) => setNuevoCircuito({ ...nuevoCircuito, zona_id: e.target.value })}>
              <option value="">Zona…</option>
              {zonas.map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
            </select>
            <select className="input" value={nuevoCircuito.vendedor_id} onChange={(e) => setNuevoCircuito({ ...nuevoCircuito, vendedor_id: e.target.value })}>
              <option value="">Vendedor asignado…</option>
              {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </select>
            <div className="flex flex-wrap gap-2">
              {DIAS.map((d) => (
                <label key={d} className="text-xs flex items-center gap-1 border rounded px-2 py-1">
                  <input type="checkbox" checked={nuevoCircuito.dias.includes(d)} onChange={() => toggleDia(d)} />
                  {d}
                </label>
              ))}
            </div>
            <button className="btn-primary">Crear circuito</button>
          </form>
        </div>
      </div>

      <div className="card overflow-x-auto">
        {loading ? <p className="text-gray-400">Cargando…</p> : (
          <table className="tbl">
            <thead><tr><th>Circuito</th><th>Zona</th><th>Vendedor</th><th>Días</th></tr></thead>
            <tbody>
              {circuitos.map((c) => (
                <tr key={c.id}>
                  <td>{c.nombre}</td>
                  <td>{c.zonas?.nombre || "—"}</td>
                  <td>{c.profiles?.nombre || "Sin asignar"}</td>
                  <td>{(c.dias_semana || []).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
