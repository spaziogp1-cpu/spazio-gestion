"""Recetas de los modelos de la web (fuente única).

Genera supabase/importaciones/2026-10_recetas_catalogo.sql: crea los productos que falten y
publica cada receta como versión nueva solo si cambió. Se puede correr las veces que haga falta.

Medidas en cm. Rectangulares: L largo, P profundidad, H alto. Redondas: D diámetro, H alto.
Las piezas con plano (20/10/2026) llevan la proporción del plano; el resto, la del cotizador
de la web. Cada receta dice de dónde sale en su nota.
"""
import json

# ---------------------------------------------------------------- vidrio
from vidrio import COLOR, COMBINADA, COLOR_BASES, FLOTA_V10, espesor_v10, vidrio  # noqa: E402

FAMILIAS = {
    # Ratonas, auxiliares y estanterías: 10 mm de estándar (float en incoloro, gris y bronce; colores laminado 5+5).
    "v10": {"entradas": None,  # dependen de si es combinada: espesor_v10()
            "uv": lambda cs: "si(" + " && ".join(FLOTA_V10(c) for c in cs) + ", 'float', 'laminado')"},
    # Mesas altas: laminado 5+5 de estándar; más grueso si el cliente lo pide.
    "alta": {"entradas": {"espesor": {"tipo": "opcion", "nombre": "Vidrio", "permitidos": ["5+5", "6+6", "8+8", "10+10"], "def": "5+5"}},
             "uv": lambda cs: "'laminado'"},
    # Estructura cromada: laminado 4+4 de estándar; bronce float 8, gris float 10.
    "v8": {"entradas": {"espesor": {"tipo": "opcion", "nombre": "Espesor (mm)", "permitidos": ["8", "10"], "def": "8"}},
           "uv": None},
}

RECT = lambda l, p, h: {"L": {"tipo": "medida", "nombre": "Largo", "def": l},
                        "P": {"tipo": "medida", "nombre": "Profundidad", "def": p},
                        "H": {"tipo": "medida", "nombre": "Alto", "def": h}}
REDONDA = lambda d, h: {"D": {"tipo": "medida", "nombre": "Diámetro", "def": d},
                        "H": {"tipo": "medida", "nombre": "Alto", "def": h}}


def pieza(id, nombre, cant, ancho, largo, forma=False, base=False, nota=None):
    return {"id": id, "nombre": nombre, "cant": cant, "ancho": ancho, "largo": largo, "forma": forma, "base": base, "nota": nota}


def receta(medidas, fam, piezas, ajuste, uv=None, extras=(), entradas_extra=None, puntas=False):
    """ajuste: 'total' (mesa baja), 'bases' (mesa alta) o None."""
    f = FAMILIAS[fam]
    combinada = fam != "v8" and any(p["base"] for p in piezas) and any(not p["base"] for p in piezas)
    entradas_fam = espesor_v10(combinada) if fam == "v10" else f.get("entradas", {})
    entradas = {**medidas, "color": COLOR, **(COMBINADA if combinada else {}), **entradas_fam, **(entradas_extra or {})}
    lineas = []
    for p in piezas:
        c = COLOR_BASES if combinada and p["base"] else "color"
        l = {"id": p["id"], "nombre": p["nombre"], "regla": "m2", **vidrio(fam, c), "ancho": p["ancho"], "largo": p["largo"]}
        if p["cant"] not in (1, "1"):
            l["cantidad"] = str(p["cant"])
        if p["nota"]:
            l["nota"] = p["nota"]
        lineas.append(l)
    con_forma = [p["id"] for p in piezas if p["forma"]]
    if con_forma:
        l = {"id": "forma", "nombre": "Recargo por forma", "regla": "porcentaje", "porcentaje": "aj.recargo_forma",
             "sobre": con_forma, "nota": "Piezas con forma o puntas redondeadas: 20%"}
        if puntas:
            l["condicion"] = "puntas == 'redondeadas'"
            entradas["puntas"] = {"tipo": "opcion", "nombre": "Puntas", "permitidos": ["redondeadas", "rectas"], "def": "redondeadas"}
        lineas.append(l)
    if ajuste == "total":
        lineas.append({"id": "ajuste", "nombre": "Ajuste", "regla": "porcentaje", "porcentaje": "aj.ajuste_vidpro",
                       "sobre": [p["id"] for p in piezas] + (["forma"] if con_forma else []),
                       "nota": "Mesa baja: 20% sobre todos los vidrios"})
    elif ajuste == "bases":
        lineas.append({"id": "ajuste", "nombre": "Ajuste", "regla": "porcentaje", "porcentaje": "aj.ajuste_vidpro",
                       "sobre": [p["id"] for p in piezas if p["base"]], "nota": "Mesa alta: 20% solo sobre las bases"})
    if uv:
        lineas.append({"id": "uv", "nombre": "Pegado UV", "regla": "ml", "insumo": "pegado-uv",
                       "variante": {"tipo_vidrio": f["uv"](["color", COLOR_BASES] if combinada else ["color"])},
                       "metros": f"({uv}) / 100"})
    lineas.extend(extras)
    orden = [k for k in entradas]
    return {"orden": orden, "entradas": entradas, "lineas": lineas}


# ---------------------------------------------------------------- extras
def estructura(modelo, ref):
    return {"id": "estructura", "nombre": "Estructura STG", "regla": "tabla", "insumo": "estructura-stg",
            "variante": {"modelo": f"'{modelo}'"}, "referencia": ref,
            "nota": "Precio de lista de STG; otras medidas se estiman"}


