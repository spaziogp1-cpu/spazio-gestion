// =====================================================================
// Motor del cotizador.
//
// Recorre la receta línea por línea: decide si la línea va, calcula
// piezas y medidas, busca la tarifa que corresponde y aplica su regla.
// Al final suma costos y saca el precio con el margen y el redondeo.
//
// No lee la base ni sabe de pantallas: misma entrada, mismo resultado.
// =====================================================================

import { ErrorFormula, compilar, evaluarCondicion, evaluarNumero, evaluarTexto, variablesDe, type Variables } from './formula';
import type {
  AjustesPiezas,
  PiezaAgregada,
  Aviso,
  Catalogo,
  Insumo,
  Linea,
  LineaResultado,
  PedidoCalculo,
  Receta,
  ResultadoCalculo,
  Tarifa,
  ValoresAtributos,
} from './tipos';

/**
 * Receta con los vidrios agregados a mano en un presupuesto. Cada uno copia el vidrio de la pieza
 * "como" (insumo y variante: mismo color y espesor), va justo después de ella y entra en los mismos
 * porcentajes (ajuste) que esa pieza. Con forma suma su propio recargo de forma.
 */
export function conPiezasAgregadas(receta: Receta, extras: PiezaAgregada[]): Receta {
  if (!extras.length) return receta;
  let lineas = [...receta.lineas];
  const nuevosEnPorcentajes = new Map<string, string[]>(); // id de la pieza "como" → ids agregados
  for (const x of extras) {
    const i = lineas.findIndex((l) => l.id === x.como && l.regla === 'm2');
    if (i < 0 || lineas.some((l) => l.id === x.id)) continue;
    const base = lineas[i];
    const pieza: Linea = {
      id: x.id,
      nombre: x.nombre,
      regla: 'm2',
      insumo: base.insumo,
      insumoFormula: base.insumoFormula,
      variante: base.variante,
      cantidad: String(x.cantidad),
      ancho: String(x.ancho),
      largo: String(x.largo),
      nota: `Agregada a mano (vidrio como ${base.nombre})`,
    };
    const nuevas: Linea[] = [pieza];
    const ids = [x.id];
    if (x.forma) {
      nuevas.push({ id: `${x.id}_forma`, nombre: `${x.nombre}: con forma`, regla: 'porcentaje', porcentaje: 'aj.recargo_forma', sobre: [x.id] });
      ids.push(`${x.id}_forma`);
    }
    // Después de la pieza "como" y de los agregados anteriores a ella.
    let j = i + 1;
    while (j < lineas.length && lineas[j].id.startsWith('extra_')) j++;
    lineas = [...lineas.slice(0, j), ...nuevas, ...lineas.slice(j)];
    nuevosEnPorcentajes.set(x.como, [...(nuevosEnPorcentajes.get(x.como) ?? []), ...ids]);
  }
  lineas = lineas.map((l) => {
    if (l.regla !== 'porcentaje' || !l.sobre || l.id.startsWith('extra_')) return l;
    const suma = l.sobre.flatMap((id) => nuevosEnPorcentajes.get(id) ?? []);
    return suma.length ? { ...l, sobre: [...l.sobre, ...suma] } : l;
  });
  return { ...receta, lineas };
}

export const VERSION_MOTOR = 'motor-2'; // motor-2: piezas cambiadas a mano

/** Distancia (en la unidad de la referencia, ej. cm) a partir de la cual una estimación es poco confiable. */
const ESTIMACION_LEJANA = 30;
const RESERVADOS = new Set(['aj', 'cantidad', 'precio', 'si', 'en', 'min', 'max']);
const ID_VALIDO = /^[a-z][a-z0-9_]*$/;

const redondear2 = (n: number) => Math.round(n * 100) / 100;
const subirA = (n: number, multiplo: number) => (multiplo > 0 ? Math.ceil(n / multiplo - 1e-9) * multiplo : n);

// ---------------------------------------------------------------------
// Tarifas
// ---------------------------------------------------------------------
function candidatos(valores: ValoresAtributos, atributo: string, valor: string): string[] {
  return [valor, ...(valores[atributo]?.[valor]?.grupos ?? [])];
}

