-- =====================================================================
-- Spazio Design · Gestión · Gift cards
--  - Página pública /gift-card: el cliente pide la tarjeta (monto, ocasión,
--    Para/De, dedicatoria, fecha de inicio). Queda "pendiente de pago" con una
--    referencia GC-1001 y le llega un aviso a todo el equipo.
--  - Spazio le escribe por WhatsApp con los datos para transferir. Cuando un
--    admin confirma que la transferencia está acreditada (en el home banking,
--    nunca solo por el comprobante), se emite la tarjeta con un código
--    SPZ-XXXX-XXXX. El código se guarda cifrado (hash): se ve una sola vez.
--  - El saldo es la suma de los movimientos (emisión, canjes, reintegros).
--    Los canjes bloquean la tarjeta mientras descuentan: no se puede gastar dos veces.
--  - Vence el mismo día 3 meses después (o el último día del mes) a las 23:59.
--    Se puede prorrogar 30 días gratis si se pide dentro de los 30 días del vencimiento.
--  - Pedidos desde $3.000.000 quedan "en revisión".
--
-- Se ejecuta una sola vez en Supabase → SQL Editor → "Run". Se puede correr de nuevo.
-- Necesita la 0017 (avisos) y la 0021 (parámetros del showroom).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

insert into public.parametros (clave, valor, nota) values
  ('gc_activa', 'si', 'Venta de gift cards en la página pública: si / no'),
  ('gc_whatsapp', '1170609239', 'WhatsApp de Spazio que se muestra al pedir una gift card'),
  ('gc_alias', '', 'Alias para transferir el pago de una gift card'),
  ('gc_cbu', '', 'CBU para transferir el pago de una gift card'),
  ('gc_titular', '', 'Titular de la cuenta para transferir')
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- Solicitudes (lo que pide el cliente en la página)
-- ---------------------------------------------------------------------
create sequence if not exists public.gc_numero start 1001;

create table if not exists public.gc_solicitudes (
  id                 uuid primary key default gen_random_uuid(),
  numero             integer not null unique default nextval('public.gc_numero'),
  token              text not null unique,
  estado             text not null default 'pendiente_pago'
                       check (estado in ('pendiente_pago', 'en_revision', 'emitida', 'cancelada')),
  monto              numeric(14,2) not null check (monto >= 50000 and mod(monto, 10000) = 0),
  ocasion            text not null default 'sin_ocasion',
  para_nombre        text not null,
  para_email         text,
  para_telefono      text,
  de_nombre          text not null,
  dedicatoria        text,
  comprador_nombre   text not null,
  comprador_email    text not null,
  comprador_telefono text not null,
  fecha_inicio       date not null,
  notas              text,
  motivo_cancelacion text,
  gift_card_id       uuid,
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now()
);
create index if not exists gc_solicitudes_estado on public.gc_solicitudes (estado, creado_en desc);

-- ---------------------------------------------------------------------
-- Tarjetas emitidas
-- ---------------------------------------------------------------------
create table if not exists public.gift_cards (
  id              uuid primary key default gen_random_uuid(),
  solicitud_id    uuid references public.gc_solicitudes(id),
  codigo_hash     text not null unique,
  codigo_fin      text not null,               -- últimos 4 caracteres, para reconocerla
  monto_inicial   numeric(14,2) not null check (monto_inicial > 0),
  ocasion         text not null default 'sin_ocasion',
  para_nombre     text not null,
  para_email      text,
  para_telefono   text,
  de_nombre       text not null,
  dedicatoria     text,
  inicio          date not null,
  vence           date not null,               -- último día para pedir (hasta las 23:59)
  prorrogada      boolean not null default false,
  estado          text not null default 'activa' check (estado in ('activa', 'anulada')),
  acreditada_el   date not null,
  emitida_por     uuid references public.equipo(id),
  creado_en       timestamptz not null default now()
);
create index if not exists gift_cards_fin on public.gift_cards (codigo_fin);

do $$ begin
  alter table public.gc_solicitudes
    add constraint gc_solicitudes_card_fk foreign key (gift_card_id) references public.gift_cards(id);
exception when duplicate_object then null; end $$;

