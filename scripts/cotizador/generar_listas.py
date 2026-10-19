"""Genera el SQL de carga inicial del cotizador desde la lista de Vidpro (Excel) y la de STG."""
import json
import re
import sys

import openpyxl

XLSX, SALIDA = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(XLSX, data_only=True)


def filas(hoja):
    return [r for r in wb[hoja].iter_rows(values_only=True) if any(c is not None for c in r)]


def seccion(hoja, titulo, cols):
    """Filas de datos bajo un título (la fila siguiente es el encabezado)."""
    fs = filas(hoja)
    i = next(k for k, r in enumerate(fs) if r[0] == titulo)
    out = []
    for r in fs[i + 2:]:
        if r[1] is None and r[2] is None:
            break
        if isinstance(r[0], str) and r[0].startswith('Mínimos'):
            break
        out.append(r[:cols])
    return out


q = lambda s: "'" + str(s).replace("'", "''") + "'"
sql = []
w = sql.append

# ---------------------------------------------------------------------
# Atributos y valores
# ---------------------------------------------------------------------
ESP_GRUPOS = {'3': [], '4': ['4-6', '4-10'], '5': ['4-6', '4-10'], '6': ['4-6', '4-10'], '8': ['8-10', '4-10'],
              '10': ['8-10', '4-10'], '12': ['12-15', '12-20'], '15': ['12-15', '12-20'], '20': ['12-20']}
COMP_GRUPOS = {'3+3': ['r3-4'], '4+4': ['r3-4'], '5+5': ['r5-6'], '6+6': ['r5-6'], '8+8': ['r8-10'],
               '10+10': ['r8-10'], '10+5': [], 'f4+4': []}
atributos = [
    ('espesor', 'Espesor', [(e, f'{e} mm', g) for e, g in ESP_GRUPOS.items()]),
    ('composicion', 'Composición del laminado',
     [(c, 'Fantasía 4 + incoloro 4 (lámina 1,14)' if c == 'f4+4' else c, g) for c, g in COMP_GRUPOS.items()]),
    ('color', 'Color', [('incoloro', 'Incoloro', []), ('gris', 'Gris', ['gris-bronce']), ('bronce', 'Bronce', ['gris-bronce']),
                        ('gris-oscuro', 'Gris oscuro', []), ('blanco', 'Blanco', [])]),
    ('terminacion_color', 'Terminación del color', [('simple', 'Simple', []), ('combinado', 'Combinado (dos colores)', []),
                                                     ('satinado', 'Satinado', [])]),
    ('forma', 'Forma', [('recto', 'Recto', []), ('con-forma', 'Con forma', [])]),
    ('tipo_vidrio', 'Tipo de vidrio', [('float', 'Float', []), ('laminado', 'Laminado de seguridad', [])]),
]
TERM_ESPEJO = {
    'Sin pulir': 'sin-pulir', 'Sin pulir con forma': 'sin-pulir-forma', 'Pulido recto': 'pulido-recto',
    'Pulido con forma': 'pulido-forma', 'Biselado': 'biselado', 'Biselado con forma': 'biselado-forma',
    'Pulido y biselado recto': 'pulido-biselado-recto', 'Pulido y biselado con forma': 'pulido-biselado-forma',
}
atributos.append(('terminacion_espejo', 'Terminación del espejo', [(v, k, []) for k, v in TERM_ESPEJO.items()]))
atributos.append(('terminacion_insercion', 'Terminación', [('al-corte', 'Al corte', []), ('pulido', 'Borde pulido', [])]))
COMP_ESPEJO = {}
for nombre in [r[0] for r in seccion('Espejos', 'Espejo laminado incoloro', 2)] + [r[0] for r in seccion('Espejos', 'Espejo laminado color', 2)]:
    m = re.match(r'(\d)mm espejo \+ (\d)mm inc', nombre)
    COMP_ESPEJO[nombre] = f'{m[1]}e+{m[2]}'
atributos.append(('composicion_espejo', 'Composición del espejo laminado',
                  [(v, k.replace('mm', ' mm').replace('inc', 'incoloro'), []) for k, v in COMP_ESPEJO.items()]))
atributos.append(('rango_fason', 'Espesores a laminar', [('r3-4', '3+3 y 4+4', []), ('r5-6', '5+5 y 6+6', []), ('r8-10', '8+8 y 10+10', [])]))
atributos.append(('lamina', 'Lámina Evalam', [('0.38', '0,38 mm', []), ('0.76', '0,76 mm', [])]))
TIPO_COLOR = {'Blanco / Super blanco / Acid white / Negro': 'blanco-negro', 'Colores traslúcidos': 'traslucido',
              'Colores combinados y satinados': 'combinado-satinado'}
