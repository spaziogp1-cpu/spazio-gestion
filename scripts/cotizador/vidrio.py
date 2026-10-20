"""Vidrio de las recetas: colores, mesas combinadas y espesores (lo usan los dos generadores)."""

COLOR = {"tipo": "opcion", "nombre": "Color", "atributo": "color", "def": "incoloro"}
# Mesas combinadas: las bases de otro color que la tapa.
COMBINADA = {"combinada": {"tipo": "opcion", "nombre": "Bases de otro color", "permitidos": ["no", "si"], "def": "no"},
             "color_bases": {"tipo": "opcion", "nombre": "Color de las bases", "atributo": "color", "def": "incoloro",
                             "mostrarSi": "combinada == 'si'"}}
COLOR_BASES = "si(combinada == 'si', color_bases, color)"
FLOTA = lambda c: f"en({c}, 'incoloro', 'gris', 'bronce')"
# Espesor en mm → composición del laminado (los colores siempre van laminados).
COMPOSICION = ("si(espesor == '8', '4+4', si(espesor == '10', '5+5', si(espesor == '12', '6+6', "
               "si(espesor == '16', '8+8', '10+10'))))")


def espesor_v10(combinada):
    """Espesor en mm y, donde existe el float (incoloro, gris y bronce de 8 o 10 mm), float o laminado."""
    colores = f"{FLOTA('color')} || (combinada == 'si' && {FLOTA('color_bases')})" if combinada else FLOTA("color")
    return {"espesor": {"tipo": "opcion", "nombre": "Espesor (mm)", "permitidos": ["10", "8", "12", "16", "20"], "def": "10"},
            "tipo_vidrio": {"tipo": "opcion", "nombre": "Vidrio", "permitidos": ["float", "laminado"], "def": "float",
                            "mostrarSi": f"en(espesor, '8', '10') && ({colores})"}}


# Va en float si es de 8 o 10 mm, eligieron float y el color existe en float; si no, laminado.
FLOTA_V10 = lambda c: f"en(espesor, '8', '10') && tipo_vidrio == 'float' && {FLOTA(c)}"


def vidrio(fam, c):
    """Insumo y variante del vidrio de una pieza de color c (nombre de variable o fórmula)."""
    if fam == "v10":
        # Float en incoloro, gris y bronce de 8 o 10 mm (si lo eligen); el resto, laminado de seguridad.
        flota = FLOTA_V10(c)
        return {"insumoFormula": f"si({flota}, 'vidrio-float', 'vidrio-laminado')",
                "variante": {"espesor": "espesor", "composicion": COMPOSICION, "color": c}}
    if fam == "alta":
        return {"insumo": "vidrio-laminado", "variante": {"composicion": "espesor", "color": c}}
    if fam == "v8":
        # Laminado 4+4 (o 5+5); bronce float de ese espesor; gris float 10.
        return {"insumoFormula": f"si(en({c}, 'gris', 'bronce'), 'vidrio-float', 'vidrio-laminado')",
                "variante": {"espesor": f"si({c} == 'gris', '10', espesor)",
                             "composicion": "si(espesor == '8', '4+4', '5+5')", "color": c}}
    raise ValueError(fam)


