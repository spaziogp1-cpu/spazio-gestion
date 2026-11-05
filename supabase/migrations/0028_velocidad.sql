-- 0028 — Velocidad: permisos que se evalúan una sola vez por consulta.
--
-- Las reglas de acceso (RLS) llaman a es_equipo() / es_admin() / mi_equipo_id().
-- Escritas así: using (public.es_equipo()), Postgres puede volver a ejecutarlas por CADA fila
-- que mira, y cada llamada es otra consulta a la tabla equipo. La vista pedidos_resumen cruza
-- pedidos, clientes, pagos, ítems y proveedores, así que una lista de pedidos terminaba haciendo
-- miles de esas llamadas.
-- Envolviéndolas en (select ...) Postgres las calcula una vez y reusa el resultado.
-- Es la recomendación oficial de Supabase; no cambia quién puede ver o editar qué.
--
-- Se puede correr más de una vez sin problema.

do $$
declare
  pol record;
  nuevo_using text;
  nuevo_check text;
  sentencia text;
begin
  for pol in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname in ('public', 'storage')
      and (coalesce(qual, '') ~ '(es_equipo|es_admin|mi_equipo_id)\(\)'
           or coalesce(with_check, '') ~ '(es_equipo|es_admin|mi_equipo_id)\(\)')
  loop
    -- Reemplaza solo las llamadas que todavía no están envueltas en un select.
    nuevo_using := regexp_replace(pol.qual,
      '(?<!SELECT )(public\.)?(es_equipo|es_admin|mi_equipo_id)\(\)',
      '( SELECT public.\2() )', 'g');
    nuevo_check := regexp_replace(pol.with_check,
      '(?<!SELECT )(public\.)?(es_equipo|es_admin|mi_equipo_id)\(\)',
      '( SELECT public.\2() )', 'g');

    if nuevo_using is distinct from pol.qual or nuevo_check is distinct from pol.with_check then
      sentencia := format('alter policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
      if nuevo_using is not null then
        sentencia := sentencia || format(' using (%s)', nuevo_using);
      end if;
      if nuevo_check is not null then
        sentencia := sentencia || format(' with check (%s)', nuevo_check);
      end if;
      begin
        execute sentencia;
      exception when others then
        -- Ej.: las reglas de storage pueden pertenecer a otro usuario de Supabase. Se saltean.
        raise notice 'No se pudo optimizar % en %.%: %', pol.policyname, pol.schemaname, pol.tablename, sqlerrm;
      end;
    end if;
  end loop;
end $$;

-- Índices para los ordenamientos y filtros nuevos de la lista de pedidos.
create index if not exists pedidos_fecha_venta on public.pedidos (fecha_venta desc);
create index if not exists pedidos_creado_en on public.pedidos (creado_en desc);
create index if not exists pedidos_responsable on public.pedidos (responsable_id);

-- Que el planificador tenga estadísticas al día.
analyze public.pedidos;
analyze public.clientes;
analyze public.pagos;
analyze public.pedido_items;
analyze public.pedidos_proveedor;
analyze public.equipo;
