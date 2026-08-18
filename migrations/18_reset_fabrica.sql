-- ============================================================================
-- Migracion 18 -- Reset de fabrica (borrado controlado de datos
-- transaccionales/de prueba, preservando catalogo, clientes, usuarios y
-- configuracion comercial).
-- ESTADO: BORRADOR NO APLICADO. Bloqueado por reconexion de cuenta Supabase.
-- Requiere que la migracion 17 (auditoria_eventos) ya este aplicada.
-- ============================================================================

create or replace function fn_reset_fabrica(
  p_confirmacion text,
  p_tenant_id uuid default null,
  p_incluir_clientes boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant uuid;
  v_resumen jsonb := '{}'::jsonb;
  v_n int;
begin
  if p_confirmacion is distinct from 'RESET-FABRICA-CONFIRMADO' then
    raise exception 'Confirmacion invalida. Se requiere el texto exacto RESET-FABRICA-CONFIRMADO.';
  end if;

  if es_master() then
    if p_tenant_id is null then
      raise exception 'Como usuario maestro, debe indicar explicitamente el tenant a resetear (p_tenant_id). No hay valor por defecto para evitar un reset accidental de toda la plataforma.';
    end if;
    v_tenant := p_tenant_id;
  elsif mi_rol() = 'dueno' then
    v_tenant := mi_tenant();
  else
    raise exception 'Solo el Dueno de la distribuidora o el Usuario Maestro pueden ejecutar el reset de fabrica.';
  end if;

  -- Orden respetando FKs: hijos antes que padres.
  delete from entrega_item_rechazos where tenant_id = v_tenant; get diagnostics v_n = row_count; v_resumen := v_resumen || jsonb_build_object('entrega_item_rechazos', v_n);
  delete from entregas where tenant_id = v_tenant; get diagnostics v_n = row_count; v_resumen := v_resumen || jsonb_build_object('entregas', v_n);
  delete from hoja_ruta_paradas where tenant_id = v_tenant; get diagnostics v_n = row_count; v_resumen := v_resumen || jsonb_build_object('hoja_ruta_paradas', v_n);
  delete from hojas_ruta where tenant_id = v_tenant; get diagnostics v_n = row_count; v_resumen := v_resumen || jsonb_build_object('hojas_ruta', v_n);
  delete from cuenta_corriente_movimientos where tenant_id = v_tenant; get diagnostics v_n = row_count; v_resumen := v_resumen || jsonb_build_object('cuenta_corriente_movimientos', v_n);
  delete from cobros where tenant_id = v_tenant; get diagnostics v_n = row_count; v_resumen := v_resumen || jsonb_build_object('cobros', v_n);
  delete from comprobantes where tenant_id = v_tenant; get diagnostics v_n = row_count; v_resumen := v_resumen || jsonb_build_object('comprobantes', v_n);
  delete from pedido_items where pedido_id in (select id from pedidos where tenant_id = v_tenant); get diagnostics v_n = row_count; v_resumen := v_resumen || jsonb_build_object('pedido_items', v_n);
  delete from pedidos where tenant_id = v_tenant; get diagnostics v_n = row_count; v_resumen := v_resumen || jsonb_build_object('pedidos', v_n);
  delete from visitas where tenant_id = v_tenant; get diagnostics v_n = row_count; v_resumen := v_resumen || jsonb_build_object('visitas', v_n);
  delete from posiciones_gps where tenant_id = v_tenant; get diagnostics v_n = row_count; v_resumen := v_resumen || jsonb_build_object('posiciones_gps', v_n);
  delete from jornadas where tenant_id = v_tenant; get diagnostics v_n = row_count; v_resumen := v_resumen || jsonb_build_object('jornadas', v_n);
  delete from rendiciones where tenant_id = v_tenant; get diagnostics v_n = row_count; v_resumen := v_resumen || jsonb_build_object('rendiciones', v_n);
  delete from notificaciones where tenant_id = v_tenant; get diagnostics v_n = row_count; v_resumen := v_resumen || jsonb_build_object('notificaciones', v_n);

  -- Tablas que se agregan en migraciones posteriores (agente de WhatsApp):
  -- se borran solo si ya existen, para no acoplar el orden de migraciones.
  if to_regclass('public.whatsapp_mensajes') is not null then
    execute 'delete from whatsapp_mensajes where tenant_id = $1' using v_tenant;
    get diagnostics v_n = row_count; v_resumen := v_resumen || jsonb_build_object('whatsapp_mensajes', v_n);
  end if;
  if to_regclass('public.whatsapp_conversaciones') is not null then
    execute 'delete from whatsapp_conversaciones where tenant_id = $1' using v_tenant;
    get diagnostics v_n = row_count; v_resumen := v_resumen || jsonb_build_object('whatsapp_conversaciones', v_n);
  end if;

  if p_incluir_clientes then
    delete from clientes where tenant_id = v_tenant; get diagnostics v_n = row_count; v_resumen := v_resumen || jsonb_build_object('clientes', v_n);
  end if;

  delete from auditoria_eventos where tenant_id = v_tenant;

  insert into auditoria_eventos (tenant_id, profile_id, tabla, registro_id, accion, detalle)
  values (v_tenant, auth.uid(), 'RESET_FABRICA', v_tenant, 'RESET', v_resumen);

  return v_resumen;
end;
$$;

-- No se otorga EXECUTE amplio: cualquier usuario autenticado puede invocar la
-- funcion via RPC, pero la funcion misma verifica el rol adentro y rechaza a
-- quien no sea dueno/master. Esto es intencional (mismo patron que el resto
-- de las funciones SECURITY DEFINER de este proyecto).

-- ============================================================================
-- NO TOCA: tenants, profiles (usuarios), zonas, circuitos, productos,
-- listas_precio, descuentos_volumen, motivos_rechazo, ofertas,
-- esquemas_comision, objetivos_comerciales, cobrador_vinculos, y clientes
-- (salvo que se pase p_incluir_clientes := true).
-- El stock de productos tampoco se toca automaticamente: si quedo alterado
-- por pedidos de prueba, se debe recargar manualmente desde Catalogo antes
-- de empezar a operar en serio.
-- ============================================================================