REGATONES = {"id": "regatones", "nombre": "Regatones", "regla": "unidad", "insumo": "regaton", "cantidad": "4"}
RUEDAS = [{"id": "ruedas", "nombre": "Ruedas cromadas", "regla": "unidad", "insumo": "rueda-cromada", "cantidad": "4"},
          {"id": "insertos_rueda", "nombre": "Insertos para ruedas", "regla": "unidad", "insumo": "inserto-rueda", "cantidad": "4"}]
INSERTOS_ALTA = [
    {"id": "insertos_alta", "nombre": "Insertos de aluminio", "regla": "fijo", "condicion": "insertos == 'si'",
     "insumoFormula": "si(espesor == '5+5', 'insertos-mesa-alta-10', 'insertos-mesa-alta-12')"},
    {"id": "doble_faz", "nombre": "Cinta doble faz", "regla": "fijo", "condicion": "insertos == 'no'", "insumo": "cinta-doble-faz"},
]
ENT_INSERTOS = {"insertos": {"tipo": "opcion", "nombre": "Insertos", "permitidos": ["no", "si"], "def": "no"}}


def con_float10(rec):
    """Lo que va en laminado 5+5 también se hace en float 10 mm en incoloro, gris y bronce (29/10/2026)."""
    combinada = "combinada" in rec["entradas"]
    ok = lambda c: f"en({c}, 'incoloro', 'gris', 'bronce')"
    hay = f"({ok('color')} || (combinada == 'si' && {ok('color_bases')}))" if combinada else ok("color")
    rec["entradas"]["tipo_vidrio"] = {"tipo": "opcion", "nombre": "Tipo de vidrio", "permitidos": ["laminado 5+5", "float 10 mm"],
                                      "def": "laminado 5+5", "mostrarSi": f"espesor == '5+5' && {hay}"}
    rec["orden"].insert(rec["orden"].index("espesor") + 1, "tipo_vidrio")
    flota = lambda c: f"espesor == '5+5' && tipo_vidrio == 'float 10 mm' && {ok(c)}"
    colores = []
    for l in rec["lineas"]:
        if l.get("insumo") == "vidrio-laminado":
            c = l["variante"]["color"]
            colores.append(c)
            del l["insumo"]
            l["insumoFormula"] = f"si({flota(c)}, 'vidrio-float', 'vidrio-laminado')"
            l["variante"] = {"espesor": "'10'", "composicion": "espesor", "color": c}
        if l["id"] == "uv":
            l["variante"]["tipo_vidrio"] = "si(" + " && ".join(flota(c) for c in dict.fromkeys(colores)) + ", 'float', 'laminado')"
    return rec


def alta(medidas, piezas, uv="2 * (H - 1)"):
    return con_float10(receta(medidas, "alta", piezas, "bases", uv, INSERTOS_ALTA, ENT_INSERTOS))


def cromada(medidas, modelo, ref, piezas, regatones=4):
    return receta(medidas, "v8", piezas, None, None, [estructura(modelo, ref), {**REGATONES, "cantidad": str(regatones)}])


TAPA = pieza("tapa", "Tapa", 1, "L", "P")
TAPA_F = pieza("tapa", "Tapa", 1, "L", "P", forma=True)
TAPA_R = pieza("tapa", "Tapa redonda", 1, "D", "D", forma=True)


def bases(id, nombre, cant, ancho, largo="H - 1", forma=False, nota=None):
    return pieza(id, nombre, cant, ancho, largo, forma=forma, base=True, nota=nota)


PLANO = "Según el plano"
WEB = "Proporciones del cotizador de la web (sin plano)"

# ---------------------------------------------------------------- espejos
TONO = {"tono": {"tipo": "opcion", "nombre": "Espejo", "permitidos": ["plata", "bronce", "gris", "color"], "def": "plata"}}
# Plata: 3 a 6 mm. Bronce y gris: solo 4 mm. De color: laminado 3+3 o 4+3.
ESPESOR_ESPEJO = {
    "espesor_plata": {"tipo": "opcion", "nombre": "Espesor", "atributo": "espesor", "permitidos": ["3", "4", "5", "6"],
                      "def": "4", "mostrarSi": "tono == 'plata'"},
    "espesor_color": {"tipo": "opcion", "nombre": "Espesor", "atributo": "composicion_espejo", "permitidos": ["3e+3", "4e+3"],
                      "def": "3e+3", "mostrarSi": "tono == 'color'"},
}
# El laminado de color no se bisela (no tiene precio de biselado).
BISEL = {"biselado": {"tipo": "opcion", "nombre": "Biselado", "permitidos": ["no", "si"], "def": "no", "mostrarSi": "tono != 'color'"}}


def terminacion(forma):
    """forma: True, False o una condición ("forma == 'si'"). Biselado: precio de "biselado" de Vidpro."""
    f = (lambda a, b: f"si({forma}, '{a}', '{b}')") if isinstance(forma, str) else (lambda a, b: f"'{a if forma else b}'")
    return f"si(biselado == 'si', {f('biselado-forma', 'biselado')}, {f('pulido-forma', 'pulido-recto')})"


