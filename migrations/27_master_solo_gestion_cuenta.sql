-- ============================================================================
-- Migración 27: Master pasa a ser un rol de GESTIÓN DE CUENTA, no de negocio.
--
-- Motivo (pedido explícito de Pablo): el Usuario Maestro (el proveedor de la
-- plataforma) solo debe poder: crear distribuidoras, entregar/resetear las
-- credenciales del Dueño, y pausar/suspender/reactivar/extender el acceso
-- por falta de pago o baja del servicio. NO debe poder ver pedidos, clientes,
-- cobros, comprobantes, ni ningún otro dato operativo de la distribuidora, ni
-- la lista de sus demás usuarios.
--
-- Hallazgo al auditar: master tenía acceso de lectura/escritura cruzado
-- (a través de "OR es_master()" o incluyéndolo en el array de roles
-- permitidos) en prácticamente todas las tablas de negocio. Además, varias
-- políticas "ALL" tenían un WITH CHECK más laxo que su USING (ya se había
-- encontrado y corregido un caso de esto en cobros_write, migración 24) —
-- esta migración corrige TODOS los casos restantes de ese mismo patrón que
-- aparecieron al tocar estas políticas, no solo los de master.
--
-- Qué se mantiene intacto para master (es su alcance legítimo):
--   - tenants_write / tenants_update_dueno (tabla tenants: nombre, slug,
--     branding, y ahora estado/vencimiento — no contiene datos de negocio).
--   - mi_alcance(), mi_rol(), mi_tenant(), mi_perfil(), es_master() sin
--     cambios en su definición (siguen siendo la base de todo el esquema).
--
-- El corte de acceso real (suspender/pausar) NO se hace vía RLS sino
-- baneando a los usuarios del tenant en Supabase Auth (ver Edge Function
-- master-cuentas) — más simple, más fuerte (bloquea login/refresh de raíz)
-- y no requiere tocar el resto del esquema.
-- ============================================================================

-- 1) Estado de cuenta y vigencia por distribuidora ---------------------------
alter table tenants add column if not exists estado text not null default 'activo'
  check (estado in ('activo','pausado','suspendido'));
alter table tenants add column if not exists motivo_estado text;
alter table tenants add column if not exists estado_actualizado_en timestamptz not null default now();
alter table tenants add column if not exists plan_vencimiento date;

-- 2) puedo_ver_lista / puedo_operar_lista: quitar el auto-true de master -----
create or replace function public.puedo_ver_lista(p_lista smallint)
returns boolean
language sql stable security definer set search_path = 'public'
as $$
  select case
    when (select role from profiles where id = auth.uid()) = 'dueno' then true
    when p_lista = 1 then coalesce((select ver_lista_1 from profiles where id = auth.uid()), false)
    when p_lista = 2 then coalesce((select ver_lista_2 from profiles where id = auth.uid()), false)
    else false
  end;
$$;

create or replace function public.puedo_operar_lista(p_lista smallint)
returns boolean
language sql stable security definer set search_path = 'public'
as $$
  select case
    when (select role from profiles where id = auth.uid()) = 'dueno' then true
    when p_lista = 1 then coalesce((select operar_lista_1 from profiles where id = auth.uid()), false)
    when p_lista = 2 then coalesce((select operar_lista_2 from profiles where id = auth.uid()), false)
    else false
  end;
$$;

-- 3) Retirar a master de las políticas de negocio -----------------------------

-- auditoria_eventos
drop policy if exists auditoria_select on auditoria_eventos;
create policy auditoria_select on auditoria_eventos for select
  using (mi_alcance(tenant_id) and mi_rol() = 'dueno');

-- circuitos
drop policy if exists circuitos_write on circuitos;
create policy circuitos_write on circuitos for all
  using (mi_alcance(tenant_id) and mi_rol() = 'dueno')
  with check (mi_alcance(tenant_id) and mi_rol() = 'dueno');

-- clientes
drop policy if exists clientes_select on clientes;
create policy clientes_select on clientes for select
  using (
    mi_alcance(tenant_id) and (
      mi_rol() = any (array['dueno'::user_role, 'entrega'::user_role])
      or (mi_rol() = 'vendedor' and vendedor_id = auth.uid())
      or (mi_rol() = 'cobrador' and id in (select clientes_de_mi_pool_cobrador()))
      or (mi_rol() = 'cliente_b2b' and id = (select cliente_id from profiles where id = auth.uid()))
    )
  );
