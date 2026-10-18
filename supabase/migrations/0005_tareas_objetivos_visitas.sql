-- =====================================================================
-- Spazio Design · Gestión · Entrega 1c
-- Tareas, objetivos y visitas al showroom.
--
-- Se ejecuta una sola vez en Supabase → SQL Editor → "Run".
-- =====================================================================

-- ---------------------------------------------------------------------
-- Objetivos
--   numerico: una meta de ventas por semana o por mes, que se calcula sola
--   proyecto: algo para terminar antes de una fecha, con sus tareas
-- ---------------------------------------------------------------------
create table public.objetivos (
  id              uuid primary key default gen_random_uuid(),
  titulo          text not null check (length(trim(titulo)) > 0),
  descripcion     text,
  tipo            text not null check (tipo in ('numerico','proyecto')),
  responsable_id  uuid references public.equipo(id),        -- vacío = todo el equipo
  -- numérico
  metrica         text check (metrica in ('ventas','facturacion')),
  periodo         text check (periodo in ('semana','mes')),
  meta            numeric(14,2) check (meta is null or meta > 0),
  -- proyecto
  fecha_limite    date,
  estado          text not null default 'activo' check (estado in ('activo','cumplido','cancelado')),
  creado_por      uuid references public.equipo(id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  constraint objetivo_numerico_completo check (
    tipo <> 'numerico' or (metrica is not null and periodo is not null and meta is not null)
  )
);
create trigger objetivos_actualizado before update on public.objetivos
  for each row execute function public.tocar_actualizado_en();

-- ---------------------------------------------------------------------
-- Visitas al showroom
-- ---------------------------------------------------------------------
create table public.visitas (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid references public.clientes(id),
  nombre          text not null,              -- quien viene (aunque todavía no sea cliente)
  telefono        text,
  fecha           date not null default public.hoy_ar(),
  hora            time,
  con_turno       boolean not null default true,
  motivo          text,
  atiende_id      uuid references public.equipo(id),
  estado          text not null default 'agendada'
                    check (estado in ('agendada','confirmada','vino','no_vino','cancelada')),
  resultado       text check (resultado in ('compro','presupuesto','pensando','no_interesado')),
  notas           text,
  pedido_id       uuid references public.pedidos(id) on delete set null,
  creado_por      uuid references public.equipo(id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index visitas_fecha on public.visitas (fecha, hora);
create trigger visitas_actualizado before update on public.visitas
  for each row execute function public.tocar_actualizado_en();

-- ---------------------------------------------------------------------
-- Tareas
-- ---------------------------------------------------------------------
create table public.tareas (
  id              uuid primary key default gen_random_uuid(),
  titulo          text not null check (length(trim(titulo)) > 0),
  descripcion     text,
  responsable_id  uuid references public.equipo(id),
  creado_por      uuid references public.equipo(id),
  prioridad       text not null default 'media' check (prioridad in ('baja','media','alta')),
  vencimiento     date,
  estado          text not null default 'pendiente'
                    check (estado in ('pendiente','en_curso','bloqueada','hecha')),
  bloqueo         text,                       -- por qué está trabada
  pedido_id       uuid references public.pedidos(id) on delete cascade,
  visita_id       uuid references public.visitas(id) on delete set null,
  objetivo_id     uuid references public.objetivos(id) on delete set null,
  completada_en   timestamptz,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index tareas_responsable on public.tareas (responsable_id, estado, vencimiento);
create index tareas_pedido on public.tareas (pedido_id);
create index tareas_objetivo on public.tareas (objetivo_id);
create trigger tareas_actualizado before update on public.tareas
  for each row execute function public.tocar_actualizado_en();

create or replace function public.marcar_completada() returns trigger
language plpgsql as $$
begin
  if new.estado = 'hecha' and old.estado is distinct from 'hecha' then
    new.completada_en := now();
  elsif new.estado <> 'hecha' then
    new.completada_en := null;
  end if;
  return new;
end $$;
create trigger tareas_completada before update on public.tareas
  for each row execute function public.marcar_completada();

-- Las tareas de un pedido aparecen en su historial.
create trigger tareas_historial after insert or update or delete on public.tareas
  for each row execute function public.registrar_cambios();

-- Vista de tareas con nombres y si está vencida.
create view public.tareas_resumen with (security_invoker = true) as
select
  t.*,
  r.nombre  as responsable_nombre,
  cr.nombre as creador_nombre,
  p.numero  as pedido_numero,
  c.nombre  as pedido_cliente,
  o.titulo  as objetivo_titulo,
  v.nombre  as visita_nombre,
  (t.estado <> 'hecha' and t.vencimiento < public.hoy_ar()) as vencida
from public.tareas t
left join public.equipo r  on r.id = t.responsable_id
left join public.equipo cr on cr.id = t.creado_por
left join public.pedidos p on p.id = t.pedido_id
left join public.clientes c on c.id = p.cliente_id
left join public.objetivos o on o.id = t.objetivo_id
left join public.visitas v on v.id = t.visita_id;

-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
alter table public.objetivos enable row level security;
alter table public.visitas   enable row level security;
alter table public.tareas    enable row level security;
create policy objetivos_todo on public.objetivos for all to authenticated using (public.es_equipo()) with check (public.es_equipo());
create policy visitas_todo   on public.visitas   for all to authenticated using (public.es_equipo()) with check (public.es_equipo());
create policy tareas_todo    on public.tareas    for all to authenticated using (public.es_equipo()) with check (public.es_equipo());

alter publication supabase_realtime add table public.tareas;
