-- =====================================================================
-- Spazio Design · Gestión interna · Entrega 1a
-- Equipo, clientes, pedidos, ítems, pagos, comentarios, archivos,
-- historial de cambios, parámetros y feriados.
--
-- Se ejecuta una sola vez en Supabase → SQL Editor → "Run".
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------

-- Fecha de hoy en Buenos Aires (la base trabaja en UTC).
create or replace function public.hoy_ar() returns date
language sql stable as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date
$$;

create or replace function public.tocar_actualizado_en() returns trigger
language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Equipo: quién puede entrar. Solo estos emails tienen acceso.
-- ---------------------------------------------------------------------
create table public.equipo (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  alias_planilla  text,                 -- cómo figura en la columna VENDEDOR
  email           text not null unique,
  telefono        text,                 -- WhatsApp, para la etapa 2
  rol             text not null default 'equipo' check (rol in ('admin','equipo')),
  activo          boolean not null default true,
  creado_en       timestamptz not null default now()
);
create unique index equipo_email_lower on public.equipo (lower(email));

-- ¿El usuario que hace la consulta es del equipo?
create or replace function public.es_equipo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.equipo
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and activo
  )
$$;

-- Usada por la pantalla de ingreso, antes de mandar el link por email.
create or replace function public.email_habilitado(p_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.equipo
    where lower(email) = lower(trim(p_email)) and activo
  )