/** Tarifas que corresponden a una variante. Prefiere las que coinciden por valor exacto antes que por grupo. */
export function tarifasPara(insumo: Insumo, variante: Record<string, string>, valores: ValoresAtributos): Tarifa[] {
  let mejor = -1;
  let elegidas: Tarifa[] = [];
  for (const t of insumo.tarifas) {
    let puntos = 0;
    let sirve = true;
    for (const a of insumo.atributos) {
      const c = candidatos(valores, a, variante[a] ?? '');
      const i = c.indexOf(t.variante[a] ?? '\u0000');
      if (i < 0) {
        sirve = false;
        break;
      }
      if (i === 0) puntos++;
    }
    if (!sirve) continue;
    if (puntos > mejor) {
      mejor = puntos;
      elegidas = [t];
    } else if (puntos === mejor) elegidas.push(t);
  }
  return elegidas;
}

function describirVariante(variante: Record<string, string>, valores: ValoresAtributos) {
  const partes = Object.entries(variante).map(([a, v]) => valores[a]?.[v]?.etiqueta ?? v);
  return partes.length ? partes.join(' · ') : 'sin variante';
}

/** Precio por referencia: exacto, interpolado entre medidas conocidas o estimado con el incremento. */
export function precioPorReferencia(
  tarifas: Tarifa[],
  ref: number,
): { precio: number; tarifa: Tarifa; estimado?: string; lejana?: boolean } {
  const conRef = tarifas.filter((t) => t.referencia != null).sort((a, b) => Number(a.referencia) - Number(b.referencia));
  if (conRef.length === 0) {
    if (tarifas.length === 1) return { precio: tarifas[0].precio, tarifa: tarifas[0] };
    throw new ErrorFormula('Hay varias tarifas y ninguna tiene medida de referencia');
  }
  const exacta = conRef.find((t) => Math.abs(Number(t.referencia) - ref) < 1e-6);
  if (exacta) return { precio: exacta.precio, tarifa: exacta };

  const r = (t: Tarifa) => Number(t.referencia);
  if (conRef.length === 1) {
    const t = conRef[0];
    if (t.incremento == null) {
      throw new ErrorFormula(
        `La medida ${ref} no está en la lista y el modelo tiene una sola medida (${r(t)}): cargá cuánto sube el precio por unidad para poder estimarla`,
      );
    }
    const precio = Math.max(0, t.precio + (ref - r(t)) * Number(t.incremento));
    return { precio, tarifa: t, estimado: `Estimada desde la medida ${r(t)}`, lejana: Math.abs(ref - r(t)) > ESTIMACION_LEJANA };
  }

  // Entre dos medidas conocidas → interpolación; afuera → sigue la pendiente de las dos más cercanas.
  let a = conRef[0];
  let b = conRef[1];
  if (ref > r(conRef[conRef.length - 1])) {
    a = conRef[conRef.length - 2];
    b = conRef[conRef.length - 1];
  } else if (ref > r(conRef[0])) {
    for (let i = 0; i < conRef.length - 1; i++) {
      if (ref > r(conRef[i]) && ref < r(conRef[i + 1])) {
        a = conRef[i];
        b = conRef[i + 1];
        break;
      }
    }
  }
  const pendiente = (b.precio - a.precio) / (r(b) - r(a));
  const precio = Math.max(0, a.precio + (ref - r(a)) * pendiente);
  const dentro = ref > r(conRef[0]) && ref < r(conRef[conRef.length - 1]);
  const distancia = dentro ? 0 : Math.min(Math.abs(ref - r(conRef[0])), Math.abs(ref - r(conRef[conRef.length - 1])));
  return {
    precio,
    tarifa: Math.abs(ref - r(a)) <= Math.abs(ref - r(b)) ? a : b,
    estimado: dentro ? `Estimada entre las medidas ${r(a)} y ${r(b)}` : `Estimada fuera de la lista (medidas ${r(conRef[0])} a ${r(conRef[conRef.length - 1])})`,
    lejana: distancia > ESTIMACION_LEJANA,
  };
}

// ---------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------
type Estado = {
  vars: Variables;
  lineas: LineaResultado[];
  porId: Map<string, LineaResultado>;
  avisos: Aviso[];
  tarifasUsadas: { insumo: string; tarifa: Tarifa }[];
  piezas: AjustesPiezas;
};

