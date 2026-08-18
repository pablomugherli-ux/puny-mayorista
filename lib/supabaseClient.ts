"use client";
import { createClient } from "@supabase/supabase-js";

// Se leen de variables de entorno si están definidas (ver .env.example) —
// con fallback al proyecto Supabase actual, para que nada se rompa en los
// entornos donde todavía no se configuraron variables de entorno explícitas.
// La anon key es segura para exponer en el cliente por diseño de Supabase:
// el control de acceso real lo hace Row Level Security en la base, no el
// secreto de esta clave.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://jeysrizigjgclqvlkfxd.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpleXNyaXppZ2pnY2xxdmxrZnhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1NzgyMTIsImV4cCI6MjEwMjE1NDIxMn0.O3W298FVrSuXVxFOz_CI0ogRMXqMNBqEP7FMDUGGklc";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