-- Movimientos: el saldo es la suma. Emisión y reintegros suman; canjes restan.
create table if not exists public.gift_card_movimientos (
  id              uuid primary key default gen_random_uuid(),
  gift_card_id    uuid not null references public.gift_cards(id),
  tipo            text not null check (tipo in ('emision', 'canje', 'reintegro', 'ajuste')),
  monto           numeric(14,2) not null check (monto <> 0),
  pedido_id       uuid references public.pedidos(id),
  nota            text,
  clave           text unique,                 -- evita registrar dos veces el mismo canje
  creado_por      uuid references public.equipo(id),
  creado_en       timestamptz not null default now()
);
create index if not exists gc_mov_card on public.gift_card_movimientos (gift_card_id, creado_en);
create index if not exists gc_mov_pedido on public.gift_card_movimientos (pedido_id) where pedido_id is not null;

alter table public.gc_solicitudes        enable row level security;
alter table public.gift_cards            enable row level security;
alter table public.gift_card_movimientos enable row level security;
-- El equipo lee todo; los cambios pasan siempre por las funciones de abajo.
drop policy if exists gc_solicitudes_lee on public.gc_solicitudes;
drop policy if exists gift_cards_lee on public.gift_cards;
drop policy if exists gc_mov_lee on public.gift_card_movimientos;
create policy gc_solicitudes_lee on public.gc_solicitudes for select to authenticated using (public.es_equipo());
create policy gift_cards_lee on public.gift_cards for select to authenticated using (public.es_equipo());
create policy gc_mov_lee on public.gift_card_movimientos for select to authenticated using (public.es_equipo());

create or replace view public.gift_cards_saldo with (security_invoker = true) as
select g.*,
       coalesce((select sum(m.monto) from public.gift_card_movimientos m where m.gift_card_id = g.id), 0) as saldo,
       ('SPZ-····-' || g.codigo_fin) as codigo_visible
from public.gift_cards g;

-- ---------------------------------------------------------------------
-- Ayudas
-- ---------------------------------------------------------------------
create or replace function public.gc_hash(p_codigo text) returns text
language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(convert_to(upper(regexp_replace(coalesce(p_codigo, ''), '[^0-9A-Za-z]', '', 'g')), 'UTF8'), 'sha256'), 'hex')
$$;

-- "spz-k7q4 m9xd" → "SPZK7Q4M9XD"; null si no tiene la forma de un código.
create or replace function public.gc_normalizar(p_codigo text) returns text
language plpgsql immutable as $$
declare v text := upper(regexp_replace(coalesce(p_codigo, ''), '[^0-9A-Za-z]', '', 'g'));
begin
  if left(v, 3) = 'SPZ' then v := substr(v, 4); end if;
  if v !~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$' then return null; end if;
  return 'SPZ' || v;
end $$;

-- Mismo día N meses después; si no existe, el último día del mes (Postgres lo hace solo).
create or replace function public.gc_vence(p_inicio date, p_meses integer default 3) returns date
language sql immutable as $$
  select (p_inicio + make_interval(months => p_meses))::date
$$;

create or replace function public.gc_vencida(p_vence date) returns boolean
language sql stable as $$
  select public.hoy_ar() > p_vence
$$;

-- ---------------------------------------------------------------------
-- Lo que ve la página pública
-- ---------------------------------------------------------------------
create or replace function public.gc_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'activa', public.notif_param('gc_activa', 'si') = 'si',
    'whatsapp', public.notif_param('gc_whatsapp', public.notif_param('showroom_whatsapp', '')),
    'hoy', public.hoy_ar())
$$;