atributos.append(('tipo_color_fason', 'Color de la lámina', [(v, k, []) for k, v in TIPO_COLOR.items()]))
TRABAJOS = {}
for nombre, _ in seccion('Mano de obra', 'Perforaciones especiales', 2):
    slug = re.sub(r'[^a-z0-9]+', '-', nombre.lower().replace('×', 'x').replace('ñ', 'n')
                  .replace('á', 'a').replace('é', 'e').replace('í', 'i').replace('ó', 'o').replace('ú', 'u')).strip('-')
    TRABAJOS[nombre] = slug[:60]
atributos.append(('trabajo', 'Trabajo', [(v, k, []) for k, v in TRABAJOS.items()]))
DIAM = {'De 6 a 12 mm': '6-12mm', 'De 12 a 20 mm': '12-20mm'}
diametros = []
for nombre, *_ in seccion('Mano de obra', 'Perforaciones por diámetro', 3):
    v = DIAM.get(nombre) or nombre.replace(' cm', '')
    DIAM[nombre] = v
    diametros.append((v, nombre if nombre in ('De 6 a 12 mm', 'De 12 a 20 mm') else f'{v} cm', []))
atributos.append(('diametro', 'Diámetro de la perforación', diametros))
MODELOS = [('modulo', 'Modulo'), ('modulo-ii', 'Modulo II'), ('bar', 'Bar'), ('binario', 'Binario'), ('arcos', 'Arcos'),
           ('helios', 'Helios'), ('helios-estante', 'Helios con estante'), ('silla-cesca-cerrada', 'Silla Cesca Cerrada'),
           ('silla-duna', 'Silla Duna'), ('taburete-duna', 'Taburete Duna'), ('saturno', 'Mesa Saturno'),
           ('recibidor-nexo', 'Recibidor Nexo')]
atributos.append(('modelo', 'Modelo de estructura', [(v, e, []) for v, e in MODELOS]))

for orden, (clave, nombre, valores) in enumerate(atributos):
    w(f"insert into public.cot_atributos (clave, nombre, orden) values ({q(clave)}, {q(nombre)}, {orden}) on conflict (clave) do nothing;")
    for o, (valor, etiqueta, grupos) in enumerate(valores):
        g = "'{" + ",".join(f'"{x}"' for x in grupos) + "}'"
        w(f"insert into public.cot_atributo_valores (atributo, valor, etiqueta, grupos, orden) values "
          f"({q(clave)}, {q(valor)}, {q(etiqueta)}, {g}, {o}) on conflict (atributo, valor) do nothing;")
w('')

# ---------------------------------------------------------------------
# Insumos
# ---------------------------------------------------------------------
insumos = []  # (codigo, tipo, nombre, unidad, atributos, proveedor, minimo, minimo_por, notas)
def insumo(*a):
    insumos.append(a)

insumo('vidrio-float', 'vidrio', 'Vidrio float', 'm2', ['espesor', 'color'], 'Vidpro', 0.2, 'pieza', 'Incluye borde pulido')
insumo('vidrio-laminado', 'vidrio', 'Vidrio laminado de seguridad', 'm2', ['composicion', 'color'], 'Vidpro', 0.2, 'pieza',
       'Incluye borde pulido. Columnas: incoloro, color, gris oscuro, combinado, satinado, blanco')
insumo('templado', 'vidrio', 'Vidrio templado', 'm2', ['espesor', 'forma'], 'Vidpro', 0.2, 'pieza', None)
insumo('templado-laminado', 'vidrio', 'Templado laminado (los dos vidrios templados)', 'm2', ['composicion', 'forma'], 'Vidpro', 0.2, 'pieza', None)
insumo('laminado-insercion', 'vidrio', 'Laminado con inserción (2 láminas 80/120)', 'm2', ['composicion', 'terminacion_insercion'], 'Vidpro', 0.2, 'pieza', None)
insumo('espejo', 'espejo', 'Espejo', 'm2', ['espesor', 'terminacion_espejo'], 'Vidpro', 0.2, 'pieza', 'La terminación ya está incluida en el precio')
insumo('espejo-color', 'espejo', 'Espejo de color 4 mm', 'm2', ['terminacion_espejo'], 'Vidpro', 0.2, 'pieza', 'La terminación ya está incluida en el precio')
insumo('espejo-laminado', 'espejo', 'Espejo laminado incoloro', 'm2', ['composicion_espejo'], 'Vidpro', 0.2, 'pieza', None)
insumo('espejo-laminado-color', 'espejo', 'Espejo laminado color', 'm2', ['composicion_espejo'], 'Vidpro', 0.2, 'pieza', None)
insumo('fason-evalam', 'proceso', 'Fasón laminado Evalam', 'm2', ['rango_fason', 'lamina'], 'Vidpro', None, None,
       'Para laminados que no están en la lista: se suman los dos vidrios por separado + este fasón')
