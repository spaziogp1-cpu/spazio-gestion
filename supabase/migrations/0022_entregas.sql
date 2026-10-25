-- =====================================================================
-- Spazio Design · Gestión · Entregas (etapa 1: datos y lista)
--  - Cuando un pedido llega a la etapa que habilita el despacho (Embalada por
--    defecto, se cambia en Ajustes) y va por flete, a coordinar o por expreso,
--    se crea su entrega. Nunca dos abiertas para el mismo pedido.
--  - Cada entrega tiene la dirección, su ubicación en el mapa, quién recibe,
--    fecha y franja, acceso (piso, ascensor, ayuda) y la carga calculada.
--  - Si falta algo, queda en "Revisar" con los motivos; si está completa,
--    queda "Lista" para planificar.
--  - Si el pedido se cancela, pasa a "retira" o vuelve a producción, la
--    entrega se cancela; todo queda en el historial de la entrega.
--
-- Se ejecuta una sola vez en Supabase → SQL Editor → "Run". Se puede correr de nuevo.
-- =====================================================================

insert into public.parametros (clave, valor, nota) values
  ('entregas_etapa_despacho', 'embalada', 'Etapa desde la que un pedido entra a Entregas: lista (Fabricada) o embalada'),
  ('deposito_direccion', 'Belaustegui 355, Villa Crespo, CABA', 'Desde dónde salen los repartos'),
  ('deposito_lat', '', 'Latitud del depósito (se completa sola al ubicarlo)'),
  ('deposito_lng', '', 'Longitud del depósito'),
  ('entregas_unidades', '{"mesa ratona":1,"mesa auxiliar":0.5,"mesa de luz":0.5,"espejos":0.5,"escritorio":2,"mesa alta":2,"mesa alta grande":3,"sillas":0.25,"taburete":0.25,"estanteria":2,"otro":1}',
   'Unidades de carga por producto (1 = una mesa ratona). "mesa alta grande": más larga que entregas_largo_grande'),
  ('entregas_largo_grande', '160', 'Desde qué largo (cm) una mesa alta cuenta como grande'),
  ('entregas_tiempos', '{"base":15,"por_unidad":10,"por_piso":5,"instalacion":20}',
   'Minutos en cada parada: base, por unidad de carga, por piso sin ascensor y por instalación')
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------
create table if not exists public.entregas (
  id                  uuid primary key default gen_random_uuid(),
  pedido_id           uuid not null references public.pedidos(id) on delete cascade,
  intento             integer not null default 1,
  estado              text not null default 'revisar'
                        check (estado in ('revisar','lista','propuesta','confirmada','en_camino','entregada','no_entregada','cancelada')),
  tipo                text not null default 'cliente' check (tipo in ('cliente','expreso')),
  -- Destino (el cliente o la sucursal del expreso)
  direccion           text,
  piso_depto          text,
  localidad           text,
  codigo_postal       text,
  lat                 double precision,
  lng                 double precision,
  place_id            text,
  direccion_google    text,             -- cómo la entendió Google
  precision           text check (precision in ('exacta','aproximada','no_encontrada')),
  ubicacion_confirmada boolean not null default false,
  expreso_nombre      text,
  -- Quién recibe y cuándo
  recibe_nombre       text,
  recibe_telefono     text,
  fecha_acordada      date,
  franja_desde        time,
  franja_hasta        time,
  -- Acceso
  ascensor            text check (ascensor in ('si','no','no_sabe')),
  acceso_notas        text,
  ayuda_descarga      boolean not null default false,
  instalacion         boolean not null default false,
  -- Carga y tiempos (se calculan; los "manual" pisan el cálculo)
  unidades            numeric(6,2) not null default 1,
  unidades_manual     numeric(6,2),
  minutos             integer not null default 25,
  personas            integer not null default 1,
  personas_manual     integer check (personas_manual between 1 and 4),
  motivos             text[] not null default '{}',
  motivo_no_entrega   text,
  notas               text,
  cerrada_en          timestamptz,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now()
);
create unique index if not exists entregas_una_abierta on public.entregas (pedido_id)
  where estado not in ('entregada','no_entregada','cancelada');
create index if not exists entregas_estado on public.entregas (estado, fecha_acordada);

