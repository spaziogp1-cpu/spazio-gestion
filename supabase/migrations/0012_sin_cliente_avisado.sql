-- =====================================================================
-- Spazio Design · Gestión · Se saca la etapa "Cliente avisado"
-- El circuito queda: Señado → En fabricación → Lista → Envío o retiro
-- coordinado → Entregado. Al quedar lista, una sola tarea: avisar al
-- cliente y coordinar la entrega o el retiro.
--
-- Se ejecuta una sola vez en Supabase → SQL Editor → "Run".
-- =====================================================================

-- 1. Los pedidos en "Cliente avisado" pasan a "Envío o retiro coordinado".
update public.pedidos set etapa = 'envio_coordinado' where etapa = 'cliente_avisado';

alter table public.pedidos drop constraint if exists pedidos_etapa_check;
alter table public.pedidos add constraint pedidos_etapa_check
  check (etapa in ('senado','en_fabricacion','lista','envio_coordinado','entregado','cancelado'));

-- 2. Tareas automáticas: al quedar lista, "avisar y coordinar" (se cierra al coordinar).
create or replace function public.automatismos_pedido() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cliente text;
  v_resp uuid := coalesce(new.responsable_id, new.creado_por);
  v_hoy date := public.hoy_ar();
  v_saldo numeric;
  o integer := public.etapa_orden(new.etapa);
begin
  select nombre into v_cliente from public.clientes where id = new.cliente_id;

  if tg_op = 'INSERT' then
    if new.etapa = 'senado' then
      perform public.crear_tarea_auto(new.id, 'pedir_proveedor',
        'Pedir a proveedores #' || new.numero || ' ' || v_cliente, public.dia_habil_siguiente(v_hoy), v_resp);
    end if;
    return new;
  end if;

  if new.etapa is not distinct from old.etapa then
    return new;
  end if;

  -- Cancelado: se cierran todas las automáticas abiertas.
  if new.etapa = 'cancelado' then
    perform public.cerrar_tareas_auto(new.id, array['pedir_proveedor','avisar_cliente','coordinar_entrega','cobrar_saldo']);
    return new;
  end if;

  -- Se cierran las que ya quedaron atrás.
  if o >= 2 then perform public.cerrar_tareas_auto(new.id, array['pedir_proveedor']); end if;
  if o >= 5 then perform public.cerrar_tareas_auto(new.id, array['avisar_cliente']); end if;
  if o >= 6 then perform public.cerrar_tareas_auto(new.id, array['coordinar_entrega']); end if;

  -- Y se crean las de la etapa nueva.
  if new.etapa = 'lista' then
    perform public.crear_tarea_auto(new.id, 'avisar_cliente',
      'Avisar a ' || v_cliente || ' que está lista y coordinar ' ||
      case when new.envio = 'retira' then 'el retiro' else 'la entrega' end || ' (#' || new.numero || ')', v_hoy, v_resp);
  elsif new.etapa = 'entregado' then
    select p.total + p.precio_envio_cliente - coalesce((select sum(monto) from public.pagos where pedido_id = p.id), 0)
      into v_saldo from public.pedidos p where p.id = new.id;
    if v_saldo > 0 then
      perform public.crear_tarea_auto(new.id, 'cobrar_saldo',
        'Cobrar saldo a ' || v_cliente || ' (#' || new.numero || ')', v_hoy, v_resp);
    end if;
  end if;
  return new;
end $$;