insumo('fason-color', 'proceso', 'Fasón laminado color', 'm2', ['rango_fason', 'tipo_color_fason'], 'Vidpro', None, None, None)
insumo('fason-visual-color', 'proceso', 'Fasón laminado visual + color', 'm2', ['rango_fason', 'tipo_color_fason'], 'Vidpro', None, None,
       'Composición: 0,38 mm visual + 0,38 mm color')
insumo('pegado-uv', 'proceso', 'Pegado UV', 'ml', ['tipo_vidrio'], 'Vidpro', 1, 'item', 'Mínimo 1 metro lineal por mesa')
insumo('perforacion-especial', 'mano_obra', 'Perforación especial', 'unidad', ['trabajo'], 'Vidpro', None, None, None)
insumo('perforacion', 'mano_obra', 'Perforación por diámetro', 'unidad', ['diametro', 'espesor'], 'Vidpro', None, None, None)
insumo('bisel', 'mano_obra', 'Bisel', 'ml', ['espesor', 'forma'], 'Vidpro', 1, 'pieza', 'Mínimo 1 m por pieza (0,50 m con forma)')
insumo('borde-pulido', 'mano_obra', 'Borde pulido', 'ml', ['espesor', 'forma'], 'Vidpro', 1, 'pieza',
       'Los vidrios de la lista ya traen el borde pulido: solo para trabajos aparte')
insumo('media-cana', 'mano_obra', 'Borde pulido 1/2 caña', 'ml', ['espesor', 'forma'], 'Vidpro', 1, 'pieza', None)
insumo('pulido-laminado', 'mano_obra', 'Laminados de seguridad (mano de obra)', 'ml', ['composicion', 'forma'], 'Vidpro', None, None,
       'Figura en la hoja de mano de obra; unidad a confirmar con Vidpro')
insumo('estructura-stg', 'estructura', 'Estructura STG', 'unidad', ['modelo'], 'STG', None, None,
       'Precio cerrado por modelo y medida. La referencia sirve para estimar medidas que no están en la lista')
insumo('silla-cesca', 'estructura', 'Estructura Silla Cesca', 'unidad', [], 'Alberto', None, None, None)
insumo('tapizado-cesca', 'otro', 'Tapizado Silla Cesca', 'unidad', [], 'Belén', None, None, None)

for o, (codigo, tipo, nombre, unidad, attrs, prov, minimo, minimo_por, notas) in enumerate(insumos):
    arr = "'{" + ",".join(attrs) + "}'"
    w("insert into public.cot_insumos (codigo, tipo, nombre, unidad, atributos, proveedor_id, minimo, minimo_por, orden, notas) "
      f"values ({q(codigo)}, {q(tipo)}, {q(nombre)}, {q(unidad)}, {arr}, (select id from public.proveedores where nombre = {q(prov)}), "
      f"{'null' if minimo is None else minimo}, {'null' if minimo_por is None else q(minimo_por)}, {o * 10}, "
      f"{'null' if notas is None else q(notas)}) on conflict (codigo) do nothing;")
w('')

# ---------------------------------------------------------------------
# Tarifas
# ---------------------------------------------------------------------
n_tarifas = 0
def tarifa(codigo, variante, precio, desde, referencia=None, minimo=None, nota=None):
    global n_tarifas
    if precio is None:
        return
    n_tarifas += 1
    v = q(json.dumps(variante, ensure_ascii=False))
    ref = 'null' if referencia is None else referencia
    w("insert into public.cot_tarifas (insumo_id, variante, referencia, precio, minimo, nota, vigente_desde) "
      f"select i.id, {v}::jsonb, {ref}, {round(float(precio), 2)}, {'null' if minimo is None else minimo}, "
      f"{'null' if nota is None else q(nota)}, {q(desde)} from public.cot_insumos i where i.codigo = {q(codigo)} "
      f"and not exists (select 1 from public.cot_tarifas t where t.insumo_id = i.id and t.variante = {v}::jsonb "
      f"and coalesce(t.referencia, -1) = coalesce({ref}, -1) and t.vigente_hasta is null);")

VID = '2026-10-15'
esp = lambda s: str(s).replace('mm', '').replace(' ', '')

