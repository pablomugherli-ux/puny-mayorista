/**
 * Generación de reportes 100% client-side (PDF / Excel).
 * La app es un export estático sin backend propio: todo el armado del
 * archivo ocurre en el navegador del usuario, sobre datos ya traídos de
 * Supabase (respetando siempre el alcance que le permite su RLS).
 */
import { creditoLinea } from "./version";

export type Columna = { header: string; key: string; formato?: (v: any) => string };
export type EmpresaReporte = { nombre?: string | null; logoUrl?: string | null };

function aFilas(datos: any[], columnas: Columna[]) {
  return datos.map((d) => columnas.map((c) => (c.formato ? c.formato(d[c.key]) : d[c.key] ?? "")));
}

async function cargarImagenBase64(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function exportarPDF(titulo: string, columnas: Columna[], datos: any[], nombreArchivo: string, empresa?: EmpresaReporte) {
  const { default: jsPDF } = await import("jspdf");
  const { autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: columnas.length > 5 ? "landscape" : "portrait" });
  let cursorX = 14;

  if (empresa?.logoUrl) {
    const b64 = await cargarImagenBase64(empresa.logoUrl);
    if (b64) {
      try { doc.addImage(b64, "PNG", 14, 8, 14, 14); cursorX = 32; } catch { /* formato no soportado, se omite */ }
    }
  }

  if (empresa?.nombre) {
    doc.setFontSize(10);
    doc.setTextColor(107, 16, 41);
    doc.text(empresa.nombre, cursorX, 13);
  }

  doc.setFontSize(14);
  doc.setTextColor(107, 16, 41);
  doc.text(titulo, cursorX, empresa?.nombre ? 20 : 16);
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(`Generado el ${new Date().toLocaleString("es-AR")}`, cursorX, empresa?.nombre ? 26 : 22);

  const credito = creditoLinea(new Date().getFullYear());

  autoTable(doc, {
    startY: 32,
    head: [columnas.map((c) => c.header)],
    body: aFilas(datos, columnas),
    headStyles: { fillColor: [107, 16, 41], textColor: [212, 175, 55], fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [250, 245, 238] },
    margin: { left: 14, right: 14, bottom: 16 },
    didDrawPage: (data: any) => {
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      doc.setFontSize(6.5);
      doc.setTextColor(150, 150, 150);
      doc.text(credito, pageW / 2, pageH - 6, { align: "center" });
    },
  });

  doc.save(`${nombreArchivo}.pdf`);
}

function escaparXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Inyecta un pie de página nativo de Excel (headerFooter/oddFooter) en cada
 * hoja del .xlsx generado. La librería xlsx (SheetJS Community, que es la
 * que usamos) solo permite configurar el MARGEN del pie de página vía la
 * API pública (`!margins`), no el texto — escribir el texto del pie
 * requiere post-procesar el XML interno del archivo (un .xlsx es un .zip
 * con XML adentro), que es lo que hace esta función con JSZip.
 */
async function inyectarPiePagina(bufferXlsx: ArrayBuffer, textoFooter: string): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(bufferXlsx);

  const footerXml = `<headerFooter><oddFooter>&amp;C&amp;8${escaparXml(textoFooter)}</oddFooter></headerFooter>`;

  const hojas = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  for (const nombre of hojas) {
    const xml = await zip.file(nombre)!.async("string");
    if (xml.includes("</headerFooter>")) continue; // ya tiene uno, no duplicar
    const xmlConFooter = xml.replace("</worksheet>", `${footerXml}</worksheet>`);
    zip.file(nombre, xmlConFooter);
  }

  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function descargarBlob(blob: Blob, nombreArchivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportarExcel(nombreHoja: string, columnas: Columna[], datos: any[], nombreArchivo: string) {
  const XLSX = await import("xlsx");
  const filas = datos.map((d) => {
    const fila: Record<string, any> = {};
    columnas.forEach((c) => (fila[c.header] = c.formato ? c.formato(d[c.key]) : d[c.key] ?? ""));
    return fila;
  });
  const ws = XLSX.utils.json_to_sheet(filas);
  ws["!margins"] = { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, nombreHoja.slice(0, 31));

  const anio = new Date().getFullYear();
  const wsInfo = XLSX.utils.aoa_to_sheet([
["PUNY 2026 INTEGRAL"],
    ["Desarrollado por", "Pablo M. Mugherli"],
    ["Todos los derechos reservados"],
    ["Teléfono", "+54 3442 503007"],
    ["Email", "pablomugherli@gmail.com"],
    ["Año", anio],
    ["Versión", "1.0.0"],
    [],
    ["Generado el", new Date().toLocaleString("es-AR")],
  ]);
  wsInfo["!margins"] = ws["!margins"];
  XLSX.utils.book_append_sheet(wb, wsInfo, "Acerca de");

  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const blobConFooter = await inyectarPiePagina(buffer, creditoLinea(anio));
  descargarBlob(blobConFooter, `${nombreArchivo}.xlsx`);
}