def espejo(l, a, forma, molde, redondo=False):
    """forma y molde: True/False, o una condición sobre las entradas (espejo personalizado)."""
    medidas = ({"D": {"tipo": "medida", "nombre": "Diámetro", "def": l}} if redondo else
               {"L": {"tipo": "medida", "nombre": "Ancho", "def": l}, "H": {"tipo": "medida", "nombre": "Alto", "def": a}})
    ancho, largo = ("D", "D") if redondo else ("L", "H")
    lineas = [{"id": "espejo", "nombre": "Espejo", "regla": "m2",
               "insumoFormula": "si(tono == 'plata', 'espejo', si(tono == 'color', 'espejo-laminado-color', 'espejo-color'))",
               "variante": {"espesor": "si(tono == 'plata', espesor_plata, '4')", "terminacion_espejo": terminacion(forma),
                            "composicion_espejo": "si(tono == 'color', espesor_color, '3e+3')"},
               "ancho": ancho, "largo": largo,
               "nota": "Plata 3 a 6 mm; bronce y gris 4 mm; de color, laminado 3+3 o 4+3. Pulido o biselado"}]
    if forma:
        # El laminado de color no tiene precio con forma: se le suma el recargo de forma.
        cond = "tono == 'color'" + (f" && {forma}" if isinstance(forma, str) else "")
        lineas.append({"id": "forma", "nombre": "Recargo por forma", "regla": "porcentaje", "condicion": cond,
                       "porcentaje": "aj.recargo_forma", "sobre": ["espejo"]})
    if molde:
        l = {"id": "molde", "nombre": "Mano de obra del molde", "regla": "porcentaje",
             "porcentaje": "aj.recargo_molde", "sobre": ["espejo"]}
        if isinstance(molde, str):
            l["condicion"] = molde
        lineas.append(l)
    lineas += [{"id": "perfil_j", "nombre": "Perfil J de aluminio", "regla": "ml", "insumo": "perfil-j-aluminio",
                "cantidad": "3", "metros": "0.4", "nota": "3 tiras de 40 cm atrás"},
               {"id": "silicona", "nombre": "Pegado con silicona", "regla": "fijo", "insumo": "silicona-espejo"}]
    personal = {}
    if isinstance(forma, str):
        personal["con_forma"] = {"tipo": "opcion", "nombre": "Forma", "permitidos": ["no", "si"], "def": "no"}
    if isinstance(molde, str):
        personal["con_molde"] = {"tipo": "opcion", "nombre": "Molde", "permitidos": ["no", "si"], "def": "no"}
    entradas = {**medidas, **personal, **TONO, **ESPESOR_ESPEJO, **BISEL}
    return {"orden": list(entradas), "entradas": entradas, "lineas": lineas}


def mesa_personalizada():
    """Mesa sin modelo: tapa y bases de partida; el resto se arma en el desglose del presupuesto."""
    rec = receta(RECT(100, 50, 40), "v10",
                 [pieza("tapa", "Tapa", 1, "L", "P", nota="Cambiá medidas o cantidad en el desglose"),
                  bases("bases", "Bases", "cant_bases", "P", nota="Agregá más vidrios con «+ Agregar vidrio»")], None)
    ent = rec["entradas"]
    ent.update({
        "cant_bases": {"tipo": "medida", "nombre": "Bases", "min": 0, "max": 10, "def": 2},
        "forma_tapa": {"tipo": "opcion", "nombre": "Forma en la tapa", "permitidos": ["no", "si"], "def": "no"},
        "ajuste": {"tipo": "opcion", "nombre": "Ajuste (20%)", "permitidos": ["mesa baja", "mesa alta", "sin ajuste"],
                   "def": "mesa baja"},
        "uv_extra": {"tipo": "medida", "nombre": "Pegado UV extra (cm)", "min": 0, "max": 2000, "def": 0},
        "insertos": {"tipo": "opcion", "nombre": "Insertos", "permitidos": ["no", "si"], "def": "no"},
        "cant_regatones": {"tipo": "medida", "nombre": "Regatones", "min": 0, "max": 20, "def": 0},
    })
    piezas = ["tapa", "bases"]
    rec["lineas"] += [
        {"id": "forma", "nombre": "Recargo por forma", "regla": "porcentaje", "condicion": "forma_tapa == 'si'",
         "porcentaje": "aj.recargo_forma", "sobre": ["tapa"], "nota": "Tapa con forma o puntas redondeadas: 20%"},
        {"id": "ajuste_baja", "nombre": "Ajuste", "regla": "porcentaje", "condicion": "ajuste == 'mesa baja'",
         "porcentaje": "aj.ajuste_vidpro", "sobre": piezas + ["forma"], "nota": "Mesa baja: 20% sobre todos los vidrios"},
        {"id": "ajuste_alta", "nombre": "Ajuste", "regla": "porcentaje", "condicion": "ajuste == 'mesa alta'",
         "porcentaje": "aj.ajuste_vidpro", "sobre": ["bases"], "nota": "Mesa alta: 20% solo sobre las bases"},
        {"id": "uv", "nombre": "Pegado UV", "regla": "ml", "insumo": "pegado-uv", "condicion": "cant_bases * (H - 1) + uv_extra > 0",
         "variante": {"tipo_vidrio": FAMILIAS["v10"]["uv"](["color", COLOR_BASES])},
         "metros": "(cant_bases * (H - 1) + uv_extra) / 100", "nota": "Cada base pegada en su alto, más el UV extra"},
        {**INSERTOS_ALTA[0], "insumoFormula": "si(en(espesor, '8', '10'), 'insertos-mesa-alta-10', 'insertos-mesa-alta-12')"},
        {**REGATONES, "cantidad": "cant_regatones", "condicion": "cant_regatones > 0"},
    ]
    rec["orden"] = list(ent)
    return rec


# ---------------------------------------------------------------- catálogo
R, AUX, COM, ESC, EST, REC, ESP = ("Mesas ratonas", "Mesas auxiliares", "Mesas de comedor", "Escritorios",
                                   "Estantes", "Recibidores y consolas", "Espejos")
PERS = "Personalizados"
SILLAS = "Sillas y taburetes"
C = []  # (nombre, categoría, receta, nota)

# --- Ratonas UV
C.append(("Mesa Tierra", R, receta(RECT(100, 50, 40), "v10",
          [TAPA, bases("laterales", "Laterales", 2, "P")], None, "2 * P"), "Sin ajuste (20/10/2026)"))
C.append(("Mesa Tierra con Estante", R, receta(RECT(100, 50, 40), "v10",
          [TAPA, bases("laterales", "Laterales", 2, "P"), pieza("estante", "Estante", 1, "L - 2", "P")], None, "4 * P"),
          "Sin ajuste, como la Tierra"))
