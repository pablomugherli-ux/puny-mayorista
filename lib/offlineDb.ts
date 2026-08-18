// Base local (IndexedDB vía Dexie) para trabajar sin conexión.
// ----------------------------------------------------------------------------
// Dos usos distintos, no confundir:
//  1) "outbox" — cola de operaciones (insert/update) hechas SIN conexión,
//     pendientes de subir a Supabase. Cada una guarda su propio timestamp
//     real (el momento en que el usuario la hizo), no el de cuando se suba.
//  2) "cache_*" — copia local de catálogos de solo lectura que hacen falta
//     para poder trabajar sin conexión (productos, clientes, listas de
//     precio). Se refresca sola cada vez que hay internet; si no hay
//     conexión, se lee de acá en vez de fallar.
// ----------------------------------------------------------------------------
import Dexie, { type Table } from "dexie";

export type OperacionPendiente = {
  id: string; // uuid generado en el cliente — es el mismo id que se manda a Supabase (permite reintentar sin duplicar)
  tabla: string; // tabla de Supabase destino
  tipo: "insert" | "update" | "rpc";
  payload: any; // fila a insertar/actualizar, o { fn, args } si tipo === "rpc"
  filtro?: any; // para "update": { columna: valor } del where
  creadoEn: string; // ISO — momento real en que el usuario hizo la acción (offline)
  intentos: number;
  ultimoError?: string;
  tenantId: string | null;
  descripcion: string; // texto corto para mostrar en la UI ("Pedido a Almacén Don José")
};

export type CacheEntry = {
  clave: string; // ej: "productos", "clientes:<tenantId>"
  datos: any;
  actualizadoEn: string;
};

class OfflineDatabase extends Dexie {
  outbox!: Table<OperacionPendiente, string>;
  cache!: Table<CacheEntry, string>;

  constructor() {
    super("puny_offline");
    this.version(1).stores({
      outbox: "id, tabla, creadoEn",
      cache: "clave",
    });
  }
}

// En SSR/build (Next static export) no existe IndexedDB — instanciar solo en el browser.
export const offlineDb: OfflineDatabase | null = typeof window !== "undefined" ? new OfflineDatabase() : null;