function guardarVars(e: Estado, r: LineaResultado) {
  e.vars[r.id] = {
    costo: r.costo,
    cantidad: r.cantidad,
    medida: r.medida,
    m2: r.unidad === 'm2' ? r.medida : 0,
    ml: r.unidad === 'ml' ? r.medida : 0,
    ancho: r.ancho ?? 0,
    largo: r.largo ?? 0,
  };
}

function resolverInsumo(l: Linea, cat: Catalogo, vars: Variables): Insumo {
  const codigo = l.insumoFormula ? evaluarTexto(l.insumoFormula, vars) : l.insumo;
  if (!codigo) throw new ErrorFormula('Falta el insumo');
  const ins = cat.insumos[codigo];
  if (!ins) throw new ErrorFormula(`No existe el insumo "${codigo}"`);
  return ins;
}

function resolverVariante(l: Linea, ins: Insumo, vars: Variables): Record<string, string> {
  const v: Record<string, string> = {};
  for (const a of ins.atributos) v[a] = evaluarTexto(l.variante?.[a] ?? a, vars);
  return v;
}

function minimoDe(ins: Insumo, t: Tarifa | undefined, por: 'pieza' | 'item'): number {
  if (ins.minimo_por !== por) return 0;
  return Number(t?.minimo ?? ins.minimo ?? 0);
}