C.append(("Mesa Venus", R, receta(RECT(100, 50, 40), "v10",
          [TAPA, bases("bases_largas", "Bases largas", 2, "redondear(L * 0.7)", nota="70 cm en la 100 × 50"),
           bases("bases_cortas", "Bases cortas", 2, "redondear(P * 0.3)", nota="15 cm en la 100 × 50")], "total",
          "2 * redondear(L * 0.7) + 2 * redondear(P * 0.3) + 2 * (H - 1)"), PLANO))
C.append(("Mesa Gravedad", R, receta(RECT(100, 60, 40), "v10",
          [TAPA_F, bases("base_larga", "Base larga", 1, "redondear(L * 0.6)", forma=True, nota="60 cm en la 100 × 60, radio 3"),
           bases("bases_cortas", "Bases cortas", 2, "redondear(P / 3)", forma=True, nota="20 cm en la 100 × 60, radio 3")], "total",
          "redondear(L * 0.6) + 2 * redondear(P / 3) + 2 * (H - 1)"), PLANO + ": tapa radio 5 y bases radio 3 (con forma)"))
C.append(("Mesa Gravedad II", R, receta(RECT(75, 55, 40), "v10",
          [TAPA_F, bases("base_larga", "Base larga", 1, "redondear(L * 0.6)", nota="45 cm en la 75 × 55"),
           bases("bases_cortas", "Bases cortas", 2, "redondear(P * 0.27)", nota="15 cm en la 75 × 55")], "total",
          "redondear(L * 0.6) + 2 * redondear(P * 0.27) + 2 * (H - 1)"), PLANO + ": tapa ovalada"))
C.append(("Mesa Eclipse", R, receta(RECT(80, 80, 40), "v10",
          [TAPA, bases("base_central", "Base central", 1, "redondear(P * 0.625)", nota="50 cm en la 80 × 80"),
           bases("bases_cortas", "Bases cortas", 2, "redondear(L * 0.25)", nota="20 cm en la 80 × 80")], "total",
          "redondear(P * 0.625) + 2 * redondear(L * 0.25) + 2 * (H - 1)"), PLANO))
C.append(("Mesa Palta", AUX, receta(RECT(55, 75, 36), "v10",
          [TAPA_F, bases("base_ancha", "Base transversal", 1, "L - 5", nota="50 cm en la 55 × 75"),
           bases("base_larga", "Base longitudinal", 1, "redondear(P * 0.6)", nota="45 cm en la 55 × 75")], "total",
          "(L - 5) + redondear(P * 0.6) + (H - 1)"), PLANO + ": tapa en forma de palta"))
C.append(("Mesa Boreal", R, receta(RECT(100, 60, 40), "v10",
          [TAPA_F, bases("laterales", "Laterales con arco", 2, "P", forma=True),
           bases("central", "Panel central con arco", 1, "redondear(L * 0.6)", forma=True)], "total",
          "2 * P + redondear(L * 0.6) + 2 * (H - 1)"), WEB))
C.append(("Mesa Atlas", R, receta(RECT(85, 45, 40), "v10",
          [pieza("tapas", "Tapa y base", 2, "L", "P - 5", forma=True, nota="85 × 40 radio 5 en la 85 × 45"),
           bases("paneles_largos", "Paneles largos", 2, "L - 35", "H - 3", nota="50 × 37 en la 85 × 45 × 40"),
           bases("paneles_cortos", "Paneles cortos", 2, "P - 20", "H - 3", nota="25 × 37 en la 85 × 45 × 40")], "total",
          "2 * (2 * (L - 35) + 2 * (P - 20))"), PLANO))
C.append(("Mesa Cósmico", AUX, receta(RECT(50, 50, 60), "v10",
          [TAPA_F, bases("trasero", "Panel trasero", 1, "P + 10", "H", nota="60 cm en la 50 × 50"),
           bases("cruzado", "Panel cruzado", 1, "L - 2.5", nota="47,5 cm en la 50 × 50")], "total", "L + P + H"),
          PLANO + ": tapa con puntas redondeadas"))
C.append(("Mesa Astra Dúo", R, receta(REDONDA(120, 40), "v10",
          [pieza("tapas", "Tapas semicirculares", 2, "D", "D / 2", forma=True),
           bases("bases_largas", "Bases largas", 2, "D"), bases("bases_cortas", "Bases cortas", 2, "D / 2 - 1")], "total",
          "2 * (D + D / 2) + 2 * (H - 1)"), PLANO + ": juego de 2 mesas semicirculares"))
C.append(("Mesa Astra Dúo Recta", R, receta(RECT(80, 40, 35), "v10",
          [pieza("tapa_chica", "Tapa chica", 1, "L", "P"), pieza("tapa_grande", "Tapa grande", 1, "L", "2 * P"),
           bases("laterales_chica", "Laterales mesa chica", 2, "P"), bases("laterales_grande", "Laterales mesa grande", 2, "2 * P", "H - 6")],
          "total", "6 * P"), WEB + ": juego de una mesa L × P × H y otra L × 2P × (H − 5)"))
C.append(("Mesa Canoa", R, receta(RECT(100, 55, 30), "v10",
          [TAPA_F, bases("base_larga", "Base longitudinal", 1, "redondear(L * 0.8)", forma=True),
           bases("bases_cortas", "Bases transversales", 2, "P", forma=True)], "total",
          "redondear(L * 0.8) + 2 * P + 2 * (H - 1)"), WEB))