drop policy if exists clientes_write on clientes;
create policy clientes_write on clientes for all
  using (mi_alcance(tenant_id) and mi_rol() = 'dueno')
  with check (mi_alcance(tenant_id) and mi_rol() = 'dueno');

-- cobrador_vinculos
drop policy if exists vinculos_select on cobrador_vinculos;
create policy vinculos_select on cobrador_vinculos for select
  using (
    mi_alcance(tenant_id) and (
      mi_rol() = 'dueno' or cobrador_id = auth.uid() or vinculado_a_id = auth.uid()
    )
  );
drop policy if exists vinculos_write on cobrador_vinculos;
create policy vinculos_write on cobrador_vinculos for all
  using (mi_alcance(tenant_id) and mi_rol() = 'dueno')
  with check (mi_alcance(tenant_id) and mi_rol() = 'dueno');

-- cobros
drop policy if exists cobros_select on cobros;
create policy cobros_select on cobros for select
  using (
    mi_alcance(tenant_id) and puedo_ver_lista(lista) and (
      mi_rol() = 'dueno'
      or cobrador_id = auth.uid()
      or cliente_id = (select cliente_id from profiles where id = auth.uid())
    )
  );
drop policy if exists cobros_write on cobros;
create policy cobros_write on cobros for all
  using (
    mi_alcance(tenant_id) and puedo_operar_lista(lista) and (
      mi_rol() = any (array['dueno'::user_role, 'cobrador'::user_role])
      or (mi_rol() = 'entrega' and es_cliente_propio(cliente_id))
      or (mi_rol() = 'vendedor' and puede_cobrar_yo() and es_cliente_propio(cliente_id))
    )
  )
  with check (
    mi_alcance(tenant_id) and puedo_operar_lista(lista) and (
      mi_rol() = any (array['dueno'::user_role, 'cobrador'::user_role])
      or (mi_rol() = 'entrega' and es_cliente_propio(cliente_id))
      or (mi_rol() = 'vendedor' and puede_cobrar_yo() and es_cliente_propio(cliente_id))
    )
  );
drop policy if exists restrict_delete_cobros on cobros;
create policy restrict_delete_cobros on cobros for delete using (mi_rol() = 'dueno');
drop policy if exists restrict_update_cobros on cobros;
create policy restrict_update_cobros on cobros for update using (mi_rol() = 'dueno');

-- comprobantes
drop policy if exists comprobantes_select on comprobantes;
create policy comprobantes_select on comprobantes for select
  using (
    mi_alcance(tenant_id) and puedo_ver_lista(lista) and (
      mi_rol() = any (array['dueno'::user_role, 'entrega'::user_role, 'vendedor'::user_role])
      or (mi_rol() = 'cobrador' and cliente_id in (select clientes_de_mi_pool_cobrador()))
      or (mi_rol() = 'cliente_b2b' and cliente_id = (select cliente_id from profiles where id = auth.uid()))
    )
  );
drop policy if exists comprobantes_write on comprobantes;
create policy comprobantes_write on comprobantes for all
  using (mi_alcance(tenant_id) and mi_rol() = 'dueno' and puedo_operar_lista(lista))
  with check (mi_alcance(tenant_id) and mi_rol() = 'dueno' and puedo_operar_lista(lista));
drop policy if exists restrict_delete_comprobantes on comprobantes;
create policy restrict_delete_comprobantes on comprobantes for delete using (mi_rol() = 'dueno');
drop policy if exists restrict_update_comprobantes on comprobantes;
create policy restrict_update_comprobantes on comprobantes for update using (mi_rol() = 'dueno');

-- cuenta_corriente_movimientos
drop policy if exists ccm_select on cuenta_corriente_movimientos;
create policy ccm_select on cuenta_corriente_movimientos for select
  using (
    mi_alcance(tenant_id) and puedo_ver_lista(lista) and (
      mi_rol() = any (array['dueno'::user_role, 'vendedor'::user_role])
      or (mi_rol() = 'cobrador' and cliente_id in (select clientes_de_mi_pool_cobrador()))
      or (mi_rol() = 'cliente_b2b' and cliente_id = (select cliente_id from profiles where id = auth.uid()))
    )
  );
