-- ============================================================================
-- Smoke tests de RLS/permisos — PUNY 2026 INTEGRAL
-- ----------------------------------------------------------------------------
-- Regresión mínima para el sistema de permisos dinámicos (tengo_permiso) y
-- algunas funciones críticas. Correrlo entero (en el SQL editor de Supabase,
-- o vía el MCP execute_sql) contra el proyecto: si algo falla, tira
-- EXCEPTION con un mensaje claro y CORTA ahí. Si termina sin errores, los 6
-- tests pasaron (los RAISE NOTICE de "OK" quedan en el log de Postgres, no
-- siempre visibles según el cliente SQL que uses — lo que importa es que NO
-- tire ningún error).
--
-- Requiere los usuarios demo sembrados (dueño a0000000-...-01, vendedor
-- a0000000-...-03). Ajustar los UUID de abajo si tu entorno demo cambia.
--
-- IMPORTANTE sobre la simulación de rol: usa "set local role authenticated"
-- + "set local request.jwt.claims" como sentencias SQL de nivel superior
-- (no como llamadas a set_config() dentro de un DO) — es la única forma en
-- que Postgres realmente cambia el rol activo y hace que RLS se aplique de
-- verdad. El MCP/cliente que corre este script suele conectarse con un rol
-- con privilegios elevados que se saltea RLS por completo si no se hace
-- este cambio de rol explícito.
--
-- No modifica datos: todo corre en una transacción que termina en ROLLBACK.
-- ============================================================================

begin;

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- Test 1: tengo_permiso() hace bypass total para dueño, sin importar la clave.
do $$
declare
  v_resultado boolean;
begin
  select tengo_permiso('clave-que-no-existe-en-ningun-lado') into v_resultado;
  if v_resultado is not true then
    raise exception 'TEST 1 FALLÓ: tengo_permiso() debería devolver true para dueño con cualquier clave, devolvió %', v_resultado;
  end if;
  raise notice 'TEST 1 OK: bypass de dueño en tengo_permiso()';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}';

-- Test 2: un vendedor sin la clave otorgada NO tiene acceso a un módulo delegable.
do $$
declare
  v_resultado boolean;
begin
  select tengo_permiso('finanzas.acceso') into v_resultado;
  if v_resultado is not false then
    raise exception 'TEST 2 FALLÓ: vendedor sin permiso otorgado no debería tener finanzas.acceso, devolvió %', v_resultado;
  end if;
  raise notice 'TEST 2 OK: vendedor sin permiso otorgado queda bloqueado';
end $$;

-- Test 3: el RPC de importación de listas de precios rechaza a quien no
-- tiene stock.acceso (regresión del bug de seguridad que NO queremos
-- reintroducir — sigue como vendedor de Test 2, que no tiene ese permiso).
do $$
begin
  begin
    perform fn_importar_producto_lista_precio('SKU-TEST-NO-EXISTE', 'x', null, null, null, 1, 1, 1, 1, null);
    raise exception 'TEST 3 FALLÓ: fn_importar_producto_lista_precio no debería dejar pasar a un usuario sin stock.acceso';
  exception when others then
    if sqlerrm like 'Sin permiso%' then
      raise notice 'TEST 3 OK: fn_importar_producto_lista_precio bloquea sin stock.acceso (%)', sqlerrm;
    else
      raise exception 'TEST 3 FALLÓ: error inesperado distinto al de permiso: %', sqlerrm;
    end if;
  end;
end $$;

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- Test 4: la función interna de aplicar plantillas de permisos NO debe ser
-- ejecutable por authenticated directamente (solo por la edge function, vía
-- service_role) — regresión del hallazgo de seguridad de la Fase 3 de RBAC.
do $$
begin
  begin
    perform _aplicar_plantillas_usuario('a0000000-0000-0000-0000-000000000003', array['vendedor'], 'a0000000-0000-0000-0000-000000000001');
    raise exception 'TEST 4 FALLÓ: _aplicar_plantillas_usuario no debería ser ejecutable desde authenticated';
  exception when insufficient_privilege then
    raise notice 'TEST 4 OK: _aplicar_plantillas_usuario sigue bloqueada para authenticated';
  end;
end $$;

reset role;

-- Setup para los tests 5 y 6: un tenant y un cliente "de juguete" ajenos a
-- todo lo real, creados con el rol elevado con el que corre este script
-- (antes de simular authenticated). Como todo el script corre dentro de
-- "begin; ... rollback;", no dejan ningún rastro real.
insert into tenants (id, nombre, slug) values ('b87a3599-3f0a-4fab-a95c-1db657fdfa09', 'Tenant Test RLS', 'test-rls-tmp');
insert into clientes (id, tenant_id, nombre) values ('c87a3599-3f0a-4fab-a95c-1db657fdfa10', 'b87a3599-3f0a-4fab-a95c-1db657fdfa09', 'Cliente de otro tenant');

set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}';

-- Test 5: aislamiento cross-tenant en SELECT — un vendedor del tenant demo
-- no debe ver clientes de otro tenant, aunque conozca el id exacto.
do $$
declare
  v_visibles int;
begin
  select count(*) into v_visibles from clientes where tenant_id = 'b87a3599-3f0a-4fab-a95c-1db657fdfa09';
  if v_visibles <> 0 then
    raise exception 'TEST 5 FALLÓ: un vendedor vio % cliente(s) de otro tenant (debería ver 0)', v_visibles;
  end if;
  raise notice 'TEST 5 OK: aislamiento cross-tenant en SELECT sobre clientes';
end $$;

-- Test 6: aislamiento cross-tenant en INSERT — un vendedor no debe poder
-- registrar un cobro con tenant_id de otro tenant, ni siquiera contra un
-- cliente real de ese otro tenant. Esto es plata: si esto se rompe, un
-- vendedor mal intencionado (o un bug de frontend que mande el tenant_id
-- equivocado) podría escribir cobros cruzados entre distribuidoras.
do $$
declare
  v_paso boolean := false;
begin
  begin
    insert into cobros (tenant_id, cliente_id, vendedor_id, lista, medio_pago, monto)
    values ('b87a3599-3f0a-4fab-a95c-1db657fdfa09', 'c87a3599-3f0a-4fab-a95c-1db657fdfa10', 'a0000000-0000-0000-0000-000000000003', 1, 'efectivo', 100);
    v_paso := true;
  exception when others then
    raise notice 'TEST 6 OK: insert de cobro cross-tenant bloqueado (%)', sqlerrm;
  end;
  if v_paso then
    raise exception 'TEST 6 FALLÓ: se pudo insertar un cobro con tenant_id de otra distribuidora';
  end if;
end $$;

reset role;

do $$
begin
  raise notice '=================================================';
  raise notice 'TODOS LOS TESTS PASARON';
  raise notice '=================================================';
end $$;

rollback;
