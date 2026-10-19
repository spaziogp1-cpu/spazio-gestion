-- =====================================================================
-- Spazio Design · Cotizador · Fase 1: catálogo de costos
-- Insumos (vidrios, procesos, estructuras...), atributos que hacen variar
-- el precio, tarifas con historial y reglas generales.
-- También suma el rol "vendedor" y la tabla de permisos: los costos los
-- ve solo quien tiene el permiso cotizador.costos (los admin siempre).
--
-- Se ejecuta una sola vez en Supabase → SQL Editor → "Run".
-- =====================================================================

-- ---------------------------------------------------------------------
-- Roles y permisos
-- ---------------------------------------------------------------------
alter table public.equipo drop constraint if exists equipo_rol_check;
alter table public.equipo add constraint equipo_rol_check
  check (rol in ('admin','equipo','vendedor'));

-- Qué puede hacer cada rol además de lo de todo el equipo. Los admin pueden todo.
create table public.permisos (
  rol      text not null,
  permiso  text not null,
  primary key (rol, permiso)
);
alter table public.permisos enable row level security;
create policy permisos_lee on public.permisos for select to authenticated using (public.es_equipo());
create policy permisos_admin on public.permisos for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- Permisos de hoy (se pueden sumar filas sin tocar código):
--   cotizador.costos  → ver y editar costos, tarifas, recetas y márgenes
insert into public.permisos (rol, permiso) values ('equipo', 'cotizador.costos')
on conflict do nothing;   -- hoy "equipo" sigue viendo todo; "vendedor" no ve costos

