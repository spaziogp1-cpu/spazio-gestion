-- =====================================================================
-- Spazio Design · Gestión · Entrega 1b
-- Proveedores y pedidos a proveedores (Vidpro, STG y otros).
--
-- Se ejecuta una sola vez en Supabase → SQL Editor → "Run".
-- =====================================================================

create table public.proveedores (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null unique,
  que_provee      text,
  contacto        text,
  telefono        text,
  plazo_dias      integer not null default 25 check (plazo_dias > 0),  -- días HÁBILES que tarda, como máximo
  activo          boolean not null default true,
  creado_en       timestamptz not null default now()
);

insert into public.proveedores (nombre, que_provee, plazo_dias) values
  ('Vidpro', 'Vidrio y mesas armadas', 25),   -- tarda entre 20 y 25 días hábiles
  ('STG', 'Estructuras cromadas', 30)         -- tarda entre 25 y 30 días hábiles
on conflict (nombre) do update set plazo_dias = excluded.plazo_dias;

create table public.pedidos_proveedor (
  id                uuid primary key default gen_random_uuid(),
  pedido_id         uuid not null references public.pedidos(id) on delete cascade,
  proveedor_id      uuid not null references public.proveedores(id),
  detalle           text,                         -- qué se le pidió
  estado            text not null default 'pedido'
                      check (estado in ('pedido','recibido','cancelado')),
  fecha_pedido      date not null default public.hoy_ar(),
  fecha_esperada    date,
  fecha_recepcion   date,
  link_drive        text,                         -- el pedido guardado en la carpeta de Drive
  nota              text,
  creado_por        uuid references public.equipo(id),
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);
create index pedidos_proveedor_pedido on public.pedidos_proveedor (pedido_id);
create index pedidos_proveedor_pendientes on public.pedidos_proveedor (estado, fecha_esperada);
create trigger pedidos_proveedor_actualizado before update on public.pedidos_proveedor
  for each row execute function public.tocar_actualizado_en();
create trigger pedidos_proveedor_historial after insert or update or delete on public.pedidos_proveedor
  for each row execute function public.registrar_cambios();

-- Al pedir algo a un proveedor, un pedido "Señado" pasa solo a "Pedido a fábrica".
create or replace function public.avanzar_al_pedir() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.pedidos set etapa = 'pedido_fabrica'
  where id = new.pedido_id and etapa = 'senado';
  return new;
end $$;
create trigger pedidos_proveedor_avanza after insert on public.pedidos_proveedor
  for each row execute function public.avanzar_al_pedir();

alter table public.proveedores enable row level security;
alter table public.pedidos_proveedor enable row level security;
create policy proveedores_todo on public.proveedores for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());
create policy pedidos_proveedor_todo on public.pedidos_proveedor for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());

-- La vista de pedidos suma el estado de los proveedores (columnas nuevas al final).
create or replace view public.pedidos_resumen with (security_invoker = true) as
select
  p.*,
  c.nombre    as cliente_nombre,
  c.telefono  as cliente_telefono,
  c.localidad as cliente_localidad,
  e.nombre    as responsable_nombre,
  coalesce(pg.pagado, 0)                                          as pagado,
  p.total + p.precio_envio_cliente - coalesce(pg.pagado, 0)       as saldo,
  (p.etapa in ('senado','pedido_fabrica','en_fabricacion')
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

-- Lista de todo lo pedido a proveedores, con el pedido y el cliente.
create view public.proveedor_pendientes with (security_invoker = true) as
select
  pp.*,
  pr.nombre        as proveedor_nombre,
  p.numero         as pedido_numero,
  p.etapa          as pedido_etapa,
  p.fecha_limite   as pedido_fecha_limite,
  c.nombre         as cliente_nombre,
  (pp.estado = 'pedido' and pp.fecha_esperada < public.hoy_ar()) as demorado
from public.pedidos_proveedor pp
join public.proveedores pr on pr.id = pp.proveedor_id
join public.pedidos p on p.id = pp.pedido_id
join public.clientes c on c.id = p.cliente_id;
