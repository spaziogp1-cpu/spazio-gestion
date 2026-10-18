-- =====================================================================
-- Spazio Design · Gestión · Ventas de Tienda Nube
-- Cada venta pagada en spaziodesign.net entra sola como pedido.
--
-- Se ejecuta una sola vez en Supabase → SQL Editor → "Run".
-- =====================================================================

-- Credenciales de servicios externos (token de Tienda Nube).
-- Sin políticas: solo el servidor (clave de servicio) puede leerla.
create table public.integraciones (
  clave           text primary key,
  datos           jsonb not null default '{}'::jsonb,
  actualizado_en  timestamptz not null default now()
);
alter table public.integraciones enable row level security;

-- Registro de cada orden de Tienda Nube recibida: evita duplicados y deja ver qué pasó.
create table public.tiendanube_ordenes (
  orden_id      bigint primary key,                 -- id interno de Tienda Nube
  numero        integer,                            -- número que ve el cliente (#1234)
  pedido_id     uuid references public.pedidos(id) on delete set null,
  estado        text not null default 'procesando'
                check (estado in ('procesando','creado','vinculado','sin_pagar','error')),
  detalle       text,
  intentos      integer not null default 0,
  recibido_en   timestamptz not null default now(),
  procesado_en  timestamptz
);
create index tiendanube_ordenes_estado on public.tiendanube_ordenes (estado, recibido_en);

alter table public.tiendanube_ordenes enable row level security;
create policy tiendanube_ordenes_lee on public.tiendanube_ordenes for select to authenticated
  using (public.es_equipo());

-- Alta de un pedido desde el servidor (sin usuario logueado).
-- Busca el cliente por email o teléfono antes de crear uno nuevo.
create or replace function public.crear_pedido_externo(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cliente uuid;
  v_pedido  uuid;
  v_total   numeric := coalesce((p ->> 'total')::numeric, 0);
  v_envio   numeric := coalesce((p ->> 'precio_envio_cliente')::numeric, 0);
  v_sena    numeric := coalesce((p ->> 'sena')::numeric, 0);
  v_creador uuid := (p ->> 'creado_por')::uuid;
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

  insert into public.pedidos (
    cliente_id, tipo_venta, canal, responsable_id, etapa, fecha_venta, fecha_limite,
    envio, direccion_entrega, forma_pago, total, precio_envio_cliente, observaciones,
    tiendanube_id, creado_por
  ) values (
    v_cliente, 'minorista', coalesce(p ->> 'canal', 'tiendanube'), null, 'senado', v_fecha,
    (p ->> 'fecha_limite')::date, coalesce(p ->> 'envio', 'coordinar'), p ->> 'direccion_entrega',
    p ->> 'forma_pago', v_total, v_envio, p ->> 'observaciones', p ->> 'tiendanube_id', v_creador
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
            v_sena, p ->> 'forma_pago', v_fecha, 'Pagado en Tienda Nube', v_creador);
  end if;

  return v_pedido;
end $$;

revoke all on function public.crear_pedido_externo(jsonb) from public, anon, authenticated;
grant execute on function public.crear_pedido_externo(jsonb) to service_role;
