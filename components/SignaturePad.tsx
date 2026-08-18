"use client";
import { useRef, useState } from "react";

export default function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);

  function pos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const point = "touches" in e ? e.touches[0] : (e as React.MouseEvent);
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }
  function move(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#7A5C0A";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  }
  function end() {
    drawing.current = false;
    if (hasSignature) onChange(canvasRef.current!.toDataURL("image/png"));
  }
  function limpiar() {
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
    setHasSignature(false);
    onChange(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={320}
        height={140}
        className="border border-gray-300 rounded bg-white touch-none w-full"
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
      />
      <button type="button" className="text-xs text-accent underline mt-1" onClick={limpiar}>Limpiar firma</button>
    </div>
  );
}
