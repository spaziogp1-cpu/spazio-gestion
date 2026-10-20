-- =====================================================================
-- Spazio Design · Gestión · Reportes diarios y recordatorios dentro de la app
--  - Reporte de la mañana: tareas del día, entregas y visitas al showroom.
--  - Reporte de la tarde: qué se completó, qué sigue pendiente y qué pide atención.
--  - Recordatorio 40 minutos antes de cada entrega o visita con horario.
--  - Si el evento se reprograma o se cancela, el recordatorio queda anulado.
-- Todo corre en la base (pg_cron, cada minuto): no hace falta tener la app abierta.
-- Horarios y zona horaria en la tabla parametros (se cambian en Ajustes).
--
-- Se ejecuta una sola vez en Supabase → SQL Editor → "Run". Se puede correr de nuevo.
-- =====================================================================

-- 1. Más datos en cada aviso -------------------------------------------
alter table public.notificaciones add column if not exists datos       jsonb;        -- contenido de los reportes
alter table public.notificaciones add column if not exists evento_tipo text;         -- entrega | visita
alter table public.notificaciones add column if not exists evento_id   uuid;         -- pedido o visita
alter table public.notificaciones add column if not exists evento_en   timestamptz;  -- cuándo es el evento
alter table public.notificaciones add column if not exists anulada_en  timestamptz;  -- se reprogramó o se canceló
create index if not exists notificaciones_evento on public.notificaciones (evento_tipo, evento_id) where evento_id is not null;

-- 2. Parámetros --------------------------------------------------------
insert into public.parametros (clave, valor, nota) values
  ('reporte_manana_hora', '08:30', 'Hora del reporte de la mañana (HH:MM)'),
  ('reporte_tarde_hora',  '18:00', 'Hora del reporte de la tarde (HH:MM)'),
  ('reporte_dias',        '1,2,3,4,5,6', 'Días con reporte: 1 = lunes … 7 = domingo'),
  ('recordatorio_minutos', '40', 'Minutos antes de una entrega o visita para el recordatorio'),
  ('zona_horaria', 'America/Argentina/Buenos_Aires', 'Zona horaria de los avisos')
on conflict (clave) do nothing;

create or replace function public.notif_param(p_clave text, p_defecto text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(trim(valor), '') from public.parametros where clave = p_clave), p_defecto)
$$;

create or replace function public.notif_zona() returns text
language plpgsql stable security definer set search_path = public as $$
declare v text := public.notif_param('zona_horaria', 'America/Argentina/Buenos_Aires');
begin
  perform now() at time zone v;  -- valida la zona
  return v;
exception when others then
  return 'America/Argentina/Buenos_Aires';
end $$;

create or replace function public.notif_hora(p_clave text, p_defecto time) returns time
language plpgsql stable security definer set search_path = public as $$
begin
  return public.notif_param(p_clave, p_defecto::text)::time;
exception when others then
  return p_defecto;
end $$;

-- Corridas ya hechas (una por reporte y día), para no recalcular cada minuto.
create table if not exists public.notif_corridas (
  clave  text primary key,
  en     timestamptz not null default now()
);
alter table public.notif_corridas enable row level security;

