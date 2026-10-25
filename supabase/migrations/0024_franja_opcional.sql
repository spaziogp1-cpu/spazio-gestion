-- =====================================================================
-- Spazio Design · Gestión · Entregas: la franja horaria pasa a ser opcional
--  - Sin franja, la entrega queda "Lista" igual: el horario lo arma la ruta
--    dentro de la jornada del fletero y después se le avisa al cliente.
--  - Si se carga una franja, se respeta como antes.
--
-- Se ejecuta una sola vez en Supabase → SQL Editor → "Run". Se puede correr de nuevo.
-- Necesita la 0022 (entregas).
-- =====================================================================

create or replace function public.entrega_completar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t jsonb;
  m text[] := '{}';
  v_envio text;
  v_piso integer;
  v_alta boolean;
begin
  -- Si cambió la dirección y no se mandó una ubicación nueva, la anterior ya no vale.
  if tg_op = 'UPDATE'
     and (new.direccion, new.localidad, new.codigo_postal) is distinct from (old.direccion, old.localidad, old.codigo_postal)
     and new.lat is not distinct from old.lat then
    new.lat := null; new.lng := null; new.place_id := null; new.direccion_google := null;
    new.precision := null; new.ubicacion_confirmada := false;
  end if;

  begin
    t := public.notif_param('entregas_tiempos', '{}')::jsonb;
  exception when others then
    t := '{}';
  end;
  new.unidades := coalesce(new.unidades_manual, public.entrega_unidades(new.pedido_id));
  v_piso := coalesce((regexp_match(coalesce(new.piso_depto, ''), '(\d+)'))[1]::integer, 0);
  new.minutos := round(coalesce((t ->> 'base')::numeric, 15)
                 + coalesce((t ->> 'por_unidad')::numeric, 10) * new.unidades
                 + case when coalesce(new.ascensor, 'no_sabe') <> 'si' then coalesce((t ->> 'por_piso')::numeric, 5) * least(v_piso, 20) else 0 end
                 + case when new.instalacion then coalesce((t ->> 'instalacion')::numeric, 20) else 0 end);
  select exists (select 1 from public.pedido_items i where i.pedido_id = new.pedido_id and lower(i.producto) = 'mesa alta') into v_alta;
  new.personas := coalesce(new.personas_manual,
                    case when new.instalacion or new.ayuda_descarga or v_alta or new.unidades >= 2 then 2 else 1 end);

  select envio into v_envio from public.pedidos where id = new.pedido_id;
  if new.tipo = 'expreso' and coalesce(trim(new.expreso_nombre), '') = '' then m := m || 'Falta qué expreso eligió el cliente'::text; end if;
  if coalesce(trim(new.direccion), '') = '' then
    m := m || (case when new.tipo = 'expreso' then 'Falta la dirección de la sucursal del expreso' else 'Falta la dirección' end)::text;
  elsif new.direccion !~ '\d' then
    m := m || 'La dirección no tiene número'::text;
  elsif new.lat is null then
    m := m || 'Falta ubicarla en el mapa'::text;
  elsif new.precision <> 'exacta' and not new.ubicacion_confirmada then
    m := m || 'Google la ubicó de forma aproximada: confirmá la ubicación'::text;
  end if;
  if new.tipo = 'cliente' and length(regexp_replace(coalesce(new.recibe_telefono, ''), '\D', '', 'g')) < 8 then
    m := m || 'Falta el teléfono de quien recibe'::text;
  end if;
  if new.fecha_acordada is null then m := m || 'Falta la fecha acordada'::text; end if;
  -- La franja es opcional: sin franja, el horario lo arma la ruta y se le avisa al cliente.
  if (new.franja_desde is null) <> (new.franja_hasta is null) then
    m := m || 'Completá la franja (desde y hasta) o dejala vacía'::text;
  elsif new.franja_hasta <= new.franja_desde then
    m := m || 'La franja horaria termina antes de empezar'::text;
  end if;
  if v_envio = 'coordinar' then m := m || 'El envío está "a coordinar": definí si va por flete o retira'::text; end if;
  new.motivos := m;

  if new.estado in ('revisar', 'lista') then
    new.estado := case when cardinality(m) = 0 then 'lista' else 'revisar' end;
  end if;
  if new.estado in ('entregada', 'no_entregada', 'cancelada') and new.cerrada_en is null then new.cerrada_en := now(); end if;
  return new;
end $$;


-- Se recalculan las entregas abiertas (las que solo esperaban la franja pasan a Lista).
select public.entregas_recalcular() as recalculadas;