for nombre, cat, d, h in [("Mesa Canoa Redonda", R, 80, 35), ("Mesa Auxiliar Canoa", AUX, 50, 30)]:
    C.append((nombre, cat, receta(REDONDA(d, h), "v10", [TAPA_R, bases("bases", "Bases en cruz", 2, "D", forma=True)], "total",
              "2 * D + 2 * (H - 1)"), WEB))
C.append(("Mesa Júpiter", R, receta(REDONDA(80, 35), "v10",
          [TAPA_R, bases("bases", "Bases circulares en cruz", 2, "redondear(D * 0.8)", forma=True)], "total",
          "redondear(D * 1.2) + 2 * (H - 1)"), WEB))
C.append(("Mesa Zenit", R, receta(REDONDA(100, 40), "v10",
          [TAPA_R, bases("bases", "Bases con arco", 2, "redondear(D * 0.6)", forma=True)], "total",
          "redondear(D * 1.2) + 2 * (H - 1)"), WEB))
C.append(("Mesa Ceres", R, receta(REDONDA(100, 40), "v10",
          [TAPA_R, pieza("estante", "Estante redondo", 1, "D", "D", forma=True),
           bases("paneles", "Paneles", 4, "redondear(D * 0.7)", "(H - 2) / 2", forma=True, nota="70 × 19 en la Ø 100 × 40")],
          "total", "3 * 2 * redondear(D * 0.7)"), PLANO))
C.append(("Mesa Nova", AUX, receta(REDONDA(50, 50), "v10",
          [TAPA_R, bases("bases", "Bases en cruz", 2, "redondear(D * 0.9)", forma=True)], "total",
          "redondear(D * 1.8) + 2 * (H - 1)"), WEB))
C.append(("Mesa Lux", AUX, receta(REDONDA(50, 60), "v10",
          [TAPA_R, bases("paneles", "Paneles", 2, "redondear(D * 0.7)", nota="35 cm en la Ø 50"),
           pieza("inclinado", "Estante inclinado", 1, "redondear(D * 0.64)", "redondear(H * 0.67)", nota="32 × 40 en la Ø 50 × 60"),
           pieza("corto", "Estante corto", 1, "redondear(D * 0.64)", "redondear(H * 0.27)", nota="32 × 16 en la Ø 50 × 60")],
          "total", "redondear(D * 1.4) + 2 * (redondear(H * 0.67) + redondear(H * 0.27)) + redondear(D * 0.64)"), PLANO))
C.append(("Mesa Estelar", AUX, receta(REDONDA(50, 60), "v10",
          [TAPA_R, pieza("estantes_redondos", "Estantes redondos", "estantes", "D", "D", forma=True),
           bases("laterales", "Laterales", 2, "redondear(D * 0.6)", "H")], "total",
          "2 * redondear(D * 0.6) * (1 + estantes)",
          entradas_extra={"estantes": {"tipo": "medida", "nombre": "Estantes", "def": 1, "min": 1, "max": 2}}), WEB))
C.append(("Mesa Cubo", AUX, receta(RECT(50, 50, 60), "v10",
          [TAPA, pieza("base", "Base", 1, "L", "P", base=True), bases("laterales", "Laterales", 2, "P", "H - 2")], "total",
          "4 * P", RUEDAS), WEB + ": con 4 ruedas y 4 insertos"))
C.append(("Mesa Órbita", AUX, receta(RECT(50, 50, 80), "v10",
          [TAPA, pieza("base", "Base", 1, "L", "P", base=True), bases("laterales", "Laterales", 2, "P", "H - 2"),
           pieza("estante", "Estante", 1, "L - 2", "P")], "total", "6 * P", RUEDAS), WEB + ": con 4 ruedas y 4 insertos"))
C.append(("Mesa Nube", AUX, receta(RECT(37, 40, 60), "v10",
          [bases("laterales", "Laterales", 2, "P", "H", forma=True, nota="40 × 60 radio 3"),
           pieza("estantes", "Estantes", 2, "L - 3", "P - 5", forma=True, nota="34 × 35 radio 3"),
           pieza("soporte", "Soporte trasero", 1, "L - 2", "redondear(H * 35 / 60)", nota="35 × 35 en la 37 × 40 × 60")], "total",
          "4 * (P - 5) + 2 * (L - 2) + 2 * redondear(H * 35 / 60)"), PLANO))

# --- Mesas altas (laminado 5+5 o float 10 mm en incoloro, gris y bronce, ajuste solo sobre las bases, insertos opcionales)
C.append(("Mesa Sol", COM, alta(REDONDA(100, 75), [TAPA_R, bases("bases", "Base en cruz", 2, "redondear(D * 0.5)")]), WEB))
C.append(("Mesa Luz", COM, alta(REDONDA(100, 75), [TAPA_R, bases("bases", "Bases en V", 4, "redondear(D * 0.35)", nota="35 cm en la Ø 100")]),
          PLANO + ": dos pares de bases en V"))
LUCERO = lambda tapa: [tapa, bases("base_larga", "Base larga", 1, "L - 60", nota="100 cm en la 160 × 90"),
                       bases("bases_cortas", "Bases cortas", 2, "redondear(P * 0.28)", nota="25 cm en la 160 × 90")]


C.append(("Mesa Lucero Rectangular", COM, alta(RECT(160, 90, 75), LUCERO(TAPA)),
          "Bases según el plano de la Lucero"))
C.append(("Mesa Lucero Medio Punto", COM, alta(RECT(160, 90, 75), LUCERO(TAPA_F)), PLANO))
C.append(("Mesa Galaxia", COM, alta(RECT(140, 90, 75), [TAPA, bases("patas", "Patas en V", 4, "redondear(P * 0.3)")]), WEB))
C.append(("Mesa Galaxia II", COM, alta(RECT(160, 80, 75), [TAPA_F, bases("patas", "Patas en V", 4, "redondear(P * 0.31)", nota="25 cm en la 160 × 80")]),
          PLANO))
