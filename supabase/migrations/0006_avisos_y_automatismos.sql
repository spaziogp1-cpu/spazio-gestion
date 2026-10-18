-- =====================================================================
-- Spazio Design · Gestión · Entrega 1d
-- Avisos (notificaciones) y tareas que se crean y se cierran solas
-- según la etapa del pedido.
--
-- Se ejecuta una sola vez en Supabase → SQL Editor → "Run".
-- =====================================================================

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
create or replace function public.mi_equipo_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.equipo
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) and activo
$$;

-- Siguiente día hábil (sin fines de semana ni feriados cargados).
create or replace function public.dia_habil_siguiente(desde date, dias integer default 1) returns date
language plpgsql stable set search_path = public as $$
declare
  d date := desde;
  n integer := 0;
begin
  while n < dias loop
    d := d + 1;
    if extract(isodow from d) < 6 and not exists (select 1 from public.feriados f where f.fecha = d) then
      n := n + 1;
    end if;
  end loop;
  return d;
end $$;

create or replace function public.etapa_orden(e text) returns integer
language sql immutable as $$
  select case e
    when 'senado' then 1 when 'pedido_fabrica' then 2 when 'en_fabricacion' then 3
    when 'lista' then 4 when 'cliente_avisado' then 5 when 'envio_coordinado' then 6
    when 'entregado' then 7 else 99 end
$$;

-- ---------------------------------------------------------------------
-- Avisos
-- ---------------------------------------------------------------------
create table public.notificaciones (
  id                    uuid primary key default gen_random_uuid(),
  usuario_id            uuid not null references public.equipo(id) on delete cascade,
  tipo                  text not null,      -- tarea_asignada, pedido_atrasado, pedido_por_vencer, tarea_vencida, saldo, proveedor_demorado
  titulo                text not null,
  cuerpo                text,
  link                  text,
  clave                 text unique,        -- evita repetir el mismo aviso
  creada_en             timestamptz not null default now(),
  leida_en              timestamptz,
  email_enviado_en      timestamptz,
  whatsapp_enviado_en   timestamptz
);
create index notificaciones_usuario on public.notificaciones (usuario_id, leida_en, creada_en desc);

alter table public.notificaciones enable row level security;
create policy notificaciones_propias on public.notificaciones for select to authenticated
  using (usuario_id = public.mi_equipo_id());
create policy notificaciones_marcar on public.notificaciones for update to authenticated
  using (usuario_id = public.mi_equipo_id()) with check (usuario_id = public.mi_equipo_id());
-- Cualquiera del equipo puede crear un aviso para otro (por ejemplo, al asignarle una tarea).
create policy notificaciones_crear on public.notificaciones for insert to authenticated
  with check (public.es_equipo());

alter publication supabase_realtime add table public.notificaciones;

-- Aviso al asignar una tarea a otra persona (o al crearse una tarea automática).
create or replace function public.avisar_tarea_asignada() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_quien text;
  v_link text := case when new.pedido_id is not null then '/pedidos/' || new.pedido_id else '/tareas' end;
begin
  if new.responsable_id is null or new.responsable_id is not distinct from new.creado_por then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.responsable_id is not distinct from new.responsable_id then
    return new;
  end if;
  select nombre into v_quien from public.equipo where id = new.creado_por;
  insert into public.notificaciones (usuario_id, tipo, titulo, cuerpo, link, clave)
  values (
    new.responsable_id, 'tarea_asignada',
    'Nueva tarea: ' || new.titulo,
    case when v_quien is not null then 'Te la asignó ' || v_quien else 'Se creó sola por el avance del pedido' end
      || case when new.vencimiento is not null then ' · para el ' || to_char(new.vencimiento, 'DD/MM') else '' end,
    v_link,
    'tarea:' || new.id || ':' || new.responsable_id
  ) on conflict (clave) do nothing;
  return new;
end $$;

create trigger tareas_aviso_asignada after insert or update of responsable_id on public.tareas
  for each row execute function public.avisar_tarea_asignada();

-- ---------------------------------------------------------------------
-- Tareas automáticas según la etapa del pedido
-- ---------------------------------------------------------------------
alter table public.tareas add column if not exists auto text;   -- pedir_proveedor, avisar_cliente, coordinar_entrega, cobrar_saldo
create index if not exists tareas_auto on public.tareas (pedido_id, auto) where auto is not null;

create or replace function public.crear_tarea_auto(p_pedido uuid, p_auto text, p_titulo text, p_venc date, p_resp uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.tareas where pedido_id = p_pedido and auto = p_auto and estado <> 'hecha') then
    return;
  end if;
  insert into public.tareas (titulo, responsable_id, prioridad, vencimiento, pedido_id, auto)
  values (p_titulo, p_resp, case when p_auto = 'cobrar_saldo' then 'alta' else 'media' end, p_venc, p_pedido, p_auto);
end $$;

create or replace function public.cerrar_tareas_auto(p_pedido uuid, p_autos text[]) returns void
language sql security definer set search_path = public as $$
  update public.tareas set estado = 'hecha'
  where pedido_id = p_pedido and auto = any (p_autos) and estado <> 'hecha'
$$;

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
      'Avisar a ' || v_cliente || ' que la mesa está lista (#' || new.numero || ')', v_hoy, v_resp);
  elsif new.etapa = 'cliente_avisado' then
    perform public.crear_tarea_auto(new.id, 'coordinar_entrega',
      'Coordinar ' || case when new.envio = 'retira' then 'retiro' else 'entrega' end || ' con ' || v_cliente || ' (#' || new.numero || ')',
      public.dia_habil_siguiente(v_hoy), v_resp);
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

create trigger pedidos_automatismos after insert or update of etapa on public.pedidos
  for each row execute function public.automatismos_pedido();

-- Cuando se termina de cobrar, se cierra la tarea de cobrar el saldo.
create or replace function public.cerrar_cobro_si_pagado() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pedido uuid := coalesce(new.pedido_id, old.pedido_id);
  v_saldo numeric;
begin
  select p.total + p.precio_envio_cliente - coalesce((select sum(monto) from public.pagos where pedido_id = p.id), 0)
    into v_saldo from public.pedidos p where p.id = v_pedido;
  if v_saldo is not null and v_saldo <= 0 then
    perform public.cerrar_tareas_auto(v_pedido, array['cobrar_saldo']);
  end if;
  return null;
end $$;

create trigger pagos_cierra_cobro after insert or update or delete on public.pagos
  for each row execute function public.cerrar_cobro_si_pagado();

-- La vista de tareas suma la columna nueva (al final).
create or replace view public.tareas_resumen with (security_invoker = true) as
select
  t.id, t.titulo, t.descripcion, t.responsable_id, t.creado_por, t.prioridad, t.vencimiento, t.estado, t.bloqueo,
  t.pedido_id, t.visita_id, t.objetivo_id, t.completada_en, t.creado_en, t.actualizado_en,
  r.nombre  as responsable_nombre,
  cr.nombre as creador_nombre,
  p.numero  as pedido_numero,
  c.nombre  as pedido_cliente,
  o.titulo  as objetivo_titulo,
  v.nombre  as visita_nombre,
  (t.estado <> 'hecha' and t.vencimiento < public.hoy_ar()) as vencida,
  t.auto
from public.tareas t
left join public.equipo r  on r.id = t.responsable_id
left join public.equipo cr on cr.id = t.creado_por
left join public.pedidos p on p.id = t.pedido_id
left join public.clientes c on c.id = p.cliente_id
left join public.objetivos o on o.id = t.objetivo_id
left join public.visitas v on v.id = t.visita_id;
