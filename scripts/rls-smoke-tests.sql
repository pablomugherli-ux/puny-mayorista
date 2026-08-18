-- ============================================================================
-- Smoke tests de RLS/permisos — PUNY 2026 INTEGRAL
-- ----------------------------------------------------------------------------
-- Regresión mínima para el sistema de permisos dinámicos (tengo_permiso) y
-- algunas funciones críticas. Correrlo entero (en el SQL editor de Supabase,
-- o vía el MCP execute_sql) contra el proyecto: si algo falla, tira
-- EXCEPTION con un mensaje claro y CORTA ahí. Si termina sin errores, los 4
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

do $$
begin
  raise notice '=================================================';
  raise notice 'TODOS LOS TESTS PASARON';
  raise notice '=================================================';
end $$;

rollback;
