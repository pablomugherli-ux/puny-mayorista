"use client";
// ============================================================================
// Generador de QR y código de barras (Code128) para un producto.
// ----------------------------------------------------------------------------
// Ambos se generan 100% en el navegador a partir del SKU del producto — sin
// depender de ningún servicio externo. El código de barras se puede leer con
// el mismo lector USB/Bluetooth que ya usa "Nuevo Pedido" (que matchea por
// SKU), y el QR con la cámara de cualquier celular. Pensado especialmente
// para imprimir la etiqueta de un producto fraccionado o de un combo armado
// en el depósito, que no viene con código de fábrica.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";

export default function CodigoProducto({ sku, nombre }: { sku: string; nombre: string }) {
  const [abierto, setAbierto] = useState(false);
  const qrRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!abierto) return;
    if (qrRef.current) {
      QRCode.toCanvas(qrRef.current, sku, { width: 180, margin: 1 }).catch(() => {});
    }
    if (barRef.current) {
      try {
        JsBarcode(barRef.current, sku, { format: "CODE128", width: 2, height: 60, displayValue: true, fontSize: 14 });
      } catch {
        // SKU con caracteres no soportados por Code128: el QR sigue funcionando igual.
      }
    }
  }, [abierto, sku]);

  function imprimir() {
    const win = window.open("", "_blank", "width=420,height=560");
    if (!win) return;
    win.document.write(`
      <html><head><title>Etiqueta — ${sku}</title>
      <style>
        body { font-family: sans-serif; text-align: center; padding: 16px; }
        h3 { margin: 4px 0; font-size: 14px; }
        .row { display: flex; justify-content: center; gap: 24px; margin-top: 12px; flex-wrap: wrap; }
      </style></head><body>
      <h3>${nombre}</h3>
      <div class="row">${qrRef.current ? `<img src="${qrRef.current.toDataURL()}" />` : ""}${
        barRef.current ? `<img src="data:image/svg+xml;base64,${btoa(new XMLSerializer().serializeToString(barRef.current))}" />` : ""
      }</div>
      <script>window.onload = () => { window.print(); }</script>
      </body></html>
    `);
    win.document.close();
  }

  return (
    <div className="inline-block">
      <button type="button" className="btn-secondary text-xs" onClick={() => setAbierto((v) => !v)}>
        {abierto ? "Cerrar código" : "Código"}
      </button>
      {abierto && (
        <div className="card mt-2 p-3 inline-flex flex-col items-center gap-2">
          <canvas ref={qrRef} />
          <svg ref={barRef} />
          <button type="button" className="btn-primary text-xs" onClick={imprimir}>Imprimir etiqueta</button>
        </div>
      )}
    </div>
  );
}