-- El cliente pide una gift card. Devuelve la referencia y un token para su página.
create or replace function public.gc_crear_solicitud(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_monto   numeric;
  v_inicio  date;
  v_hoy     date := public.hoy_ar();
  v_ocasion text := coalesce(nullif(p ->> 'ocasion', ''), 'sin_ocasion');
  v_para    text := left(trim(coalesce(p ->> 'para_nombre', '')), 80);
  v_de      text := left(trim(coalesce(p ->> 'de_nombre', '')), 80);
  v_comp    text := left(trim(coalesce(p ->> 'comprador_nombre', '')), 120);
  v_cemail  text := lower(left(trim(coalesce(p ->> 'comprador_email', '')), 160));
  v_ctel    text := left(trim(coalesce(p ->> 'comprador_telefono', '')), 40);
  v_pemail  text := nullif(lower(left(trim(coalesce(p ->> 'para_email', '')), 160)), '');
  v_ptel    text := nullif(left(trim(coalesce(p ->> 'para_telefono', '')), 40), '');
  v_ded     text := nullif(left(trim(coalesce(p ->> 'dedicatoria', '')), 240), '');
  v_estado  text := 'pendiente_pago';
  v_token   text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_id      uuid;
  v_numero  integer;
begin
  if public.notif_param('gc_activa', 'si') <> 'si' then raise exception 'Por ahora no estamos vendiendo gift cards online. Escribinos por WhatsApp.'; end if;
  begin
    v_monto := (p ->> 'monto')::numeric;
  exception when others then
    raise exception 'Elegí o escribí un monto';
  end;
  if v_monto is null or v_monto < 50000 then raise exception 'El monto mínimo es $50.000'; end if;
  if mod(v_monto, 10000) <> 0 then raise exception 'El monto tiene que ser múltiplo de $10.000'; end if;
  begin
    v_inicio := coalesce(nullif(p ->> 'fecha_inicio', '')::date, v_hoy);
  exception when others then
    raise exception 'La fecha de inicio no es válida';
  end;
  if v_inicio < v_hoy then v_inicio := v_hoy; end if;
  if v_inicio > v_hoy + 60 then raise exception 'La fecha de inicio puede ser hasta 60 días desde hoy'; end if;
  if v_ocasion not in ('sin_ocasion', 'casamiento', 'cumpleanos', 'casa_nueva', 'aniversario', 'nacimiento', 'fiestas', 'agradecimiento') then
    v_ocasion := 'sin_ocasion';
  end if;
  if length(v_para) < 2 then raise exception 'Escribí para quién es la gift card'; end if;
  if length(v_de) < 2 then raise exception 'Escribí de parte de quién es'; end if;
  if length(v_comp) < 2 then raise exception 'Escribí tu nombre'; end if;
  if v_cemail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Tu email no es válido'; end if;
  if length(regexp_replace(v_ctel, '\D', '', 'g')) < 8 then raise exception 'Escribí tu WhatsApp (con característica)'; end if;
  if v_pemail is null and v_ptel is null then raise exception 'Escribí el email o el WhatsApp de quien la recibe'; end if;
  if v_pemail is not null and v_pemail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'El email de quien la recibe no es válido'; end if;
  if v_ptel is not null and length(regexp_replace(v_ptel, '\D', '', 'g')) < 8 then raise exception 'El WhatsApp de quien la recibe no es válido'; end if;

  -- Freno simple a pedidos repetidos: hasta 5 pendientes por WhatsApp.
  if (select count(*) from public.gc_solicitudes s
      where s.estado in ('pendiente_pago', 'en_revision')
        and right(regexp_replace(s.comprador_telefono, '\D', '', 'g'), 8) = right(regexp_replace(v_ctel, '\D', '', 'g'), 8)) >= 5 then
    raise exception 'Ya tenés varias gift cards pendientes de pago. Escribinos por WhatsApp y lo resolvemos.';
  end if;

  if v_monto >= 3000000 then v_estado := 'en_revision'; end if;

  insert into public.gc_solicitudes (token, estado, monto, ocasion, para_nombre, para_email, para_telefono, de_nombre,
                                     dedicatoria, comprador_nombre, comprador_email, comprador_telefono, fecha_inicio)
  values (v_token, v_estado, v_monto, v_ocasion, v_para, v_pemail, v_ptel, v_de, v_ded, v_comp, v_cemail, v_ctel, v_inicio)
  returning id, numero into v_id, v_numero;

  insert into public.notificaciones (usuario_id, tipo, titulo, cuerpo, link, clave)
  select q.id, 'gift_card',
         'Gift card pedida: GC-' || v_numero || ' · ' || '$' || replace(to_char(v_monto, 'FM999,999,999,990'), ',', '.') || ' · ' || v_comp,
         concat_ws(' · ', 'Para ' || v_para, v_ctel,
           case when v_estado = 'en_revision' then 'Monto alto: en revisión' else 'Hay que pasarle los datos para transferir' end),
         '/gift-cards#solicitud-' || v_id,
         'gc:' || v_id || ':' || q.id
  from public.equipo q where q.activo
  on conflict (clave) do nothing;

  return jsonb_build_object('token', v_token, 'referencia', 'GC-' || v_numero, 'estado', v_estado);
end $$;

-- Lo que ve quien compró en su página de pedido.
create or replace function public.gc_solicitud_por_token(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('referencia', 'GC-' || s.numero, 'estado', s.estado, 'monto', s.monto, 'ocasion', s.ocasion,
                            'para_nombre', s.para_nombre, 'de_nombre', s.de_nombre, 'dedicatoria', s.dedicatoria,
                            'comprador_nombre', s.comprador_nombre, 'fecha_inicio', s.fecha_inicio, 'creado_en', s.creado_en,
                            'whatsapp', public.notif_param('gc_whatsapp', public.notif_param('showroom_whatsapp', '')))
  from public.gc_solicitudes s where s.token = p_token and length(p_token) >= 40
$$;

-- Consulta de saldo con el código (página pública y app).
create or replace function public.gc_saldo(p_codigo text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_norm text := public.gc_normalizar(p_codigo);
  g public.gift_cards%rowtype;
  v_saldo numeric;
begin
  if v_norm is null then return null; end if;
  select * into g from public.gift_cards where codigo_hash = public.gc_hash(v_norm);
  if not found then return null; end if;
  select coalesce(sum(monto), 0) into v_saldo from public.gift_card_movimientos where gift_card_id = g.id;
  return jsonb_build_object(
    'para_nombre', g.para_nombre, 'de_nombre', g.de_nombre, 'ocasion', g.ocasion, 'dedicatoria', g.dedicatoria,
    'monto_inicial', g.monto_inicial, 'saldo', v_saldo, 'inicio', g.inicio, 'vence', g.vence,
    'estado', case when g.estado = 'anulada' then 'anulada'
                   when public.gc_vencida(g.vence) then 'vencida'
                   when g.inicio > public.hoy_ar() then 'todavia_no'
                   when v_saldo <= 0 then 'usada'
                   else 'activa' end,
    'codigo_fin', g.codigo_fin);
end $$;

-- ---------------------------------------------------------------------
-- Lo que hace el equipo
-- ---------------------------------------------------------------------
create or replace function public.gc_miembro() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.equipo where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')) and activo
$$;

-- Un admin confirma la transferencia acreditada y se emite la tarjeta.
-- Devuelve el código completo: es la única vez que se puede ver.
create or replace function public.gc_emitir(p_solicitud uuid, p_acreditada date) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  s public.gc_solicitudes%rowtype;
  v_alf text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes bytea;
  v_cod text;
  v_inicio date;
  v_vence date;
  v_card uuid;
  i integer;
  intento integer := 0;
begin
  if not public.es_admin() then raise exception 'Solo un admin puede confirmar pagos y emitir gift cards'; end if;
  if p_acreditada is null or p_acreditada > public.hoy_ar() then raise exception 'Poné la fecha en que se acreditó la transferencia'; end if;
  select * into s from public.gc_solicitudes where id = p_solicitud for update;
  if not found then raise exception 'No encontramos la solicitud'; end if;
  if s.estado = 'emitida' then raise exception 'Esta gift card ya se emitió'; end if;
  if s.estado = 'cancelada' then raise exception 'Esta solicitud está cancelada'; end if;

  loop
    intento := intento + 1;
    v_bytes := extensions.gen_random_bytes(8);
    v_cod := '';
    for i in 0..7 loop
      v_cod := v_cod || substr(v_alf, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.gift_cards where codigo_hash = public.gc_hash('SPZ' || v_cod));
    if intento > 5 then raise exception 'No se pudo generar el código, probá de nuevo'; end if;
  end loop;

  v_inicio := greatest(s.fecha_inicio, p_acreditada);
  v_vence := public.gc_vence(v_inicio, 3);

  insert into public.gift_cards (solicitud_id, codigo_hash, codigo_fin, monto_inicial, ocasion, para_nombre, para_email,
                                 para_telefono, de_nombre, dedicatoria, inicio, vence, acreditada_el, emitida_por)
  values (s.id, public.gc_hash('SPZ' || v_cod), right(v_cod, 4), s.monto, s.ocasion, s.para_nombre, s.para_email,
          s.para_telefono, s.de_nombre, s.dedicatoria, v_inicio, v_vence, p_acreditada, public.gc_miembro())
  returning id into v_card;

  insert into public.gift_card_movimientos (gift_card_id, tipo, monto, nota, clave, creado_por)
  values (v_card, 'emision', s.monto, 'GC-' || s.numero || ' · transferencia acreditada el ' || to_char(p_acreditada, 'DD/MM/YYYY'),
          'emision:' || s.id, public.gc_miembro());

  update public.gc_solicitudes set estado = 'emitida', gift_card_id = v_card, actualizado_en = now() where id = s.id;

  return jsonb_build_object('codigo', 'SPZ-' || left(v_cod, 4) || '-' || right(v_cod, 4), 'gift_card_id', v_card,
                            'inicio', v_inicio, 'vence', v_vence, 'monto', s.monto);
end $$;

-- Si hay que reenviarla y nadie guardó el código: se genera uno nuevo y el anterior deja de servir.
create or replace function public.gc_nuevo_codigo(p_card uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_alf text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes bytea;
  v_cod text;
  i integer;
begin
  if not public.es_admin() then raise exception 'Solo un admin puede generar un código nuevo'; end if;
  perform 1 from public.gift_cards where id = p_card for update;
  if not found then raise exception 'No encontramos la tarjeta'; end if;
  loop
    v_bytes := extensions.gen_random_bytes(8);
    v_cod := '';
    for i in 0..7 loop
      v_cod := v_cod || substr(v_alf, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.gift_cards where codigo_hash = public.gc_hash('SPZ' || v_cod));
  end loop;
  update public.gift_cards set codigo_hash = public.gc_hash('SPZ' || v_cod), codigo_fin = right(v_cod, 4) where id = p_card;
  return jsonb_build_object('codigo', 'SPZ-' || left(v_cod, 4) || '-' || right(v_cod, 4));
end $$;

-- Descontar saldo de una tarjeta (lo hace un asesor al cerrar un pedido).
-- p_clave: identificador del intento, para que un doble clic no descuente dos veces.
create or replace function public.gc_canjear(p_codigo text, p_monto numeric, p_pedido uuid, p_nota text, p_clave text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_norm text := public.gc_normalizar(p_codigo);
  g public.gift_cards%rowtype;
  v_saldo numeric;
  v_previo public.gift_card_movimientos%rowtype;
begin
  if public.gc_miembro() is null then raise exception 'No autorizado'; end if;
  if v_norm is null then raise exception 'El código no es válido'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'Escribí cuánto se descuenta'; end if;

  if p_clave is not null then
    select * into v_previo from public.gift_card_movimientos where clave = p_clave;
    if found then
      select coalesce(sum(monto), 0) into v_saldo from public.gift_card_movimientos where gift_card_id = v_previo.gift_card_id;
      return jsonb_build_object('repetido', true, 'saldo', v_saldo);
    end if;
  end if;

  select * into g from public.gift_cards where codigo_hash = public.gc_hash(v_norm) for update;
  if not found then raise exception 'No encontramos una gift card con ese código'; end if;
  if g.estado <> 'activa' then raise exception 'Esta gift card está anulada'; end if;
  if g.inicio > public.hoy_ar() then raise exception 'Esta gift card empieza a valer el %', to_char(g.inicio, 'DD/MM/YYYY'); end if;
  if public.gc_vencida(g.vence) then raise exception 'Esta gift card venció el %', to_char(g.vence, 'DD/MM/YYYY'); end if;

  select coalesce(sum(monto), 0) into v_saldo from public.gift_card_movimientos where gift_card_id = g.id;
  if p_monto > v_saldo then raise exception 'El saldo disponible es $%', replace(to_char(v_saldo, 'FM999,999,999,990'), ',', '.'); end if;

  if p_pedido is not null and (
    select count(distinct m.gift_card_id) from public.gift_card_movimientos m
    where m.pedido_id = p_pedido and m.tipo = 'canje' and m.gift_card_id <> g.id) >= 3 then
    raise exception 'Se pueden usar hasta 3 gift cards por pedido';
  end if;

  insert into public.gift_card_movimientos (gift_card_id, tipo, monto, pedido_id, nota, clave, creado_por)
  values (g.id, 'canje', -p_monto, p_pedido, nullif(left(trim(coalesce(p_nota, '')), 300), ''), p_clave, public.gc_miembro());

  return jsonb_build_object('saldo', v_saldo - p_monto, 'descontado', p_monto, 'para_nombre', g.para_nombre);
end $$;

-- Devuelve saldo (por ejemplo, si se cancela un pedido pagado con la tarjeta).
create or replace function public.gc_reintegrar(p_card uuid, p_monto numeric, p_nota text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_saldo numeric;
begin
  if not public.es_admin() then raise exception 'Solo un admin puede reintegrar saldo'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'Escribí el monto a reintegrar'; end if;
  perform 1 from public.gift_cards where id = p_card for update;
  if not found then raise exception 'No encontramos la tarjeta'; end if;
  insert into public.gift_card_movimientos (gift_card_id, tipo, monto, nota, creado_por)
  values (p_card, 'reintegro', p_monto, nullif(left(trim(coalesce(p_nota, '')), 300), ''), public.gc_miembro());
  select coalesce(sum(monto), 0) into v_saldo from public.gift_card_movimientos where gift_card_id = p_card;
  return jsonb_build_object('saldo', v_saldo);
end $$;

-- Prórroga gratis de 30 días, una sola vez, si se pide hasta 30 días después de vencer.
create or replace function public.gc_prorrogar(p_card uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare g public.gift_cards%rowtype;
begin
  if public.gc_miembro() is null then raise exception 'No autorizado'; end if;
  select * into g from public.gift_cards where id = p_card for update;
  if not found then raise exception 'No encontramos la tarjeta'; end if;
  if g.prorrogada then raise exception 'Esta gift card ya tuvo su prórroga'; end if;
  if public.hoy_ar() > g.vence + 30 then raise exception 'Pasaron más de 30 días del vencimiento'; end if;
  update public.gift_cards set vence = greatest(g.vence, public.hoy_ar()) + 30, prorrogada = true where id = p_card;
  return jsonb_build_object('vence', greatest(g.vence, public.hoy_ar()) + 30);
end $$;

create or replace function public.gc_cancelar_solicitud(p_solicitud uuid, p_motivo text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare s public.gc_solicitudes%rowtype;
begin
  if public.gc_miembro() is null then raise exception 'No autorizado'; end if;
  select * into s from public.gc_solicitudes where id = p_solicitud for update;
  if not found then raise exception 'No encontramos la solicitud'; end if;
  if s.estado = 'emitida' then raise exception 'Ya se emitió: no se puede cancelar desde acá'; end if;
  update public.gc_solicitudes set estado = 'cancelada', motivo_cancelacion = nullif(left(trim(coalesce(p_motivo, '')), 300), ''),
         actualizado_en = now() where id = s.id;
  return jsonb_build_object('estado', 'cancelada');
end $$;

-- Pasar de "en revisión" a "pendiente de pago" (monto alto ya revisado) o anotar algo.
create or replace function public.gc_actualizar_solicitud(p_solicitud uuid, p_estado text, p_notas text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if public.gc_miembro() is null then raise exception 'No autorizado'; end if;
  if p_estado is not null and p_estado not in ('pendiente_pago', 'en_revision') then raise exception 'Estado inválido'; end if;
  update public.gc_solicitudes
     set estado = coalesce(case when estado in ('pendiente_pago', 'en_revision') then p_estado end, estado),
         notas = coalesce(p_notas, notas), actualizado_en = now()
   where id = p_solicitud;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.gc_config() from public;
revoke all on function public.gc_crear_solicitud(jsonb) from public;
revoke all on function public.gc_solicitud_por_token(text) from public;
revoke all on function public.gc_saldo(text) from public;
revoke all on function public.gc_miembro() from public;
revoke all on function public.gc_emitir(uuid, date) from public;
revoke all on function public.gc_nuevo_codigo(uuid) from public;
revoke all on function public.gc_canjear(text, numeric, uuid, text, text) from public;
revoke all on function public.gc_reintegrar(uuid, numeric, text) from public;
revoke all on function public.gc_prorrogar(uuid) from public;
revoke all on function public.gc_cancelar_solicitud(uuid, text) from public;
revoke all on function public.gc_actualizar_solicitud(uuid, text, text) from public;

grant execute on function public.gc_config() to anon, authenticated, service_role;
grant execute on function public.gc_crear_solicitud(jsonb) to anon, authenticated, service_role;
grant execute on function public.gc_solicitud_por_token(text) to anon, authenticated, service_role;
grant execute on function public.gc_saldo(text) to anon, authenticated, service_role;
grant execute on function public.gc_miembro() to authenticated, service_role;
grant execute on function public.gc_emitir(uuid, date) to authenticated, service_role;
grant execute on function public.gc_nuevo_codigo(uuid) to authenticated, service_role;
grant execute on function public.gc_canjear(text, numeric, uuid, text, text) to authenticated, service_role;
grant execute on function public.gc_reintegrar(uuid, numeric, text) to authenticated, service_role;
grant execute on function public.gc_prorrogar(uuid) to authenticated, service_role;
grant execute on function public.gc_cancelar_solicitud(uuid, text) to authenticated, service_role;
grant execute on function public.gc_actualizar_solicitud(uuid, text, text) to authenticated, service_role;