C.append(("Mesa Universo", COM, alta(RECT(160, 80, 75), [TAPA, bases("patas", "Patas", 2, "redondear(P * 0.6)"),
                                                          bases("refuerzos", "Refuerzos de patas", 2, "redondear(P * 0.25)")]), WEB))
C.append(("Mesa Tiempo", COM, alta(RECT(160, 80, 75), [TAPA_F, bases("patas", "Patas (2 paneles cada una)", 4, "redondear(P * 0.6)", forma=True)]), WEB))
C.append(("Mesa DJ", COM, alta(RECT(170, 50, 92), [TAPA, bases("patas", "Patas", 2, "P"), bases("refuerzos", "Refuerzos de patas", 2, "redondear(P * 0.4)")]), WEB))
C.append(("Escritorio Tierra", ESC, alta(RECT(120, 50, 75), [TAPA, bases("laterales", "Laterales", 2, "P")], "2 * P"), PLANO))

# --- Estanterías, racks y recibidores (sin ajuste)
C.append(("Estantería Prisma", EST, receta(RECT(32, 30, 104), "v10",
          [TAPA, pieza("laterales", "Laterales", 2, "P", "H - 1"), pieza("estantes", "Estantes", 3, "L - 2", "P")], None, "8 * P"), WEB))
C.append(("Estantería Halo", EST, receta(RECT(100, 35, 100), "v10",
          [pieza("laterales", "Laterales con arco", 2, "P", "H", forma=True),
           pieza("estantes", "Estantes con arco", 3, "L - 20", "P", forma=True, nota="80 × 35 en la 100 × 35 × 100"),
           pieza("base_estante", "Base del estante", 1, "P", "redondear(H * 0.15)", forma=True, nota="35 × 15 radio 5"),
           pieza("soporte_medio", "Soporte estante medio", 1, "redondear(H * 0.335)", "P"),
           pieza("soporte_arriba", "Soporte estante de arriba (con arco)", 1, "redondear(H * 0.4)", "P", forma=True)], None, "8 * P"), PLANO))
C.append(("Estantería Lyra", EST, receta(RECT(60, 50, 77), "v10",
          [TAPA_F, pieza("laterales", "Laterales", 2, "P", "H - 1", forma=True), pieza("estante", "Estante", 1, "L - 2", "P"),
           pieza("vinilero", "Vinilero (frente y fondo)", 2, "L - 2", "redondear(H * 0.3)", forma=True)], None,
          "4 * P + 4 * redondear(H * 0.3)"), WEB))
C.append(("Vinilero Lyra", EST, receta(RECT(40, 40, 40), "v10",
          [pieza("base", "Base", 1, "L", "P"), pieza("laterales", "Laterales", 2, "P", "H", forma=True),
           pieza("fondo", "Fondo", 1, "L", "H", forma=True)], None, "2 * P + L + 2 * H"), WEB))
# Plano 26/10/2026 (140 × 30 × 60): tapa y estante 140 × 30; laterales 33 × 30 entre la tapa y el estante;
# 2 bases de 25 × 30 debajo del estante, 20 cm adentro de cada punta. 60 = 33 + 25 + 2 cm de los dos vidrios.
C.append(("Rack Núcleo", EST, receta(RECT(140, 30, 60), "v10",
          [TAPA, pieza("laterales", "Laterales", 2, "P", "H - 2 - redondear(H * 0.42)", nota="33 × 30 en la 140 × 30 × 60"),
           pieza("estante", "Estante", 1, "L", "P", nota="Misma medida que la tapa"),
           pieza("bases", "Bases", 2, "P", "redondear(H * 0.42)", nota="25 × 30 en la 140 × 30 × 60; van 20 cm adentro de cada punta")],
          None, "6 * P"), PLANO))
C.append(("Recibidor Tori", REC, receta(RECT(110, 30, 100), "v10",
          [pieza("estantes", "Estantes", 3, "L", "P"), pieza("paneles", "Paneles verticales", 2, "P", "H"),
           pieza("separadores", "Separadores", 4, "P", "redondear(H * 0.3)")], None, "14 * P"), WEB))
C.append(("Estantería Aurora", EST, receta(RECT(110, 45, 101), "v10",
          [TAPA, pieza("base", "Base", 1, "L", "P"), pieza("laterales", "Laterales", 2, "P", "H - 2"),
           pieza("estantes", "Estantes", 2, "L - 2", "P"),
           pieza("puertas", "Puertas", 2, "L / 2 - 1", "redondear(H / 2)", nota="54 × 50 en la 110 × 45 × 101")], None, "8 * P",
          [{"id": "bisagras", "nombre": "Bisagras", "regla": "unidad", "insumo": "bisagra", "cantidad": "4", "nota": "2 por puerta"}]), PLANO))

# --- Estructura cromada (STG + vidrios + 4 regatones, sin ajuste)
for nombre, cat, modelo, (l, p, h) in [("Módulo", REC, "modulo", (110, 45, 65)), ("Módulo II", REC, "modulo-ii", (60, 45, 65)),
                                       ("Bar Spazio", REC, "bar", (55, 45, 65)), ("Mesa Arcos", AUX, "arcos", (45, 39, 60))]:
    C.append((nombre, cat, cromada(RECT(l, p, h), modelo, "L", [pieza("vidrios", "Vidrios", 2, "L", "P")]), WEB))
C.append(("Mesa Binario", R, cromada(
    {**RECT(130, 45, 35), "La": {"tipo": "medida", "nombre": "Largo de la auxiliar", "def": 55},
     "Pa": {"tipo": "medida", "nombre": "Profundidad de la auxiliar", "def": 50}}, "binario", "L",
    [pieza("vidrio_larga", "Vidrio mesa larga", 1, "L", "P"), pieza("vidrio_aux", "Vidrio mesa auxiliar", 1, "La", "Pa")], regatones=8),
    "Juego de 2 mesas; cada vidrio a la medida de su mesa"))