create or replace function public.puede(p_permiso text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.equipo e
    where lower(e.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and e.activo
      and (e.rol = 'admin'
           or exists (select 1 from public.permisos p where p.rol = e.rol and p.permiso = p_permiso))
  )
$$;
grant execute on function public.puede(text) to authenticated;

-- ---------------------------------------------------------------------
-- Proveedores que faltaban (Silla Cesca)
-- ---------------------------------------------------------------------
insert into public.proveedores (nombre, que_provee, plazo_dias) values
  ('Alberto', 'Estructura de la Silla Cesca', 25),
  ('Belén', 'Tapicería', 25)
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------------
-- Atributos: lo que hace variar un precio (espesor, color, forma...)
-- ---------------------------------------------------------------------
create table public.cot_atributos (
  clave   text primary key check (clave ~ '^[a-z][a-z0-9_]*$'),
  nombre  text not null,
  orden   integer not null default 0
);

-- Valores posibles. "grupos" = a qué columnas de precio pertenece el valor:
-- el color rosa → grupo "color"; el espesor 8 → "8-10" (bordes) y "4-10" (perforaciones).
create table public.cot_atributo_valores (
  id        uuid primary key default gen_random_uuid(),
  atributo  text not null references public.cot_atributos(clave) on update cascade,
  valor     text not null check (valor ~ '^[a-z0-9][a-z0-9+._-]*$'),
  etiqueta  text not null,
  grupos    text[] not null default '{}',
  muestra   text,                       -- color de muestra (#hex) para los chips de vidrio
  orden     integer not null default 0,
  activo    boolean not null default true,
  unique (atributo, valor)
);

-- ---------------------------------------------------------------------
-- Insumos: todo lo que tiene un costo
-- ---------------------------------------------------------------------
create table public.cot_insumos (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique check (codigo ~ '^[a-z0-9][a-z0-9-]*$'),  -- el nombre que usan las recetas
  tipo          text not null check (tipo in ('vidrio','espejo','madera','estructura','herraje',
                                               'proceso','mano_obra','embalaje','flete','otro')),
  nombre        text not null,
  unidad        text not null check (unidad in ('m2','ml','unidad','fijo','kg','hora')),
  atributos     text[] not null default '{}',   -- claves que definen cada precio (ej. espesor, color)
  proveedor_id  uuid references public.proveedores(id),
  minimo        numeric(12,4) check (minimo is null or minimo > 0),   -- en la unidad del insumo
  minimo_por    text check (minimo_por in ('pieza','item')),         -- item = por mesa / producto
  orden         integer not null default 0,
  activo        boolean not null default true,
  notas         text,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check ((minimo is null) = (minimo_por is null))
);
create index cot_insumos_tipo on public.cot_insumos (tipo, orden);
create trigger cot_insumos_actualizado before update on public.cot_insumos
  for each row execute function public.tocar_actualizado_en();

-- ---------------------------------------------------------------------
-- Tarifas: el precio de un insumo para una combinación de atributos.
-- Nunca se pisan: cambiar un precio cierra la fila vigente y abre otra.
-- "referencia" es un número para estimar medidas que no están en la lista
-- (ej. el diámetro de la Saturno); "incremento" = cuánto sube por cada
-- unidad de referencia cuando el modelo tiene una sola medida.
-- ---------------------------------------------------------------------
create table public.cot_tarifas (
  id             bigint generated always as identity primary key,
  insumo_id      uuid not null references public.cot_insumos(id) on delete cascade,
  variante       jsonb not null default '{}'::jsonb check (jsonb_typeof(variante) = 'object'),
  referencia     numeric(12,2),
  precio         numeric(14,2) not null check (precio >= 0),
  minimo         numeric(12,4) check (minimo is null or minimo > 0),   -- pisa el mínimo del insumo
  incremento     numeric(14,2),
  nota           text,
  vigente_desde  timestamptz not null default now(),
  vigente_hasta  timestamptz,
  creado_por     uuid references public.equipo(id),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);
create unique index cot_tarifas_vigente on public.cot_tarifas
  (insumo_id, variante, coalesce(referencia, -1)) where vigente_hasta is null;
create index cot_tarifas_historial on public.cot_tarifas (insumo_id, vigente_desde desc);

create view public.cot_tarifas_vigentes with (security_invoker = true) as
select t.*, i.codigo as insumo_codigo
from public.cot_tarifas t
join public.cot_insumos i on i.id = t.insumo_id
where t.vigente_hasta is null;

-- ---------------------------------------------------------------------
-- Reglas generales (recargo en cuotas, redondeo, ajuste de Vidpro...)
-- ---------------------------------------------------------------------
create table public.cot_ajustes (
  clave           text primary key check (clave ~ '^[a-z][a-z0-9_]*$'),
  valor           numeric(14,4) not null,
  nombre          text not null,
  nota            text,
  actualizado_en  timestamptz not null default now()
);
create trigger cot_ajustes_actualizado before update on public.cot_ajustes
  for each row execute function public.tocar_actualizado_en();

insert into public.cot_ajustes (clave, valor, nombre, nota) values
  ('recargo_cuotas',  0.27, 'Recargo en cuotas',        'Precio en cuotas = transferencia × (1 + recargo)'),
  ('redondeo',        1000, 'Redondeo del precio',      'El precio se redondea hacia arriba a este múltiplo'),
  ('tope_descuento',  0.10, 'Tope de descuento',        'Más que esto necesita aprobación de un admin'),
  ('validez_dias',    7,    'Validez del presupuesto',  'Días'),
  ('ajuste_vidpro',   0.20, 'Ajuste de Vidpro',         'Sobre el precio de los vidrios (en mesas altas, solo las bases)')
on conflict (clave) do nothing;

-- Historial automático de cambios en insumos (mismo trigger que pedidos).
-- El historial de precios ya queda en cot_tarifas (filas cerradas).
create trigger cot_insumos_historial after insert or update or delete on public.cot_insumos
  for each row execute function public.registrar_cambios();

-- ---------------------------------------------------------------------
-- Permisos de lectura y escritura
-- Atributos y reglas generales: los lee todo el equipo (el vendedor elige
-- colores y ve el recargo en cuotas). Insumos y tarifas: solo cotizador.costos.
-- ---------------------------------------------------------------------
alter table public.cot_atributos        enable row level security;
alter table public.cot_atributo_valores enable row level security;
alter table public.cot_insumos          enable row level security;
alter table public.cot_tarifas          enable row level security;
alter table public.cot_ajustes          enable row level security;

create policy cot_atributos_lee  on public.cot_atributos for select to authenticated using (public.es_equipo());
create policy cot_atributos_edita on public.cot_atributos for all to authenticated
  using (public.puede('cotizador.costos')) with check (public.puede('cotizador.costos'));
create policy cot_valores_lee  on public.cot_atributo_valores for select to authenticated using (public.es_equipo());
create policy cot_valores_edita on public.cot_atributo_valores for all to authenticated
  using (public.puede('cotizador.costos')) with check (public.puede('cotizador.costos'));
create policy cot_ajustes_lee  on public.cot_ajustes for select to authenticated using (public.es_equipo());
create policy cot_ajustes_edita on public.cot_ajustes for update to authenticated
  using (public.puede('cotizador.costos')) with check (public.puede('cotizador.costos'));
create policy cot_insumos_costos on public.cot_insumos for all to authenticated
  using (public.puede('cotizador.costos')) with check (public.puede('cotizador.costos'));
-- Las tarifas se leen directo, pero solo se escriben con las funciones de abajo.
create policy cot_tarifas_lee on public.cot_tarifas for select to authenticated
  using (public.puede('cotizador.costos'));

-- ---------------------------------------------------------------------
-- Cambiar un precio: cierra la tarifa vigente y abre una nueva.
-- Si el precio es el mismo, no hace nada.
-- ---------------------------------------------------------------------
create or replace function public.cot_cambiar_precio(
  p_insumo uuid, p_variante jsonb, p_precio numeric,
  p_referencia numeric default null, p_nota text default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_actual public.cot_tarifas%rowtype;
  v_yo uuid;
  v_id bigint;
begin
  if not public.puede('cotizador.costos') then raise exception 'No tenés permiso para cambiar precios'; end if;
  if p_precio is null or p_precio < 0 then raise exception 'El precio no puede ser negativo'; end if;
  select id into v_yo from public.equipo where lower(email) = lower(auth.jwt() ->> 'email');

  select * into v_actual from public.cot_tarifas
  where insumo_id = p_insumo and variante = coalesce(p_variante, '{}'::jsonb)
    and coalesce(referencia, -1) = coalesce(p_referencia, -1) and vigente_hasta is null
  for update;

  if found and v_actual.precio = p_precio then return v_actual.id; end if;

  if found then
    update public.cot_tarifas set vigente_hasta = now() where id = v_actual.id;
  end if;
  insert into public.cot_tarifas (insumo_id, variante, referencia, precio, minimo, incremento, nota, creado_por)
  values (p_insumo, coalesce(p_variante, '{}'::jsonb), p_referencia, p_precio,
          v_actual.minimo, v_actual.incremento, coalesce(p_nota, v_actual.nota), v_yo)
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.cot_cambiar_precio(uuid, jsonb, numeric, numeric, text) to authenticated;

-- Dar de baja una tarifa (deja de existir esa combinación).
create or replace function public.cot_quitar_tarifa(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.puede('cotizador.costos') then raise exception 'No tenés permiso para cambiar precios'; end if;
  update public.cot_tarifas set vigente_hasta = now() where id = p_id and vigente_hasta is null;
end $$;
grant execute on function public.cot_quitar_tarifa(bigint) to authenticated;

-- Aumento masivo: todos los precios vigentes de un proveedor (y opcionalmente
-- de un tipo de insumo) suben un porcentaje. Devuelve cuántos precios cambió.
create or replace function public.cot_aumento_masivo(
  p_proveedor uuid, p_porcentaje numeric, p_tipo text default null, p_nota text default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  t record;
  n integer := 0;
  v_yo uuid;
begin
  if not public.puede('cotizador.costos') then raise exception 'No tenés permiso para cambiar precios'; end if;
  if p_porcentaje is null or p_porcentaje <= -100 or p_porcentaje > 500 then
    raise exception 'Porcentaje fuera de rango';
  end if;
  select id into v_yo from public.equipo where lower(email) = lower(auth.jwt() ->> 'email');

  for t in
    select tf.* from public.cot_tarifas tf
    join public.cot_insumos i on i.id = tf.insumo_id
    where tf.vigente_hasta is null and i.proveedor_id = p_proveedor
      and (p_tipo is null or i.tipo = p_tipo)
    for update of tf
  loop
    update public.cot_tarifas set vigente_hasta = now() where id = t.id;
    insert into public.cot_tarifas (insumo_id, variante, referencia, precio, minimo, incremento, nota, creado_por)
    values (t.insumo_id, t.variante, t.referencia,
            round(t.precio * (1 + p_porcentaje / 100), 2), t.minimo,
            case when t.incremento is null then null else round(t.incremento * (1 + p_porcentaje / 100), 2) end,
            coalesce(p_nota, t.nota), v_yo);
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function public.cot_aumento_masivo(uuid, numeric, text, text) to authenticated;
