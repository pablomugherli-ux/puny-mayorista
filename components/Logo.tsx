export default function Logo({
  variant = "on-light", size = "md",
  nombre = "PUNY", subtitulo = "2026 INTEGRAL",
  logoUrl = null, colorFondo, colorTexto,
}: {
  variant?: "on-light" | "on-dark"; size?: "sm" | "md" | "lg";
  nombre?: string; subtitulo?: string;
  logoUrl?: string | null; colorFondo?: string; colorTexto?: string;
}) {
  const onDark = variant === "on-dark";
  const dims = size === "lg" ? 44 : size === "sm" ? 28 : 34;
  const nombreSize = size === "lg" ? 24 : size === "sm" ? 15 : 19;
  const subSize = size === "lg" ? 11 : 9;

  const fondo = colorFondo || (onDark ? "#D4AF37" : "#7A5C0A");
  const texto = colorTexto || (onDark ? "#7A5C0A" : "#D4AF37");
  const inicial = (nombre || "P").trim().charAt(0).toUpperCase() || "P";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={nombre} style={{ width: dims, height: dims, borderRadius: dims * 0.28, objectFit: "cover", flexShrink: 0 }} />
      ) : (
        <div
          style={{
            width: dims, height: dims, borderRadius: dims * 0.28, flexShrink: 0,
            background: fondo, display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <span style={{ color: texto, fontWeight: 700, fontSize: dims * 0.5, fontFamily: "Georgia, serif" }}>{inicial}</span>
        </div>
      )}
      <div style={{ lineHeight: 1.1, minWidth: 0 }}>
        <div style={{ fontSize: nombreSize, fontWeight: 700, letterSpacing: 0.2, color: onDark ? "#fff" : "#7A5C0A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nombre}</div>
        <div style={{ fontSize: subSize, letterSpacing: 2, color: onDark ? "#E3C878" : "#9C7F1F" }}>{subtitulo}</div>
      </div>
    </div>
  );
}