function calcularLinea(l: Linea, cat: Catalogo, e: Estado): LineaResultado | null {
  if (l.condicion && !evaluarCondicion(l.condicion, e.vars)) return null;
  const cantidadReceta = l.cantidad == null || l.cantidad === '' ? 1 : evaluarNumero(l.cantidad, e.vars);
  if (cantidadReceta < 0) throw new ErrorFormula('La cantidad no puede ser negativa');
  // Pieza cambiada a mano en el presupuesto (solo piezas por m²).
  const ajuste = l.regla === 'm2' ? e.piezas[l.id] : undefined;
  const cantidad = ajuste?.cantidad ?? cantidadReceta;

  const base: LineaResultado = {
    id: l.id,
    nombre: l.nombre,
    regla: l.regla,
    cantidad,
    medida: 0,
    medidaReal: 0,
    unidad: 'unidad',
    precioUnitario: 0,
    costo: 0,
  };

  if (l.regla === 'porcentaje') {
    const pct = evaluarNumero(l.porcentaje ?? '0', e.vars);
    let sobre = 0;
    for (const id of l.sobre ?? []) {
      const otra = e.porId.get(id);
      if (otra) sobre += otra.costo;
    }
    return { ...base, cantidad: 1, unidad: 'porcentaje', medida: pct, medidaReal: pct, precioUnitario: sobre, costo: redondear2(sobre * pct) };
  }

  const ins = resolverInsumo(l, cat, e.vars);
  const variante = resolverVariante(l, ins, e.vars);
  const tarifas = tarifasPara(ins, variante, cat.valores);
  const r: LineaResultado = { ...base, insumo: ins.codigo, insumoNombre: ins.nombre, variante, unidad: ins.unidad };
  const sinPrecio = () =>
    new ErrorFormula(`Falta el precio de ${ins.nombre} para ${describirVariante(variante, cat.valores)}`);

  let tarifa: Tarifa | undefined;
  let precio = 0;
  if (l.regla === 'tabla') {
    if (tarifas.length === 0) throw sinPrecio();
    const ref = l.referencia ? evaluarNumero(l.referencia, e.vars) : NaN;
    const hayRef = tarifas.some((t) => t.referencia != null);
    if (hayRef && !Number.isFinite(ref)) throw new ErrorFormula('Falta la medida de referencia para buscar el precio');
    const p = precioPorReferencia(tarifas, Number.isFinite(ref) ? ref : 0);
    tarifa = p.tarifa;
    precio = p.precio;
    if (p.estimado) {
      r.estimado = `${p.estimado}: confirmar con el proveedor`;
      e.avisos.push({ nivel: 'advertencia', linea: l.id, mensaje: `${l.nombre}: precio estimado, confirmar con el proveedor` });
    }
    if (p.lejana) {
      e.avisos.push({ nivel: 'advertencia', linea: l.id, mensaje: `${l.nombre}: la medida está lejos de las de la lista, la estimación es poco confiable` });
    }
  } else if (l.regla !== 'formula' || l.insumo || l.insumoFormula) {
    if (tarifas.length === 0) throw sinPrecio();
    if (tarifas.length > 1 && new Set(tarifas.map((t) => t.precio)).size > 1) {
      throw new ErrorFormula(`${ins.nombre} tiene varios precios para ${describirVariante(variante, cat.valores)}: usá la regla "tabla"`);
    }
    tarifa = tarifas[0];
    precio = tarifa.precio;
  }
  if (tarifa) e.tarifasUsadas.push({ insumo: ins.codigo, tarifa });
  r.precioUnitario = precio;
  r.tarifaId = tarifa?.id;

  switch (l.regla) {
    case 'm2': {
      if (!l.ancho || !l.largo) throw new ErrorFormula('Faltan el ancho y el largo de la pieza');
      const anchoReceta = evaluarNumero(l.ancho, e.vars);
      const largoReceta = evaluarNumero(l.largo, e.vars);
      const ancho = ajuste?.ancho ?? anchoReceta;
      const largo = ajuste?.largo ?? largoReceta;
      if (ajuste && (ancho !== anchoReceta || largo !== largoReceta || cantidad !== cantidadReceta))
        r.original = { cantidad: cantidadReceta, ancho: anchoReceta, largo: largoReceta };
      if (ancho <= 0 || largo <= 0) throw new ErrorFormula(`Medidas de pieza inválidas (${ancho} × ${largo})`);
      const m2 = (ancho * largo) / 10000;
      const min = minimoDe(ins, tarifa, 'pieza');
      const cobrado = Math.max(m2, min);
      r.ancho = ancho;
      r.largo = largo;
      r.medidaReal = m2 * cantidad;
      r.medida = cobrado * cantidad;
      if (cobrado > m2) r.minimoAplicado = `Mínimo ${min} m² por pieza`;
      break;
    }
    case 'ml': {
      let metros: number;
      if (l.metros) metros = evaluarNumero(l.metros, e.vars);
      else if (l.ancho && l.largo) {
        r.ancho = evaluarNumero(l.ancho, e.vars);
        r.largo = evaluarNumero(l.largo, e.vars);
        metros = (2 * (r.ancho + r.largo)) / 100;
      } else throw new ErrorFormula('Faltan los metros lineales');
      if (metros < 0) throw new ErrorFormula('Los metros no pueden ser negativos');
      const min = minimoDe(ins, tarifa, 'pieza');
      const cobrado = Math.max(metros, min);
      r.medidaReal = metros * cantidad;
      r.medida = cobrado * cantidad;
      if (cobrado > metros) r.minimoAplicado = `Mínimo ${min} m por pieza`;
      break;
    }
    case 'unidad':
    case 'fijo':
    case 'tabla':
      r.medida = r.medidaReal = cantidad;
      break;
    case 'formula': {
      if (!l.monto) throw new ErrorFormula('Falta la fórmula del monto');
      const monto = evaluarNumero(l.monto, { ...e.vars, precio });
      r.medida = r.medidaReal = 1;
      r.precioUnitario = monto;
      r.costo = redondear2(monto);
      return r;
    }
  }
  r.costo = redondear2(r.medida * precio);
  return r;
}

/** Mínimos por mesa (ej. 1 m de pegado UV): se suman todas las líneas del mismo insumo. */
function aplicarMinimosPorItem(cat: Catalogo, e: Estado): boolean {
  let cambio = false;
  const grupos = new Map<string, LineaResultado[]>();
  for (const r of e.lineas) {
    if (!r.insumo || r.unidad === 'porcentaje') continue;
    const ins = cat.insumos[r.insumo];
    if (ins?.minimo_por !== 'item' || r.regla === 'formula') continue;
    grupos.set(r.insumo, [...(grupos.get(r.insumo) ?? []), r]);
  }
  for (const [codigo, rs] of grupos) {
    const ins = cat.insumos[codigo];
    const tarifa = ins.tarifas.find((t) => t.id != null && t.id === rs[rs.length - 1].tarifaId);
    const min = minimoDe(ins, tarifa, 'item');
    const total = rs.reduce((s, r) => s + r.medida, 0);
    if (total > 0 && total < min - 1e-9) {
      const ultima = rs[rs.length - 1];
      ultima.medida += min - total;
      ultima.costo = redondear2(ultima.medida * ultima.precioUnitario);
      ultima.minimoAplicado = `Mínimo ${min} ${ins.unidad === 'ml' ? 'm' : ins.unidad} por mesa`;
      guardarVars(e, ultima);
      cambio = true;
    }
  }
  return cambio;
}

