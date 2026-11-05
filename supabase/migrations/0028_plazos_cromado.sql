-- Plazos de producción según el producto (días hábiles desde la venta).
-- Con estructura cromada: 30 a 35. El resto: 20 a 25. La fecha límite usa el máximo.
-- Reemplazan a plazo_entrega_dias / plazo_entrega_tipo (49 corridos), que ya no se usan.
insert into public.parametros (clave, valor, nota) values
  ('plazo_normal_min',  '20', 'Producción sin estructura cromada: mínimo (días hábiles)'),
  ('plazo_normal_max',  '25', 'Producción sin estructura cromada: máximo (días hábiles, fecha límite)'),
  ('plazo_cromado_min', '30', 'Producción con estructura cromada: mínimo (días hábiles)'),
  ('plazo_cromado_max', '35', 'Producción con estructura cromada: máximo (días hábiles, fecha límite)')
on conflict (clave) do nothing;
