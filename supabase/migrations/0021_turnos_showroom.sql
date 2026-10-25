-- =====================================================================
-- Spazio Design · Gestión · Turnos online para el showroom
--  - Un link público (/turnos) donde el cliente elige día y horario libre.
--  - El turno queda como visita "agendada" en Showroom y en el calendario,
--    con el recordatorio de siempre, y le llega un aviso a todo el equipo.
--  - El cliente puede cancelarlo o cambiarlo desde su propio link.
--  - Horarios, duración, cupo y días cerrados se cambian en Ajustes.
--
-- Se ejecuta una sola vez en Supabase → SQL Editor → "Run". Se puede correr de nuevo.
-- Necesita la 0017 (avisos).
-- =====================================================================

alter table public.visitas add column if not exists email  text;
alter table public.visitas add column if not exists origen text not null default 'app';
alter table public.visitas add column if not exists codigo text;
create unique index if not exists visitas_codigo on public.visitas (codigo) where codigo is not null;

insert into public.parametros (clave, valor, nota) values
  ('turnos_activo', 'si', 'Turnos online del showroom: si / no'),
  ('turnos_horarios', '{"1":"10:00-18:00","2":"10:00-18:00","3":"10:00-18:00","4":"10:00-18:00","5":"10:00-18:00","6":"10:00-13:00"}',
   'Horario de cada día (1 = lunes … 7 = domingo). Sin horario: cerrado'),
  ('turnos_duracion', '30', 'Minutos de cada turno'),
  ('turnos_cupo', '1', 'Cuántas visitas pueden reservar el mismo horario'),
  ('turnos_anticipacion_horas', '3', 'Horas mínimas de anticipación para reservar'),
  ('turnos_dias_adelante', '21', 'Hasta cuántos días adelante se puede reservar'),
  ('turnos_cerrados', '', 'Días sin turnos, además de los feriados (AAAA-MM-DD separados por coma)'),
  ('showroom_direccion', '', 'Dirección del showroom (se muestra al reservar)'),
  ('showroom_whatsapp', '', 'WhatsApp de contacto que se muestra al reservar')
on conflict (clave) do nothing;

-- Lo que ve el cliente en la página (nada interno).
create or replace function public.turnos_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'activo', public.notif_param('turnos_activo', 'si') = 'si',
    'duracion', public.notif_param('turnos_duracion', '30')::integer,
    'direccion', public.notif_param('showroom_direccion', ''),
    'whatsapp', public.notif_param('showroom_whatsapp', ''))
$$;

-- Horarios libres desde hoy hasta "turnos_dias_adelante".
create or replace function public.turnos_disponibles() returns table (fecha date, hora time, libres integer)
language plpgsql stable security definer set search_path = public as $$
declare
  v_zona   text := public.notif_zona();
  v_ahora  timestamp := now() at time zone v_zona;
  v_dur    integer := greatest(10, coalesce(nullif(public.notif_param('turnos_duracion', '30'), '')::integer, 30));
  v_cupo   integer := greatest(1, coalesce(nullif(public.notif_param('turnos_cupo', '1'), '')::integer, 1));
  v_antic  integer := greatest(0, coalesce(nullif(public.notif_param('turnos_anticipacion_horas', '3'), '')::integer, 3));
  v_dias   integer := least(90, greatest(1, coalesce(nullif(public.notif_param('turnos_dias_adelante', '21'), '')::integer, 21)));
  v_hor    jsonb;
  v_cerr   text[] := string_to_array(replace(public.notif_param('turnos_cerrados', ''), ' ', ''), ',');
