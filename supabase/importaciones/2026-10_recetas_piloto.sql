-- =====================================================================
-- Spazio Design · Cotizador · Recetas de los productos piloto
-- Generado por scripts/cotizador/recetas_piloto.py. Publica cada receta como versión
-- nueva solo si cambió; la anterior queda archivada. Se puede correr de nuevo.
-- Se ejecuta después de 2026-10_grises_y_mesa_luna.sql, 2026-10_helios.sql y 2026-10_aire.sql.
-- =====================================================================

insert into public.cot_ajustes (clave, valor, nombre, nota) values
  ('recargo_forma', 0.20, 'Recargo con forma', 'Puntas redondeadas u otras formas: % sobre el vidrio de esa pieza')
on conflict (clave) do nothing;

create or replace function pg_temp.publicar_receta(p_nombre text, p_def jsonb, p_nota text) returns text
language plpgsql as $$
declare
  v_prod uuid;
  v_pub public.cot_recetas%rowtype;
  v_bor uuid;
  v_id uuid;
  v_ver integer;
begin
  select id into v_prod from public.cot_productos where lower(nombre) = lower(p_nombre) and activo;
  if v_prod is null then return p_nombre || ': no existe'; end if;
  select * into v_pub from public.cot_recetas where producto_id = v_prod and estado = 'publicada';
  if found and v_pub.definicion = p_def then return p_nombre || ': sin cambios'; end if;
  if found then update public.cot_recetas set estado = 'archivada' where id = v_pub.id; end if;
  select id into v_bor from public.cot_recetas where producto_id = v_prod and estado = 'borrador';
  if v_bor is not null then
    update public.cot_recetas set definicion = p_def, nota = p_nota where id = v_bor;
    update public.cot_recetas set estado = 'publicada', publicado_en = now() where id = v_bor;
    v_id := v_bor;
  else
    select coalesce(max(version), 0) + 1 into v_ver from public.cot_recetas where producto_id = v_prod;
    insert into public.cot_recetas (producto_id, version, estado, definicion, nota, publicado_en)
    values (v_prod, v_ver, 'publicada', p_def, p_nota, now()) returning id into v_id;
  end if;
  update public.cot_productos set receta_publicada_id = v_id where id = v_prod;
  insert into public.cot_receta_insumos (receta_id, insumo_id)
  select v_id, i.id from public.cot_insumos i
  where p_def::text like '%''' || i.codigo || '''%' or p_def::text like '%"' || i.codigo || '"%'
  on conflict do nothing;
  select version into v_ver from public.cot_recetas where id = v_id;
  return p_nombre || ': publicada la versión ' || v_ver;
end $$;

select pg_temp.publicar_receta('Mesa Luna', '{"orden": ["L", "P", "H", "color", "puntas"], "entradas": {"L": {"tipo": "medida", "nombre": "Largo", "def": 100}, "P": {"tipo": "medida", "nombre": "Profundidad", "def": 70}, "H": {"tipo": "medida", "nombre": "Alto de las bases", "def": 35}, "color": {"tipo": "opcion", "nombre": "Color", "atributo": "color", "def": "incoloro"}, "puntas": {"tipo": "opcion", "nombre": "Puntas", "permitidos": ["redondeadas", "rectas"], "def": "redondeadas"}}, "lineas": [{"id": "tapa", "nombre": "Tapa", "regla": "m2", "insumoFormula": "si(en(color, ''incoloro'', ''gris'', ''bronce''), ''vidrio-float'', ''vidrio-laminado'')", "variante": {"espesor": "''10''", "composicion": "''5+5''", "color": "color"}, "ancho": "L", "largo": "P", "nota": "Float 10 mm; los colores, laminado 5+5"}, {"id": "forma", "nombre": "Tapa con forma (puntas redondeadas)", "regla": "porcentaje", "condicion": "puntas == ''redondeadas''", "porcentaje": "aj.recargo_forma", "sobre": ["tapa"]}, {"id": "bases", "nombre": "Bases", "regla": "m2", "insumoFormula": "si(en(color, ''incoloro'', ''gris'', ''bronce''), ''vidrio-float'', ''vidrio-laminado'')", "variante": {"espesor": "''10''", "composicion": "''5+5''", "color": "color"}, "cantidad": "4", "ancho": "25", "largo": "H"}, {"id": "ajuste", "nombre": "Ajuste", "regla": "porcentaje", "porcentaje": "aj.ajuste_vidpro", "sobre": ["tapa", "forma", "bases"], "nota": "Mesa baja: 20% sobre todos los vidrios"}, {"id": "uv", "nombre": "Pegado UV", "regla": "ml", "insumo": "pegado-uv", "variante": {"tipo_vidrio": "si(en(color, ''incoloro'', ''gris'', ''bronce''), ''float'', ''laminado'')"}, "cantidad": "4", "metros": "25 / 100", "nota": "4 bases pegadas por su lado de 25 cm"}]}'::jsonb, 'Puntas redondeadas con recargo de forma (20%)');
select pg_temp.publicar_receta('Mesa Helios', '{"orden": ["L", "P", "H", "color"], "entradas": {"L": {"tipo": "medida", "nombre": "Largo", "def": 100}, "P": {"tipo": "medida", "nombre": "Profundidad", "def": 70}, "H": {"tipo": "medida", "nombre": "Alto", "def": 45}, "color": {"tipo": "opcion", "nombre": "Color", "atributo": "color", "def": "incoloro"}}, "lineas": [{"id": "estructura", "nombre": "Estructura STG", "regla": "tabla", "insumo": "estructura-stg", "variante": {"modelo": "''helios''"}, "referencia": "L + P", "nota": "Precio por medida (largo + profundidad); otras medidas se estiman"}, {"id": "tapa", "nombre": "Tapa", "regla": "m2", "insumoFormula": "si(en(color, ''gris'', ''bronce''), ''vidrio-float'', ''vidrio-laminado'')", "variante": {"espesor": "si(color == ''gris'', ''10'', ''8'')", "composicion": "''4+4''", "color": "color"}, "ancho": "L", "largo": "P", "nota": "Incoloro y colores: laminado 4+4. Bronce: float 8. Gris: float 10"}, {"id": "base", "nombre": "Base", "regla": "m2", "insumoFormula": "si(en(color, ''gris'', ''bronce''), ''vidrio-float'', ''vidrio-laminado'')", "variante": {"espesor": "si(color == ''gris'', ''10'', ''8'')", "composicion": "''4+4''", "color": "color"}, "ancho": "L", "largo": "P"}]}'::jsonb, 'Sin ajuste: los vidrios no van pegados');
select pg_temp.publicar_receta('Mesa Helios con estante', '{"orden": ["L", "P", "H", "color"], "entradas": {"L": {"tipo": "medida", "nombre": "Largo", "def": 100}, "P": {"tipo": "medida", "nombre": "Profundidad", "def": 70}, "H": {"tipo": "medida", "nombre": "Alto", "def": 45}, "color": {"tipo": "opcion", "nombre": "Color", "atributo": "color", "def": "incoloro"}}, "lineas": [{"id": "estructura", "nombre": "Estructura STG", "regla": "tabla", "insumo": "estructura-stg", "variante": {"modelo": "''helios-estante''"}, "referencia": "L + P", "nota": "Precio por medida (largo + profundidad); otras medidas se estiman"}, {"id": "tapa", "nombre": "Tapa", "regla": "m2", "insumoFormula": "si(en(color, ''gris'', ''bronce''), ''vidrio-float'', ''vidrio-laminado'')", "variante": {"espesor": "si(color == ''gris'', ''10'', ''8'')", "composicion": "''4+4''", "color": "color"}, "ancho": "L", "largo": "P", "nota": "Incoloro y colores: laminado 4+4. Bronce: float 8. Gris: float 10"}, {"id": "base", "nombre": "Base", "regla": "m2", "insumoFormula": "si(en(color, ''gris'', ''bronce''), ''vidrio-float'', ''vidrio-laminado'')", "variante": {"espesor": "si(color == ''gris'', ''10'', ''8'')", "composicion": "''4+4''", "color": "color"}, "ancho": "L", "largo": "P"}]}'::jsonb, 'Sin ajuste: los vidrios no van pegados');
select pg_temp.publicar_receta('Mesa Aire Alta Redonda', '{"orden": ["D", "H", "terminacion", "color"], "entradas": {"D": {"tipo": "medida", "nombre": "Diámetro", "min": 120, "max": 180, "def": 120}, "H": {"tipo": "medida", "nombre": "Alto", "def": 76}, "terminacion": {"tipo": "opcion", "nombre": "Tapa", "permitidos": ["Madera clara", "Madera negra mate", "Madera oscura", "Madera roble", "Melamina lisa de color"], "def": "Madera clara"}, "color": {"tipo": "opcion", "nombre": "Vidrio", "atributo": "color", "def": "incoloro"}}, "lineas": [{"id": "tapa", "nombre": "Tapa de melamina", "regla": "tabla", "insumo": "tapa-melamina-redonda", "referencia": "D"}, {"id": "base_larga", "nombre": "Base larga", "regla": "m2", "insumo": "vidrio-laminado", "variante": {"composicion": "''6+6''", "color": "color"}, "ancho": "si(D <= 140, 80, si(D <= 160, 90, 110.4))", "largo": "H - 1.8", "nota": "80 cm hasta Ø 140, 90 en Ø 160, 110,4 en Ø 180"}, {"id": "base_corta", "nombre": "Base corta", "regla": "m2", "insumo": "vidrio-laminado", "variante": {"composicion": "''6+6''", "color": "color"}, "ancho": "si(D <= 140, 55, 80)", "largo": "H - 1.8", "nota": "55 cm hasta Ø 140, 80 desde Ø 160"}, {"id": "ajuste", "nombre": "Ajuste", "regla": "porcentaje", "porcentaje": "aj.ajuste_vidpro", "sobre": ["base_larga", "base_corta"], "nota": "Mesa alta: 20% solo sobre las bases"}, {"id": "silicona", "nombre": "Pegado con silicona", "regla": "fijo", "insumo": "silicona"}, {"id": "perfil_larga", "nombre": "Perfiles L (base larga)", "regla": "ml", "insumo": "perfil-l-aluminio", "cantidad": "2", "metros": "(si(D <= 140, 80, si(D <= 160, 90, 110.4))) / 100"}, {"id": "perfil_corta", "nombre": "Perfiles L (base corta)", "regla": "ml", "insumo": "perfil-l-aluminio", "cantidad": "2", "metros": "(si(D <= 140, 55, 80)) / 100"}]}'::jsonb, 'Carga inicial con los planos de las bases');
