-- =====================================================================
-- Spazio Design · Cotizador · Insumos de la Mesa Aire (perfiles L y silicona)
-- Faltaban en la base: sin ellos la Aire da error. Se puede correr de nuevo.
-- =====================================================================
-- Insumos de la Mesa Aire (precios del 20/10/2026)
insert into public.cot_insumos (codigo, tipo, nombre, unidad, atributos, orden, notas)
values ('silicona', 'proceso', 'Pegado con silicona', 'fijo', '{}', 500, 'Precio fijo por mesa, sin importar la medida'),
       ('perfil-l-aluminio', 'herraje', 'Perfil L de aluminio', 'ml', '{}', 510, 'Barra de 6 m a $45.000: se cobra por metro')
on conflict (codigo) do nothing;
insert into public.cot_tarifas (insumo_id, variante, precio, nota, vigente_desde)
select i.id, '{}'::jsonb, 15000, null, '2026-10-20' from public.cot_insumos i where i.codigo = 'silicona'
  and not exists (select 1 from public.cot_tarifas t where t.insumo_id = i.id and t.vigente_hasta is null);
insert into public.cot_tarifas (insumo_id, variante, precio, nota, vigente_desde)
select i.id, '{}'::jsonb, 7500, '$45.000 la barra de 6 m', '2026-10-20' from public.cot_insumos i where i.codigo = 'perfil-l-aluminio'
  and not exists (select 1 from public.cot_tarifas t where t.insumo_id = i.id and t.vigente_hasta is null);
