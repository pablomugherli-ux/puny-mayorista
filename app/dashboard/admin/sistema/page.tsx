"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/lib/useAuth";
import PageHeader from "@/components/PageHeader";

const FRASE_CONFIRMACION = "RESET-FABRICA-CONFIRMADO";

export default function SistemaAdmin() {
  const { profile } = useAuth();
  const [incluirClientes, setIncluirClientes] = useState(false);
  const [frase, setFrase] = useState("");
  const [ejecutando, setEjecutando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  if (profile && profile.role !== "dueno") {
    return <p className="text-red-600 text-sm">No autorizado. Esta sección es exclusiva del Dueño de la distribuidora — ni siquiera el Usuario Maestro de la plataforma tiene acceso a los datos operativos de una distribuidora.</p>;
  }

  async function ejecutarReset() {
    setEjecutando(true);
    setError(null);
    setResultado(null);
    const { data, error } = await supabase.rpc("fn_reset_fabrica", { p_confirmacion: frase, p_incluir_clientes: incluirClientes });
    if (error) {
      setError(error.message.replace(/^.*?: /, ""));
    } else {
      setResultado(data);
      setFrase("");
    }
    setEjecutando(false);
  }

  const puedeEjecutar = frase === FRASE_CONFIRMACION;

  return (
    <div>
      <PageHeader title="Sistema" subtitle="Configuración de plataforma y operaciones de mantenimiento" />

      <div className="card border-2 border-danger">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 text-danger flex items-center justify-center text-lg font-bold shrink-0">!</div>
          <div>
            <h3 className="text-sm font-bold text-danger">Reset de fábrica — acción irreversible</h3>
            <p className="text-xs text-gray-600 mt-1">
              Borra permanentemente todos los datos transaccionales y de prueba: pedidos, cobros, entregas,
              devoluciones, comprobantes, cuenta corriente, hojas de ruta, notificaciones, visitas y auditoría.
            </p>
            <p className="text-xs text-gray-600 mt-1">
              <strong>No borra:</strong> catálogo de productos, usuarios, zonas y circuitos, esquemas de comisión,
              objetivos comerciales{incluirClientes ? "" : " ni clientes"}. El stock de productos no se ajusta
              automáticamente — revisalo en Catálogo antes de empezar a operar.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3 border-t pt-4">
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={incluirClientes} onChange={(e) => setIncluirClientes(e.target.checked)} />
            Incluir también la cartera de clientes cargada (si son clientes de prueba)
          </label>

          <div>
            <label className="text-xs text-gray-500">
              Para confirmar, escribí exactamente: <code className="bg-gray-100 px-1 rounded">{FRASE_CONFIRMACION}</code>
            </label>
            <input className="input" value={frase} onChange={(e) => setFrase(e.target.value)} placeholder={FRASE_CONFIRMACION} />
          </div>

          <button
            className="btn-primary !bg-danger hover:!bg-red-700"
            disabled={!puedeEjecutar || ejecutando}
            onClick={ejecutarReset}
          >
            {ejecutando ? "Ejecutando reset…" : "Ejecutar reset de fábrica"}
          </button>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {resultado && (
            <div className="text-xs bg-green-50 border border-green-200 rounded p-3">
              <p className="font-semibold text-green-700 mb-1">Reset completado. Registros eliminados:</p>
              <pre className="whitespace-pre-wrap">{JSON.stringify(resultado, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
