-- =====================================================================
-- Spazio Design · Gestión · Entregas, etapa 2: vehículos y rutas
--  - Vehículos de los fleteros: capacidad, medidas máximas, personas, jornada y precio.
--  - Rutas de cada día: la app propone, el encargado ajusta y confirma.
--  - Mientras una ruta está en propuesta, las entregas siguen "Listas"; al
--    confirmarla pasan a "Confirmada" y el pedido a "Envío o retiro coordinado"
--    con la fecha y la hora estimada (calendario, recordatorio y planilla).
--  - Una ruta confirmada no cambia sola: si una entrega suya se cancela o le
--    cambia la dirección, se avisa a los admin y la ruta queda marcada.
--
-- Se ejecuta una sola vez en Supabase → SQL Editor → "Run". Se puede correr de nuevo.
-- Necesita la 0022 (entregas).
-- =====================================================================

create table if not exists public.vehiculos (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null,              -- "Trafic", "Kangoo"
  fletero            text,
  telefono           text,
  capacidad          numeric(6,2) not null default 3 check (capacidad > 0),   -- unidades (1 = una ratona)
  largo_max          integer not null default 176,  -- cm, mesa embalada
  ancho_max          integer not null default 117,
  alto_max           integer not null default 110,
  personas_max       integer not null default 2 check (personas_max between 1 and 6),
  jornada_desde      time not null default '08:30',
  jornada_hasta      time not null default '18:30',
  vuelve_deposito    boolean not null default true,
  dias               text not null default '1,2,3,4,5',  -- 1 = lunes … 7 = domingo
  precio_entrega     numeric(14,2) not null default 0,
  descuento_desde    integer not null default 3,       -- entregas en un viaje para el precio especial
  precio_descuento   numeric(14,2),                    -- precio por entrega con descuento
  activo             boolean not null default true,
  orden              integer not null default 0,
  creado_en          timestamptz not null default now()
);

insert into public.vehiculos (nombre, capacidad, largo_max, ancho_max, alto_max, personas_max, orden)
select v.* from (values ('Trafic', 5::numeric, 244, 127, 132, 3, 1), ('Kangoo', 3::numeric, 176, 117, 110, 2, 2)) v(nombre, capacidad, l, a, h, p, o)
where not exists (select 1 from public.vehiculos);

create table if not exists public.rutas (
  id               uuid primary key default gen_random_uuid(),
  fecha            date not null,
  vehiculo_id      uuid not null references public.vehiculos(id),
  estado           text not null default 'propuesta'
                     check (estado in ('propuesta','confirmada','en_curso','terminada','descartada')),
  salida           time,
  regreso          time,
  km               numeric(8,1),
  minutos          integer,
  costo_estimado   numeric(14,2),
  polyline         text,
  calculo          text not null default 'estimado' check (calculo in ('google','estimado')),
  desactualizada   boolean not null default false,  -- hay cambios desde que se propuso
  con_cambios      text,                            -- qué pasó después de confirmar
  token            text unique,                     -- link del fletero (etapa 3)
  confirmada_por   uuid references public.equipo(id),
  confirmada_en    timestamptz,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);
create index if not exists rutas_fecha on public.rutas (fecha, estado);

create table if not exists public.ruta_paradas (
  id                 uuid primary key default gen_random_uuid(),
  ruta_id            uuid not null references public.rutas(id) on delete cascade,
  entrega_id         uuid not null references public.entregas(id) on delete cascade,
  orden              integer not null,
  llegada            time,
  salida             time,
  minutos_viaje      integer,
  km_desde_anterior  numeric(8,1),
  fuera_de_franja    boolean not null default false,
  espera_minutos     integer not null default 0,
  creado_en          timestamptz not null default now()
);
create index if not exists ruta_paradas_ruta on public.ruta_paradas (ruta_id, orden);
create index if not exists ruta_paradas_entrega on public.ruta_paradas (entrega_id);

create table if not exists public.rutas_omitidas (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null,
  entrega_id  uuid not null references public.entregas(id) on delete cascade,
  motivo      text not null,
  creado_en   timestamptz not null default now()
);
create index if not exists rutas_omitidas_fecha on public.rutas_omitidas (fecha);

