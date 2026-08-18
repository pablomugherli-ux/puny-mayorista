"use client";
// ============================================================================
// Gráficos de historial de compras de un cliente (Vendedor → ficha de
// cliente). Se separan en un componente aparte cargado con next/dynamic
// desde la página que lo usa: recharts es una librería pesada y esta
// pantalla es de uso diario en celular con datos móviles — así el bundle
// inicial de la página no la incluye, solo se descarga cuando el gráfico
// realmente se va a mostrar.
// ============================================================================
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line,
} from "recharts";

type Props = {
  serie: { mes: string; total: number }[];
  proy: { proyeccion: number; pendiente: number } | null;
  fmt: (n: number) => string;
};

export default function GraficosHistorialCliente({ serie, proy, fmt }: Props) {
  return (
    <div className="grid md:grid-cols-2 gap-4 mb-6">
      <div className="card">
        <h3 className="text-sm font-semibold text-navy mb-3">Compras por mes</h3>
        {serie.length === 0 ? <p className="text-xs text-gray-400">Sin historial de compras aún.</p> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v: any) => fmt(Number(v))} />
              <Bar dataKey="total" fill="#B8860B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="card">
        <h3 className="text-sm font-semibold text-navy mb-3">Proyección próximo mes (tendencia lineal)</h3>
        {!proy ? (
          <p className="text-xs text-gray-400">Se necesitan al menos 2 meses con compras para proyectar.</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={[...serie, { mes: "Próx.", total: proy.proyeccion }]}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip formatter={(v: any) => fmt(Number(v))} />
                <Line type="monotone" dataKey="total" stroke="#D4AF37" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-xs text-gray-500 mt-2">
              Proyección orientativa: {fmt(proy.proyeccion)} ({proy.pendiente >= 0 ? "tendencia creciente" : "tendencia decreciente"}).
              Calculada por regresión lineal simple sobre los últimos {serie.length} meses — no reemplaza el criterio comercial.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
