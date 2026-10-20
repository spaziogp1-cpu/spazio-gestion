-- =====================================================================
-- Spazio Design · Gestión · Notificaciones en el celular (Web Push)
--  - Cada persona activa las notificaciones en su celular o compu (Ajustes).
--  - Cada aviso nuevo (reportes, recordatorios, tareas…) se manda también
--    como notificación: la base llama a la app (pg_net), que la envía.
--
-- Se ejecuta una sola vez en Supabase → SQL Editor → "Run". Se puede correr de nuevo.
-- =====================================================================

-- 1. Dispositivos de cada persona --------------------------------------
create table if not exists public.push_suscripciones (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references public.equipo(id) on delete cascade,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  dispositivo   text,                 -- para reconocerlo en Ajustes (ej. "iPhone", "Chrome en Windows")
  creada_en     timestamptz not null default now(),
  ultimo_envio  timestamptz,
  ultimo_error  text
);
create index if not exists push_suscripciones_usuario on public.push_suscripciones (usuario_id);

alter table public.push_suscripciones enable row level security;
drop policy if exists push_propias on public.push_suscripciones;
create policy push_propias on public.push_suscripciones for all to authenticated
  using (usuario_id = public.mi_equipo_id()) with check (usuario_id = public.mi_equipo_id());

-- 2. Clave para que la base llame a la app ----------------------------
insert into public.integraciones (clave, datos)
values ('push_envio', jsonb_build_object(
  'secreto', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  'url', 'https://spazio-gestion.vercel.app/api/cron/push'))
on conflict (clave) do nothing;

-- 3. Cada aviso nuevo se manda al celular -----------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  else
    raise notice 'pg_net no está disponible: los avisos no se mandan al celular';
  end if;
end $$;

create or replace function public.push_aviso_nuevo() returns trigger
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  -- Aviso nuevo, o recordatorio que se anuló (reprogramado o cancelado): reemplaza al del celular.
  if tg_op = 'INSERT' and new.anulada_en is not null then return new; end if;
  if tg_op = 'UPDATE' and not (old.anulada_en is null and new.anulada_en is not null and new.tipo like 'recordatorio%') then return new; end if;
  -- Solo si la persona tiene algún dispositivo activado.
  if not exists (select 1 from public.push_suscripciones where usuario_id = new.usuario_id) then
    return new;
  end if;
  if to_regnamespace('net') is null then return new; end if;
  select datos into v from public.integraciones where clave = 'push_envio';
  if v ->> 'url' is null then return new; end if;
  perform net.http_post(
    url := v ->> 'url',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (v ->> 'secreto')),
    body := jsonb_build_object('id', new.id),
    timeout_milliseconds := 20000
  );
  return new;
exception when others then
  -- Un problema con el envío nunca frena el aviso dentro de la app.
  raise warning 'push: %', sqlerrm;
  return new;
end $$;

drop trigger if exists push_aviso_nuevo on public.notificaciones;
create trigger push_aviso_nuevo after insert on public.notificaciones
  for each row execute function public.push_aviso_nuevo();
drop trigger if exists push_aviso_anulado on public.notificaciones;
create trigger push_aviso_anulado after update of anulada_en on public.notificaciones
  for each row when (old.anulada_en is null and new.anulada_en is not null)
  execute function public.push_aviso_nuevo();
