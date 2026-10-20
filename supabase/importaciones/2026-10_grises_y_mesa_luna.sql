-- =====================================================================
-- Spazio Design · Cotizador · Gris y bronce laminado + Mesa Luna
-- Precios del 20/10/2026 (con IVA). Se ejecuta después de 0015.
-- Se puede correr de nuevo: no duplica nada.
-- =====================================================================

-- Gris claro laminado (columna nueva "Gris" en vidrio laminado)
insert into public.cot_tarifas (insumo_id, variante, precio, nota, vigente_desde) select i.id, '{"composicion": "4+4", "color": "gris"}'::jsonb, 115000, 'Gris claro', '2026-10-20' from public.cot_insumos i where i.codigo = 'vidrio-laminado' and not exists (select 1 from public.cot_tarifas t where t.insumo_id = i.id and t.variante = '{"composicion": "4+4", "color": "gris"}'::jsonb and t.vigente_hasta is null);
insert into public.cot_tarifas (insumo_id, variante, precio, nota, vigente_desde) select i.id, '{"composicion": "5+5", "color": "gris"}'::jsonb, 147000, 'Gris claro', '2026-10-20' from public.cot_insumos i where i.codigo = 'vidrio-laminado' and not exists (select 1 from public.cot_tarifas t where t.insumo_id = i.id and t.variante = '{"composicion": "5+5", "color": "gris"}'::jsonb and t.vigente_hasta is null);
insert into public.cot_tarifas (insumo_id, variante, precio, nota, vigente_desde) select i.id, '{"composicion": "6+6", "color": "gris"}'::jsonb, 166000, 'Gris claro', '2026-10-20' from public.cot_insumos i where i.codigo = 'vidrio-laminado' and not exists (select 1 from public.cot_tarifas t where t.insumo_id = i.id and t.variante = '{"composicion": "6+6", "color": "gris"}'::jsonb and t.vigente_hasta is null);
insert into public.cot_tarifas (insumo_id, variante, precio, nota, vigente_desde) select i.id, '{"composicion": "10+5", "color": "gris"}'::jsonb, 227600, 'Gris claro', '2026-10-20' from public.cot_insumos i where i.codigo = 'vidrio-laminado' and not exists (select 1 from public.cot_tarifas t where t.insumo_id = i.id and t.variante = '{"composicion": "10+5", "color": "gris"}'::jsonb and t.vigente_hasta is null);
insert into public.cot_tarifas (insumo_id, variante, precio, nota, vigente_desde) select i.id, '{"composicion": "10+10", "color": "gris"}'::jsonb, 198500, 'Gris claro', '2026-10-20' from public.cot_insumos i where i.codigo = 'vidrio-laminado' and not exists (select 1 from public.cot_tarifas t where t.insumo_id = i.id and t.variante = '{"composicion": "10+10", "color": "gris"}'::jsonb and t.vigente_hasta is null);

-- Bronce laminado: mismo precio que el gris oscuro de la lista de Vidpro
insert into public.cot_tarifas (insumo_id, variante, precio, nota, vigente_desde) select i.id, '{"composicion": "8+8", "color": "bronce"}'::jsonb, 226300, 'Igual que gris oscuro', '2026-10-20' from public.cot_insumos i where i.codigo = 'vidrio-laminado' and not exists (select 1 from public.cot_tarifas t where t.insumo_id = i.id and t.variante = '{"composicion": "8+8", "color": "bronce"}'::jsonb and t.vigente_hasta is null);
insert into public.cot_tarifas (insumo_id, variante, precio, nota, vigente_desde) select i.id, '{"composicion": "10+10", "color": "bronce"}'::jsonb, 251500, 'Igual que gris oscuro', '2026-10-20' from public.cot_insumos i where i.codigo = 'vidrio-laminado' and not exists (select 1 from public.cot_tarifas t where t.insumo_id = i.id and t.variante = '{"composicion": "10+10", "color": "bronce"}'::jsonb and t.vigente_hasta is null);

-- Mesa Luna: tapa + 4 bases de 25 × alto, pegadas con UV. Mesa baja: ajuste del 20% sobre todos los vidrios.
-- Sin margen: se carga a mano en la ficha del producto (hasta entonces no se puede cotizar).
insert into public.cot_productos (nombre, categoria_id, descripcion)
select 'Mesa Luna', c.id, 'Mesa ratona de vidrio pegado con UV: tapa con puntas redondeadas y cuatro bases.'
from public.cot_categorias c where c.nombre = 'Mesas ratonas'
  and not exists (select 1 from public.cot_productos x where lower(x.nombre) = 'mesa luna' and x.activo);

insert into public.cot_recetas (producto_id, version, estado, definicion, nota, publicado_en)
select x.id, 1, 'publicada', '{"orden": ["L", "P", "H", "color", "puntas"], "entradas": {"L": {"tipo": "medida", "nombre": "Largo", "def": 100}, "P": {"tipo": "medida", "nombre": "Profundidad", "def": 70}, "H": {"tipo": "medida", "nombre": "Alto de las bases", "def": 35}, "color": {"tipo": "opcion", "nombre": "Color", "atributo": "color", "def": "incoloro"}, "puntas": {"tipo": "opcion", "nombre": "Puntas", "permitidos": ["redondeadas", "rectas"], "def": "redondeadas"}}, "lineas": [{"id": "tapa", "nombre": "Tapa", "regla": "m2", "insumoFormula": "si(en(color, ''incoloro'', ''gris'', ''bronce''), ''vidrio-float'', ''vidrio-laminado'')", "variante": {"espesor": "''10''", "composicion": "''5+5''", "color": "color"}, "ancho": "L", "largo": "P", "nota": "Float 10 mm; los colores, laminado 5+5"}, {"id": "bases", "nombre": "Bases", "regla": "m2", "insumoFormula": "si(en(color, ''incoloro'', ''gris'', ''bronce''), ''vidrio-float'', ''vidrio-laminado'')", "variante": {"espesor": "''10''", "composicion": "''5+5''", "color": "color"}, "cantidad": "4", "ancho": "25", "largo": "H"}, {"id": "ajuste", "nombre": "Ajuste", "regla": "porcentaje", "porcentaje": "aj.ajuste_vidpro", "sobre": ["tapa", "bases"], "nota": "Mesa baja: 20% sobre todos los vidrios"}, {"id": "uv", "nombre": "Pegado UV", "regla": "ml", "insumo": "pegado-uv", "variante": {"tipo_vidrio": "si(en(color, ''incoloro'', ''gris'', ''bronce''), ''float'', ''laminado'')"}, "cantidad": "4", "metros": "25 / 100", "nota": "4 bases pegadas por su lado de 25 cm"}]}'::jsonb, 'Carga inicial', now()
from public.cot_productos x
where lower(x.nombre) = 'mesa luna' and x.activo
  and not exists (select 1 from public.cot_recetas r where r.producto_id = x.id);

update public.cot_productos x set receta_publicada_id = r.id
from public.cot_recetas r
where r.producto_id = x.id and r.estado = 'publicada' and lower(x.nombre) = 'mesa luna' and x.receta_publicada_id is null;

insert into public.cot_receta_insumos (receta_id, insumo_id)
select x.receta_publicada_id, i.id
from public.cot_productos x, public.cot_insumos i
where lower(x.nombre) = 'mesa luna' and x.activo and x.receta_publicada_id is not null
  and i.codigo in ('vidrio-float', 'vidrio-laminado', 'pegado-uv')
on conflict do nothing;
