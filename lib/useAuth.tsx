"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import type { Profile, Tenant } from "./types";

type AuthCtx = {
  session: Session | null;
  profile: Profile | null;
  tenant: Tenant | null;
  permisos: Set<string>;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshTenant: () => Promise<void>;
  refreshPermisos: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  session: null,
  profile: null,
  tenant: null,
  permisos: new Set(),
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
  refreshTenant: async () => {},
  refreshPermisos: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  // RBAC dinámico — Fase 4: set de claves de catalogo_permisos activas para
  // el usuario actual (mis_permisos_activos(), RBAC Fase 4). Sidebar.tsx lo
  // usa para filtrar qué enlaces mostrar en vez de derivarlo de role/permiso_*
  // a mano. Vacío mientras no haya sesión o el usuario no tenga permisos
  // dinámicos (ej. Usuario Maestro, fuera de este sistema).
  const [permisos, setPermisos] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  async function loadTenant(tenantId: string | null) {
    if (!tenantId) {
      setTenant(null);
      return;
    }
    const { data } = await supabase.from("tenants").select("*").eq("id", tenantId).maybeSingle();
    setTenant((data as Tenant) || null);
  }

  async function loadPermisos(role: string | undefined) {
    if (role === "master") { setPermisos(new Set()); return; }
    const { data, error } = await supabase.rpc("mis_permisos_activos");
    setPermisos(!error && data ? new Set((data as any[]).map((r: any) => r.clave)) : new Set());
  }

  async function loadProfile(userId: string) {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    setProfile((data as Profile) || null);
    // Bug detectado en vivo probando distintos roles seguidos en la misma
    // pestaña: si el nuevo perfil no tiene tenant_id (p.ej. Usuario Maestro,
    // que no pertenece a ninguna distribuidora), esto antes NO se llamaba,
    // así que el tenant/branding de la sesión anterior quedaba pegado en
    // pantalla (nombre y logo de la distribuidora previa) hasta un refresh
    // manual. Ahora siempre se llama, con null si corresponde, para que el
    // tenant se limpie igual que el resto del estado de sesión.
    await loadTenant(data?.tenant_id || null);
    await loadPermisos(data?.role);
  }

  async function refreshProfile() {
    if (session?.user?.id) await loadProfile(session.user.id);
  }

  async function refreshPermisos() {
    await loadPermisos(profile?.role);
  }

  async function refreshTenant() {
    if (profile?.tenant_id) await loadTenant(profile.tenant_id);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user?.id) {
        loadProfile(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user?.id) {
        loadProfile(newSession.user.id);
      } else {
        setProfile(null);
        setTenant(null);
        setPermisos(new Set());
      }
    });

    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setTenant(null);
    setPermisos(new Set());
    setSession(null);
  }

  return (
    <Ctx.Provider value={{ session, profile, tenant, permisos, loading, signOut, refreshProfile, refreshTenant, refreshPermisos }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  return useContext(Ctx);
}
