-- =====================================================================
-- Spazio Design · Gestión · Etapas simplificadas y entregas con horario
--  - Se saca la etapa "Pedido a fábrica": de Señado se pasa a En fabricación.
--  - La entrega programada puede tener horario (para el calendario).
--
-- Se ejecuta una sola vez en Supabase → SQL Editor → "Run".
-- =====================================================================

-- 1. Los pedidos que estaban en "Pedido a fábrica" pasan a "En fabricación".
update public.pedidos set etapa = 'en_fabricacion' where etapa = 'pedido_fabrica';

do $$
declare r record;
begin
  for r in select conname from pg_constraint
           where conrelid = 'public.pedidos'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%etapa%'
  loop
    execute format('alter table public.pedidos drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.pedidos add constraint pedidos_etapa_check
  check (etapa in ('senado','en_fabricacion','lista','cliente_avisado','envio_coordinado','entregado','cancelado'));

-- 2. Al pedir algo a un proveedor, un pedido "Señado" pasa solo a "En fabricación".
create or replace function public.avanzar_al_pedir() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.pedidos set etapa = 'en_fabricacion'
  where id = new.pedido_id and etapa = 'senado';
  return new;
end $$;

-- 3. Horario de la entrega programada.
alter table public.pedidos add column if not exists hora_entrega_programada time;

-- La vista se vuelve a crear para que incluya la columna nueva.
drop view if exists public.pedidos_resumen;
create view public.pedidos_resumen with (security_invoker = true) as
select
  p.*,
  c.nombre    as cliente_nombre,
  c.telefono  as cliente_telefono,
  c.localidad as cliente_localidad,
  e.nombre    as responsable_nombre,
  coalesce(pg.pagado, 0)                                          as pagado,
  p.total + p.precio_envio_cliente - coalesce(pg.pagado, 0)       as saldo,
  (p.etapa in ('senado','en_fabricacion')
     and p.fecha_limite < public.hoy_ar())                        as atrasado,
  (p.fecha_limite - public.hoy_ar())                              as dias_restantes,
  coalesce(it.resumen, '')                                        as productos,
  coalesce(pv.pendientes, 0)                                      as prov_pendientes,
  coalesce(pv.recibidos, 0)                                       as prov_recibidos,
  coalesce(pv.resumen, '')                                        as prov_resumen
from public.pedidos p
join public.clientes c on c.id = p.cliente_id
left join public.equipo e on e.id = p.responsable_id
left join lateral (
  select sum(monto) as pagado from public.pagos where pedido_id = p.id
) pg on true
left join lateral (
  select string_agg(
           trim(concat_ws(' ', i.producto, i.modelo, i.medidas,
                case when i.cantidad > 1 then '×' || i.cantidad end)),
           ' · ' order by i.orden) as resumen
  from public.pedido_items i where i.pedido_id = p.id
) it on true
left join lateral (
  select count(*) filter (where pp.estado = 'pedido')   as pendientes,
         count(*) filter (where pp.estado = 'recibido') as recibidos,
         string_agg(pr.nombre || case when pp.estado = 'recibido' then ' ✓' else ' …' end,
                    ' · ' order by pp.creado_en) filter (where pp.estado <> 'cancelado') as resumen
  from public.pedidos_proveedor pp
  join public.proveedores pr on pr.id = pp.proveedor_id
  where pp.pedido_id = p.id
) pv on true;
grant select on public.pedidos_resumen to authenticated, service_role;
