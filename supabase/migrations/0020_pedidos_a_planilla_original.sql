-- =====================================================================
-- Spazio Design · Gestión · Los pedidos de la app se escriben en Plantilla_Spazio_2026
--  - Desde ahora la app escribe cada pedido nuevo en la planilla original
--    (antes iba a la copia de pruebas).
--  - Si el N° del pedido quedó atrás del último de la planilla, el pedido pasa
--    al número siguiente, así la numeración sigue en orden en las dos.
--  - Los pedidos cargados en la app desde el 15/10 que no están en la original
--    quedan pendientes y se escriben solos en los próximos 15 minutos.
--
-- Se ejecuta una sola vez en Supabase → SQL Editor → "Run". Se puede correr de nuevo.
-- =====================================================================

create or replace function public.planilla_renumerar(p_pedido uuid, p_minimo integer) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_actual integer;
  v_nuevo  integer;
begin
  if not (public.es_equipo() or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role') then
    raise exception 'Sin permiso';
  end if;
  select numero into v_actual from public.pedidos where id = p_pedido for update;
  if v_actual is null then raise exception 'Pedido no encontrado'; end if;
  if v_actual >= p_minimo then return v_actual; end if;

  v_nuevo := greatest(p_minimo, (select max(numero) + 1 from public.pedidos));
  update public.pedidos set
    numero = v_nuevo,
    observaciones = concat_ws(E'\n', nullif(observaciones, ''),
      'Antes era #' || v_actual || ': pasó al #' || v_nuevo || ' para seguir la numeración de la planilla.')
  where id = p_pedido;
  perform setval('public.pedidos_numero_seq', greatest(v_nuevo, (select last_value from public.pedidos_numero_seq)));
  return v_nuevo;
end $$;
revoke all on function public.planilla_renumerar(uuid, integer) from public, anon;
grant execute on function public.planilla_renumerar(uuid, integer) to authenticated, service_role;

-- Los que vinieron de la planilla original ya están ahí: no se vuelven a escribir.
insert into public.planilla_sync (pedido_id, estado, sincronizado_en)
select distinct o.pedido_id, 'ok', now()
from public.planilla_origen o
where o.pedido_id is not null and o.estado in ('creado', 'vinculado')
on conflict (pedido_id) do update set estado = 'ok', error = null;

-- Los cargados en la app (o llegados de Tienda Nube) desde el 15/10 que no están en la
-- original: quedan pendientes. Se dejan afuera los de prueba y los cancelados.
insert into public.planilla_sync (pedido_id, estado, intentos)
select p.id, 'pendiente', 0
from public.pedidos p
join public.clientes c on c.id = p.cliente_id
where p.fecha_venta >= date '2026-10-15'
  and p.etapa <> 'cancelado'
  and c.nombre not ilike '%prueba%'
  and not exists (select 1 from public.planilla_origen o where o.pedido_id = p.id and o.estado in ('creado', 'vinculado'))
on conflict (pedido_id) do update set estado = 'pendiente', intentos = 0, error = null;

-- Para ver cuáles se van a escribir:
-- select p.numero, c.nombre, p.fecha_venta from public.planilla_sync s
-- join public.pedidos p on p.id = s.pedido_id join public.clientes c on c.id = p.cliente_id
-- where s.estado = 'pendiente' order by p.numero;