function valoresDeEntrada(receta: Receta, cat: Catalogo, elegidos: Record<string, number | string>, avisos: Aviso[]): Variables {
  const vars: Variables = {};
  for (const [clave, ent] of Object.entries(receta.entradas)) {
    if (ent.mostrarSi) {
      let visible = false;
      try {
        visible = evaluarCondicion(ent.mostrarSi, vars);
      } catch (x) {
        avisos.push({ nivel: 'error', mensaje: `${ent.nombre}: ${(x as Error).message}` });
      }
      if (!visible) {
        vars[clave] = ent.tipo === 'medida' ? 0 : '';
        continue;
      }
    }
    const crudo = elegidos[clave] ?? ent.def;
    if (crudo === undefined || crudo === null || crudo === '') {
      avisos.push({ nivel: 'error', mensaje: `Falta ${ent.nombre.toLowerCase()}` });
      vars[clave] = ent.tipo === 'medida' ? 0 : '';
      continue;
    }
    if (ent.tipo === 'medida') {
      const n = typeof crudo === 'number' ? crudo : Number(String(crudo).replace(',', '.'));
      // Las medidas con mínimo 0 (cantidades: bases, regatones) aceptan 0.
      if (!Number.isFinite(n) || n < 0 || (n === 0 && ent.min !== 0)) {
        avisos.push({ nivel: 'error', mensaje: `${ent.nombre}: "${crudo}" no es una medida válida` });
        vars[clave] = 0;
        continue;
      }
      if ((ent.min != null && n < ent.min) || (ent.max != null && n > ent.max)) {
        avisos.push({
          nivel: 'advertencia',
          mensaje: `${ent.nombre} ${n} cm está fuera del rango habitual (${ent.min ?? '–'} a ${ent.max ?? '–'} cm)`,
        });
      }
      vars[clave] = n;
    } else {
      const v = String(crudo);
      if (ent.permitidos?.length && !ent.permitidos.includes(v)) {
        avisos.push({ nivel: 'error', mensaje: `${ent.nombre}: "${v}" no está disponible para este producto` });
      } else if (ent.atributo && !ent.permitidos?.length && cat.valores[ent.atributo] && !cat.valores[ent.atributo][v]) {
        avisos.push({ nivel: 'error', mensaje: `${ent.nombre}: "${v}" no existe` });
      }
      vars[clave] = v;
    }
  }
  return vars;
}

/** Qué entradas se piden con los valores elegidos hasta ahora (para el formulario y el probador). */
export function entradasVisibles(receta: Receta, elegidos: Record<string, number | string>): string[] {
  const vars: Variables = {};
  const out: string[] = [];
  for (const [clave, ent] of Object.entries(receta.entradas)) {
    let visible = true;
    if (ent.mostrarSi) {
      try {
        visible = evaluarCondicion(ent.mostrarSi, vars);
      } catch {
        visible = true;
      }
    }
    const v = visible ? (elegidos[clave] ?? ent.def ?? (ent.tipo === 'medida' ? 0 : '')) : ent.tipo === 'medida' ? 0 : '';
    vars[clave] = ent.tipo === 'medida' ? Number(v) || 0 : String(v);
    if (visible) out.push(clave);
  }
  return out;
}

