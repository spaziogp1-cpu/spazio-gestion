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


def vidrio(fam, c):
    """Insumo y variante del vidrio de una pieza de color c (nombre de variable o fórmula)."""
    if fam == "v10":
        # Float en incoloro, gris y bronce de 8 o 10 mm; el resto, laminado.
        flota = f"en(espesor, '8', '10') && {FLOTA(c)}"
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


