-- =====================================================================
-- Spazio Design · Gestión · Pedidos a proveedores para stock
-- Un pedido a proveedor puede no estar asociado a ningún pedido de cliente
-- (compra para tener en stock).
--
-- Se ejecuta una sola vez en Supabase → SQL Editor → "Run".
-- =====================================================================

alter table public.pedidos_proveedor alter column pedido_id drop not null;
alter table public.pedidos_proveedor add column if not exists cantidad text;   -- "10 planchas", "50 m"

-- La lista general ahora incluye los pedidos de stock (sin pedido ni cliente).
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
