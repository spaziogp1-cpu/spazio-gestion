-- =====================================================================
-- Spazio Design · Cotizador · Fase 3: presupuestos
-- Cada presupuesto guarda lo que ve el cliente (ítems y precios) y, aparte,
-- la foto completa del cálculo (receta, precios y costos de ese momento),
-- que solo ven quienes tienen el permiso cotizador.costos.
--
-- Se ejecuta una sola vez en Supabase → SQL Editor → "Run",
-- después de 0014_cotizador_productos.sql.
-- =====================================================================

create sequence public.cot_presupuestos_numero_seq start with 1001;

create table public.cot_presupuestos (
  id                   uuid primary key default gen_random_uuid(),
  numero               integer not null unique default nextval('public.cot_presupuestos_numero_seq'),
  cliente_id           uuid references public.clientes(id),
  cliente_nombre       text not null,           -- como figura en el presupuesto (aunque cambie la ficha)
  cliente_telefono     text,
  vendedor_id          uuid references public.equipo(id),
  estado               text not null default 'borrador'
                         check (estado in ('borrador','enviado','seguimiento','aprobado','rechazado','vencido')),
  fecha                date not null default public.hoy_ar(),
  valido_hasta         date not null,
  subtotal             numeric(14,2) not null default 0,     -- transferencia, antes del descuento
  descuento_pct        numeric(6,4) not null default 0 check (descuento_pct >= 0 and descuento_pct < 1),
  descuento_monto      numeric(14,2) not null default 0 check (descuento_monto >= 0),
  total                numeric(14,2) not null default 0,     -- transferencia, final
  total_cuotas         numeric(14,2) not null default 0,
  necesita_aprobacion  boolean not null default false,       -- descuento por encima del tope
  aprobado_por         uuid references public.equipo(id),
  condiciones          text,
  observaciones        text,
  pedido_id            uuid references public.pedidos(id) on delete set null,
  duplicado_de         uuid references public.cot_presupuestos(id) on delete set null,
  creado_por           uuid references public.equipo(id),
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now()
);
create index cot_presupuestos_estado on public.cot_presupuestos (estado, fecha desc);
create index cot_presupuestos_cliente on public.cot_presupuestos (cliente_id);
create index cot_presupuestos_vendedor on public.cot_presupuestos (vendedor_id, fecha desc);
create trigger cot_presupuestos_actualizado before update on public.cot_presupuestos
  for each row execute function public.tocar_actualizado_en();
create trigger cot_presupuestos_historial after insert or update or delete on public.cot_presupuestos
  for each row execute function public.registrar_cambios();

create table public.cot_presupuesto_items (
  id                      uuid primary key default gen_random_uuid(),
  presupuesto_id          uuid not null references public.cot_presupuestos(id) on delete cascade,
  orden                   integer not null default 0,
  producto_id             uuid references public.cot_productos(id) on delete set null,
  receta_id               uuid references public.cot_recetas(id) on delete set null,
  titulo                  text not null,          -- "Mesa Luna"
  detalle                 text,                   -- "140 × 60 × 35 cm · bronce 10 mm"
  valores                 jsonb not null default '{}'::jsonb,   -- lo elegido (para editar o duplicar)
  cantidad                integer not null default 1 check (cantidad > 0),
  precio_unitario         numeric(14,2) not null default 0,     -- transferencia
  precio_unitario_cuotas  numeric(14,2) not null default 0,
  total                   numeric(14,2) not null default 0,
  estimado                boolean not null default false        -- hay algún precio a confirmar con el proveedor
);
create index cot_presupuesto_items_presupuesto on public.cot_presupuesto_items (presupuesto_id, orden);

-- Foto del cálculo: solo costos.
create table public.cot_presupuesto_calculos (
  item_id         uuid primary key references public.cot_presupuesto_items(id) on delete cascade,
  presupuesto_id  uuid not null references public.cot_presupuestos(id) on delete cascade,
  receta          jsonb not null,
  resultado       jsonb not null,         -- líneas, tarifas usadas, avisos
  costo_unitario  numeric(14,2) not null,
  margen          numeric(6,4) not null,
  motor           text not null,
  creado_en       timestamptz not null default now()
);
create index cot_presupuesto_calculos_presupuesto on public.cot_presupuesto_calculos (presupuesto_id);

-- ---------------------------------------------------------------------
-- Permisos: presupuestos e ítems los ve y edita todo el equipo; la foto
-- del cálculo solo cotizador.costos. Los ítems y la foto los escribe el
-- servidor (que recalcula el precio), nunca el navegador.
-- ---------------------------------------------------------------------
alter table public.cot_presupuestos         enable row level security;
alter table public.cot_presupuesto_items    enable row level security;
alter table public.cot_presupuesto_calculos enable row level security;

create policy cot_presupuestos_lee on public.cot_presupuestos for select to authenticated using (public.es_equipo());
-- El navegador solo puede cambiar el estado, las notas y el cliente; los montos los pone el servidor.
create policy cot_presupuestos_edita on public.cot_presupuestos for update to authenticated
  using (public.es_equipo()) with check (public.es_equipo());
create policy cot_items_lee on public.cot_presupuesto_items for select to authenticated using (public.es_equipo());
create policy cot_calculos_lee on public.cot_presupuesto_calculos for select to authenticated using (public.puede('cotizador.costos'));

revoke update on public.cot_presupuestos from authenticated;
grant update (estado, observaciones, cliente_id, cliente_nombre, cliente_telefono, condiciones, valido_hasta)
  on public.cot_presupuestos to authenticated;

-- Un presupuesto con descuento por encima del tope no se puede dar por enviado
-- ni aprobado hasta que un admin lo apruebe.
create or replace function public.cot_presupuesto_controla_estado() returns trigger
language plpgsql as $$
begin
  if new.estado <> old.estado and new.estado in ('enviado','seguimiento','aprobado')
     and new.necesita_aprobacion and new.aprobado_por is null then
    raise exception 'El descuento supera el tope: tiene que aprobarlo un administrador antes de enviarlo';
  end if;
  return new;
end $$;
create trigger cot_presupuestos_estado before update on public.cot_presupuestos
  for each row execute function public.cot_presupuesto_controla_estado();

-- Vence solo: el proceso diario llama a esto y pasa a "vencido" lo enviado o en
-- seguimiento cuya validez ya pasó.
create or replace function public.cot_vencer_presupuestos() returns integer
language sql security definer set search_path = public as $$
  with v as (
    update public.cot_presupuestos set estado = 'vencido'
    where estado in ('enviado','seguimiento') and valido_hasta < public.hoy_ar()
    returning 1
  )
  select count(*)::integer from v
$$;
revoke all on function public.cot_vencer_presupuestos() from public, anon, authenticated;
grant execute on function public.cot_vencer_presupuestos() to service_role;

grant usage on sequence public.cot_presupuestos_numero_seq to service_role;
