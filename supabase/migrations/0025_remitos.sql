-- =====================================================================
-- Spazio Design · Gestión · Remitos
--  - Cada venta nueva genera su remito en PDF (mismo modelo que el equipo
--    usaba a mano): queda en los archivos del pedido y se guarda en la
--    carpeta "remitos" de Google Drive.
--  - Desde la ficha del pedido se puede volver a generar (por ejemplo,
--    después de registrar un pago): queda como versión nueva.
--
-- Se ejecuta una sola vez en Supabase → SQL Editor → "Run". Se puede correr de nuevo.
-- =====================================================================

create table if not exists public.remitos (
  id          uuid primary key default gen_random_uuid(),
  pedido_id   uuid not null references public.pedidos(id) on delete cascade,
  version     integer not null default 1,
  nombre      text not null,
  ruta        text not null,                 -- en el bucket "archivos"
  drive_id    text,
  drive_url   text,
  estado      text not null default 'pendiente' check (estado in ('pendiente','ok','error')),
  error       text,
  intentos    integer not null default 0,
  creado_en   timestamptz not null default now(),
  unique (pedido_id, version)
);
create index if not exists remitos_estado on public.remitos (estado, creado_en);

alter table public.remitos enable row level security;
drop policy if exists remitos_lee on public.remitos;
create policy remitos_lee on public.remitos for select to authenticated using (public.es_equipo());

-- Conexión con Drive: un script de Google (Apps Script) del dueño de la carpeta recibe el PDF
-- y lo guarda. La app le manda una clave para que nadie más pueda usarlo.
insert into public.integraciones (clave, datos)
values ('drive_remitos', jsonb_build_object(
  'secreto', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  'carpeta', '1XHIt9Rbfgx8sDAWxZdCzFZwyi_hPzqeQ',
  'url', null))
on conflict (clave) do nothing;
