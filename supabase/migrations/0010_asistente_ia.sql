-- =====================================================================
-- Spazio Design · Gestión · Asistente de IA (Claude / ChatGPT)
-- Claves personales para conectar Claude o ChatGPT a la app, y registro
-- en el historial de quién hizo cada cambio desde el asistente.
--
-- Se ejecuta una sola vez en Supabase → SQL Editor → "Run".
-- =====================================================================

create table public.claves_ia (
  id           uuid primary key default gen_random_uuid(),
  miembro_id   uuid not null references public.equipo(id) on delete cascade,
  nombre       text not null default 'Claude',
  hash         text not null unique,           -- sha256 de la clave; la clave no se guarda
  ultimos      text not null,                  -- últimos 4 caracteres, para reconocerla
  creada_en    timestamptz not null default now(),
  ultimo_uso   timestamptz,
  revocada_en  timestamptz
);
alter table public.claves_ia enable row level security;
create policy claves_ia_propias on public.claves_ia for all to authenticated
  using (miembro_id = public.mi_equipo_id()) with check (miembro_id = public.mi_equipo_id());

create or replace function public.registrar_cambios() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_pedido uuid;
  -- Los procesos del servidor (asistente de IA, Tienda Nube) mandan quién hizo el cambio
  -- en el encabezado x-spazio-usuario; solo se acepta con la clave de servicio.
  v_email text := coalesce(
    auth.jwt() ->> 'email',
    case when auth.jwt() ->> 'role' = 'service_role'
         then nullif(current_setting('request.headers', true)::json ->> 'x-spazio-usuario', '') end);
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