-- 3. Reportes ----------------------------------------------------------
-- Arma el contenido del reporte de una persona (sin guardarlo).
create or replace function public.notif_datos_reporte(p_tipo text, p_fecha date, p_usuario uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_zona   text := public.notif_zona();
  v_admin  boolean := exists (select 1 from public.equipo where id = p_usuario and rol = 'admin');
  v_tareas jsonb; v_hechas jsonb; v_entregas jsonb; v_visitas jsonb; v_equipo jsonb;
begin
  -- Tareas pendientes de la persona (y las de todo el equipo, sin responsable) que vencen hasta hoy.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'titulo', t.titulo, 'vencimiento', t.vencimiento, 'prioridad', t.prioridad,
           'estado', t.estado, 'bloqueo', t.bloqueo, 'pedido_id', t.pedido_id, 'de_equipo', t.responsable_id is null,
           'vencida', t.vencimiento < p_fecha,
           'atencion', t.vencimiento < p_fecha or t.prioridad = 'alta' or t.estado = 'bloqueada')
         order by t.vencimiento, t.prioridad = 'alta' desc, t.titulo), '[]')
    into v_tareas
  from public.tareas t
  where t.estado <> 'hecha' and t.vencimiento <= p_fecha
    and (t.responsable_id = p_usuario or t.responsable_id is null);

  -- Entregas y retiros del día (todo el equipo las ve: cualquiera puede tener que estar).
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'numero', p.numero, 'cliente', c.nombre, 'hora', to_char(p.hora_entrega_programada, 'HH24:MI'),
           'envio', p.envio, 'localidad', c.localidad, 'etapa', p.etapa,
           'mia', coalesce(p.responsable_id, p.creado_por) = p_usuario)
         order by p.hora_entrega_programada nulls last, p.numero), '[]')
    into v_entregas
  from public.pedidos p join public.clientes c on c.id = p.cliente_id
  where p.fecha_entrega_programada = p_fecha and p.etapa <> 'cancelado'
    and (p_tipo = 'manana' and p.etapa <> 'entregado' or p_tipo = 'tarde');

  -- Visitas al showroom del día.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', v.id, 'nombre', v.nombre, 'hora', to_char(v.hora, 'HH24:MI'), 'motivo', v.motivo,
           'estado', v.estado, 'atiende', e.nombre, 'mia', v.atiende_id = p_usuario)
         order by v.hora nulls last, v.nombre), '[]')
    into v_visitas
  from public.visitas v left join public.equipo e on e.id = v.atiende_id
  where v.fecha = p_fecha and v.estado <> 'cancelada'
    and (p_tipo = 'manana' and v.estado in ('agendada', 'confirmada') or p_tipo = 'tarde');

  if p_tipo = 'manana' then
    return jsonb_build_object('tipo', 'manana', 'fecha', p_fecha, 'tareas', v_tareas, 'entregas', v_entregas, 'visitas', v_visitas);
  end if;

  -- Tarde: lo que se completó hoy.
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'titulo', t.titulo, 'pedido_id', t.pedido_id,
           'de_equipo', t.responsable_id is null) order by t.completada_en), '[]')
    into v_hechas
  from public.tareas t
  where t.estado = 'hecha' and (t.completada_en at time zone v_zona)::date = p_fecha
    and (t.responsable_id = p_usuario or t.responsable_id is null);

  -- Para los admin: lo trabado o vencido del resto del equipo.
  if v_admin then
    select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'titulo', t.titulo, 'responsable', e.nombre,
             'vencimiento', t.vencimiento, 'estado', t.estado, 'bloqueo', t.bloqueo, 'pedido_id', t.pedido_id,
             'vencida', t.vencimiento < p_fecha)
           order by t.vencimiento nulls last), '[]')
      into v_equipo
    from public.tareas t join public.equipo e on e.id = t.responsable_id
    where t.estado <> 'hecha' and t.responsable_id <> p_usuario
      and (t.vencimiento < p_fecha or t.estado = 'bloqueada');
  end if;

  return jsonb_build_object('tipo', 'tarde', 'fecha', p_fecha, 'hechas', v_hechas, 'tareas', v_tareas,
    'entregas', v_entregas, 'visitas', v_visitas, 'equipo', coalesce(v_equipo, '[]'::jsonb));
end $$;

-- Título y resumen del reporte, a partir de su contenido.
create or replace function public.notif_titulo_reporte(p_nombre text, d jsonb, out titulo text, out cuerpo text)
language plpgsql immutable as $$
declare
  nt int := jsonb_array_length(d -> 'tareas');
  ne int := jsonb_array_length(d -> 'entregas');
  nv int := jsonb_array_length(d -> 'visitas');
  nh int := coalesce(jsonb_array_length(d -> 'hechas'), 0);
  nven int := (select count(*) from jsonb_array_elements(d -> 'tareas') x where (x ->> 'vencida')::boolean);
  -- Requieren atención: tareas vencidas, de prioridad alta o bloqueadas, las trabadas del equipo (admin)
  -- y, a la tarde, las entregas de hoy que no se marcaron como entregadas.
  natt int := (select count(*) from jsonb_array_elements(d -> 'tareas') x where (x ->> 'atencion')::boolean)
              + coalesce(jsonb_array_length(d -> 'equipo'), 0)
              + case when d ->> 'tipo' = 'tarde'
                     then (select count(*) from jsonb_array_elements(d -> 'entregas') x where x ->> 'etapa' <> 'entregado')
                     else 0 end;
  pl text;
