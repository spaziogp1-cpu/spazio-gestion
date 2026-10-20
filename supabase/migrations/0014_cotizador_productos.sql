-- =====================================================================
-- Spazio Design · Cotizador · Fase 2: productos y recetas
-- Cada producto (Mesa Luna, Helios...) tiene recetas versionadas: un
-- borrador que se edita y versiones publicadas que no cambian nunca.
-- El margen de cada producto vive aparte, porque es un dato de costos.
--
-- Se ejecuta una sola vez en Supabase → SQL Editor → "Run",
-- después de 0013_cotizador_costos.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Categorías y productos (lo que ve el vendedor: nombre, foto, categoría)
-- ---------------------------------------------------------------------
create table public.cot_categorias (
  id      uuid primary key default gen_random_uuid(),
  nombre  text not null unique,
  orden   integer not null default 0
);

insert into public.cot_categorias (nombre, orden) values
  ('Mesas ratonas', 10), ('Mesas auxiliares', 20), ('Mesas de comedor', 30),
  ('Escritorios', 40), ('Recibidores y consolas', 50), ('Espejos', 60),
  ('Estantes', 70), ('Sillas y taburetes', 80), ('Otros', 90)
on conflict (nombre) do nothing;

create table public.cot_productos (
  id                   uuid primary key default gen_random_uuid(),
  nombre               text not null,
  categoria_id         uuid references public.cot_categorias(id),
  descripcion          text,                     -- lo que lee el cliente en el presupuesto
  foto_url             text,
  tiendanube_id        text,
  tiendanube_url       text,
  receta_publicada_id  uuid,                     -- se completa al publicar (FK más abajo)
  activo               boolean not null default true,
  orden                integer not null default 0,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now()
);
create unique index cot_productos_nombre on public.cot_productos (lower(nombre)) where activo;
create index cot_productos_categoria on public.cot_productos (categoria_id, orden);
create trigger cot_productos_actualizado before update on public.cot_productos
  for each row execute function public.tocar_actualizado_en();
create trigger cot_productos_historial after insert or update or delete on public.cot_productos
  for each row execute function public.registrar_cambios();

-- ---------------------------------------------------------------------
-- Margen por producto (dato de costos). Se cambia cuando haga falta y
-- queda en el historial; los presupuestos guardan el que usaron.
-- ---------------------------------------------------------------------
create table public.cot_margenes (
  id              uuid primary key default gen_random_uuid(),
  producto_id     uuid not null unique references public.cot_productos(id) on delete cascade,
  margen          numeric(6,4) not null check (margen >= 0 and margen < 0.95),
  actualizado_en  timestamptz not null default now()
);
create trigger cot_margenes_actualizado before update on public.cot_margenes
  for each row execute function public.tocar_actualizado_en();
create trigger cot_margenes_historial after insert or update on public.cot_margenes
  for each row execute function public.registrar_cambios();

-- ---------------------------------------------------------------------
-- Recetas: borrador → publicada → archivada. Una publicada no se edita.
-- ---------------------------------------------------------------------
create table public.cot_recetas (
  id             uuid primary key default gen_random_uuid(),
  producto_id    uuid not null references public.cot_productos(id) on delete cascade,
  version        integer not null,
  estado         text not null default 'borrador' check (estado in ('borrador','publicada','archivada')),
  definicion     jsonb not null default '{"entradas":{},"lineas":[]}'::jsonb
                   check (jsonb_typeof(definicion) = 'object'),
  nota           text,
  creado_por     uuid references public.equipo(id),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  publicado_por  uuid references public.equipo(id),
  publicado_en   timestamptz,
  unique (producto_id, version)
);
create unique index cot_recetas_un_borrador on public.cot_recetas (producto_id) where estado = 'borrador';
create unique index cot_recetas_una_publicada on public.cot_recetas (producto_id) where estado = 'publicada';
create trigger cot_recetas_actualizado before update on public.cot_recetas
  for each row execute function public.tocar_actualizado_en();

alter table public.cot_productos add constraint cot_productos_receta_fk
  foreign key (receta_publicada_id) references public.cot_recetas(id) on delete set null;

-- Una receta publicada o archivada no cambia: solo puede pasar de publicada a archivada.
create or replace function public.cot_recetas_inmutables() returns trigger
language plpgsql as $$
begin
  if old.estado <> 'borrador' then
    if new.definicion is distinct from old.definicion or new.version <> old.version
       or new.producto_id <> old.producto_id
       or not (old.estado = 'publicada' and new.estado = 'archivada') then
      raise exception 'La versión % ya está publicada y no se puede cambiar: creá un borrador nuevo', old.version;
    end if;
  end if;
  return new;
end $$;
create trigger cot_recetas_inmutable before update on public.cot_recetas
  for each row execute function public.cot_recetas_inmutables();