for e, inc, gb in seccion('Vidrios', 'Float', 3):
    tarifa('vidrio-float', {'espesor': esp(e), 'color': 'incoloro'}, inc, VID)
    tarifa('vidrio-float', {'espesor': esp(e), 'color': 'gris-bronce'}, gb, VID)
COL_LAM = ['incoloro', 'color', 'gris-oscuro', 'combinado', 'satinado', 'blanco']
for r in seccion('Vidrios', 'Laminados', 7):
    for col, precio in zip(COL_LAM, r[1:]):
        tarifa('vidrio-laminado', {'composicion': r[0], 'color': col}, precio, VID)

for nombre, recto, forma in seccion('Templados e inserción', 'Templados', 3):
    e = esp(nombre.replace('Templado ', ''))
    tarifa('templado', {'espesor': e, 'forma': 'recto'}, recto, VID)
    tarifa('templado', {'espesor': e, 'forma': 'con-forma'}, forma, VID)
for nombre, recto, forma in seccion('Templados e inserción', 'Templado laminado — los dos vidrios templados', 3):
    c = nombre.replace('Laminado ', '')
    tarifa('templado-laminado', {'composicion': c, 'forma': 'recto'}, recto, VID)
    tarifa('templado-laminado', {'composicion': c, 'forma': 'con-forma'}, forma, VID)
for nombre, corte, pulido in seccion('Templados e inserción', 'Laminado con inserción — 2 láminas 80/120', 3):
    c = 'f4+4' if 'fantasía' in nombre else nombre.replace('Laminado ', '')
    tarifa('laminado-insercion', {'composicion': c, 'terminacion_insercion': 'al-corte'}, corte, VID)
    tarifa('laminado-insercion', {'composicion': c, 'terminacion_insercion': 'pulido'}, pulido, VID)

for r in seccion('Espejos', 'Espejos por espesor', 5):
    for e, precio in zip(['3', '4', '5', '6'], r[1:]):
        tarifa('espejo', {'espesor': e, 'terminacion_espejo': TERM_ESPEJO[r[0]]}, precio, VID)
for nombre, precio in seccion('Espejos', 'Espejo de color · 4 mm', 2):
    tarifa('espejo-color', {'terminacion_espejo': TERM_ESPEJO[nombre]}, precio, VID)
for nombre, precio in seccion('Espejos', 'Espejo laminado incoloro', 2):
    tarifa('espejo-laminado', {'composicion_espejo': COMP_ESPEJO[nombre]}, precio, VID)
for nombre, precio in seccion('Espejos', 'Espejo laminado color', 2):
    tarifa('espejo-laminado-color', {'composicion_espejo': COMP_ESPEJO[nombre]}, precio, VID)

RANGO = {'3+3 y 4+4': 'r3-4', '5+5 y 6+6': 'r5-6', '8+8 y 10+10': 'r8-10'}
for nombre, a, b in seccion('Fasón', 'Fasón laminados — sistema Evalam', 3):
    tarifa('fason-evalam', {'rango_fason': RANGO[nombre], 'lamina': '0.38'}, a, VID)
    tarifa('fason-evalam', {'rango_fason': RANGO[nombre], 'lamina': '0.76'}, b, VID)
for nombre, tipo, precio in seccion('Fasón', 'Fasón laminado color', 3):
    tarifa('fason-color', {'rango_fason': RANGO[nombre], 'tipo_color_fason': TIPO_COLOR[tipo]}, precio, VID)
for nombre, tipo, precio in seccion('Fasón', 'Fasón laminado visual + color', 3):
    tarifa('fason-visual-color', {'rango_fason': RANGO[nombre], 'tipo_color_fason': TIPO_COLOR[tipo]}, precio, VID)

tarifa('pegado-uv', {'tipo_vidrio': 'float'}, 21500, VID, nota='Incoloro, gris o bronce float')
tarifa('pegado-uv', {'tipo_vidrio': 'laminado'}, 31000, VID, nota='Todos los laminados de seguridad')

for nombre, precio in seccion('Mano de obra', 'Perforaciones especiales', 2):
    tarifa('perforacion-especial', {'trabajo': TRABAJOS[nombre]}, precio, VID)
for nombre, a, b in seccion('Mano de obra', 'Perforaciones por diámetro', 3):
    tarifa('perforacion', {'diametro': DIAM[nombre], 'espesor': '4-10'}, a, VID)
    tarifa('perforacion', {'diametro': DIAM[nombre], 'espesor': '12-20'}, b, VID)