begin
  pl := concat_ws(' · ',
    case when nt > 0 then nt || case when nt = 1 then ' tarea' else ' tareas' end end,
    case when ne > 0 then ne || case when ne = 1 then ' entrega' else ' entregas' end end,
    case when nv > 0 then nv || case when nv = 1 then ' visita' else ' visitas' end end);
  if d ->> 'tipo' = 'manana' then
    titulo := 'Buen día, ' || p_nombre || ': ' || coalesce(nullif(pl, ''), 'hoy no hay tareas, entregas ni visitas');
    cuerpo := case when nven > 0 then nven || case when nven = 1 then ' tarea vencida' else ' tareas vencidas' end || ' · ' else '' end
              || 'Tocá para ver el detalle';
  else
    titulo := 'Cierre del día: ' || case when nh = 0 then 'ninguna tarea completada' when nh = 1 then '1 tarea completada' else nh || ' tareas completadas' end
              || ' · ' || case when nt = 0 then 'nada pendiente' when nt = 1 then '1 pendiente' else nt || ' pendientes' end;
    cuerpo := case when natt > 0 then natt || case when natt = 1 then ' requiere atención' else ' requieren atención' end || ' · ' else '' end
              || 'Tocá para ver el detalle';
  end if;
end $$;

-- Crea el reporte de cada persona activa (una sola vez por día y tipo).
create or replace function public.notif_reportes(p_tipo text, p_fecha date) returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  insert into public.notificaciones (id, usuario_id, tipo, titulo, cuerpo, link, clave, datos)
  select x.id, x.usuario_id, 'reporte_' || p_tipo, (x.t).titulo, (x.t).cuerpo, '/avisos/' || x.id,
         'reporte:' || p_tipo || ':' || p_fecha || ':' || x.usuario_id, x.datos
  from (
    select gen_random_uuid() as id, m.id as usuario_id, d.datos, public.notif_titulo_reporte(split_part(m.nombre, ' ', 1), d.datos) as t
    from public.equipo m
    cross join lateral (select public.notif_datos_reporte(p_tipo, p_fecha, m.id) as datos) d
    where m.activo
  ) x
  on conflict (clave) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- 4. Recordatorios -----------------------------------------------------
create or replace function public.notif_recordatorios(p_ahora timestamptz default now()) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_zona  text := public.notif_zona();
  v_min   integer := coalesce(nullif(public.notif_param('recordatorio_minutos', '40'), '')::integer, 40);
  v_hoy   date := (p_ahora at time zone v_zona)::date;
  v_n     integer; v_m integer;
