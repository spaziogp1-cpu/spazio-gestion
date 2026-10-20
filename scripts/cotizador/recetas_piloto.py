"""Recetas de los productos piloto del cotizador (fuente única).

Genera supabase/importaciones/2026-10_recetas_piloto.sql, que publica cada receta como
versión nueva si cambió (archiva la anterior). Se puede correr las veces que haga falta.
"""
import json

from vidrio import COLOR, COMBINADA, COLOR_BASES, FLOTA, vidrio

ESPESOR_V10 = {"espesor": {"tipo": "opcion", "nombre": "Espesor (mm)", "permitidos": ["10", "8", "12", "16", "20"], "def": "10"}}
ESPESOR_V8 = {"espesor": {"tipo": "opcion", "nombre": "Espesor (mm)", "permitidos": ["8", "10"], "def": "8"}}

LUNA_ENTRADAS = {
    "L": {"tipo": "medida", "nombre": "Largo", "def": 100},
    "P": {"tipo": "medida", "nombre": "Profundidad", "def": 70},
    "H": {"tipo": "medida", "nombre": "Alto de las bases", "def": 35},
    "color": COLOR, **COMBINADA, **ESPESOR_V10,
    "puntas": {"tipo": "opcion", "nombre": "Puntas", "permitidos": ["redondeadas", "rectas"], "def": "redondeadas"},
}
LUNA = {
    "orden": list(LUNA_ENTRADAS),
    "entradas": LUNA_ENTRADAS,
    "lineas": [
        {"id": "tapa", "nombre": "Tapa", "regla": "m2", **vidrio("v10", "color"),
         "ancho": "L", "largo": "P", "nota": "10 mm: float; los colores, laminado 5+5"},
        {"id": "forma", "nombre": "Tapa con forma (puntas redondeadas)", "regla": "porcentaje",
         "condicion": "puntas == 'redondeadas'", "porcentaje": "aj.recargo_forma", "sobre": ["tapa"]},
        {"id": "bases", "nombre": "Bases", "regla": "m2", **vidrio("v10", COLOR_BASES),
         "cantidad": "4", "ancho": "25", "largo": "H"},
        {"id": "uv", "nombre": "Pegado UV", "regla": "ml", "insumo": "pegado-uv",
         "variante": {"tipo_vidrio": f"si(en(espesor, '8', '10') && {FLOTA('color')} && {FLOTA(COLOR_BASES)}, 'float', 'laminado')"},
         "cantidad": "4", "metros": "25 / 100", "nota": "4 bases pegadas por su lado de 25 cm"},
    ],
}

def helios(modelo, estante=False):
    entradas = {
        "L": {"tipo": "medida", "nombre": "Largo", "def": 100},
        "P": {"tipo": "medida", "nombre": "Profundidad", "def": 70},
        "H": {"tipo": "medida", "nombre": "Alto", "def": 45},
        "color": COLOR,
        "combinada": {**COMBINADA["combinada"], "nombre": "Base de otro color"},
        "color_bases": {**COMBINADA["color_bases"], "nombre": "Color de la base"},
        **ESPESOR_V8,
    }
    return {
        "orden": list(entradas),
        "entradas": entradas,
        "lineas": [
            {"id": "estructura", "nombre": "Estructura STG", "regla": "tabla", "insumo": "estructura-stg",
             "variante": {"modelo": f"'{modelo}'"}, "referencia": "L + P",
             "nota": "Precio por medida (largo + profundidad); otras medidas se estiman"},
            {"id": "tapa", "nombre": "Tapa", "regla": "m2", **vidrio("v8", "color"), "ancho": "L", "largo": "P",
             "nota": "Incoloro y colores: laminado 4+4. Bronce: float 8. Gris: float 10"},
            {"id": "base", "nombre": "Base", "regla": "m2", **vidrio("v8", COLOR_BASES), "ancho": "L", "largo": "P"},
            *([{"id": "estante", "nombre": "Estante del medio", "regla": "m2", **vidrio("v8", "color"), "ancho": "redondear(L * 0.6)", "largo": "P",
                "nota": "60% del largo por la profundidad (en la 100 × 70 es de 60 × 70)"}] if estante else []),
            {"id": "regatones", "nombre": "Regatones", "regla": "unidad", "insumo": "regaton", "cantidad": "4"},
        ],
    }

