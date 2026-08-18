import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/useAuth";
import FooterCreditos from "@/components/FooterCreditos";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import ConexionBanner from "@/components/ConexionBanner";

export const metadata: Metadata = {
  title: "PUNY 2026 INTEGRAL",
  description: "PUNY 2026 INTEGRAL — ecosistema unificado: Mayorista, Masivo, Cuentas Clave, WP y Seguridad. Instalable, funciona sin conexión.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#7A5C0A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <AuthProvider>
          <ConexionBanner />
          {children}
        </AuthProvider>
        <FooterCreditos />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