begin
  if public.notif_param('turnos_activo', 'si') <> 'si' then return; end if;
  begin
    v_hor := public.notif_param('turnos_horarios', '{}')::jsonb;
  exception when others then
    return;
  end;
  return query
  with dias as (
    select d::date as dia from generate_series(v_ahora::date, v_ahora::date + v_dias, interval '1 day') d
  ), rangos as (
    select x.dia, split_part(r, '-', 1)::time as desde, split_part(r, '-', 2)::time as hasta
    from dias x
    cross join lateral (select nullif(trim(v_hor ->> extract(isodow from x.dia)::text), '') as r) h
    where h.r ~ '^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$'
      and not exists (select 1 from public.feriados f where f.fecha = x.dia)
      and not (x.dia::text = any (coalesce(v_cerr, '{}')))
  ), turnos as (
    select r.dia, t::timestamp as ini
    from rangos r
    cross join lateral generate_series(r.dia + r.desde, r.dia + r.hasta - make_interval(mins => v_dur), make_interval(mins => v_dur)) t
  )
  select t.dia, t.ini::time,
         (v_cupo - (select count(*) from public.visitas v
                     where v.fecha = t.dia and v.hora is not null and v.estado in ('agendada', 'confirmada')
                       and (v.fecha + v.hora) >= t.ini and (v.fecha + v.hora) < t.ini + make_interval(mins => v_dur)))::integer
  from turnos t
  where t.ini >= v_ahora + make_interval(hours => v_antic)
  order by 1, 2;
end $$;