BISEL = {'De 4 a 6 mm': '4-6', 'De 8 a 10 mm': '8-10', 'De 12 a 15 mm': '12-15', '20 mm': '20'}
for nombre, recto, forma in seccion('Mano de obra', 'Bisel', 3):
    tarifa('bisel', {'espesor': BISEL[nombre], 'forma': 'recto'}, recto, VID)
    tarifa('bisel', {'espesor': BISEL[nombre], 'forma': 'con-forma'}, forma, VID, minimo=0.5)
BORDES = {'4, 5 y 6 mm': '4-6', '8 y 10 mm': '8-10', '15 mm': '15', '20 mm': '20'}
for nombre, recto, forma in seccion('Mano de obra', 'Bordes pulidos', 3):
    tarifa('borde-pulido', {'espesor': BORDES[nombre], 'forma': 'recto'}, recto, VID)
    tarifa('borde-pulido', {'espesor': BORDES[nombre], 'forma': 'con-forma'}, forma, VID)
for nombre, recto, forma in seccion('Mano de obra', 'Bordes pulidos 1/2 caña', 3):
    tarifa('media-cana', {'espesor': esp(nombre), 'forma': 'recto'}, recto, VID)
    tarifa('media-cana', {'espesor': esp(nombre), 'forma': 'con-forma'}, forma, VID)
for nombre, recto, forma in seccion('Mano de obra', 'Laminados de seguridad', 3):
    c = nombre.replace(' mm', '')
    tarifa('pulido-laminado', {'composicion': c, 'forma': 'recto'}, recto, VID)
    tarifa('pulido-laminado', {'composicion': c, 'forma': 'con-forma'}, forma, VID)

STG = '2026-10-19'
# (modelo, medida de la lista, precio, referencia, qué mide la referencia)
stg = [
    ('modulo', '110x45x65', 240000, 110, 'largo'),
    ('modulo-ii', '60x45x65', 180000, 60, 'largo'),
    ('bar', '55x45x65', 260000, 55, 'largo'),
    ('binario', '100x45x35 y 55x40x48', 270000, 100, 'largo de la mesa grande; precio por el juego'),
    ('binario', '130x45x35 y 55x50x48', 325000, 130, 'largo de la mesa grande; precio por el juego'),
    ('arcos', '45x39x60', 165000, 45, 'largo'),
    ('helios', '100x70x45', 230000, 170, 'largo + profundidad'),
    ('helios', '80x50x45', 200000, 130, 'largo + profundidad'),
    ('helios-estante', '100x70x45', 260000, 170, 'largo + profundidad'),
    ('saturno', 'Ø 50', 200000, 50, 'diámetro del vidrio'),
    ('saturno', 'Ø 60', 220000, 60, 'diámetro del vidrio'),
    ('saturno', 'Ø 70', 240000, 70, 'diámetro del vidrio'),
    ('saturno', 'Ø 80', 250000, 80, 'diámetro del vidrio'),
    ('saturno', 'Ø 90', 270000, 90, 'diámetro del vidrio'),
    ('recibidor-nexo', '150x47x90', 240000, 150, 'largo'),
]
for modelo, medida, precio, ref, que in stg:
    tarifa('estructura-stg', {'modelo': modelo}, precio, STG, referencia=ref, nota=f'{medida} · referencia = {que}')
tarifa('estructura-stg', {'modelo': 'silla-cesca-cerrada'}, 160000, STG, nota='A confirmar si es de STG')
tarifa('estructura-stg', {'modelo': 'silla-duna'}, 160000, STG, nota='Llega completa')
tarifa('estructura-stg', {'modelo': 'taburete-duna'}, 180000, STG, nota='Llega completo')
tarifa('silla-cesca', {}, 115000, STG)
tarifa('tapizado-cesca', {}, 58000, STG)

cabecera = f"""-- =====================================================================
-- Spazio Design · Cotizador · Carga inicial de listas de precios
-- Vidpro: lista del 15/10/2026 (Excel "Lista de precios vidpro spazio").
-- STG: lista del 19/10/2026. Silla Cesca: Alberto (estructura) + Belén (tapizado).
-- Precios con IVA incluido.
--
-- Generado automáticamente: {len(insumos)} insumos y {n_tarifas} precios.
-- Se ejecuta después de 0013_cotizador_costos.sql. Se puede correr de nuevo
-- sin duplicar nada: solo agrega lo que falta.
-- =====================================================================

"""
open(SALIDA, 'w').write(cabecera + "\n".join(sql) + "\n")
print(len(insumos), 'insumos', n_tarifas, 'tarifas', sum(len(a[2]) for a in atributos), 'valores')
