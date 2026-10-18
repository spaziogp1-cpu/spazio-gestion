-- =====================================================================
-- Spazio Design · Gestión · Precio de los pedidos a proveedores
-- Lo que se le paga al proveedor, para sumar la plata invertida.
--
-- Se ejecuta una sola vez en Supabase → SQL Editor → "Run".
-- =====================================================================

alter table public.pedidos_proveedor add column if not exists monto numeric(14,2) check (monto is null or monto >= 0);

-- La vista se vuelve a crear para que incluya la columna nueva.
drop view if exists public.proveedor_pendientes;
create view public.proveedor_pendientes with (security_invoker = true) as
select
  pp.*,
  pr.nombre        as proveedor_nombre,
  p.numero         as pedido_numero,
  p.etapa          as pedido_etapa,
  p.fecha_limite   as pedido_fecha_limite,
  c.nombre         as cliente_nombre,
  (pp.pedido_id is null) as es_stock,
  (pp.estado = 'pedido' and pp.fecha_esperada < public.hoy_ar()) as demorado
from public.pedidos_proveedor pp
join public.proveedores pr on pr.id = pp.proveedor_id
left join public.pedidos p on p.id = pp.pedido_id
left join public.clientes c on c.id = p.cliente_id;