export function cotizar(p: PedidoCalculo): ResultadoCalculo {
  const avisos: Aviso[] = validarReceta(p.receta).filter((a) => a.nivel === 'error');
  const cantidad = p.cantidad ?? 1;
  if (!Number.isInteger(cantidad) || cantidad < 1) avisos.push({ nivel: 'error', mensaje: 'La cantidad tiene que ser un número entero mayor a cero' });
  if (!(p.margen >= 0 && p.margen < 0.95)) avisos.push({ nivel: 'error', mensaje: 'El margen tiene que estar entre 0% y 95%' });

  const e: Estado = {
    vars: { ...valoresDeEntrada(p.receta, p.catalogo, p.valores, avisos), aj: { ...p.catalogo.ajustes }, cantidad },
    lineas: [],
    porId: new Map(),
    avisos,
    tarifasUsadas: [],
    piezas: p.piezas ?? {},
  };

  if (!avisos.some((a) => a.nivel === 'error')) {
    for (const l of p.receta.lineas) {
      try {
        const r = calcularLinea(l, p.catalogo, e);
        if (r) {
          e.lineas.push(r);
          e.porId.set(r.id, r);
          guardarVars(e, r);
        } else e.vars[l.id] = { costo: 0, cantidad: 0, medida: 0, m2: 0, ml: 0, ancho: 0, largo: 0 };
      } catch (err) {
        if (!(err instanceof ErrorFormula)) throw err;
        avisos.push({ nivel: 'error', linea: l.id, mensaje: `${l.nombre}: ${err.message}` });
        e.vars[l.id] = { costo: 0, cantidad: 0, medida: 0, m2: 0, ml: 0, ancho: 0, largo: 0 };
      }
    }
    // Si un mínimo por mesa cambió algún costo, se recalculan los porcentajes que dependen de él.
    if (aplicarMinimosPorItem(p.catalogo, e)) {
      for (const r of e.lineas) {
        if (r.regla !== 'porcentaje') continue;
        const l = p.receta.lineas.find((x) => x.id === r.id)!;
        const sobre = (l.sobre ?? []).reduce((s, id) => s + (e.porId.get(id)?.costo ?? 0), 0);
        r.precioUnitario = sobre;
        r.costo = redondear2(sobre * r.medida);
        guardarVars(e, r);
      }
    }
  }

  const ok = !avisos.some((a) => a.nivel === 'error');
  const costoUnitario = redondear2(e.lineas.reduce((s, r) => s + r.costo, 0));
  const redondeo = Number(p.catalogo.ajustes.redondeo ?? 1) || 1;
  const recargo = Number(p.catalogo.ajustes.recargo_cuotas ?? 0);
  let precioUnitario = 0;
  let precioUnitarioCuotas = 0;
  if (ok) {
    const lista = Math.max(costoUnitario / (1 - p.margen), Number(p.receta.precioMinimo ?? 0));
    precioUnitario = subirA(lista, redondeo);
    precioUnitarioCuotas = subirA(precioUnitario * (1 + recargo), redondeo);
  }
  return {
    ok,
    lineas: e.lineas,
    costoUnitario,
    precioUnitario,
    precioUnitarioCuotas,
    cantidad,
    costoTotal: redondear2(costoUnitario * cantidad),
    precioTotal: precioUnitario * cantidad,
    precioTotalCuotas: precioUnitarioCuotas * cantidad,
    margen: p.margen,
    margenReal: precioUnitario > 0 ? 1 - costoUnitario / precioUnitario : 0,
    avisos,
    tarifasUsadas: e.tarifasUsadas,
    motor: VERSION_MOTOR,
  };
}