drop policy if exists restrict_delete_cuenta_corriente_movimientos on cuenta_corriente_movimientos;
create policy restrict_delete_cuenta_corriente_movimientos on cuenta_corriente_movimientos for delete using (mi_rol() = 'dueno');
drop policy if exists restrict_update_cuenta_corriente_movimientos on cuenta_corriente_movimientos;
create policy restrict_update_cuenta_corriente_movimientos on cuenta_corriente_movimientos for update using (mi_rol() = 'dueno');

-- descuentos_volumen
drop policy if exists descuentos_write on descuentos_volumen;
create policy descuentos_write on descuentos_volumen for all
  using (mi_alcance(tenant_id) and mi_rol() = 'dueno')
  with check (mi_alcance(tenant_id) and mi_rol() = 'dueno');

-- entrega_item_rechazos
drop policy if exists restrict_delete_entrega_item_rechazos on entrega_item_rechazos;
create policy restrict_delete_entrega_item_rechazos on entrega_item_rechazos for delete using (mi_rol() = 'dueno');
drop policy if exists restrict_update_entrega_item_rechazos on entrega_item_rechazos;
create policy restrict_update_entrega_item_rechazos on entrega_item_rechazos for update using (mi_rol() = 'dueno');

-- entregas
drop policy if exists entregas_select on entregas;
create policy entregas_select on entregas for select
  using (
    mi_alcance(tenant_id) and (
      mi_rol() = 'dueno'
      or repartidor_id = auth.uid()
      or exists (
        select 1 from pedidos p
        where p.id = entregas.pedido_id
          and p.cliente_id = (select cliente_id from profiles where id = auth.uid())
      )
    )
  );
drop policy if exists entregas_write on entregas;
create policy entregas_write on entregas for all
  using (mi_alcance(tenant_id) and (mi_rol() = 'dueno' or repartidor_id = auth.uid()))
  with check (mi_alcance(tenant_id) and (mi_rol() = 'dueno' or repartidor_id = auth.uid()));
drop policy if exists restrict_delete_entregas on entregas;
create policy restrict_delete_entregas on entregas for delete using (mi_rol() = 'dueno');
drop policy if exists restrict_update_entregas on entregas;
create policy restrict_update_entregas on entregas for update using (mi_rol() = 'dueno');

-- esquemas_comision
drop policy if exists esquemas_comision_select on esquemas_comision;
create policy esquemas_comision_select on esquemas_comision for select
  using (mi_alcance(tenant_id) and (profile_id is null or profile_id = auth.uid() or mi_rol() = 'dueno'));
drop policy if exists esquemas_comision_write on esquemas_comision;
create policy esquemas_comision_write on esquemas_comision for all
  using (mi_rol() = 'dueno' and tenant_id = mi_tenant())
  with check (mi_rol() = 'dueno' and tenant_id = mi_tenant());

-- hoja_ruta_paradas
drop policy if exists hrp_select on hoja_ruta_paradas;
create policy hrp_select on hoja_ruta_paradas for select
  using (exists (
    select 1 from hojas_ruta h
    where h.id = hoja_ruta_paradas.hoja_ruta_id
      and mi_alcance(h.tenant_id)
      and (mi_rol() = 'dueno' or h.responsable_id = auth.uid())
  ));
drop policy if exists hrp_write on hoja_ruta_paradas;
create policy hrp_write on hoja_ruta_paradas for all
  using (exists (
    select 1 from hojas_ruta h
    where h.id = hoja_ruta_paradas.hoja_ruta_id
      and mi_alcance(h.tenant_id)
      and (mi_rol() = 'dueno' or h.responsable_id = auth.uid())
  ));

-- hojas_ruta
drop policy if exists hojas_ruta_select on hojas_ruta;
create policy hojas_ruta_select on hojas_ruta for select
  using (mi_alcance(tenant_id) and (mi_rol() = 'dueno' or responsable_id = auth.uid()));