-- Índice de qué insumos usa cada receta: "si sube este vidrio, ¿qué productos cambian?"
create table public.cot_receta_insumos (
  receta_id  uuid not null references public.cot_recetas(id) on delete cascade,
  insumo_id  uuid not null references public.cot_insumos(id) on delete cascade,
  primary key (receta_id, insumo_id)
);

-- ---------------------------------------------------------------------
-- Funciones
-- ---------------------------------------------------------------------

-- Borrador del producto: devuelve el que hay, o crea uno copiando la versión publicada.
create or replace function public.cot_borrador(p_producto uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_yo uuid;
  v_def jsonb;
  v_version integer;
begin
  if not public.puede('cotizador.costos') then raise exception 'No tenés permiso para editar recetas'; end if;
  select id into v_id from public.cot_recetas where producto_id = p_producto and estado = 'borrador';
  if v_id is not null then return v_id; end if;

  select id into v_yo from public.equipo where lower(email) = lower(auth.jwt() ->> 'email');
  select definicion into v_def from public.cot_recetas where producto_id = p_producto and estado = 'publicada';
  select coalesce(max(version), 0) + 1 into v_version from public.cot_recetas where producto_id = p_producto;
  insert into public.cot_recetas (producto_id, version, definicion, creado_por)
  values (p_producto, v_version, coalesce(v_def, '{"entradas":{},"lineas":[]}'::jsonb), v_yo)
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.cot_borrador(uuid) to authenticated;

-- Publicar el borrador: archiva la versión anterior y la nueva pasa a ser la que se cotiza.
-- La app valida la receta con el motor antes de llamar a esta función.
create or replace function public.cot_publicar(p_receta uuid, p_insumos text[], p_nota text default null) returns integer
language plpgsql security definer set search_path = public as $$
declare
  r public.cot_recetas%rowtype;
  v_yo uuid;
begin
  if not public.puede('cotizador.costos') then raise exception 'No tenés permiso para publicar recetas'; end if;
  select * into r from public.cot_recetas where id = p_receta for update;
  if not found then raise exception 'No existe la receta'; end if;
  if r.estado <> 'borrador' then raise exception 'Solo se publica un borrador'; end if;
  if jsonb_array_length(coalesce(r.definicion -> 'lineas', '[]'::jsonb)) = 0 then
    raise exception 'La receta no tiene líneas';
  end if;
  select id into v_yo from public.equipo where lower(email) = lower(auth.jwt() ->> 'email');

  update public.cot_recetas set estado = 'archivada'
  where producto_id = r.producto_id and estado = 'publicada';
  update public.cot_recetas set estado = 'publicada', publicado_por = v_yo, publicado_en = now(),
         nota = coalesce(p_nota, nota)
  where id = p_receta;
  update public.cot_productos set receta_publicada_id = p_receta where id = r.producto_id;

  insert into public.cot_receta_insumos (receta_id, insumo_id)
  select p_receta, i.id from public.cot_insumos i where i.codigo = any(coalesce(p_insumos, '{}'))
  on conflict do nothing;
  return r.version;
end $$;
grant execute on function public.cot_publicar(uuid, text[], text) to authenticated;

-- ---------------------------------------------------------------------
-- Permisos
-- Productos y categorías: los ve todo el equipo (el vendedor elige qué cotizar).
-- Recetas y márgenes: solo cotizador.costos.
-- ---------------------------------------------------------------------
alter table public.cot_categorias     enable row level security;
alter table public.cot_productos      enable row level security;
alter table public.cot_margenes       enable row level security;
alter table public.cot_recetas        enable row level security;
alter table public.cot_receta_insumos enable row level security;

create policy cot_categorias_lee on public.cot_categorias for select to authenticated using (public.es_equipo());
create policy cot_categorias_edita on public.cot_categorias for all to authenticated
  using (public.puede('cotizador.costos')) with check (public.puede('cotizador.costos'));
create policy cot_productos_lee on public.cot_productos for select to authenticated using (public.es_equipo());
create policy cot_productos_edita on public.cot_productos for all to authenticated
  using (public.puede('cotizador.costos')) with check (public.puede('cotizador.costos'));
create policy cot_margenes_costos on public.cot_margenes for all to authenticated
  using (public.puede('cotizador.costos')) with check (public.puede('cotizador.costos'));
create policy cot_receta_insumos_lee on public.cot_receta_insumos for select to authenticated
  using (public.puede('cotizador.costos'));
-- Las recetas se leen y el borrador se edita directo; crear y publicar va por las funciones.
create policy cot_recetas_lee on public.cot_recetas for select to authenticated
  using (public.puede('cotizador.costos'));
create policy cot_recetas_edita_borrador on public.cot_recetas for update to authenticated
  using (public.puede('cotizador.costos') and estado = 'borrador')
  with check (public.puede('cotizador.costos') and estado = 'borrador');
