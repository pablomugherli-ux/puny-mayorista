"use client";
import { useEffect, useRef, useState } from "react";

/** Contador animado — anima el número al cambiar el valor objetivo. Sin dependencias externas. */
export default function AnimatedNumber({
  value, format, durationMs = 700,
}: {
  value: number; format?: (n: number) => string; durationMs?: number;
}) {
  const [display, setDisplay] = useState(0);
  const inicio = useRef<number | null>(null);
  const desde = useRef(0);

  useEffect(() => {
    desde.current = display;
    inicio.current = null;
    let raf: number;
    function paso(ts: number) {
      if (inicio.current === null) inicio.current = ts;
      const t = Math.min(1, (ts - inicio.current) / durationMs);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplay(desde.current + (value - desde.current) * ease);
      if (t < 1) raf = requestAnimationFrame(paso);
    }
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <>{format ? format(display) : Math.round(display).toLocaleString("es-AR")}</>;
}
