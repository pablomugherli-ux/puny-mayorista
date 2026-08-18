-- ============================================================================
-- Migracion 20 -- Datos de la empresa y marca propia por tenant (white-label).
-- ESTADO: BORRADOR NO APLICADO. Bloqueado por reconexion de cuenta Supabase.
-- ============================================================================

alter table tenants add column if not exists razon_social text;
alter table tenants add column if not exists cuit text;
alter table tenants add column if not exists direccion text;
alter table tenants add column if not exists telefono text;
alter table tenants add column if not exists email_contacto text;
alter table tenants add column if not exists sitio_web text;
alter table tenants add column if not exists eslogan text not null default 'MAYORISTA';
alter table tenants add column if not exists logo_url text;
alter table tenants add column if not exists logo_color_fondo text not null default '#6B1029';
alter table tenants add column if not exists logo_color_texto text not null default '#D4AF37';

-- Verificado contra pg_policies real: "tenants_select" (mi_alcance(id)) ya
-- existe, no hace falta agregarla. Pero "tenants_write" (ALL) exige
-- es_master() -- el dueño NO puede hoy editar su propio tenant. Se agrega
-- la policy de update que falta para que el dueño pueda guardar su marca.
drop policy if exists tenants_update_dueno on tenants;
create policy tenants_update_dueno on tenants for update
  using ((mi_rol() = 'dueno' and id = mi_tenant()) or es_master())
  with check ((mi_rol() = 'dueno' and id = mi_tenant()) or es_master());

-- ---------------------------------------------------------------------------
-- Storage: bucket publico para logos (analogo al bucket 'pod' ya existente).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

drop policy if exists branding_lectura_publica on storage.objects;
create policy branding_lectura_publica on storage.objects for select
  using (bucket_id = 'branding');

drop policy if exists branding_escritura_dueno on storage.objects;
create policy branding_escritura_dueno on storage.objects for insert
  with check (
    bucket_id = 'branding'
    and (mi_rol() = 'dueno' or es_master())
    and (storage.foldername(name))[1] = mi_tenant()::text
  );

drop policy if exists branding_actualiza_dueno on storage.objects;
create policy branding_actualiza_dueno on storage.objects for update
  using (bucket_id = 'branding' and (mi_rol() = 'dueno' or es_master()))
  with check (bucket_id = 'branding' and (mi_rol() = 'dueno' or es_master()));
