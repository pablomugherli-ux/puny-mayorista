"use client";
import { useEffect, useState } from "react";
import { APP_NAME, APP_VERSION, APP_AUTOR, APP_TELEFONO, APP_EMAIL } from "@/lib/version";

export default function FooterCreditos() {
  const [anio, setAnio] = useState(2026);
  useEffect(() => { setAnio(new Date().getFullYear()); }, []);

  return (
    <footer
      style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50,
        background: "#3D2E05", borderTop: "1px solid rgba(212,175,55,.25)",
        overflowX: "auto", whiteSpace: "nowrap",
      }}
    >
      <div style={{ padding: "4px 10px", fontSize: 10.5, color: "#E3C878", textAlign: "center" }}>
        <span style={{ fontWeight: 700, color: "#fff" }}>{APP_NAME}</span>
        <span> · Desarrollado por {APP_AUTOR}</span>
        <span> · Todos los derechos reservados</span>
        <span> · {APP_TELEFONO}</span>
        <span> · {APP_EMAIL}</span>
        <span> · © {anio}</span>
        <span> · v{APP_VERSION}</span>
      </div>
    </footer>
  );
}