drop policy if exists hojas_ruta_write on hojas_ruta;
create policy hojas_ruta_write on hojas_ruta for all
  using (mi_alcance(tenant_id) and (mi_rol() = 'dueno' or responsable_id = auth.uid()))
  with check (mi_alcance(tenant_id) and (mi_rol() = 'dueno' or responsable_id = auth.uid()));

-- jornadas
drop policy if exists jornadas_select on jornadas;
create policy jornadas_select on jornadas for select
  using (mi_alcance(tenant_id) and (mi_rol() = 'dueno' or usuario_id = auth.uid()));
drop policy if exists jornadas_write on jornadas;
create policy jornadas_write on jornadas for all
  using (mi_alcance(tenant_id) and (mi_rol() = 'dueno' or usuario_id = auth.uid()))
  with check (mi_alcance(tenant_id) and (mi_rol() = 'dueno' or usuario_id = auth.uid()));

-- listas_precio
drop policy if exists listas_precio_write on listas_precio;
create policy listas_precio_write on listas_precio for all
  using (mi_alcance(tenant_id) and mi_rol() = 'dueno')
  with check (mi_alcance(tenant_id) and mi_rol() = 'dueno');

-- motivos_rechazo
drop policy if exists motivos_write on motivos_rechazo;
create policy motivos_write on motivos_rechazo for all
  using (mi_alcance(tenant_id) and mi_rol() = 'dueno')
  with check (mi_alcance(tenant_id) and mi_rol() = 'dueno');

-- notificaciones
drop policy if exists notif_select on notificaciones;
create policy notif_select on notificaciones for select
  using (
    mi_alcance(tenant_id) and (
      mi_rol() = 'dueno' or cliente_id = (select cliente_id from profiles where id = auth.uid())
    )
  );

-- objetivos_comerciales
drop policy if exists objetivos_select on objetivos_comerciales;
create policy objetivos_select on objetivos_comerciales for select
  using (mi_alcance(tenant_id) and (profile_id = auth.uid() or mi_rol() = 'dueno'));
drop policy if exists objetivos_write on objetivos_comerciales;
create policy objetivos_write on objetivos_comerciales for all
  using (mi_rol() = 'dueno' and tenant_id = mi_tenant())
  with check (mi_rol() = 'dueno' and tenant_id = mi_tenant());

-- ofertas
drop policy if exists ofertas_write on ofertas;
create policy ofertas_write on ofertas for all
  using (mi_alcance(tenant_id) and mi_rol() = 'dueno')
  with check (mi_alcance(tenant_id) and mi_rol() = 'dueno');

-- pedido_items
drop policy if exists restrict_delete_pedido_items on pedido_items;
create policy restrict_delete_pedido_items on pedido_items for delete using (mi_rol() = 'dueno');
drop policy if exists restrict_update_pedido_items on pedido_items;
create policy restrict_update_pedido_items on pedido_items for update using (mi_rol() = 'dueno');

-- pedidos
drop policy if exists pedidos_select on pedidos;
create policy pedidos_select on pedidos for select
  using (
    mi_alcance(tenant_id) and puedo_ver_lista(lista) and (
      mi_rol() = any (array['dueno'::user_role, 'entrega'::user_role])
      or (mi_rol() = 'vendedor' and vendedor_id = auth.uid())
      or (mi_rol() = 'cobrador' and cliente_id in (select clientes_de_mi_pool_cobrador()))
      or (mi_rol() = 'cliente_b2b' and cliente_id = (select cliente_id from profiles where id = auth.uid()))
    )
  );
drop policy if exists pedidos_update on pedidos;
create policy pedidos_update on pedidos for update
  using (mi_alcance(tenant_id) and (mi_rol() = 'dueno' or vendedor_id = auth.uid()));
drop policy if exists restrict_delete_pedidos on pedidos;
create policy restrict_delete_pedidos on pedidos for delete using (mi_rol() = 'dueno');
drop policy if exists restrict_update_pedidos on pedidos;
create policy restrict_update_pedidos on pedidos for update using (mi_rol() = 'dueno');

-- posiciones_gps
drop policy if exists posiciones_select on posiciones_gps;
create policy posiciones_select on posiciones_gps for select
  using (mi_alcance(tenant_id) and (mi_rol() = 'dueno' or usuario_id = auth.uid()));