// ---------------------------------------------------------------------
// Validación de recetas (al guardar en el panel y antes de cada cálculo)
// ---------------------------------------------------------------------
export function validarReceta(receta: Receta, catalogo?: Catalogo): Aviso[] {
  const avisos: Aviso[] = [];
  const err = (mensaje: string, linea?: string) => avisos.push({ nivel: 'error', linea, mensaje });
  const entradas = Object.keys(receta.entradas ?? {});
  const previas: string[] = [];
  for (const k of entradas) {
    if (!ID_VALIDO.test(k) && !/^[A-Z][A-Za-z0-9_]*$/.test(k)) err(`Entrada "${k}": usá letras, números y _`);
    if (RESERVADOS.has(k)) err(`"${k}" es un nombre reservado`);
    const ent = receta.entradas[k];
    if (!ent?.nombre?.trim()) err(`Entrada "${k}": falta el nombre`);
    if (ent?.tipo === 'medida' && ent.min != null && ent.max != null && ent.min > ent.max) err(`${ent.nombre}: el mínimo es mayor que el máximo`);
    if (ent?.mostrarSi) {
      try {
        for (const v of variablesDe(ent.mostrarSi)) {
          if (!previas.includes(v.split('.')[0])) err(`${ent.nombre}, mostrar si: solo puede usar entradas anteriores ("${v}")`);
        }
      } catch (x) {
        err(`${ent.nombre}, mostrar si: ${(x as Error).message}`);
      }
    }
    previas.push(k);
  }
  if (!receta.lineas?.length) err('La receta no tiene líneas');

  const anteriores = new Set<string>();
  for (const l of receta.lineas ?? []) {
    const donde = l.id || l.nombre || '?';
    if (!ID_VALIDO.test(l.id ?? '')) err(`Línea "${donde}": el id va en minúsculas, sin espacios (ej. tapa)`, donde);
    if (anteriores.has(l.id) || entradas.includes(l.id) || RESERVADOS.has(l.id)) err(`Línea "${l.id}": el id se repite o está reservado`, l.id);
    if (!l.nombre?.trim()) err(`Línea "${donde}": falta el nombre`, donde);

    const formulas: [string, string | undefined][] = [
      ['condición', l.condicion],
      ['cantidad', l.cantidad],
      ['ancho', l.ancho],
      ['largo', l.largo],
      ['metros', l.metros],
      ['porcentaje', l.porcentaje],
      ['referencia', l.referencia],
      ['monto', l.monto],
      ['insumo', l.insumoFormula],
      ...Object.entries(l.variante ?? {}).map(([a, f]) => [`variante ${a}`, f] as [string, string]),
    ];
    for (const [campo, f] of formulas) {
      if (f == null || f === '') continue;
      try {
        compilar(f);
        for (const v of variablesDe(f)) {
          const [raiz] = v.split('.');
          const ok =
            entradas.includes(raiz) ||
            raiz === 'cantidad' ||
            (raiz === 'aj' && v.includes('.')) ||
            (anteriores.has(raiz) && v.includes('.')) ||
            (raiz === 'precio' && campo === 'monto');
          if (!ok) err(`Línea "${l.id}", ${campo}: no existe "${v}"`, l.id);
        }
      } catch (x) {
        err(`Línea "${l.id}", ${campo}: ${(x as Error).message}`, l.id);
      }
    }

    switch (l.regla) {
      case 'm2':
        if (!l.ancho || !l.largo) err(`Línea "${l.id}": la regla m² necesita ancho y largo`, l.id);
        break;
      case 'ml':
        if (!l.metros && !(l.ancho && l.largo)) err(`Línea "${l.id}": la regla ml necesita metros (o ancho y largo para el perímetro)`, l.id);
        break;
      case 'porcentaje':
        if (!l.porcentaje) err(`Línea "${l.id}": falta el porcentaje`, l.id);
        if (!l.sobre?.length) err(`Línea "${l.id}": falta sobre qué líneas se calcula`, l.id);
        for (const s of l.sobre ?? []) if (!anteriores.has(s)) err(`Línea "${l.id}": "${s}" tiene que ser una línea anterior`, l.id);
        break;
      case 'formula':
        if (!l.monto) err(`Línea "${l.id}": falta la fórmula del monto`, l.id);
        break;
      case 'tabla':
      case 'unidad':
      case 'fijo':
        break;
      default:
        err(`Línea "${l.id}": regla desconocida "${(l as { regla: string }).regla}"`, l.id);
    }
    if (l.regla !== 'porcentaje' && l.regla !== 'formula' && !l.insumo && !l.insumoFormula) err(`Línea "${l.id}": falta el insumo`, l.id);
    if (catalogo && l.insumo) {
      const ins = catalogo.insumos[l.insumo];
      if (!ins) err(`Línea "${l.id}": no existe el insumo "${l.insumo}"`, l.id);
      else
        for (const a of ins.atributos) {
          if (!l.variante?.[a] && !entradas.includes(a)) err(`Línea "${l.id}": falta de dónde sale "${a}" para ${ins.nombre}`, l.id);
        }
    }
    if (l.id) anteriores.add(l.id);
  }
  return avisos;
}