create table if not exists public.entrega_eventos (
  id          uuid primary key default gen_random_uuid(),
  entrega_id  uuid not null references public.entregas(id) on delete cascade,
  tipo        text not null,            -- creada, estado, cambio, ubicada, cancelada…
  detalle     text,
  por_id      uuid references public.equipo(id),
  por_texto   text,                     -- "Sistema", "Fletero"…
  creado_en   timestamptz not null default now()
);
create index if not exists entrega_eventos_entrega on public.entrega_eventos (entrega_id, creado_en);

alter table public.entregas enable row level security;
alter table public.entrega_eventos enable row level security;
drop policy if exists entregas_todo on public.entregas;
create policy entregas_todo on public.entregas for all to authenticated using (public.es_equipo()) with check (public.es_equipo());
drop policy if exists entrega_eventos_todo on public.entrega_eventos;
create policy entrega_eventos_todo on public.entrega_eventos for all to authenticated using (public.es_equipo()) with check (public.es_equipo());

-- ---------------------------------------------------------------------
-- Cálculos
-- ---------------------------------------------------------------------
create or replace function public.entrega_quien() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.equipo where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) and activo limit 1
$$;

-- Unidades de carga de un pedido (1 = una mesa ratona), con la tabla de Ajustes.
create or replace function public.entrega_unidades(p_pedido uuid) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  t jsonb;
  v_grande numeric := coalesce(nullif(public.notif_param('entregas_largo_grande', '160'), '')::numeric, 160);
  v numeric;
begin
  begin
    t := public.notif_param('entregas_unidades', '{}')::jsonb;
  exception when others then
    t := '{}';
  end;
  select coalesce(sum(i.cantidad * coalesce(
           case
             when lower(i.producto) = 'mesa alta'
                  and coalesce((regexp_match(coalesce(i.medidas, ''), '(\d+(?:[.,]\d+)?)'))[1], '0')::numeric > v_grande
               then (t ->> 'mesa alta grande')::numeric
             else (t ->> lower(trim(i.producto)))::numeric
           end, (t ->> 'otro')::numeric, 1)), 0)
    into v
  from public.pedido_items i where i.pedido_id = p_pedido;
  return greatest(v, 0.25);
end $$;

-- Completa carga, minutos, personas y motivos antes de guardar la entrega.
create or replace function public.entrega_completar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t jsonb;
  m text[] := '{}';
  v_envio text;
  v_piso integer;
  v_alta boolean;
begin
  -- Si cambió la dirección y no se mandó una ubicación nueva, la anterior ya no vale.
  if tg_op = 'UPDATE'
     and (new.direccion, new.localidad, new.codigo_postal) is distinct from (old.direccion, old.localidad, old.codigo_postal)
     and new.lat is not distinct from old.lat then
    new.lat := null; new.lng := null; new.place_id := null; new.direccion_google := null;
    new.precision := null; new.ubicacion_confirmada := false;
  end if;

  begin
    t := public.notif_param('entregas_tiempos', '{}')::jsonb;
  exception when others then
    t := '{}';
  end;
  new.unidades := coalesce(new.unidades_manual, public.entrega_unidades(new.pedido_id));
  v_piso := coalesce((regexp_match(coalesce(new.piso_depto, ''), '(\d+)'))[1]::integer, 0);
  new.minutos := round(coalesce((t ->> 'base')::numeric, 15)
                 + coalesce((t ->> 'por_unidad')::numeric, 10) * new.unidades
                 + case when coalesce(new.ascensor, 'no_sabe') <> 'si' then coalesce((t ->> 'por_piso')::numeric, 5) * least(v_piso, 20) else 0 end
                 + case when new.instalacion then coalesce((t ->> 'instalacion')::numeric, 20) else 0 end);
  select exists (select 1 from public.pedido_items i where i.pedido_id = new.pedido_id and lower(i.producto) = 'mesa alta') into v_alta;
  new.personas := coalesce(new.personas_manual,
                    case when new.instalacion or new.ayuda_descarga or v_alta or new.unidades >= 2 then 2 else 1 end);

  select envio into v_envio from public.pedidos where id = new.pedido_id;
  if new.tipo = 'expreso' and coalesce(trim(new.expreso_nombre), '') = '' then m := m || 'Falta qué expreso eligió el cliente'::text; end if;
  if coalesce(trim(new.direccion), '') = '' then
    m := m || (case when new.tipo = 'expreso' then 'Falta la dirección de la sucursal del expreso' else 'Falta la dirección' end)::text;
  elsif new.direccion !~ '\d' then
    m := m || 'La dirección no tiene número'::text;
  elsif new.lat is null then
    m := m || 'Falta ubicarla en el mapa'::text;
  elsif new.precision <> 'exacta' and not new.ubicacion_confirmada then
    m := m || 'Google la ubicó de forma aproximada: confirmá la ubicación'::text;
  end if;
  if new.tipo = 'cliente' and length(regexp_replace(coalesce(new.recibe_telefono, ''), '\D', '', 'g')) < 8 then
    m := m || 'Falta el teléfono de quien recibe'::text;
  end if;
  if new.fecha_acordada is null then m := m || 'Falta la fecha acordada'::text; end if;
  if new.franja_desde is null or new.franja_hasta is null then
    m := m || (case when new.tipo = 'expreso' then 'Falta el horario de recepción del expreso' else 'Falta la franja horaria' end)::text;
  elsif new.franja_hasta <= new.franja_desde then
    m := m || 'La franja horaria termina antes de empezar'::text;
  end if;
  if v_envio = 'coordinar' then m := m || 'El envío está "a coordinar": definí si va por flete o retira'::text; end if;
  new.motivos := m;

  if new.estado in ('revisar', 'lista') then
    new.estado := case when cardinality(m) = 0 then 'lista' else 'revisar' end;
  end if;
  if new.estado in ('entregada', 'no_entregada', 'cancelada') and new.cerrada_en is null then new.cerrada_en := now(); end if;
  return new;
