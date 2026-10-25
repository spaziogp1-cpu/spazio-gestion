-- Buscador global: busca en pedidos, clientes, presupuestos, tareas, visitas y proveedores.
-- Sin acentos (unaccent) y tolerante a errores de tipeo (pg_trgm).
-- La interpretación de la frase ("atrasados", "octubre", "#557"…) la hace la app (lib/buscador)
-- y llega acá ya separada en texto + filtros.

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create or replace function public.normalizar(t text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, '')))
$$;

-- ¿Cada palabra de la búsqueda aparece (o casi) en el texto?
create or replace function public.coincide_palabras(palabras text[], doc text) returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select coalesce(bool_and(
           doc like '%' || w || '%'
           or (length(w) >= 4 and extensions.word_similarity(w, doc) >= 0.5)
         ), true)
  from unnest(palabras) w
$$;

create or replace function public.puntaje_busqueda(q text, palabras text[], titulo text, doc text) returns real
language sql immutable parallel safe set search_path = '' as $$
  select (case when q = '' then 0::real else
            extensions.word_similarity(q, doc)
            + 0.6 * extensions.word_similarity(q, titulo)
            + case when titulo like q || '%' then 0.5 else 0 end
            + coalesce((select count(*) filter (where titulo like '%' || w || '%') from unnest(palabras) w), 0) * 0.15
          end)::real
$$;

-- p_texto:   lo que quedó para buscar como texto libre (sin normalizar)
-- p_numero:  número de pedido / presupuesto
-- p_digitos: teléfono (solo dígitos, 6 o más)
-- p_filtros: {"etapas":[…], "atrasado":true, "con_saldo":true, "desde":"2026-10-01", "hasta":"2026-10-31",
--             "envio":"flete", "canal":"tiendanube", "tipo_venta":"mayorista", "vendedor":"tete",
--             "solo":"pedidos"|"clientes"|…}
create or replace function public.buscar_global(
  p_texto text default '',
  p_numero integer default null,
  p_digitos text default null,
  p_filtros jsonb default '{}'::jsonb,
  p_limite integer default 8
) returns table (
  tipo text, id uuid, titulo text, detalle text, estado text, fecha date, monto numeric, puntaje real
)
language plpgsql stable security invoker set search_path = public, extensions as $$
declare
  q text := trim(public.normalizar(p_texto));
  palabras text[] := coalesce((select array_agg(w) from regexp_split_to_table(q, '\s+') w where length(w) >= 2), '{}');
  f jsonb := coalesce(p_filtros, '{}'::jsonb);
  con_filtros boolean := f ?| array['etapas','atrasado','con_saldo','desde','hasta','envio','canal','tipo_venta','vendedor'];
  solo text := f->>'solo';
  lim integer := least(greatest(coalesce(p_limite, 8), 1), 50);
  hay_busqueda boolean;
