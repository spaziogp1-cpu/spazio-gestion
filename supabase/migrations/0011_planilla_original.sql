-- =====================================================================
-- Spazio Design · Gestión · Ventas cargadas en la planilla original
-- Cada 15 minutos la app revisa Plantilla_Spazio_2026 y crea los pedidos
-- nuevos que el equipo cargó ahí (después se escriben en la copia).
--
-- Se ejecuta una sola vez en Supabase → SQL Editor → "Run".
-- =====================================================================

-- 1. Registro de las ventas de la planilla ya traídas (evita duplicados).
create table if not exists public.planilla_origen (
  clave           text primary key,             -- número + cliente + fecha de la venta en la planilla
  pedido_id       uuid references public.pedidos(id) on delete set null,
  numero_planilla integer,
  filas           text,
  estado          text not null check (estado in ('creado','vinculado','error')),
  detalle         text,
  creado_en       timestamptz not null default now()
);
alter table public.planilla_origen enable row level security;
create policy planilla_origen_lee on public.planilla_origen for select to authenticated using (public.es_equipo());

-- 2. El alta desde el servidor acepta número, vendedor, tipo de venta y datos de pauta.
create or replace function public.crear_pedido_externo(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cliente uuid;
  v_pedido  uuid;
  v_total   numeric := coalesce((p ->> 'total')::numeric, 0);
  v_envio   numeric := coalesce((p ->> 'precio_envio_cliente')::numeric, 0);
  v_sena    numeric := coalesce((p ->> 'sena')::numeric, 0);
  v_creador uuid := (p ->> 'creado_por')::uuid;
  v_numero  integer := (p ->> 'numero')::integer;
  v_fecha   date := coalesce((p ->> 'fecha_venta')::date, public.hoy_ar());
  c         jsonb := coalesce(p -> 'cliente', '{}'::jsonb);
  v_email   text := nullif(lower(trim(c ->> 'email')), '');
  v_tel     text := right(regexp_replace(coalesce(c ->> 'telefono', ''), '\D', '', 'g'), 8);
  it        jsonb;
  n         integer := 0;
begin
  if coalesce(trim(c ->> 'nombre'), '') = '' then raise exception 'Falta el nombre del cliente'; end if;
  if p ->> 'tiendanube_id' is not null
     and exists (select 1 from public.pedidos where tiendanube_id = p ->> 'tiendanube_id') then
    raise exception 'La orden % ya está cargada', p ->> 'tiendanube_id';
  end if;

  select id into v_cliente from public.clientes
  where (v_email is not null and lower(email) = v_email)
     or (length(v_tel) = 8 and right(regexp_replace(coalesce(telefono, ''), '\D', '', 'g'), 8) = v_tel)
  order by creado_en desc limit 1;

  if v_cliente is null then
    insert into public.clientes (nombre, telefono, email, dni, direccion, localidad, codigo_postal)
    values (trim(c ->> 'nombre'), c ->> 'telefono', c ->> 'email', c ->> 'dni',
            c ->> 'direccion', c ->> 'localidad', c ->> 'codigo_postal')
    returning id into v_cliente;
  else
    update public.clientes set
      telefono      = coalesce(telefono, c ->> 'telefono'),
      email         = coalesce(email, c ->> 'email'),
      dni           = coalesce(dni, c ->> 'dni'),
      direccion     = coalesce(c ->> 'direccion', direccion),
      localidad     = coalesce(c ->> 'localidad', localidad),
      codigo_postal = coalesce(c ->> 'codigo_postal', codigo_postal)
    where id = v_cliente;
  end if;

  -- Número: el que trae (si está libre) o el siguiente. La secuencia nunca queda atrás.
  -- Un número muy adelantado (error de tipeo en la planilla) no se usa, para no saltear la numeración.
  if v_numero is not null and (exists (select 1 from public.pedidos where numero = v_numero)
       or v_numero > (select last_value from public.pedidos_numero_seq) + 50) then
    v_numero := null;
  end if;
  if v_numero is null then
    v_numero := nextval('public.pedidos_numero_seq');
  else
    perform setval('public.pedidos_numero_seq', greatest(v_numero, (select last_value from public.pedidos_numero_seq)));
  end if;

  insert into public.pedidos (
    numero, cliente_id, tipo_venta, canal, responsable_id, etapa, fecha_venta, fecha_limite,
    envio, direccion_entrega, forma_pago, total, precio_envio_cliente, observaciones,
    pauta, campana, dm_inbound, tiendanube_id, creado_por
  ) values (
    v_numero, v_cliente, coalesce(p ->> 'tipo_venta', 'minorista'), coalesce(p ->> 'canal', 'tiendanube'),
    (p ->> 'responsable_id')::uuid, 'senado', v_fecha,
    (p ->> 'fecha_limite')::date, coalesce(p ->> 'envio', 'coordinar'), p ->> 'direccion_entrega',
    p ->> 'forma_pago', v_total, v_envio, p ->> 'observaciones',
    (p ->> 'pauta')::boolean, p ->> 'campana', p ->> 'dm_inbound', p ->> 'tiendanube_id', v_creador
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
    insert into public.pagos (pedido_id, tipo, monto, medio, fecha, nota, creado_por)
    values (v_pedido, case when v_sena >= v_total + v_envio then 'total' else 'sena' end,
            v_sena, p ->> 'forma_pago', v_fecha, coalesce(p ->> 'nota_pago', 'Pagado en Tienda Nube'), v_creador);
  end if;

  return v_pedido;
end $$;

revoke all on function public.crear_pedido_externo(jsonb) from public, anon, authenticated;
grant execute on function public.crear_pedido_externo(jsonb) to service_role;

-- 3. Revisión automática cada 15 minutos (pg_cron llama a la app con una clave propia).
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

insert into public.integraciones (clave, datos)
values ('cron_planilla', jsonb_build_object('secreto', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')))
on conflict (clave) do nothing;

select cron.unschedule(jobid) from cron.job where jobname = 'spazio-planilla-original';
select cron.schedule(
  'spazio-planilla-original',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://spazio-gestion.vercel.app/api/cron/planilla',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select datos ->> 'secreto' from public.integraciones where clave = 'cron_planilla')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $cron$
);