$$;
grant execute on function public.email_habilitado(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Parámetros y feriados
-- ---------------------------------------------------------------------
create table public.parametros (
  clave  text primary key,
  valor  text not null,
  nota   text
);

insert into public.parametros (clave, valor, nota) values
  ('plazo_entrega_dias', '49', 'Días que se suman a la fecha de venta para la fecha límite'),
  ('plazo_entrega_tipo', 'corridos', 'corridos (como la planilla hoy) o habiles'),
  ('aviso_dias_antes',   '3', 'Días antes de la fecha límite para avisar (entrega 1d)');

create table public.feriados (
  fecha        date primary key,
  descripcion  text not null
);

-- Feriados nacionales que caen en el período de uso inicial.
-- Se completan/ajustan desde Configuración más adelante.
insert into public.feriados (fecha, descripcion) values
  ('2026-11-23', 'Día de la Soberanía Nacional (trasladable)'),
  ('2026-12-08', 'Inmaculada Concepción de María'),
  ('2026-12-25', 'Navidad'),
  ('2027-01-01', 'Año Nuevo')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------
create table public.clientes (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  telefono        text,
  email           text,
  dni             text,
  direccion       text,
  localidad       text,      -- columna PROVINCIA de la planilla (CABA, La Plata…)
  codigo_postal   text,
  notas           text,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index clientes_nombre on public.clientes (lower(nombre));
create index clientes_telefono on public.clientes (telefono);
create trigger clientes_actualizado before update on public.clientes
  for each row execute function public.tocar_actualizado_en();

-- ---------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------
-- Continúa la numeración de "N DE COMPRA" de la planilla (último: 541).
create sequence public.pedidos_numero_seq start with 542;

create table public.pedidos (
  id                        uuid primary key default gen_random_uuid(),
  numero                    integer not null unique default nextval('public.pedidos_numero_seq'),
  cliente_id                uuid not null references public.clientes(id),
  tipo_venta                text not null default 'minorista'
                              check (tipo_venta in ('minorista','mayorista','profesional')),
  canal                     text not null
                              check (canal in ('whatsapp','instagram','tiendanube','showroom','propia')),
  responsable_id            uuid references public.equipo(id),   -- VENDEDOR
  etapa                     text not null default 'senado'
                              check (etapa in ('senado','pedido_fabrica','en_fabricacion','lista',
                                               'cliente_avisado','envio_coordinado','entregado','cancelado')),
  fecha_venta               date not null default public.hoy_ar(),
  fecha_limite              date not null,                         -- FECHA LIMITE DE ENTREGA
  fecha_entrega_programada  date,
  fecha_entrega_real        date,                                  -- FECHA REAL DE ENTREGA
  envio                     text not null default 'coordinar'
                              check (envio in ('retira','flete','expreso','coordinar')),
  direccion_entrega         text,
  forma_pago                text,      -- transferencia, cuotas/mp, pagonube, efectivo…
  total                     numeric(14,2) not null default 0,     -- TOTAL DE COMPRA
  precio_envio_cliente      numeric(14,2) not null default 0,     -- lo que paga el cliente por el envío
  observaciones             text,
  -- Marketing (columnas PAUTA?, CAMPAÑA, DM/INBOUND de la planilla)
  pauta                     boolean,
  campana                   text,
  dm_inbound                text,
  -- Integraciones
  tiendanube_id             text unique,
  creado_por                uuid references public.equipo(id),
  creado_en                 timestamptz not null default now(),
  actualizado_en            timestamptz not null default now()
);
create index pedidos_etapa on public.pedidos (etapa);
create index pedidos_fecha_limite on public.pedidos (fecha_limite);
create index pedidos_cliente on public.pedidos (cliente_id);
create trigger pedidos_actualizado before update on public.pedidos
  for each row execute function public.tocar_actualizado_en();

-- Un renglón por producto (en la planilla, una fila por producto).
create table public.pedido_items (
  id          uuid primary key default gen_random_uuid(),
  pedido_id   uuid not null references public.pedidos(id) on delete cascade,
  producto    text not null,   -- mesa ratona, mesa alta, mesa auxiliar, mueble, vidrio…
  modelo      text,            -- DETALLE DE PRODUCTO: lucero, eclipse, gravedad…
  color       text,
  puntas      text,
  tapa        text,
  material    text,            -- 10mm, 5+5…
  medidas     text,            -- 160x90x75
  cantidad    integer not null default 1 check (cantidad > 0),
  precio      numeric(14,2),
  apto_fotos  boolean not null default false,   -- para la vista de contenido de Fede
  orden       integer not null default 0,
  creado_en   timestamptz not null default now()
);
create index pedido_items_pedido on public.pedido_items (pedido_id);

create table public.pagos (
  id          uuid primary key default gen_random_uuid(),
  pedido_id   uuid not null references public.pedidos(id) on delete cascade,
  tipo        text not null check (tipo in ('sena','saldo','total','otro')),
  monto       numeric(14,2) not null check (monto > 0),
  medio       text,
  fecha       date not null default public.hoy_ar(),
  nota        text,
  creado_por  uuid references public.equipo(id),
  creado_en   timestamptz not null default now()
);
create index pagos_pedido on public.pagos (pedido_id);

-- Notas y comentarios en el pedido (las @menciones llegan en la entrega 1c).
create table public.comentarios (
  id          uuid primary key default gen_random_uuid(),
  pedido_id   uuid not null references public.pedidos(id) on delete cascade,
  autor_id    uuid references public.equipo(id),
  texto       text not null check (length(trim(texto)) > 0),
  creado_en   timestamptz not null default now()
);
create index comentarios_pedido on public.comentarios (pedido_id, creado_en);

create table public.archivos (
  id          uuid primary key default gen_random_uuid(),
  pedido_id   uuid not null references public.pedidos(id) on delete cascade,
  nombre      text not null,
  ruta        text not null unique,     -- ruta dentro del bucket "archivos"
  tipo_mime   text,
  tamano      bigint,
  subido_por  uuid references public.equipo(id),
  creado_en   timestamptz not null default now()
);
create index archivos_pedido on public.archivos (pedido_id);

-- ---------------------------------------------------------------------
-- Historial de cambios (automático)
-- ---------------------------------------------------------------------
create table public.eventos (
  id              bigint generated always as identity primary key,
  entidad         text not null,    -- tabla
  entidad_id      uuid not null,
  pedido_id       uuid,             -- para mostrar todo el historial en la ficha
  accion          text not null check (accion in ('creado','modificado','eliminado')),
  campo           text,
  valor_anterior  text,
  valor_nuevo     text,
  usuario_email   text,
  creado_en       timestamptz not null default now()
);
create index eventos_pedido on public.eventos (pedido_id, creado_en desc);

create or replace function public.registrar_cambios() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_pedido uuid;
  v_email text := auth.jwt() ->> 'email';
  k text;
begin
  if tg_op = 'DELETE' then v_row := to_jsonb(old); else v_row := to_jsonb(new); end if;
  v_pedido := case when tg_table_name = 'pedidos' then (v_row ->> 'id')::uuid
                   else (v_row ->> 'pedido_id')::uuid end;

  if tg_op = 'INSERT' then
    insert into eventos (entidad, entidad_id, pedido_id, accion, usuario_email)
    values (tg_table_name, (v_row ->> 'id')::uuid, v_pedido, 'creado', v_email);
    return new;
  elsif tg_op = 'DELETE' then
    insert into eventos (entidad, entidad_id, pedido_id, accion, usuario_email)
    values (tg_table_name, (v_row ->> 'id')::uuid, v_pedido, 'eliminado', v_email);
    return old;
  end if;

  v_old := to_jsonb(old);
  v_new := to_jsonb(new);
  for k in select jsonb_object_keys(v_new) loop
    if k in ('actualizado_en', 'creado_en') then continue; end if;
    if (v_new -> k) is distinct from (v_old -> k) then
      insert into eventos (entidad, entidad_id, pedido_id, accion, campo,
                           valor_anterior, valor_nuevo, usuario_email)
      values (tg_table_name, (v_row ->> 'id')::uuid, v_pedido, 'modificado', k,
              v_old ->> k, v_new ->> k, v_email);
    end if;
  end loop;
  return new;
end $$;

create trigger pedidos_historial after insert or update or delete on public.pedidos
  for each row execute function public.registrar_cambios();
create trigger pedido_items_historial after insert or update or delete on public.pedido_items
  for each row execute function public.registrar_cambios();
create trigger pagos_historial after insert or update or delete on public.pagos
  for each row execute function public.registrar_cambios();
create trigger archivos_historial after insert or delete on public.archivos
  for each row execute function public.registrar_cambios();

-- ---------------------------------------------------------------------
-- Vista de pedidos con saldo, cliente y atraso calculados
-- ---------------------------------------------------------------------
create view public.pedidos_resumen with (security_invoker = true) as
select
  p.*,
  c.nombre    as cliente_nombre,
  c.telefono  as cliente_telefono,
  c.localidad as cliente_localidad,
  e.nombre    as responsable_nombre,
  coalesce(pg.pagado, 0)                                          as pagado,
  p.total + p.precio_envio_cliente - coalesce(pg.pagado, 0)       as saldo,
  (p.etapa in ('senado','pedido_fabrica','en_fabricacion')
     and p.fecha_limite < public.hoy_ar())                        as atrasado,
  (p.fecha_limite - public.hoy_ar())                              as dias_restantes,
  coalesce(it.resumen, '')                                        as productos
from public.pedidos p
join public.clientes c on c.id = p.cliente_id
left join public.equipo e on e.id = p.responsable_id
left join lateral (
  select sum(monto) as pagado from public.pagos where pedido_id = p.id
) pg on true
left join lateral (
  select string_agg(
           trim(concat_ws(' ', i.producto, i.modelo, i.medidas,
                case when i.cantidad > 1 then '×' || i.cantidad end)),
           ' · ' order by i.orden) as resumen
  from public.pedido_items i where i.pedido_id = p.id
) it on true;

-- ---------------------------------------------------------------------
-- Permisos: todo el equipo ve y edita todo (confirmado).
-- Nadie fuera de la tabla "equipo" puede leer ni escribir.
-- ---------------------------------------------------------------------
alter table public.equipo        enable row level security;
alter table public.parametros    enable row level security;
alter table public.feriados      enable row level security;
alter table public.clientes      enable row level security;
alter table public.pedidos       enable row level security;
alter table public.pedido_items  enable row level security;
alter table public.pagos         enable row level security;
alter table public.comentarios   enable row level security;
alter table public.archivos      enable row level security;
alter table public.eventos       enable row level security;

create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.equipo
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and activo and rol = 'admin'
  )
$$;

create policy equipo_lee on public.equipo for select to authenticated using (public.es_equipo());
create policy equipo_admin on public.equipo for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

create policy parametros_todo on public.parametros for all to authenticated using (public.es_equipo()) with check (public.es_equipo());
create policy feriados_todo   on public.feriados   for all to authenticated using (public.es_equipo()) with check (public.es_equipo());
create policy clientes_todo   on public.clientes   for all to authenticated using (public.es_equipo()) with check (public.es_equipo());
create policy pedidos_todo    on public.pedidos    for all to authenticated using (public.es_equipo()) with check (public.es_equipo());
create policy items_todo      on public.pedido_items for all to authenticated using (public.es_equipo()) with check (public.es_equipo());
create policy pagos_todo      on public.pagos      for all to authenticated using (public.es_equipo()) with check (public.es_equipo());
create policy comentarios_todo on public.comentarios for all to authenticated using (public.es_equipo()) with check (public.es_equipo());
create policy archivos_todo   on public.archivos   for all to authenticated using (public.es_equipo()) with check (public.es_equipo());
-- El historial solo se lee; lo escribe el trigger.
create policy eventos_lee     on public.eventos    for select to authenticated using (public.es_equipo());

grant usage on sequence public.pedidos_numero_seq to authenticated;

-- ---------------------------------------------------------------------
-- Alta de pedido en un solo paso (cliente + pedido + productos + seña).
-- Si algo falla, no se guarda nada a medias.
-- ---------------------------------------------------------------------
create or replace function public.crear_pedido(p jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_cliente uuid := (p ->> 'cliente_id')::uuid;
  v_pedido  uuid;
  v_yo      uuid;
  v_total   numeric := coalesce((p ->> 'total')::numeric, 0);
  v_envio   numeric := coalesce((p ->> 'precio_envio_cliente')::numeric, 0);
  v_sena    numeric := coalesce((p ->> 'sena')::numeric, 0);
  c         jsonb := coalesce(p -> 'cliente', '{}'::jsonb);
  it        jsonb;
  n         integer := 0;
begin
  if not public.es_equipo() then raise exception 'No tenés permiso para cargar pedidos'; end if;
  select id into v_yo from public.equipo where lower(email) = lower(auth.jwt() ->> 'email');

  if v_cliente is null then
    if coalesce(trim(c ->> 'nombre'), '') = '' then raise exception 'Falta el nombre del cliente'; end if;
    insert into public.clientes (nombre, telefono, email, dni, direccion, localidad, codigo_postal)
    values (trim(c ->> 'nombre'), c ->> 'telefono', c ->> 'email', c ->> 'dni',
            c ->> 'direccion', c ->> 'localidad', c ->> 'codigo_postal')
    returning id into v_cliente;
  else
    -- Completa los datos que falten o hayan cambiado, sin borrar los existentes.
    update public.clientes set
      telefono      = coalesce(c ->> 'telefono', telefono),
      email         = coalesce(c ->> 'email', email),
      dni           = coalesce(c ->> 'dni', dni),
      direccion     = coalesce(c ->> 'direccion', direccion),
      localidad     = coalesce(c ->> 'localidad', localidad),
      codigo_postal = coalesce(c ->> 'codigo_postal', codigo_postal)
    where id = v_cliente;
  end if;

  insert into public.pedidos (
    cliente_id, tipo_venta, canal, responsable_id, etapa, fecha_venta, fecha_limite,
    envio, direccion_entrega, forma_pago, total, precio_envio_cliente, observaciones,
    pauta, campana, dm_inbound, creado_por
  ) values (
    v_cliente,
    coalesce(p ->> 'tipo_venta', 'minorista'),
    p ->> 'canal',
    coalesce((p ->> 'responsable_id')::uuid, v_yo),
    'senado',
    coalesce((p ->> 'fecha_venta')::date, public.hoy_ar()),
    (p ->> 'fecha_limite')::date,
    coalesce(p ->> 'envio', 'coordinar'),
    p ->> 'direccion_entrega',
    p ->> 'forma_pago',
    v_total, v_envio,
    p ->> 'observaciones',
    (p ->> 'pauta')::boolean,
    p ->> 'campana',
    p ->> 'dm_inbound',
    v_yo
  ) returning id into v_pedido;

  for it in select * from jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) loop
    insert into public.pedido_items (pedido_id, producto, modelo, color, puntas, tapa, material,
                                     medidas, cantidad, precio, orden)
    values (v_pedido, it ->> 'producto', it ->> 'modelo', it ->> 'color', it ->> 'puntas',
            it ->> 'tapa', it ->> 'material', it ->> 'medidas',
            coalesce((it ->> 'cantidad')::integer, 1), (it ->> 'precio')::numeric, n);
    n := n + 1;
  end loop;

  if v_sena > 0 then
    insert into public.pagos (pedido_id, tipo, monto, medio, fecha, creado_por)
    values (v_pedido,
            case when v_sena >= v_total + v_envio then 'total' else 'sena' end,
            v_sena, p ->> 'forma_pago',
            coalesce((p ->> 'fecha_venta')::date, public.hoy_ar()), v_yo);
  end if;

  return v_pedido;
end $$;

grant execute on function public.crear_pedido(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- Archivos (fotos, comprobantes, planos): bucket privado
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('archivos', 'archivos', false, 20971520)   -- 20 MB por archivo
on conflict (id) do nothing;

create policy archivos_storage_lee on storage.objects for select to authenticated
  using (bucket_id = 'archivos' and public.es_equipo());
create policy archivos_storage_sube on storage.objects for insert to authenticated
  with check (bucket_id = 'archivos' and public.es_equipo());
create policy archivos_storage_borra on storage.objects for delete to authenticated
  using (bucket_id = 'archivos' and public.es_equipo());

-- ---------------------------------------------------------------------
-- Realtime: los cambios de pedidos se ven al instante en otros equipos
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.pedidos;
