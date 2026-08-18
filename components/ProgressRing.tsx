"use client";
import { useEffect, useState } from "react";

/** Anillo de progreso SVG animado. Usado para mostrar % de cumplimiento de objetivos. */
export default function ProgressRing({
  pct, size = 96, stroke = 10, color = "#D4AF37", trackColor = "#7A5C0A",
  label, sublabel,
}: {
  pct: number; size?: number; stroke?: number; color?: string; trackColor?: string;
  label?: string; sublabel?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const [animado, setAnimado] = useState(0);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;

  useEffect(() => {
    const t = setTimeout(() => setAnimado(clamped), 60);
    return () => clearTimeout(t);
  }, [clamped]);

  const offset = circ - (animado / 100) * circ;
  const sobrepasado = pct > 100;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeOpacity={0.18} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={sobrepasado ? "#1FAE7A" : color}
          strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-navy">{Math.round(pct)}%</span>
        {label && <span className="text-[10px] text-gray-400 leading-none mt-0.5 text-center px-1">{label}</span>}
      </div>
      {sublabel && <span className="sr-only">{sublabel}</span>}
    </div>
  );
}