begin
  -- Entregas y retiros: al responsable del pedido (o a quien lo cargó) y a los admin.
  insert into public.notificaciones (usuario_id, tipo, titulo, cuerpo, link, clave, evento_tipo, evento_id, evento_en)
  select d.id, 'recordatorio_entrega',
         case when p.envio = 'retira' then 'Retiro' else 'Entrega' end || ' a las ' || to_char(p.hora_entrega_programada, 'HH24:MI')
           || ' · #' || p.numero || ' ' || c.nombre,
         concat_ws(' · ',
           case when p.envio = 'retira' then 'Retira en el showroom' else nullif(trim(concat_ws(', ', coalesce(p.direccion_entrega, c.direccion), c.localidad)), '') end,
           nullif(c.telefono, ''), nullif(it.resumen, '')),
         '/pedidos/' || p.id,
         'rec:entrega:' || p.id || ':' || to_char(e.ev at time zone v_zona, 'YYYY-MM-DD"T"HH24:MI') || ':' || d.id,
         'entrega', p.id, e.ev
  from public.pedidos p
  join public.clientes c on c.id = p.cliente_id
  cross join lateral (select (p.fecha_entrega_programada + p.hora_entrega_programada) at time zone v_zona as ev) e
  left join lateral (
    select string_agg(trim(concat_ws(' ', i.producto, i.modelo, i.medidas, case when i.cantidad > 1 then '×' || i.cantidad end)), ' · ' order by i.orden) as resumen
    from public.pedido_items i where i.pedido_id = p.id
  ) it on true
  join lateral (
    select q.id from public.equipo q
    where q.activo and (q.id = coalesce(p.responsable_id, p.creado_por) or q.rol = 'admin')
  ) d on true
  where p.fecha_entrega_programada between v_hoy and v_hoy + 1
    and p.hora_entrega_programada is not null
    and p.etapa not in ('entregado', 'cancelado')
    and e.ev > p_ahora and e.ev <= p_ahora + make_interval(mins => v_min)
  on conflict (clave) do nothing;
  get diagnostics v_n = row_count;

  -- Visitas al showroom: a quien atiende y a los admin; si no tiene asignado, a todo el equipo.
  insert into public.notificaciones (usuario_id, tipo, titulo, cuerpo, link, clave, evento_tipo, evento_id, evento_en)
  select d.id, 'recordatorio_visita',
         'Visita a las ' || to_char(v.hora, 'HH24:MI') || ' · ' || v.nombre,
         concat_ws(' · ', nullif(v.motivo, ''), nullif(v.telefono, ''),
           case when a.nombre is not null then 'Atiende ' || a.nombre else 'Sin asignar' end,
           case when v.estado = 'confirmada' then 'Confirmada' end),
         '/showroom#visita-' || v.id,
         'rec:visita:' || v.id || ':' || to_char(e.ev at time zone v_zona, 'YYYY-MM-DD"T"HH24:MI') || ':' || d.id,
         'visita', v.id, e.ev
  from public.visitas v
  left join public.equipo a on a.id = v.atiende_id
  cross join lateral (select (v.fecha + v.hora) at time zone v_zona as ev) e
  join lateral (
    select q.id from public.equipo q
    where q.activo and (q.id = v.atiende_id or q.rol = 'admin' or v.atiende_id is null)
  ) d on true
  where v.fecha between v_hoy and v_hoy + 1
    and v.hora is not null
    and v.estado in ('agendada', 'confirmada')
    and e.ev > p_ahora and e.ev <= p_ahora + make_interval(mins => v_min)
  on conflict (clave) do nothing;
  get diagnostics v_m = row_count;
  return v_n + v_m;
end $$;

-- 5. Lo que corre cada minuto -----------------------------------------
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
    -- La mañana sale desde su hora hasta la de la tarde (si el proceso se atrasó, sale igual).
    if v_hora >= v_manana and v_hora < v_tarde then
      insert into public.notif_corridas (clave) values ('manana:' || v_fecha) on conflict do nothing;
      if found then r := r || jsonb_build_object('reporte_manana', public.notif_reportes('manana', v_fecha)); end if;
    end if;
    if v_hora >= v_tarde then
      insert into public.notif_corridas (clave) values ('tarde:' || v_fecha) on conflict do nothing;
      if found then r := r || jsonb_build_object('reporte_tarde', public.notif_reportes('tarde', v_fecha)); end if;
    end if;
  end if;
  return r || jsonb_build_object('recordatorios', public.notif_recordatorios(p_ahora));
end $$;

