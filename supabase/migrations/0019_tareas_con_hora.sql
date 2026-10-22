-- =====================================================================
-- Spazio Design · Gestión · Tareas con hora
--  - Las tareas pueden tener hora: aparecen en ese horario del calendario.
--  - Recordatorio 30 minutos antes (se cambia en Ajustes) al responsable;
--    si es de todo el equipo, a todos.
--  - Si la tarea se completa, se borra o cambia de día u hora, el
--    recordatorio queda anulado.
--
-- Se ejecuta una sola vez en Supabase → SQL Editor → "Run". Se puede correr de nuevo.
-- Necesita la 0017 (reportes y recordatorios).
-- =====================================================================

alter table public.tareas add column if not exists hora time;

-- La vista suma la hora al final (las columnas anteriores quedan igual).
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
  t.auto,
  t.hora
from public.tareas t
left join public.equipo r  on r.id = t.responsable_id
left join public.equipo cr on cr.id = t.creado_por
left join public.pedidos p on p.id = t.pedido_id
left join public.clientes c on c.id = p.cliente_id
left join public.objetivos o on o.id = t.objetivo_id
left join public.visitas v on v.id = t.visita_id;

insert into public.parametros (clave, valor, nota) values
  ('recordatorio_tarea_minutos', '30', 'Minutos antes de una tarea con hora para el recordatorio')
on conflict (clave) do nothing;

-- Recordatorios de tareas con hora.
create or replace function public.notif_recordatorios_tareas(p_ahora timestamptz default now()) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_zona text := public.notif_zona();
  v_min  integer := coalesce(nullif(public.notif_param('recordatorio_tarea_minutos', '30'), '')::integer, 30);
  v_hoy  date := (p_ahora at time zone v_zona)::date;
  v_n    integer;
begin
  insert into public.notificaciones (usuario_id, tipo, titulo, cuerpo, link, clave, evento_tipo, evento_id, evento_en)
  select d.id, 'recordatorio_tarea',
         'Tarea a las ' || to_char(t.hora, 'HH24:MI') || ' · ' || t.titulo,
         concat_ws(' · ',
           nullif(left(t.descripcion, 160), ''),
           case when p.numero is not null then '#' || p.numero || ' ' || c.nombre end,
           case when t.responsable_id is null then 'De todo el equipo' end,
           case when t.prioridad = 'alta' then 'Prioridad alta' end),
         case when t.pedido_id is not null then '/pedidos/' || t.pedido_id else '/tareas' end,
         'rec:tarea:' || t.id || ':' || to_char(e.ev at time zone v_zona, 'YYYY-MM-DD"T"HH24:MI') || ':' || d.id,
         'tarea', t.id, e.ev
  from public.tareas t
  left join public.pedidos p on p.id = t.pedido_id
  left join public.clientes c on c.id = p.cliente_id
  cross join lateral (select (t.vencimiento + t.hora) at time zone v_zona as ev) e
  join lateral (
    select q.id from public.equipo q
    where q.activo and (q.id = t.responsable_id or t.responsable_id is null)
  ) d on true
  where t.vencimiento between v_hoy and v_hoy + 1
    and t.hora is not null
    and t.estado <> 'hecha'
    and e.ev > p_ahora and e.ev <= p_ahora + make_interval(mins => v_min)
  on conflict (clave) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.notif_recordatorios_tareas(timestamptz) from public, anon, authenticated;

-- El proceso de cada minuto (0017) suma los recordatorios de tareas.
create or replace function public.notif_procesar(p_ahora timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_local  timestamp := p_ahora at time zone public.notif_zona();
  v_fecha  date := v_local::date;
  v_hora   time := v_local::time;
  v_dia    text := extract(isodow from v_fecha)::text;
  v_dias   text[] := string_to_array(replace(public.notif_param('reporte_dias', '1,2,3,4,5,6'), ' ', ''), ',');
  v_manana time := public.notif_hora('reporte_manana_hora', '08:30');
  v_tarde  time := public.notif_hora('reporte_tarde_hora', '18:00');
  r jsonb := '{}';
begin
  if v_dia = any (v_dias) then
    if v_hora >= v_manana and v_hora < v_tarde then
      insert into public.notif_corridas (clave) values ('manana:' || v_fecha) on conflict do nothing;
      if found then r := r || jsonb_build_object('reporte_manana', public.notif_reportes('manana', v_fecha)); end if;
    end if;
    if v_hora >= v_tarde then
      insert into public.notif_corridas (clave) values ('tarde:' || v_fecha) on conflict do nothing;
      if found then r := r || jsonb_build_object('reporte_tarde', public.notif_reportes('tarde', v_fecha)); end if;
    end if;
  end if;
  return r || jsonb_build_object(
    'recordatorios', public.notif_recordatorios(p_ahora),
    'recordatorios_tareas', public.notif_recordatorios_tareas(p_ahora));
end $$;
revoke all on function public.notif_procesar(timestamptz) from public, anon, authenticated;

-- Si cambia el día o la hora, o se completa o se borra, el recordatorio queda anulado.
create or replace function public.notif_cambio_tarea() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nuevo timestamptz;
begin
  if tg_op = 'DELETE' then
    perform public.notif_anular('tarea', old.id, null, 'Se borró la tarea');
    return old;
  end if;
  if new.estado = 'hecha' then
    perform public.notif_anular('tarea', new.id, null, 'Ya se completó');
  elsif new.vencimiento is null or new.hora is null then
    perform public.notif_anular('tarea', new.id, null, 'Se sacó el horario de la tarea');
  else
    v_nuevo := (new.vencimiento + new.hora) at time zone public.notif_zona();
    perform public.notif_anular('tarea', new.id, v_nuevo,
      'Se reprogramó para el ' || to_char(new.vencimiento, 'DD/MM') || ' a las ' || to_char(new.hora, 'HH24:MI'));
  end if;
  return new;
end $$;

drop trigger if exists notif_cambio_tarea on public.tareas;
create trigger notif_cambio_tarea
  after update of vencimiento, hora, estado on public.tareas
  for each row
  when (old.vencimiento is distinct from new.vencimiento or old.hora is distinct from new.hora
        or (old.estado is distinct from new.estado and new.estado = 'hecha'))
  execute function public.notif_cambio_tarea();
drop trigger if exists notif_borrar_tarea on public.tareas;
create trigger notif_borrar_tarea after delete on public.tareas
  for each row execute function public.notif_cambio_tarea();