alter table public.vehiculos enable row level security;
alter table public.rutas enable row level security;
alter table public.ruta_paradas enable row level security;
alter table public.rutas_omitidas enable row level security;
drop policy if exists vehiculos_todo on public.vehiculos;
create policy vehiculos_todo on public.vehiculos for all to authenticated using (public.es_equipo()) with check (public.es_equipo());
drop policy if exists rutas_todo on public.rutas;
create policy rutas_todo on public.rutas for all to authenticated using (public.es_equipo()) with check (public.es_equipo());
drop policy if exists ruta_paradas_todo on public.ruta_paradas;
create policy ruta_paradas_todo on public.ruta_paradas for all to authenticated using (public.es_equipo()) with check (public.es_equipo());
drop policy if exists rutas_omitidas_todo on public.rutas_omitidas;
create policy rutas_omitidas_todo on public.rutas_omitidas for all to authenticated using (public.es_equipo()) with check (public.es_equipo());

drop trigger if exists rutas_actualizado on public.rutas;
create trigger rutas_actualizado before update on public.rutas
  for each row execute function public.tocar_actualizado_en();

-- ---------------------------------------------------------------------
-- Confirmar y deshacer
-- ---------------------------------------------------------------------
create or replace function public.ruta_confirmar(p_ruta uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  r public.rutas%rowtype;
  v_n integer;
begin
  if not public.es_equipo() then raise exception 'Sin permiso'; end if;
  select * into r from public.rutas where id = p_ruta for update;
  if not found then raise exception 'No se encontró la ruta'; end if;
  if r.estado <> 'propuesta' then raise exception 'La ruta ya no está en propuesta'; end if;
  if exists (select 1 from public.ruta_paradas rp join public.entregas e on e.id = rp.entrega_id
             where rp.ruta_id = p_ruta and e.estado <> 'lista') then
    raise exception 'Alguna entrega de la ruta cambió desde la propuesta: volvé a proponer';
  end if;
  if not exists (select 1 from public.ruta_paradas where ruta_id = p_ruta) then raise exception 'La ruta no tiene paradas'; end if;

  update public.rutas set estado = 'confirmada', confirmada_por = public.entrega_quien(), confirmada_en = now(),
    token = coalesce(token, left(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 24))
  where id = p_ruta;
  update public.entregas e set estado = 'confirmada', fecha_acordada = r.fecha
  from public.ruta_paradas rp where rp.ruta_id = p_ruta and rp.entrega_id = e.id;
  -- El pedido queda coordinado con la hora estimada: así aparece en el calendario con su recordatorio.
  update public.pedidos p set etapa = 'envio_coordinado', fecha_entrega_programada = r.fecha, hora_entrega_programada = rp.llegada
  from public.ruta_paradas rp join public.entregas e on e.id = rp.entrega_id
  where rp.ruta_id = p_ruta and p.id = e.pedido_id and p.etapa not in ('entregado', 'cancelado');
  get diagnostics v_n = row_count;
  -- Las otras propuestas del día con estas entregas ya no valen.
  update public.rutas set desactualizada = true
  where fecha = r.fecha and estado = 'propuesta' and id <> p_ruta;
  return v_n;
end $$;

create or replace function public.ruta_deshacer(p_ruta uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.rutas%rowtype;
begin
  if not public.es_equipo() then raise exception 'Sin permiso'; end if;
  select * into r from public.rutas where id = p_ruta for update;
  if not found or r.estado not in ('propuesta', 'confirmada') then raise exception 'Esta ruta ya no se puede deshacer'; end if;
  if exists (select 1 from public.ruta_paradas rp join public.entregas e on e.id = rp.entrega_id
             where rp.ruta_id = p_ruta and e.estado in ('en_camino', 'entregada', 'no_entregada')) then
    raise exception 'La ruta ya empezó';
  end if;
  if r.estado = 'confirmada' then
    update public.pedidos p set etapa = 'embalada', hora_entrega_programada = null
    from public.ruta_paradas rp join public.entregas e on e.id = rp.entrega_id
    where rp.ruta_id = p_ruta and p.id = e.pedido_id and p.etapa = 'envio_coordinado';
    update public.entregas e set estado = 'lista'
    from public.ruta_paradas rp where rp.ruta_id = p_ruta and rp.entrega_id = e.id and e.estado = 'confirmada';
  end if;
  update public.rutas set estado = 'descartada' where id = p_ruta;
end $$;

revoke all on function public.ruta_confirmar(uuid) from public, anon;
revoke all on function public.ruta_deshacer(uuid) from public, anon;
grant execute on function public.ruta_confirmar(uuid) to authenticated;
grant execute on function public.ruta_deshacer(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Cambios que tocan rutas
-- ---------------------------------------------------------------------
-- La etapa "envio_coordinado" ya no debe cancelar la entrega (es la etapa de una ruta confirmada).
-- (entrega_etapas_despacho la incluye desde la 0022.)

create or replace function public.ruta_por_entrega() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_pedido record;
  v_texto text;
begin
  -- Una entrega de una propuesta cambió: la propuesta queda desactualizada.
  update public.rutas ru set desactualizada = true
  from public.ruta_paradas rp
  where rp.entrega_id = new.id and ru.id = rp.ruta_id and ru.estado = 'propuesta' and not ru.desactualizada;

  -- Una entrega nueva lista para un día con propuesta: la propuesta queda desactualizada.
  if new.estado = 'lista' and (tg_op = 'INSERT' or old.estado is distinct from 'lista' or old.fecha_acordada is distinct from new.fecha_acordada) then
    update public.rutas set desactualizada = true where fecha = new.fecha_acordada and estado = 'propuesta' and not desactualizada;
  end if;

  if tg_op = 'UPDATE' and old.estado in ('confirmada', 'en_camino') then
    v_texto := case
      when new.estado = 'cancelada' then 'se canceló' || coalesce(' (' || nullif(split_part(coalesce(new.notas, ''), E'\n', -1), '') || ')', '')
      when (new.direccion, new.piso_depto, new.localidad) is distinct from (old.direccion, old.piso_depto, old.localidad) then 'cambió la dirección'
      when new.franja_desde is distinct from old.franja_desde or new.franja_hasta is distinct from old.franja_hasta then 'cambió la franja'
    end;
    if v_texto is not null then
      select p.numero, c.nombre into v_pedido from public.pedidos p join public.clientes c on c.id = p.cliente_id where p.id = new.pedido_id;
      for r in select ru.id, ru.fecha from public.rutas ru join public.ruta_paradas rp on rp.ruta_id = ru.id
               where rp.entrega_id = new.id and ru.estado in ('confirmada', 'en_curso') loop
        update public.rutas set con_cambios = concat_ws(' · ', nullif(con_cambios, ''), '#' || v_pedido.numero || ' ' || v_texto) where id = r.id;
        insert into public.notificaciones (usuario_id, tipo, titulo, cuerpo, link, clave)
        select q.id, 'ruta_cambio', 'Cambio en una ruta confirmada · #' || v_pedido.numero || ' ' || v_pedido.nombre,
               upper(left(v_texto, 1)) || substr(v_texto, 2) || '. Revisá la ruta del ' || to_char(r.fecha, 'DD/MM') || ': deshacé la confirmación y volvé a proponer.',
               '/entregas/planificar?fecha=' || r.fecha, 'ruta-cambio:' || new.id || ':' || md5(v_texto) || ':' || q.id
        from public.equipo q where q.activo and q.rol = 'admin'
        on conflict (clave) do nothing;
      end loop;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists entregas_ruta on public.entregas;
create trigger entregas_ruta after insert or update on public.entregas
  for each row execute function public.ruta_por_entrega();

-- En una ruta confirmada, la entrega sí registra los cambios de dirección del pedido (para avisar).
create or replace function public.entrega_desde_pedido_confirmada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.direccion_entrega is distinct from old.direccion_entrega and nullif(trim(new.direccion_entrega), '') is not null then
    update public.entregas set direccion = trim(new.direccion_entrega)
    where pedido_id = new.id and estado in ('confirmada', 'en_camino') and tipo = 'cliente';
  end if;
  return new;
end $$;
drop trigger if exists pedidos_entrega_confirmada on public.pedidos;
create trigger pedidos_entrega_confirmada after update of direccion_entrega on public.pedidos
  for each row execute function public.entrega_desde_pedido_confirmada();
