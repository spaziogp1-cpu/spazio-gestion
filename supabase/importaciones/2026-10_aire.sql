-- =====================================================================
-- Spazio Design · Cotizador · Tapas de melamina y producto Mesa Aire Alta Redonda
-- Precios del 20/10/2026. La receta la publica 2026-10_recetas_piloto.sql
-- (correr este archivo antes). Se puede correr de nuevo: no duplica nada.
-- =====================================================================

insert into public.proveedores (nombre, que_provee, plazo_dias)
values ('Guido', 'Tapas de melamina', 25)
on conflict (nombre) do nothing;

insert into public.cot_insumos (codigo, tipo, nombre, unidad, atributos, orden, notas)
values
  ('tapa-melamina-redonda', 'madera', 'Tapa redonda de melamina 18 mm', 'unidad', '{}', 600,
   'Precio por diámetro (cm). Otros diámetros se estiman y quedan para confirmar'),
  ('tapa-melamina-rectangular', 'madera', 'Tapa rectangular de melamina 18 mm', 'unidad', '{}', 610,
   'Precio por medida: la referencia es largo + profundidad (cm). Otras medidas se estiman')
on conflict (codigo) do nothing;

update public.cot_insumos set proveedor_id = (select id from public.proveedores where nombre = 'Guido')
where codigo in ('tapa-melamina-redonda', 'tapa-melamina-rectangular') and proveedor_id is null;

insert into public.cot_tarifas (insumo_id, variante, referencia, precio, nota, vigente_desde)
select i.id, '{}'::jsonb, v.ref, v.precio, v.nota, '2026-10-20'
from public.cot_insumos i
join (values
  ('tapa-melamina-redonda', 60, 100000, 'Ø 60'),
  ('tapa-melamina-redonda', 80, 140000, 'Ø 80'),
  ('tapa-melamina-redonda', 100, 160000, 'Ø 100'),
  ('tapa-melamina-redonda', 120, 180000, 'Ø 120'),
  ('tapa-melamina-redonda', 140, 220000, 'Ø 140'),
  ('tapa-melamina-rectangular', 120, 90000, '80 × 40'),
  ('tapa-melamina-rectangular', 150, 110000, '100 × 50'),
  ('tapa-melamina-rectangular', 170, 130000, '100 × 70'),
  ('tapa-melamina-rectangular', 240, 200000, '160 × 80'),
  ('tapa-melamina-rectangular', 270, 220000, '180 × 90'),
  ('tapa-melamina-rectangular', 300, 310000, '200 × 100'),
  ('tapa-melamina-rectangular', 370, 380000, '250 × 120')
) as v(codigo, ref, precio, nota) on v.codigo = i.codigo
where not exists (
  select 1 from public.cot_tarifas t
  where t.insumo_id = i.id and t.referencia = v.ref and t.vigente_hasta is null
);

insert into public.cot_productos (nombre, categoria_id, descripcion)
select 'Mesa Aire Alta Redonda', c.id,
       'Mesa alta con tapa de melamina Egger 18 mm y bases de vidrio incoloro.'
from public.cot_categorias c where c.nombre = 'Mesas de comedor'
  and not exists (select 1 from public.cot_productos x where lower(x.nombre) = 'mesa aire alta redonda' and x.activo);

insert into public.cot_productos (nombre, categoria_id, descripcion)
select 'Mesa Aire Ratona Redonda', c.id,
       'Mesa ratona con tapa de melamina Egger 18 mm y bases de vidrio.'
from public.cot_categorias c where c.nombre = 'Mesas ratonas'
  and not exists (select 1 from public.cot_productos x where lower(x.nombre) = 'mesa aire ratona redonda' and x.activo);

insert into public.cot_productos (nombre, categoria_id, descripcion)
select 'Mesa Aire Alta Rectangular', c.id,
       'Mesa alta con tapa de melamina Egger 18 mm y bases de vidrio.'
from public.cot_categorias c where c.nombre = 'Mesas de comedor'
  and not exists (select 1 from public.cot_productos x where lower(x.nombre) = 'mesa aire alta rectangular' and x.activo);

insert into public.cot_productos (nombre, categoria_id, descripcion)
select 'Mesa Aire Ratona Rectangular', c.id,
       'Mesa ratona con tapa de melamina Egger 18 mm y bases de vidrio.'
from public.cot_categorias c where c.nombre = 'Mesas ratonas'
  and not exists (select 1 from public.cot_productos x where lower(x.nombre) = 'mesa aire ratona rectangular' and x.activo);

-- Medidas de los planos que no estaban en la lista de Guido (20/10/2026): precio estimado
-- con el promedio del precio por m² de las dos medidas vecinas de la lista.
insert into public.cot_tarifas (insumo_id, variante, referencia, precio, nota, vigente_desde)
select i.id, '{}'::jsonb, v.ref, v.precio, v.nota, '2026-10-20'
from public.cot_insumos i
join (values
  ('tapa-melamina-redonda', 160, 287000, 'Ø 160 · estimado por m²'),
  ('tapa-melamina-redonda', 180, 364000, 'Ø 180 · estimado por m²'),
  ('tapa-melamina-rectangular', 210, 185000, '120 × 90 · estimado por m²'),
  ('tapa-melamina-rectangular', 250, 210000, '160 × 90 · estimado por m²'),
  ('tapa-melamina-rectangular', 280, 249000, '190 × 90 · estimado por m²'),
  ('tapa-melamina-rectangular', 320, 310000, '220 × 100 · estimado por m²'),
  ('tapa-melamina-rectangular', 350, 352000, '250 × 100 · estimado por m²'),
  ('tapa-melamina-rectangular', 420, 456000, '300 × 120 · estimado por m²')
) as v(codigo, ref, precio, nota) on v.codigo = i.codigo
where not exists (
  select 1 from public.cot_tarifas t
  where t.insumo_id = i.id and t.referencia = v.ref and t.vigente_hasta is null
);