begin
  if q = '' then palabras := '{}'; end if;
  hay_busqueda := q <> '' or p_numero is not null or p_digitos is not null;
  if not hay_busqueda and not con_filtros then return; end if;

  -- Pedidos -------------------------------------------------------------------
  if solo is null or solo = 'pedidos' then
    return query
    with base as (
      select p.id, p.numero, p.etapa, p.fecha_limite, p.fecha_venta, p.saldo, p.atrasado, p.productos,
             p.cliente_nombre, p.envio, p.canal, p.tipo_venta,
             public.normalizar(p.cliente_nombre) as tit,
             public.normalizar(concat_ws(' ', p.numero, p.cliente_nombre, p.cliente_localidad, p.direccion_entrega,
               p.responsable_nombre, p.observaciones, p.campana, it.txt)) as doc,
             regexp_replace(coalesce(p.cliente_telefono, ''), '\D', '', 'g') as tel,
             public.normalizar(p.responsable_nombre) as vend
      from public.pedidos_resumen p
      left join lateral (
        select string_agg(concat_ws(' ', i.producto, i.modelo, i.color, i.tapa, i.material, i.medidas), ' ') as txt
        from public.pedido_items i where i.pedido_id = p.id
      ) it on true
    )
    select 'pedido'::text, b.id, ('#' || b.numero || ' · ' || b.cliente_nombre),
           nullif(b.productos, ''), b.etapa, b.fecha_limite, b.saldo,
           (case when p_numero is not null and b.numero = p_numero then 10 else 0 end
            + case when p_digitos is not null and b.tel like '%' || p_digitos || '%' then 5 else 0 end
            + public.puntaje_busqueda(q, palabras, b.tit, b.doc)
            + case when b.etapa not in ('entregado','cancelado') then 0.2 else 0 end)::real
    from base b
    where (not hay_busqueda
           or (p_numero is not null and (b.numero = p_numero))
           or (p_digitos is not null and b.tel like '%' || p_digitos || '%')
           or (q <> '' and public.coincide_palabras(palabras, b.doc)))
      and (not (f ? 'etapas') or b.etapa in (select jsonb_array_elements_text(f->'etapas')))
      and (not coalesce((f->>'atrasado')::boolean, false) or b.atrasado)
      and (not coalesce((f->>'con_saldo')::boolean, false) or (b.saldo > 0 and b.etapa <> 'cancelado'))
      and (f->>'desde' is null or b.fecha_venta >= (f->>'desde')::date)
      and (f->>'hasta' is null or b.fecha_venta <= (f->>'hasta')::date)
      and (f->>'envio' is null or b.envio = f->>'envio')
      and (f->>'canal' is null or b.canal = f->>'canal')
      and (f->>'tipo_venta' is null or b.tipo_venta = f->>'tipo_venta')
      and (f->>'vendedor' is null or b.vend like '%' || public.normalizar(f->>'vendedor') || '%')
    order by 8 desc, b.fecha_limite asc nulls last
    limit case when con_filtros then 50 else lim end;
  end if;

  -- Si la frase traía filtros de pedidos, el resto no aplica.
  if con_filtros then return; end if;

  -- Clientes ------------------------------------------------------------------
  if solo is null or solo = 'clientes' then
    return query
    select 'cliente'::text, c.id, c.nombre,
           nullif(concat_ws(' · ', c.telefono, c.localidad, c.email), ''),
           null::text, null::date, null::numeric,
           (case when p_digitos is not null and regexp_replace(coalesce(c.telefono,''), '\D', '', 'g') like '%' || p_digitos || '%' then 6 else 0 end
            + case when p_digitos is not null and regexp_replace(coalesce(c.dni,''), '\D', '', 'g') = p_digitos then 6 else 0 end
            + public.puntaje_busqueda(q, palabras, public.normalizar(c.nombre),
                public.normalizar(concat_ws(' ', c.nombre, c.email, c.dni, c.direccion, c.localidad, c.notas))))::real
    from public.clientes c
    where (p_digitos is not null and (regexp_replace(coalesce(c.telefono,''), '\D', '', 'g') like '%' || p_digitos || '%'
                                   or regexp_replace(coalesce(c.dni,''), '\D', '', 'g') = p_digitos))
       or (q <> '' and public.coincide_palabras(palabras,
             public.normalizar(concat_ws(' ', c.nombre, c.email, c.dni, c.direccion, c.localidad, c.notas))))
    order by 8 desc
    limit lim;
  end if;

  -- Presupuestos --------------------------------------------------------------
  if solo is null or solo = 'presupuestos' then
    return query
    with base as (
      select pr.*, public.normalizar(pr.cliente_nombre) as tit,
             public.normalizar(concat_ws(' ', pr.numero, pr.cliente_nombre, pr.observaciones, it.txt)) as doc
      from public.cot_presupuestos pr
      left join lateral (
        select string_agg(concat_ws(' ', i.titulo, i.detalle), ' ') as txt
        from public.cot_presupuesto_items i where i.presupuesto_id = pr.id
      ) it on true
    )
    select 'presupuesto'::text, b.id, ('Presupuesto ' || b.numero || ' · ' || b.cliente_nombre),
           null::text, b.estado, b.fecha, b.total,
           (case when p_numero is not null and b.numero = p_numero then 8 else 0 end
            + case when p_digitos is not null and regexp_replace(coalesce(b.cliente_telefono,''), '\D', '', 'g') like '%' || p_digitos || '%' then 4 else 0 end
            + public.puntaje_busqueda(q, palabras, b.tit, b.doc) - 0.1)::real
    from base b
    where (p_numero is not null and b.numero = p_numero)
       or (p_digitos is not null and regexp_replace(coalesce(b.cliente_telefono,''), '\D', '', 'g') like '%' || p_digitos || '%')
       or (q <> '' and public.coincide_palabras(palabras, b.doc))
    order by 8 desc, b.fecha desc
    limit lim;
  end if;

  if q = '' and p_digitos is null then return; end if;

  -- Tareas --------------------------------------------------------------------
  if solo is null or solo = 'tareas' then
    return query
    select 'tarea'::text, t.id, t.titulo, nullif(t.descripcion, ''), t.estado, t.vencimiento, null::numeric,
           (public.puntaje_busqueda(q, palabras, public.normalizar(t.titulo),
              public.normalizar(concat_ws(' ', t.titulo, t.descripcion, t.bloqueo)))
            - case when t.estado = 'hecha' then 0.4 else 0 end)::real
    from public.tareas t
    where q <> '' and public.coincide_palabras(palabras, public.normalizar(concat_ws(' ', t.titulo, t.descripcion, t.bloqueo)))
    order by 8 desc
    limit lim;
  end if;

  -- Visitas al showroom -------------------------------------------------------
  if solo is null or solo = 'visitas' then
    return query
    select 'visita'::text, v.id, v.nombre,
           nullif(concat_ws(' · ', to_char(v.hora, 'HH24:MI'), v.motivo), ''), v.estado, v.fecha, null::numeric,
           (case when p_digitos is not null and regexp_replace(coalesce(v.telefono,''), '\D', '', 'g') like '%' || p_digitos || '%' then 4 else 0 end
            + public.puntaje_busqueda(q, palabras, public.normalizar(v.nombre),
                public.normalizar(concat_ws(' ', v.nombre, v.motivo, v.notas))) - 0.2)::real
    from public.visitas v
    where (p_digitos is not null and regexp_replace(coalesce(v.telefono,''), '\D', '', 'g') like '%' || p_digitos || '%')
       or (q <> '' and public.coincide_palabras(palabras, public.normalizar(concat_ws(' ', v.nombre, v.motivo, v.notas))))
    order by 8 desc, v.fecha desc
    limit lim;
  end if;

  -- Proveedores ---------------------------------------------------------------
  if solo is null or solo = 'proveedores' then
    return query
    select 'proveedor'::text, pv.id, pv.nombre, nullif(concat_ws(' · ', pv.que_provee, pv.contacto, pv.telefono), ''),
           case when pv.activo then null else 'inactivo' end, null::date, null::numeric,
           (case when p_digitos is not null and regexp_replace(coalesce(pv.telefono,''), '\D', '', 'g') like '%' || p_digitos || '%' then 4 else 0 end
            + public.puntaje_busqueda(q, palabras, public.normalizar(pv.nombre),
                public.normalizar(concat_ws(' ', pv.nombre, pv.que_provee, pv.contacto))))::real
    from public.proveedores pv
    where (p_digitos is not null and regexp_replace(coalesce(pv.telefono,''), '\D', '', 'g') like '%' || p_digitos || '%')
       or (q <> '' and public.coincide_palabras(palabras, public.normalizar(concat_ws(' ', pv.nombre, pv.que_provee, pv.contacto))))
    order by 8 desc
    limit lim;
  end if;
end $$;

grant execute on function public.normalizar(text) to authenticated, service_role;
grant execute on function public.buscar_global(text, integer, text, jsonb, integer) to authenticated, service_role;
revoke execute on function public.buscar_global(text, integer, text, jsonb, integer) from anon, public;
