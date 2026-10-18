-- =====================================================================
-- Spazio Design · Gestión · Conexión con la planilla de ventas
-- Registro de qué pedidos ya se escribieron en la planilla.
--
-- Se ejecuta una sola vez en Supabase → SQL Editor → "Run".
-- =====================================================================

create table public.planilla_sync (
  pedido_id       uuid primary key references public.pedidos(id) on delete cascade,
  estado          text not null default 'pendiente' check (estado in ('pendiente','ok','error')),
  filas           integer,                     -- cuántas filas ocupa (una por producto)
  error           text,
  intentos        integer not null default 0,
  sincronizado_en timestamptz,
  creado_en       timestamptz not null default now()
);

alter table public.planilla_sync enable row level security;
create policy planilla_sync_todo on public.planilla_sync for all to authenticated
  using (public.es_equipo()) with check (public.es_equipo());
