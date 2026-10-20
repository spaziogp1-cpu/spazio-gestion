-- =====================================================================
-- Spazio Design · Cotizador · Mesa Helios (sin y con estante) + insumos de la Aire
-- Se ejecuta después de 2026-10_grises_y_mesa_luna.sql. Se puede correr de nuevo.
-- =====================================================================

-- La Helios con estante tiene una sola medida en la lista de STG: para estimar otras
-- se usa la misma suba que la Helios sin estante ($750 por cm de largo + profundidad).
update public.cot_tarifas t set incremento = 750
from public.cot_insumos i
where i.id = t.insumo_id and i.codigo = 'estructura-stg' and t.vigente_hasta is null
  and t.variante = '{"modelo": "helios-estante"}'::jsonb and t.incremento is null;

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

-- Mesa Helios: estructura de caño curvo cromado de STG, tapa y base de vidrio del tamaño de la estructura.

insert into public.cot_productos (nombre, categoria_id, descripcion)
select 'Mesa Helios', c.id, 'Mesa ratona con estructura de caño curvo cromado y superficies de vidrio.'
from public.cot_categorias c where c.nombre = 'Mesas ratonas'
  and not exists (select 1 from public.cot_productos x where lower(x.nombre) = 'mesa helios' and x.activo);

insert into public.cot_recetas (producto_id, version, estado, definicion, nota, publicado_en)
select x.id, 1, 'publicada', '{"orden": ["L", "P", "H", "color"], "entradas": {"L": {"tipo": "medida", "nombre": "Largo", "def": 100}, "P": {"tipo": "medida", "nombre": "Profundidad", "def": 70}, "H": {"tipo": "medida", "nombre": "Alto", "def": 45}, "color": {"tipo": "opcion", "nombre": "Color", "atributo": "color", "def": "incoloro"}}, "lineas": [{"id": "estructura", "nombre": "Estructura STG", "regla": "tabla", "insumo": "estructura-stg", "variante": {"modelo": "''helios''"}, "referencia": "L + P", "nota": "Precio por medida (largo + profundidad); otras medidas se estiman"}, {"id": "tapa", "nombre": "Tapa", "regla": "m2", "insumoFormula": "si(en(color, ''gris'', ''bronce''), ''vidrio-float'', ''vidrio-laminado'')", "variante": {"espesor": "si(color == ''gris'', ''10'', ''8'')", "composicion": "''4+4''", "color": "color"}, "ancho": "L", "largo": "P", "nota": "Incoloro y colores: laminado 4+4. Bronce: float 8. Gris: float 10"}, {"id": "base", "nombre": "Base", "regla": "m2", "insumoFormula": "si(en(color, ''gris'', ''bronce''), ''vidrio-float'', ''vidrio-laminado'')", "variante": {"espesor": "si(color == ''gris'', ''10'', ''8'')", "composicion": "''4+4''", "color": "color"}, "ancho": "L", "largo": "P"}, {"id": "ajuste", "nombre": "Ajuste", "regla": "porcentaje", "porcentaje": "aj.ajuste_vidpro", "sobre": ["tapa", "base"], "nota": "Mesa baja: 20% sobre todos los vidrios"}]}'::jsonb, 'Carga inicial', now()
from public.cot_productos x
where lower(x.nombre) = 'mesa helios' and x.activo
  and not exists (select 1 from public.cot_recetas r where r.producto_id = x.id);

update public.cot_productos x set receta_publicada_id = r.id
from public.cot_recetas r
where r.producto_id = x.id and r.estado = 'publicada' and lower(x.nombre) = 'mesa helios' and x.receta_publicada_id is null;

insert into public.cot_receta_insumos (receta_id, insumo_id)
select x.receta_publicada_id, i.id
from public.cot_productos x, public.cot_insumos i
where lower(x.nombre) = 'mesa helios' and x.activo and x.receta_publicada_id is not null
  and i.codigo in ('estructura-stg', 'vidrio-float', 'vidrio-laminado')
on conflict do nothing;

insert into public.cot_productos (nombre, categoria_id, descripcion)
select 'Mesa Helios con estante', c.id, 'Mesa ratona con estructura de caño curvo cromado, superficies de vidrio y estante.'
from public.cot_categorias c where c.nombre = 'Mesas ratonas'
  and not exists (select 1 from public.cot_productos x where lower(x.nombre) = 'mesa helios con estante' and x.activo);

insert into public.cot_recetas (producto_id, version, estado, definicion, nota, publicado_en)
select x.id, 1, 'publicada', '{"orden": ["L", "P", "H", "color"], "entradas": {"L": {"tipo": "medida", "nombre": "Largo", "def": 100}, "P": {"tipo": "medida", "nombre": "Profundidad", "def": 70}, "H": {"tipo": "medida", "nombre": "Alto", "def": 45}, "color": {"tipo": "opcion", "nombre": "Color", "atributo": "color", "def": "incoloro"}}, "lineas": [{"id": "estructura", "nombre": "Estructura STG", "regla": "tabla", "insumo": "estructura-stg", "variante": {"modelo": "''helios-estante''"}, "referencia": "L + P", "nota": "Precio por medida (largo + profundidad); otras medidas se estiman"}, {"id": "tapa", "nombre": "Tapa", "regla": "m2", "insumoFormula": "si(en(color, ''gris'', ''bronce''), ''vidrio-float'', ''vidrio-laminado'')", "variante": {"espesor": "si(color == ''gris'', ''10'', ''8'')", "composicion": "''4+4''", "color": "color"}, "ancho": "L", "largo": "P", "nota": "Incoloro y colores: laminado 4+4. Bronce: float 8. Gris: float 10"}, {"id": "base", "nombre": "Base", "regla": "m2", "insumoFormula": "si(en(color, ''gris'', ''bronce''), ''vidrio-float'', ''vidrio-laminado'')", "variante": {"espesor": "si(color == ''gris'', ''10'', ''8'')", "composicion": "''4+4''", "color": "color"}, "ancho": "L", "largo": "P"}, {"id": "ajuste", "nombre": "Ajuste", "regla": "porcentaje", "porcentaje": "aj.ajuste_vidpro", "sobre": ["tapa", "base"], "nota": "Mesa baja: 20% sobre todos los vidrios"}]}'::jsonb, 'Carga inicial', now()
from public.cot_productos x
where lower(x.nombre) = 'mesa helios con estante' and x.activo
  and not exists (select 1 from public.cot_recetas r where r.producto_id = x.id);

update public.cot_productos x set receta_publicada_id = r.id
from public.cot_recetas r
where r.producto_id = x.id and r.estado = 'publicada' and lower(x.nombre) = 'mesa helios con estante' and x.receta_publicada_id is null;

insert into public.cot_receta_insumos (receta_id, insumo_id)
select x.receta_publicada_id, i.id
from public.cot_productos x, public.cot_insumos i
where lower(x.nombre) = 'mesa helios con estante' and x.activo and x.receta_publicada_id is not null
  and i.codigo in ('estructura-stg', 'vidrio-float', 'vidrio-laminado')
on conflict do nothing;