-- productos
drop policy if exists productos_write on productos;
create policy productos_write on productos for all
  using (mi_alcance(tenant_id) and mi_rol() = 'dueno')
  with check (mi_alcance(tenant_id) and mi_rol() = 'dueno');

-- profiles: master deja de poder leer/crear/editar/borrar perfiles de otros
-- usuarios directamente — la creación/edición del Dueño de una distribuidora
-- pasa exclusivamente por la Edge Function master-cuentas (service_role).
drop policy if exists profiles_delete on profiles;
create policy profiles_delete on profiles for delete
  using (mi_rol() = 'dueno' and tenant_id = mi_tenant());
drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles for insert
  with check ((mi_rol() = 'dueno' and tenant_id = mi_tenant()) or id = auth.uid());
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update
  using (id = auth.uid() or (mi_rol() = 'dueno' and tenant_id = mi_tenant()));
drop policy if exists restrict_update_profiles_self on profiles;
create policy restrict_update_profiles_self on profiles for update
  using (true)
  with check (
    mi_rol() = 'dueno'
    or (
      id = auth.uid()
      and role = (select role from profiles p2 where p2.id = auth.uid())
      and tenant_id is not distinct from (select tenant_id from profiles p2 where p2.id = auth.uid())
      and cliente_id is not distinct from (select cliente_id from profiles p2 where p2.id = auth.uid())
      and puede_cobrar = (select puede_cobrar from profiles p2 where p2.id = auth.uid())
    )
  );

-- rendiciones
drop policy if exists rendiciones_select on rendiciones;
create policy rendiciones_select on rendiciones for select
  using (mi_alcance(tenant_id) and (mi_rol() = 'dueno' or cobrador_id = auth.uid()));
drop policy if exists rendiciones_write on rendiciones;
create policy rendiciones_write on rendiciones for all
  using (mi_alcance(tenant_id) and (mi_rol() = 'dueno' or cobrador_id = auth.uid()))
  with check (mi_alcance(tenant_id) and (mi_rol() = 'dueno' or cobrador_id = auth.uid()));

-- visitas
drop policy if exists visitas_select on visitas;
create policy visitas_select on visitas for select
  using (mi_alcance(tenant_id) and (mi_rol() = 'dueno' or usuario_id = auth.uid()));
drop policy if exists visitas_write on visitas;
create policy visitas_write on visitas for all
  using (mi_alcance(tenant_id) and (mi_rol() = 'dueno' or usuario_id = auth.uid()))
  with check (mi_alcance(tenant_id) and (mi_rol() = 'dueno' or usuario_id = auth.uid()));

-- whatsapp_config / whatsapp_conversaciones / whatsapp_mensajes
drop policy if exists whatsapp_config_write on whatsapp_config;
create policy whatsapp_config_write on whatsapp_config for all
  using (mi_alcance(tenant_id) and mi_rol() = 'dueno')
  with check (mi_alcance(tenant_id) and mi_rol() = 'dueno');
drop policy if exists whatsapp_conversaciones_write on whatsapp_conversaciones;
create policy whatsapp_conversaciones_write on whatsapp_conversaciones for all
  using (mi_alcance(tenant_id) and mi_rol() = 'dueno')
  with check (mi_alcance(tenant_id) and mi_rol() = 'dueno');
drop policy if exists whatsapp_mensajes_write on whatsapp_mensajes;
create policy whatsapp_mensajes_write on whatsapp_mensajes for all
  using (mi_alcance(tenant_id) and mi_rol() = 'dueno')
  with check (mi_alcance(tenant_id) and mi_rol() = 'dueno');

-- zonas
drop policy if exists zonas_write on zonas;
create policy zonas_write on zonas for all
  using (mi_alcance(tenant_id) and mi_rol() = 'dueno')
  with check (mi_alcance(tenant_id) and mi_rol() = 'dueno');

-- Nota: tenants_write y tenants_update_dueno (tabla tenants) NO se tocan:
-- siguen permitiendo a master gestionar nombre/slug/branding/estado/vencimiento
-- de cualquier distribuidora — es exactamente su alcance nuevo y legítimo.