# Mesa Aire Alta Redonda: tapa de melamina por diámetro y dos bases de vidrio en T
# (planos del 20/10/2026). Mesa alta: vidrio 6+6 y ajuste del 20% solo sobre las bases.
# Menos de Ø 120 no hay plano: se escalan las bases de la Ø 120 en proporción al diámetro.
LARGA = "si(D < 120, redondear(D * 80 / 120), si(D <= 140, 80, si(D <= 160, 90, 110.4)))"
CORTA = "si(D < 120, redondear(D * 55 / 120), si(D <= 140, 55, 80))"
ALTO_BASE = "H"  # se calcula con el alto total de la mesa (20/10/2026); las bases van pegadas a los perfiles (sin UV)
# Mesa Aire rectangular (planos del 20/10/2026): una base transversal (P − 10, hasta 90) y
# una longitudinal en T. Con 120 de profundidad lleva dos transversales de 90.
# Longitudinal: 38,5 en 120 de largo, 62 en 160, 80 de 190 a 220, 90 en 250
# (con dos transversales: 80 en 250 y 90 en 300). Entre medidas, proporcional.
NT_RECT = "si(P >= 120, 2, 1)"
TRANS_RECT = "si(P - 10 < 90, P - 10, 90)"
LONG_RECT = ("si(P >= 120, si(L < 300, 80, 90), si(L <= 120, L * 38.5 / 120, si(L < 160, 38.5 + (L - 120) * 23.5 / 40, "
             "si(L < 190, 62 + (L - 160) * 18 / 30, si(L < 250, 80, 90)))))")
# Ratona rectangular: no hay planos; se escalan las bases de la 120 × 90.
LONG_RAT = "redondear(L * 38.5 / 120)"
TRANS_RAT = "redondear(P * 80 / 90)"

TERMINACION = {"tipo": "opcion", "nombre": "Tapa",
               "permitidos": ["Madera clara", "Madera negra mate", "Madera oscura", "Madera roble", "Melamina lisa de color"],
               "def": "Madera clara"}