C.append(("Mesa Saturno", R, cromada(REDONDA(80, 40), "saturno", "D", [pieza("vidrio", "Vidrio redondo", 1, "D", "D", forma=True)]),
          PLANO + ": un vidrio redondo del diámetro de la estructura"))
C.append(("Recibidor Nexo", REC, cromada(RECT(150, 47, 90), "recibidor-nexo", "L",
          [pieza("vidrios", "Vidrios", 2, "L", "P"), pieza("estante", "Estante central", 1, "redondear(L * 0.4)", "P")]), WEB))

# --- Patas cilíndricas
PATAS = {"patas": {"tipo": "opcion", "nombre": "Patas", "permitidos": ["aluminio", "acero inoxidable"], "def": "aluminio"}}
C.append(("Mesa Constelación", COM, con_float10(receta(RECT(180, 90, 75), "alta", [TAPA], None, None,
          [{"id": "patas_juego", "nombre": "Patas cilíndricas (juego de 4)", "regla": "unidad",
            "insumoFormula": "si(patas == 'aluminio', 'patas-cilindricas-aluminio', 'patas-cilindricas-acero')"}], PATAS)),
          "Tapa laminada 5+5 (o float 10 mm en incoloro, gris y bronce) y juego de 4 patas"))
C.append(("Mesa Constelación Ratona", R, receta(RECT(100, 50, 40), "v10", [TAPA], None, None,
          [{"id": "patas_juego", "nombre": "Patas cilíndricas de aluminio (juego de 4)", "regla": "unidad",
            "insumo": "patas-cilindricas-aluminio-ratona"}]), "Patas estimadas a la mitad de las de comedor"))

# --- Espejos
for nombre, l, a, forma, molde, redondo in [
        ("Espejo Rectangular", 60, 80, False, False, False), ("Espejo Tótem", 40, 100, False, False, False),
        ("Espejo Capilla", 70, 100, True, False, False), ("Espejo Medio Punto", 50, 100, True, False, False),
        ("Espejo Bote", 55, 140, True, False, False), ("Espejo Círculo", 60, 60, True, False, True),
        ("Espejo Púa", 70, 100, False, True, False), ("Espejo Gota", 55, 80, False, True, False),
        ("Espejo Nébula", 150, 60, False, True, False), ("Espejo Mercurio", 57, 64, False, True, False),
        ("Espejo Cosmos", 73, 90, False, True, False), ("Espejo Eco", 70, 77, False, True, False),
        ("Espejo Neptuno", 91, 100, False, True, False)]:
    C.append((nombre, ESP, espejo(l, a, forma, molde, redondo),
              "Con molde: +30% de mano de obra" if molde else ("Pulido con forma" if forma else "Pulido recto")))

# --- Personalizados: sin modelo, se arman en el desglose
C.append(("Espejo Personalizado", PERS, espejo(60, 80, "con_forma == 'si'", "con_molde == 'si'"),
          "Cualquier forma: medidas del rectángulo que lo contiene; vidrios extra en el desglose"))
C.append(("Mesa Personalizada", PERS, mesa_personalizada(),
          "Sin modelo: se arma en el desglose (tapa, bases y vidrios agregados)"))

# --- Sillas y taburetes: precio por unidad, no cambia con la tela ni el color
TELA = {"tela": {"tipo": "opcion", "nombre": "Tela", "permitidos": ["panne", "cuerina", "algodón texturado"], "def": "panne"}}
TAPIZADO = {"color": {"tipo": "opcion", "nombre": "Color", "atributo": "tapizado", "def": "a-elegir"}}
TAPIZADOS = [("a-elegir", "A elegir"), ("amarillo", "Amarillo"), ("azul", "Azul"), ("gris", "Gris"), ("verde", "Verde"),
             ("rosa", "Rosa"), ("rojo", "Rojo"), ("negro", "Negro"), ("marron", "Marrón"), ("microcuadro-blanco", "Microcuadro blanco"),
             ("microcuadro-negro", "Microcuadro negro"), ("violeta", "Violeta"), ("almendra", "Almendra"), ("celeste", "Celeste"),
             ("beige", "Beige"), ("oceano", "Océano"), ("catalogo", "Otro del catálogo")]


def silla(lineas, cantidad=1):
    ent = {**TELA, **TAPIZADO}
    if cantidad != 1:
        lineas = [{**l, "cantidad": str(cantidad)} for l in lineas]
    return {"orden": list(ent), "entradas": ent, "lineas": lineas}


TAPIZADO_BELEN = {"id": "tapizado", "nombre": "Tapizado (Belén)", "regla": "unidad", "insumo": "tapizado-cesca"}
CESCA = [{"id": "estructura", "nombre": "Estructura (Alberto)", "regla": "unidad", "insumo": "silla-cesca"}, TAPIZADO_BELEN]
stg = lambda modelo, nota: {"id": "stg", "nombre": "STG", "regla": "unidad", "insumo": "estructura-stg",
                            "variante": {"modelo": f"'{modelo}'"}, "nota": nota}
DUNA = [stg("silla-duna", "Llega completa de STG")]
C.append(("Silla Cesca", SILLAS, silla(CESCA), "Estructura de Alberto y tapizado de Belén"))
C.append(("Silla Cesca Cerrada", SILLAS, silla([
    {"id": "estructura", "nombre": "Estructura (Alberto)", "regla": "unidad", "insumo": "silla-cesca-cerrada",
     "nota": "Precio a confirmar con Alberto"}, TAPIZADO_BELEN]),
    "Estructura de Alberto y tapizado de Belén"))