end $$;

drop trigger if exists entregas_completar on public.entregas;
create trigger entregas_completar before insert or update on public.entregas
  for each row execute function public.entrega_completar();
drop trigger if exists entregas_actualizado on public.entregas;
create trigger entregas_actualizado before update on public.entregas
  for each row execute function public.tocar_actualizado_en();

-- Historial: cada cambio de estado queda registrado.
create or replace function public.entrega_historial() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n text[] := array['revisar','lista','propuesta','confirmada','en_camino','entregada','no_entregada','cancelada'];
  e text[] := array['Revisar','Lista para planificar','En propuesta','Confirmada','En camino','Entregada','No entregada','Cancelada'];
  v_quien uuid := public.entrega_quien();
begin
  if tg_op = 'INSERT' then
    insert into public.entrega_eventos (entrega_id, tipo, detalle, por_id, por_texto)
    values (new.id, 'creada', 'Entrega creada (intento ' || new.intento || ') · ' || e[array_position(n, new.estado)],
            v_quien, case when v_quien is null then 'Sistema' end);
  elsif new.estado is distinct from old.estado then
    insert into public.entrega_eventos (entrega_id, tipo, detalle, por_id, por_texto)
    values (new.id, 'estado', e[array_position(n, old.estado)] || ' → ' || e[array_position(n, new.estado)]
              || coalesce(': ' || nullif(new.motivo_no_entrega, ''), ''),
            v_quien, case when v_quien is null then 'Sistema' end);
  end if;
  return new;
end $$;
drop trigger if exists entregas_historial on public.entregas;
create trigger entregas_historial after insert or update of estado on public.entregas
  for each row execute function public.entrega_historial();

-- ---------------------------------------------------------------------
-- Alta y baja automáticas desde el pedido
-- ---------------------------------------------------------------------
create or replace function public.entrega_etapas_despacho() returns text[]
language sql stable security definer set search_path = public as $$
  select case public.notif_param('entregas_etapa_despacho', 'embalada')
    when 'lista' then array['lista','embalada','envio_coordinado']
    else array['embalada','envio_coordinado'] end
$$;