def aire(alta, redonda=True):
    if alta:
        vid = {"insumo": "vidrio-laminado", "variante": {"composicion": "espesor", "color": "color"}}
        entradas_vidrio = {"espesor": {"tipo": "opcion", "nombre": "Espesor", "permitidos": ["6+6", "8+8", "10+10"], "def": "6+6"}}
        alto = {"tipo": "medida", "nombre": "Alto", "def": 76}
        nota_ajuste = "Mesa alta: 20% solo sobre las bases"
    else:
        # Mesas bajas: 5+5 o 10 mm. El float solo existe en incoloro, gris y bronce.
        flot = "espesor == '10' && en(color, 'incoloro', 'gris', 'bronce')"
        vid = {"insumoFormula": f"si({flot}, 'vidrio-float', 'vidrio-laminado')",
                  "variante": {"espesor": "'10'", "composicion": "'5+5'", "color": "color"}}
        entradas_vidrio = {"espesor": {"tipo": "opcion", "nombre": "Espesor", "permitidos": ["5+5", "10"], "def": "5+5"}}
        alto = {"tipo": "medida", "nombre": "Alto", "def": 40}
        nota_ajuste = "Mesa baja: 20% sobre todos los vidrios (son solo las bases)"
    if redonda:
        medidas = {"D": {"tipo": "medida", "nombre": "Diámetro", "min": 100, "max": 180, "def": 120} if alta
                   else {"tipo": "medida", "nombre": "Diámetro", "min": 60, "max": 140, "def": 80}}
        tapa = {"id": "tapa", "nombre": "Tapa de melamina", "regla": "tabla", "insumo": "tapa-melamina-redonda", "referencia": "D"}
        bases = [
            {"id": "base_larga", "nombre": "Base larga", "regla": "m2", **vid, "ancho": LARGA, "largo": ALTO_BASE,
             "nota": "Planos: 80 cm de Ø 120 a 140, 90 en Ø 160, 110,4 en Ø 180. Menos de Ø 120: proporcional"},
            {"id": "base_corta", "nombre": "Base corta", "regla": "m2", **vid, "ancho": CORTA, "largo": ALTO_BASE,
             "nota": "Planos: 55 cm de Ø 120 a 140, 80 desde Ø 160. Menos de Ø 120: proporcional"},
        ]
        perfiles = [("perfil_larga", "Perfiles L (base larga)", "2", LARGA), ("perfil_corta", "Perfiles L (base corta)", "2", CORTA)]
    else:
        if alta:
            medidas = {"L": {"tipo": "medida", "nombre": "Largo", "min": 120, "max": 300, "def": 160},
                       "P": {"tipo": "medida", "nombre": "Profundidad", "min": 90, "max": 120, "def": 90}}
            nt, trans, lon = NT_RECT, TRANS_RECT, LONG_RECT
            nota_t = "Planos: profundidad − 10, hasta 90. Con 120 de profundidad van dos"
            nota_l = "Planos: 38,5 en 120 de largo, 62 en 160, 80 de 190 a 220, 90 en 250 (con dos transversales: 80 en 250, 90 en 300)"
        else:
            medidas = {"L": {"tipo": "medida", "nombre": "Largo", "min": 80, "max": 160, "def": 100},
                       "P": {"tipo": "medida", "nombre": "Profundidad", "min": 40, "max": 90, "def": 70}}
            nt, trans, lon = "1", TRANS_RAT, LONG_RAT
            nota_t = nota_l = "Sin plano: proporcional a la base de la Aire Alta 120 × 90"
        tapa = {"id": "tapa", "nombre": "Tapa de melamina", "regla": "tabla", "insumo": "tapa-melamina-rectangular", "referencia": "L + P"}
        bases = [
            {"id": "base_larga", "nombre": "Base longitudinal", "regla": "m2", **vid, "ancho": lon, "largo": ALTO_BASE, "nota": nota_l},
            {"id": "base_corta", "nombre": "Base transversal", "regla": "m2", **vid, "cantidad": nt, "ancho": trans, "largo": ALTO_BASE, "nota": nota_t},
        ]
        perfiles = [("perfil_larga", "Perfiles L (base longitudinal)", "2", lon),
                    ("perfil_corta", "Perfiles L (bases transversales)", f"2 * {nt}" if nt != "1" else "2", trans)]
    return {
        "orden": [*medidas, "H", "terminacion", "color", *entradas_vidrio],
        "entradas": {**medidas, "H": alto, "terminacion": TERMINACION,
                     "color": {"tipo": "opcion", "nombre": "Vidrio", "atributo": "color", "def": "incoloro"}, **entradas_vidrio},
        "lineas": [
            tapa, *bases,
            {"id": "ajuste", "nombre": "Ajuste", "regla": "porcentaje", "porcentaje": "aj.ajuste_vidpro",
             "sobre": ["base_larga", "base_corta"], "nota": nota_ajuste},
            {"id": "silicona", "nombre": "Pegado con silicona", "regla": "fijo", "insumo": "silicona"},
            *[{"id": i, "nombre": n, "regla": "ml", "insumo": "perfil-l-aluminio", "cantidad": c, "metros": f"({m}) / 100"}
              for i, n, c, m in perfiles],
        ],
    }
AIRE = aire(True)

RECETAS = [
    ("Mesa Luna", LUNA, "Sin ajuste (20/10/2026); puntas redondeadas con recargo de forma"),
    ("Mesa Helios", helios("helios"), "Con 4 regatones; sin ajuste"),
    ("Mesa Helios con estante", helios("helios-estante", estante=True), "Estante del medio (60 × 70 en la 100 × 70) y 4 regatones"),
    ("Mesa Aire Alta Redonda", AIRE, "Carga inicial con los planos de las bases"),
    ("Mesa Aire Ratona Redonda", aire(False), "Como la alta, en 5+5 o 10 mm; bases proporcionales a las de la Ø 120"),
    ("Mesa Aire Alta Rectangular", aire(True, redonda=False), "Carga inicial con los planos de las bases"),
    ("Mesa Aire Ratona Rectangular", aire(False, redonda=False), "Sin planos: bases proporcionales a la Alta 120 × 90"),
]

q = lambda s: "'" + s.replace("'", "''") + "'"
out = ["""-- =====================================================================
-- Spazio Design · Cotizador · Recetas de los productos piloto
-- Generado por scripts/cotizador/recetas_piloto.py. Publica cada receta como versión
-- nueva solo si cambió; la anterior queda archivada. Se puede correr de nuevo.
-- Se ejecuta después de 2026-10_grises_y_mesa_luna.sql, 2026-10_helios.sql, 2026-10_aire.sql y 2026-10_componentes.sql.
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
"""]
for nombre, receta, nota in RECETAS:
    out.append(f"select pg_temp.publicar_receta({q(nombre)}, {q(json.dumps(receta, ensure_ascii=False))}::jsonb, {q(nota)});")
open("supabase/importaciones/2026-10_recetas_piloto.sql", "w").write("\n".join(out) + "\n")
print("ok")