-- Reserva un turno. p: nombre, telefono, email, motivo, fecha, hora y, para cambiar uno, "reemplaza" (su código).
create or replace function public.reservar_turno(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_nombre text := left(trim(coalesce(p ->> 'nombre', '')), 120);
  v_tel    text := left(trim(coalesce(p ->> 'telefono', '')), 40);
  v_email  text := nullif(lower(left(trim(coalesce(p ->> 'email', '')), 160)), '');
  v_motivo text := nullif(left(trim(coalesce(p ->> 'motivo', '')), 500), '');
  v_fecha  date;
  v_hora   time;
  v_ult8   text;
  v_libres integer;
  v_cliente uuid;
  v_id     uuid;
  v_codigo text := left(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 24);
  v_viejo  public.visitas%rowtype;
  v_dias   text[] := array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  v_cuando text;
begin
  begin
    v_fecha := (p ->> 'fecha')::date;
    v_hora := (p ->> 'hora')::time;
  exception when others then
    raise exception 'Elegí un día y un horario';
  end;
  if length(v_nombre) < 2 then raise exception 'Escribí tu nombre'; end if;
  v_ult8 := right(regexp_replace(v_tel, '\D', '', 'g'), 8);
  if length(regexp_replace(v_tel, '\D', '', 'g')) < 8 then raise exception 'Escribí un teléfono válido (con característica)'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'El email no es válido'; end if;

  -- Un turno a la vez para no pisar dos reservas en el mismo horario.
  perform pg_advisory_xact_lock(hashtext('spazio-turnos'));

  if p ->> 'reemplaza' is not null then
    select * into v_viejo from public.visitas where codigo = p ->> 'reemplaza' and origen = 'web';
    if not found then raise exception 'No encontramos el turno a cambiar'; end if;
  end if;

  select d.libres into v_libres from public.turnos_disponibles() d where d.fecha = v_fecha and d.hora = v_hora;
  -- El turno que se está cambiando no ocupa lugar.
  if v_viejo.id is not null and v_viejo.fecha = v_fecha and v_viejo.hora = v_hora and v_viejo.estado in ('agendada', 'confirmada') then
    v_libres := coalesce(v_libres, 0) + 1;
  end if;
  if coalesce(v_libres, 0) < 1 then raise exception 'Ese horario ya no está disponible. Elegí otro, por favor.'; end if;

  if (select count(*) from public.visitas v
      where v.origen = 'web' and v.estado in ('agendada', 'confirmada') and v.fecha >= public.hoy_ar()
        and right(regexp_replace(coalesce(v.telefono, ''), '\D', '', 'g'), 8) = v_ult8
        and v.id is distinct from v_viejo.id) >= 2 then
    raise exception 'Ya tenés turnos reservados con ese teléfono. Si querés cambiarlo, usá el link de tu reserva.';
  end if;

  if v_viejo.id is not null then
    update public.visitas set estado = 'cancelada',
      notas = concat_ws(E'\n', nullif(notas, ''), 'El cliente lo cambió desde el link de turnos.')
    where id = v_viejo.id;
  end if;

  select id into v_cliente from public.clientes
  where (v_email is not null and lower(email) = v_email)
     or right(regexp_replace(coalesce(telefono, ''), '\D', '', 'g'), 8) = v_ult8
  order by creado_en desc limit 1;

  insert into public.visitas (cliente_id, nombre, telefono, email, fecha, hora, con_turno, motivo, estado, origen, codigo)
  values (v_cliente, v_nombre, v_tel, v_email, v_fecha, v_hora, true, v_motivo, 'agendada', 'web', v_codigo)
  returning id into v_id;

  v_cuando := initcap(v_dias[extract(isodow from v_fecha)::integer]) || ' ' || to_char(v_fecha, 'DD/MM') || ' ' || to_char(v_hora, 'HH24:MI');
  insert into public.notificaciones (usuario_id, tipo, titulo, cuerpo, link, clave)
  select q.id, 'turno_web',
         case when v_viejo.id is not null then 'Turno cambiado: ' else 'Nuevo turno: ' end || v_cuando || ' · ' || v_nombre,
         concat_ws(' · ', v_motivo, v_tel,
           case when v_viejo.id is not null then 'Antes: ' || to_char(v_viejo.fecha, 'DD/MM') || ' ' || to_char(v_viejo.hora, 'HH24:MI') end,
           case when v_cliente is not null then 'Ya es cliente' end),
         '/showroom#visita-' || v_id,
         'turno:' || v_id || ':' || q.id
  from public.equipo q where q.activo
  on conflict (clave) do nothing;

  return jsonb_build_object('codigo', v_codigo, 'fecha', v_fecha, 'hora', to_char(v_hora, 'HH24:MI'));
end $$;

-- Lo que ve el cliente de su reserva.
create or replace function public.turno_por_codigo(p_codigo text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('nombre', v.nombre, 'telefono', v.telefono, 'email', v.email, 'motivo', v.motivo,
                            'fecha', v.fecha, 'hora', to_char(v.hora, 'HH24:MI'), 'estado', v.estado,
                            'pasado', (v.fecha + v.hora) < (now() at time zone public.notif_zona()))
  from public.visitas v where v.codigo = p_codigo and v.origen = 'web' and length(p_codigo) >= 20
$$;

create or replace function public.cancelar_turno(p_codigo text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v public.visitas%rowtype;
begin
  select * into v from public.visitas where codigo = p_codigo and origen = 'web' and length(p_codigo) >= 20;
  if not found then raise exception 'No encontramos el turno'; end if;
  if v.estado not in ('agendada', 'confirmada') then return jsonb_build_object('estado', v.estado); end if;
  if (v.fecha + v.hora) < (now() at time zone public.notif_zona()) then raise exception 'Ese turno ya pasó'; end if;
  update public.visitas set estado = 'cancelada',
    notas = concat_ws(E'\n', nullif(notas, ''), 'El cliente lo canceló desde el link de turnos.')
  where id = v.id;
  insert into public.notificaciones (usuario_id, tipo, titulo, cuerpo, link, clave)
  select q.id, 'turno_web', 'Turno cancelado: ' || to_char(v.fecha, 'DD/MM') || ' ' || to_char(v.hora, 'HH24:MI') || ' · ' || v.nombre,
         concat_ws(' · ', v.telefono, 'Lo canceló el cliente'), '/showroom#visita-' || v.id, 'turno-cancelado:' || v.id || ':' || q.id
  from public.equipo q where q.activo
  on conflict (clave) do nothing;
  return jsonb_build_object('estado', 'cancelada');
end $$;

revoke all on function public.turnos_config() from public;
revoke all on function public.turnos_disponibles() from public;
revoke all on function public.reservar_turno(jsonb) from public;
revoke all on function public.turno_por_codigo(text) from public;
revoke all on function public.cancelar_turno(text) from public;
grant execute on function public.turnos_config() to anon, authenticated, service_role;
grant execute on function public.turnos_disponibles() to anon, authenticated, service_role;
grant execute on function public.reservar_turno(jsonb) to anon, authenticated, service_role;
grant execute on function public.turno_por_codigo(text) to anon, authenticated, service_role;
grant execute on function public.cancelar_turno(text) to anon, authenticated, service_role;
