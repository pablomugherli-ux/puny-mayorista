"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/useAuth";

export default function Home() {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(session ? "/dashboard" : "/login");
  }, [loading, session, router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-gray-500">
      Cargando PUNY 2026 INTEGRAL…
    </div>
  );
}