-- Crea la entrega de un pedido si corresponde y no hay una abierta (ni una ya entregada).
create or replace function public.entrega_crear(p_pedido uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  p public.pedidos%rowtype;
  c public.clientes%rowtype;
  v_id uuid;
begin
  select * into p from public.pedidos where id = p_pedido;
  if not found or p.envio not in ('flete','coordinar','expreso') or not (p.etapa = any (public.entrega_etapas_despacho())) then return null; end if;
  if exists (select 1 from public.entregas where pedido_id = p_pedido and estado not in ('no_entregada','cancelada')) then return null; end if;
  select * into c from public.clientes where id = p.cliente_id;
  insert into public.entregas (pedido_id, intento, tipo, direccion, localidad, codigo_postal, recibe_nombre, recibe_telefono, fecha_acordada)
  values (p.id,
          (select count(*) + 1 from public.entregas where pedido_id = p.id),
          case when p.envio = 'expreso' then 'expreso' else 'cliente' end,
          case when p.envio = 'expreso' then null else coalesce(nullif(trim(p.direccion_entrega), ''), nullif(trim(c.direccion), '')) end,
          case when p.envio = 'expreso' then null else c.localidad end,
          case when p.envio = 'expreso' then null else c.codigo_postal end,
          c.nombre, c.telefono, p.fecha_entrega_programada)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.entrega_desde_pedido() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  e public.entregas%rowtype;
  v_motivo text;
begin
  select * into e from public.entregas
  where pedido_id = new.id and estado not in ('entregada','no_entregada','cancelada') limit 1;

  if e.id is not null then
    -- Lo marcaron Entregado desde el pedido: la entrega se cierra igual.
    if new.etapa = 'entregado' then
      update public.entregas set estado = 'entregada' where id = e.id;
      return new;
    end if;
    v_motivo := case
      when new.etapa = 'cancelado' then 'Se canceló el pedido'
      when new.envio = 'retira' then 'El cliente retira en el showroom'
      when not (new.etapa = any (public.entrega_etapas_despacho())) then 'El pedido volvió a ' || case new.etapa when 'senado' then 'Señado'
             when 'en_fabricacion' then 'En fabricación' when 'lista' then 'Fabricada' else new.etapa end
    end;
    if v_motivo is not null then
      update public.entregas set estado = 'cancelada', notas = concat_ws(E'\n', nullif(notas, ''), v_motivo) where id = e.id;
      insert into public.entrega_eventos (entrega_id, tipo, detalle, por_texto) values (e.id, 'cancelada', v_motivo, 'Sistema');
      return new;
    end if;
    -- Cambios del pedido que tocan la entrega (solo si todavía no está en una ruta).
    if e.estado in ('revisar', 'lista') then
      if tg_op = 'UPDATE' and new.direccion_entrega is distinct from old.direccion_entrega and e.tipo = 'cliente'
         and nullif(trim(new.direccion_entrega), '') is not null then
        update public.entregas set direccion = trim(new.direccion_entrega) where id = e.id;
        insert into public.entrega_eventos (entrega_id, tipo, detalle, por_texto) values (e.id, 'cambio', 'Cambió la dirección en el pedido', 'Sistema');
      end if;
      if tg_op = 'UPDATE' and new.fecha_entrega_programada is distinct from old.fecha_entrega_programada
         and (e.fecha_acordada is null or e.fecha_acordada = old.fecha_entrega_programada) then
        update public.entregas set fecha_acordada = new.fecha_entrega_programada where id = e.id;
      end if;
      if tg_op = 'UPDATE' and new.envio is distinct from old.envio then
        update public.entregas set tipo = case when new.envio = 'expreso' then 'expreso' else 'cliente' end where id = e.id;
      end if;
    end if;
    return new;
  end if;

  perform public.entrega_crear(new.id);
  return new;
end $$;

drop trigger if exists pedidos_entrega on public.pedidos;
create trigger pedidos_entrega after insert or update of etapa, envio, direccion_entrega, fecha_entrega_programada on public.pedidos
  for each row execute function public.entrega_desde_pedido();

-- Si cambian los productos, se recalcula la carga.
create or replace function public.entrega_por_items() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.entregas set actualizado_en = now()
  where pedido_id = coalesce(new.pedido_id, old.pedido_id) and estado in ('revisar', 'lista');
  return null;
end $$;
drop trigger if exists pedido_items_entrega on public.pedido_items;
create trigger pedido_items_entrega after insert or update or delete on public.pedido_items
  for each row execute function public.entrega_por_items();

-- Si cambian los Ajustes (tabla de unidades o tiempos), se recalculan las abiertas.
create or replace function public.entregas_recalcular() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.entregas set actualizado_en = now() where estado in ('revisar', 'lista');
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.entregas_recalcular() to authenticated;

-- Pedidos que ya están en la etapa de despacho: se crean sus entregas ahora.
select count(public.entrega_crear(p.id)) as entregas_creadas
from public.pedidos p
where p.envio in ('flete','coordinar','expreso') and p.etapa = any (public.entrega_etapas_despacho());

revoke all on function public.entrega_crear(uuid) from public, anon;
grant execute on function public.entrega_crear(uuid) to authenticated, service_role;
revoke all on function public.entregas_recalcular() from public, anon;
