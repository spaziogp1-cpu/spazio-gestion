-- =====================================================================
-- Spazio Design · Cotizador · Herrajes y componentes (precios del 20/10/2026)
-- Regatones, ruedas, insertos, patas cilíndricas, cinta doble faz y el recargo
-- por molde de los espejos. Se puede correr de nuevo: no duplica nada.
-- =====================================================================

insert into public.cot_insumos (codigo, tipo, nombre, unidad, atributos, orden, notas)
values
  ('regaton', 'herraje', 'Regatón', 'unidad', '{}', 700, 'Todas las estructuras cromadas llevan 4'),
  ('rueda-cromada', 'herraje', 'Rueda cromada', 'unidad', '{}', 710, 'Las mesas cubo llevan 4'),
  ('inserto-rueda', 'herraje', 'Inserto para rueda', 'unidad', '{}', 720, 'Las mesas cubo llevan 4'),
  ('inserto-aluminio', 'herraje', 'Inserto de aluminio', 'unidad', '{}', 730, null),
  ('insertos-mesa-alta-10', 'herraje', 'Insertos de mesa alta (vidrio hasta 10 mm)', 'fijo', '{}', 740,
   'Juego por mesa, para vidrio de 10 mm o 5+5'),
  ('insertos-mesa-alta-12', 'herraje', 'Insertos de mesa alta (vidrio de 12 mm o más)', 'fijo', '{}', 741,
   'Juego por mesa, para vidrio 6+6 o más grueso'),
  ('patas-cilindricas-aluminio', 'estructura', 'Patas cilíndricas de aluminio (juego de 4, comedor)', 'unidad', '{}', 750,
   'Línea Constelación, patas de 80 cm'),
  ('patas-cilindricas-acero', 'estructura', 'Patas cilíndricas de acero inoxidable (juego de 4, comedor)', 'unidad', '{}', 751,
   'Línea Constelación, patas de 80 cm'),
  ('patas-cilindricas-aluminio-ratona', 'estructura', 'Patas cilíndricas de aluminio (juego de 4, ratona)', 'unidad', '{}', 752,
   'Estimado a la mitad de las de comedor: confirmar'),
  ('cinta-doble-faz', 'herraje', 'Cinta doble faz (fijación de la tapa)', 'fijo', '{}', 760, 'Por mesa'),
  ('perfil-j-aluminio', 'herraje', 'Perfil J de aluminio (espejos)', 'ml', '{}', 770,
   'Barra de 6 m a $18.000: se cobra por metro. Cada espejo lleva 3 tiras de 40 cm'),
  ('silicona-espejo', 'proceso', 'Pegado con silicona (espejo)', 'fijo', '{}', 780, 'Precio fijo por espejo'),
  ('bisagra', 'herraje', 'Bisagra', 'unidad', '{}', 790, 'Puertas de vidrio')
on conflict (codigo) do nothing;

insert into public.cot_tarifas (insumo_id, variante, precio, nota, vigente_desde)
select i.id, '{}'::jsonb, v.precio, v.nota, '2026-10-20'
from public.cot_insumos i
join (values
  ('regaton', 500, null),
  ('rueda-cromada', 6000, null),
  ('inserto-rueda', 5000, null),
  ('inserto-aluminio', 17000, null),
  ('insertos-mesa-alta-10', 100000, null),
  ('insertos-mesa-alta-12', 130000, null),
  ('patas-cilindricas-aluminio', 170000, null),
  ('patas-cilindricas-acero', 200000, null),
  ('patas-cilindricas-aluminio-ratona', 85000, 'Estimado'),
  ('cinta-doble-faz', 0, 'Precio a definir'),
  ('perfil-j-aluminio', 3000, '$18.000 la barra de 6 m'),
  ('silicona-espejo', 5000, null),
  ('bisagra', 7000, null)
) as v(codigo, precio, nota) on v.codigo = i.codigo
where not exists (
  select 1 from public.cot_tarifas t where t.insumo_id = i.id and t.vigente_hasta is null
);

insert into public.cot_ajustes (clave, valor, nombre, nota) values
  ('recargo_molde', 0.30, 'Recargo por molde', 'Espejos con molde: % de mano de obra sobre el espejo')
on conflict (clave) do nothing;