-- Para probar desde la app: el reporte de quien lo pide, ahora (no reemplaza al del día).
create or replace function public.notif_reporte_prueba(p_tipo text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_yo uuid := public.mi_equipo_id();
  v_fecha date := (now() at time zone public.notif_zona())::date;
  v_id uuid := gen_random_uuid();
  v_nombre text;
  v_datos jsonb;
  t record;
begin
  if v_yo is null or p_tipo not in ('manana', 'tarde') then raise exception 'No autorizado'; end if;
  select split_part(nombre, ' ', 1) into v_nombre from public.equipo where id = v_yo;
  v_datos := public.notif_datos_reporte(p_tipo, v_fecha, v_yo);
  select * into t from public.notif_titulo_reporte(v_nombre, v_datos);
  insert into public.notificaciones (id, usuario_id, tipo, titulo, cuerpo, link, clave, datos)
  values (v_id, v_yo, 'reporte_' || p_tipo, '(Prueba) ' || t.titulo, t.cuerpo, '/avisos/' || v_id,
          'prueba:' || p_tipo || ':' || v_id, v_datos);
  return v_id;
end $$;

revoke all on function public.notif_procesar(timestamptz) from public, anon, authenticated;
revoke all on function public.notif_recordatorios(timestamptz) from public, anon, authenticated;
revoke all on function public.notif_reportes(text, date) from public, anon, authenticated;
revoke all on function public.notif_datos_reporte(text, date, uuid) from public, anon, authenticated;
grant execute on function public.notif_reporte_prueba(text) to authenticated;

-- 6. Reprogramado, cancelado o borrado: el recordatorio queda anulado ---
create or replace function public.notif_anular(p_tipo text, p_id uuid, p_nuevo timestamptz, p_motivo text) returns void
language sql security definer set search_path = public as $$
  update public.notificaciones
     set anulada_en = now(),
         leida_en = coalesce(leida_en, now()),
         cuerpo = p_motivo || coalesce(' · ' || cuerpo, '')
   where evento_tipo = p_tipo and evento_id = p_id and anulada_en is null
     and (p_nuevo is null or evento_en is distinct from p_nuevo)
$$;

create or replace function public.notif_cambio_entrega() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_zona text := public.notif_zona();
  v_nuevo timestamptz;
begin
  if tg_op = 'DELETE' then
    perform public.notif_anular('entrega', old.id, null, 'Se borró el pedido');
    return old;
  end if;
  if new.etapa = 'cancelado' then
    perform public.notif_anular('entrega', new.id, null, 'Se canceló el pedido');
  elsif new.fecha_entrega_programada is null or new.hora_entrega_programada is null then
    perform public.notif_anular('entrega', new.id, null, 'Se sacó el horario de entrega');
  else
    v_nuevo := (new.fecha_entrega_programada + new.hora_entrega_programada) at time zone v_zona;
    perform public.notif_anular('entrega', new.id, v_nuevo,
      'Se reprogramó para el ' || to_char(new.fecha_entrega_programada, 'DD/MM') || ' a las ' || to_char(new.hora_entrega_programada, 'HH24:MI'));
  end if;
  return new;
end $$;

drop trigger if exists notif_cambio_entrega on public.pedidos;
create trigger notif_cambio_entrega
  after update of fecha_entrega_programada, hora_entrega_programada, etapa on public.pedidos
  for each row
  when (old.fecha_entrega_programada is distinct from new.fecha_entrega_programada
        or old.hora_entrega_programada is distinct from new.hora_entrega_programada
        or (old.etapa is distinct from new.etapa and new.etapa = 'cancelado'))
  execute function public.notif_cambio_entrega();
drop trigger if exists notif_borrar_entrega on public.pedidos;
create trigger notif_borrar_entrega after delete on public.pedidos
  for each row execute function public.notif_cambio_entrega();

create or replace function public.notif_cambio_visita() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nuevo timestamptz;
begin
  if tg_op = 'DELETE' then
    perform public.notif_anular('visita', old.id, null, 'Se borró la visita');
    return old;
  end if;
  if new.estado = 'cancelada' then
    perform public.notif_anular('visita', new.id, null, 'Se canceló la visita');
  elsif new.hora is null then
    perform public.notif_anular('visita', new.id, null, 'Se sacó el horario de la visita');
  else
    v_nuevo := (new.fecha + new.hora) at time zone public.notif_zona();
    perform public.notif_anular('visita', new.id, v_nuevo,
      'Se reprogramó para el ' || to_char(new.fecha, 'DD/MM') || ' a las ' || to_char(new.hora, 'HH24:MI'));
  end if;
  return new;
end $$;

drop trigger if exists notif_cambio_visita on public.visitas;
create trigger notif_cambio_visita
  after update of fecha, hora, estado on public.visitas
  for each row
  when (old.fecha is distinct from new.fecha or old.hora is distinct from new.hora
        or (old.estado is distinct from new.estado and new.estado = 'cancelada'))
  execute function public.notif_cambio_visita();
drop trigger if exists notif_borrar_visita on public.visitas;
create trigger notif_borrar_visita after delete on public.visitas
  for each row execute function public.notif_cambio_visita();

-- 7. Cada minuto, dentro de Supabase ----------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'spazio-avisos';
    perform cron.schedule('spazio-avisos', '* * * * *', 'select public.notif_procesar()');
  else
    raise notice 'pg_cron no está disponible: los avisos no se generan solos';
  end if;
end $$;