C.append(("Silla Duna", SILLAS, silla(DUNA), "STG la hace completa"))
C.append(("Taburete Duna", SILLAS, silla([stg("taburete-duna", "Llega completo de STG")]), "STG lo hace completo"))

# --- Combos de la web
RECETAS = {nombre: rec for nombre, _, rec, _ in C}


def combo_mesa(mesa, sillas, n=4, medidas=None):
    """La receta de la mesa más n sillas (sus líneas con prefijo "sillas_")."""
    m = json.loads(json.dumps(mesa))
    if medidas:
        for k, v in medidas.items():
            m["entradas"][k]["def"] = v
    ent = {**m["entradas"], "tela": TELA["tela"],
           "color_sillas": {**TAPIZADO["color"], "nombre": "Color de las sillas"}}
    lineas = m["lineas"] + [{**l, "id": "sillas_" + l["id"], "nombre": f"{n} sillas: " + l["nombre"][0].lower() + l["nombre"][1:],
                             "cantidad": str(n)} for l in sillas]
    return {"orden": [*m.get("orden", list(m["entradas"])), "tela", "color_sillas"], "entradas": ent, "lineas": lineas}


from recetas_piloto import aire  # noqa: E402

COMBOS = "Combos"
C.append(("Combo Silla Cesca", COMBOS, silla(CESCA, 4), "4 Sillas Cesca (web)"))
C.append(("Combo Silla Duna", COMBOS, silla(DUNA, 4), "4 Sillas Duna (web)"))
C.append(("Combo Mesa Constelación + 4 Sillas Cesca", COMBOS, combo_mesa(RECETAS["Mesa Constelación"], CESCA), "Web: 140×70, 180×90 o 200×100"))
C.append(("Combo Mesa Aire Alta Rectangular + 4 Sillas Cesca", COMBOS, combo_mesa(aire(True, redonda=False), CESCA),
          "Web: 160×80, 180×90 o 200×100"))
C.append(("Combo Mesa Aire Alta Redonda + 4 Sillas Cesca", COMBOS, combo_mesa(aire(True), CESCA), "Web: Ø 100, 120 o 140"))
C.append(("Combo Mesa Tiempo + 4 Sillas Cesca", COMBOS, combo_mesa(RECETAS["Mesa Tiempo"], CESCA), "Web: 160×80, 180×90 o 200×100"))
C.append(("Combo Mesa Sol + 4 Sillas Cesca", COMBOS, combo_mesa(RECETAS["Mesa Sol"], CESCA), "Web: Ø 80 a 140"))

# ---------------------------------------------------------------- SQL
q = lambda s: "'" + s.replace("'", "''") + "'"
out = ["""-- =====================================================================
-- Spazio Design · Cotizador · Recetas de los modelos de la web
-- Generado por scripts/cotizador/recetas_catalogo.py. Crea los productos que falten y
-- publica cada receta como versión nueva solo si cambió. Se puede correr de nuevo.
-- Se ejecuta después de 2026-10_componentes.sql y 2026-10_recetas_piloto.sql.
-- =====================================================================

insert into public.cot_categorias (nombre, orden) values ('Personalizados', 5), ('Sillas y taburetes', 70), ('Combos', 80) on conflict (nombre) do nothing;
insert into public.cot_atributos (clave, nombre, orden) values ('tapizado', 'Tapizado', 20) on conflict (clave) do nothing;
-- Colores de tapizado: los de la web (spaziodesign.net, 22/10/2026).
delete from public.cot_atributo_valores where atributo = 'tapizado'
  and valor not in (""" + ", ".join(f"'{v}'" for v, _ in TAPIZADOS) + """);
-- La estructura de la Cesca Cerrada es de Alberto (no de STG). Precio a confirmar: el de la lista.
insert into public.cot_insumos (codigo, tipo, nombre, unidad, atributos, proveedor_id, orden, notas)
values ('silla-cesca-cerrada', 'estructura', 'Estructura Silla Cesca Cerrada', 'unidad', '{}',
        (select id from public.proveedores where nombre = 'Alberto'), 205, 'Precio a confirmar')
on conflict (codigo) do nothing;
insert into public.cot_tarifas (insumo_id, variante, precio, nota, vigente_desde)
select i.id, '{}'::jsonb, 160000, 'A confirmar con Alberto', '2026-10-22' from public.cot_insumos i
where i.codigo = 'silla-cesca-cerrada' and not exists (select 1 from public.cot_tarifas t where t.insumo_id = i.id and t.vigente_hasta is null);
""" + "\n".join(f"insert into public.cot_atributo_valores (atributo, valor, etiqueta, grupos, orden) values ('tapizado', '{v}', '{e}', '{{}}', {i}) on conflict (atributo, valor) do nothing;" for i, (v, e) in enumerate(TAPIZADOS)) + """

create or replace function pg_temp.publicar_receta(p_nombre text, p_categoria text, p_def jsonb, p_nota text) returns text
language plpgsql as $$
declare
  v_prod uuid;
  v_pub public.cot_recetas%rowtype;
  v_bor uuid;
  v_id uuid;
  v_ver integer;
begin
  select id into v_prod from public.cot_productos where lower(nombre) = lower(p_nombre) and activo;
  if v_prod is null then
    insert into public.cot_productos (nombre, categoria_id)
    values (p_nombre, (select id from public.cot_categorias where nombre = p_categoria))
    returning id into v_prod;
  end if;
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
for nombre, cat, rec, nota in C:
    out.append(f"select pg_temp.publicar_receta({q(nombre)}, {q(cat)}, {q(json.dumps(rec, ensure_ascii=False))}::jsonb, {q(nota)});")
open("supabase/importaciones/2026-10_recetas_catalogo.sql", "w").write("\n".join(out) + "\n")
print(len(C), "recetas")
