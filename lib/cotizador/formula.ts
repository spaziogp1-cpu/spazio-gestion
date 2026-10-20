// =====================================================================
// Fórmulas de las recetas del cotizador.
//
// Un intérprete chico y propio: nunca usa eval ni Function, y solo conoce
// números, textos entre comillas, las variables que le pasan y unas pocas
// funciones. Ejemplos:
//   H - espesor / 10
//   si(L > 160, 3, 2)
//   techo(L / 50)
//   si(en(color, 'incoloro', 'gris', 'bronce'), 'float', 'laminado')
//   tapa.m2 * 2
// =====================================================================

export type Valor = number | string | boolean;
export type Variables = Record<string, Valor | Record<string, Valor>>;

export class ErrorFormula extends Error {
  constructor(mensaje: string, readonly posicion?: number) {
    super(mensaje);
    this.name = 'ErrorFormula';
  }
}

// ---------------------------------------------------------------------
// Lectura del texto
// ---------------------------------------------------------------------
type Token =
  | { t: 'num'; v: number; p: number }
  | { t: 'txt'; v: string; p: number }
  | { t: 'id'; v: string; p: number }
  | { t: 'op'; v: string; p: number }
  | { t: 'fin'; p: number };

const OPERADORES = ['==', '!=', '<=', '>=', '&&', '||', '+', '-', '*', '/', '%', '<', '>', '!', '(', ')', ','];
const MAX_LARGO = 500;

function leerTokens(texto: string): Token[] {
  if (texto.length > MAX_LARGO) throw new ErrorFormula(`La fórmula es demasiado larga (máximo ${MAX_LARGO} caracteres)`);
  const tokens: Token[] = [];
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(texto[i + 1] ?? ''))) {
      // Decimales con punto (0.2): la coma separa los valores de una función.
      let j = i;
      while (j < texto.length && /[0-9.]/.test(texto[j])) j++;
      const crudo = texto.slice(i, j);
      if ((crudo.match(/\./g) ?? []).length > 1) throw new ErrorFormula(`Número inválido "${crudo}"`, i);
      tokens.push({ t: 'num', v: Number(crudo), p: i });
      i = j;
      continue;
    }
    if (c === "'" || c === '"') {
      const j = texto.indexOf(c, i + 1);
      if (j < 0) throw new ErrorFormula('Falta cerrar las comillas', i);
      tokens.push({ t: 'txt', v: texto.slice(i + 1, j), p: i });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_áéíóúñÁÉÍÓÚÑ]/.test(c)) {
      let j = i;
      while (j < texto.length && /[A-Za-z0-9_.áéíóúñÁÉÍÓÚÑ]/.test(texto[j])) j++;
      const nombre = texto.slice(i, j);
      if (nombre.endsWith('.')) throw new ErrorFormula(`Nombre inválido "${nombre}"`, i);
      tokens.push({ t: 'id', v: nombre, p: i });
      i = j;
      continue;
    }
    const op = OPERADORES.find((o) => texto.startsWith(o, i));
    if (!op) throw new ErrorFormula(`No entiendo "${c}"`, i);
    tokens.push({ t: 'op', v: op, p: i });
    i += op.length;
  }
  tokens.push({ t: 'fin', p: texto.length });
  return tokens;
}

// ---------------------------------------------------------------------
// Árbol de la fórmula
// ---------------------------------------------------------------------
export type Nodo =
  | { k: 'num'; v: number }
  | { k: 'txt'; v: string }
  | { k: 'var'; nombre: string; p: number }
  | { k: 'un'; op: '-' | '!'; a: Nodo }
  | { k: 'bin'; op: string; a: Nodo; b: Nodo; p: number }
  | { k: 'fn'; nombre: string; args: Nodo[]; p: number };

// Precedencia de menor a mayor.
const NIVELES: string[][] = [['||'], ['&&'], ['==', '!='], ['<', '<=', '>', '>='], ['+', '-'], ['*', '/', '%']];
const MAX_PROFUNDIDAD = 40;

class Lector {
  private i = 0;
  private profundidad = 0;
  constructor(private tokens: Token[]) {}

  private actual() {
    return this.tokens[this.i];
  }
  private esOp(v: string) {
    const t = this.actual();
    return t.t === 'op' && t.v === v;
  }
  private esperar(v: string) {
    const t = this.actual();
    if (!(t.t === 'op' && t.v === v)) throw new ErrorFormula(`Se esperaba "${v}"`, t.p);
    this.i++;
  }

  todo(): Nodo {
    const n = this.expresion(0);
    const t = this.actual();
    if (t.t !== 'fin') throw new ErrorFormula('Sobra algo al final de la fórmula', t.p);
    return n;
  }

  private expresion(nivel: number): Nodo {
    // Cuenta solo el anidamiento real (paréntesis y funciones), no los niveles de precedencia.
    const sube = nivel === 0;
    if (sube && ++this.profundidad > MAX_PROFUNDIDAD) throw new ErrorFormula('La fórmula está demasiado anidada');
    try {
      if (nivel >= NIVELES.length) return this.unario();
      let a = this.expresion(nivel + 1);
      for (;;) {
        const t = this.actual();
        if (t.t === 'op' && NIVELES[nivel].includes(t.v)) {
          this.i++;
          const b = this.expresion(nivel + 1);
          a = { k: 'bin', op: t.v, a, b, p: t.p };
        } else return a;
      }
    } finally {
      if (sube) this.profundidad--;
    }
  }

  private unario(): Nodo {
    if (this.esOp('-')) {
      this.i++;
      return { k: 'un', op: '-', a: this.unario() };
    }
    if (this.esOp('!')) {
      this.i++;
      return { k: 'un', op: '!', a: this.unario() };
    }
    if (this.esOp('+')) {
      this.i++;
      return this.unario();
    }
    return this.primario();
  }

  private primario(): Nodo {
    const t = this.actual();
    if (t.t === 'num') {
      this.i++;
      return { k: 'num', v: t.v };
    }
    if (t.t === 'txt') {
      this.i++;
      return { k: 'txt', v: t.v };
    }
    if (t.t === 'id') {
      this.i++;
      if (this.esOp('(')) {
        this.i++;
        const args: Nodo[] = [];
        if (!this.esOp(')')) {
          for (;;) {
            args.push(this.expresion(0));
            if (this.esOp(',')) {
              this.i++;
              continue;
            }
            break;
          }
        }
        this.esperar(')');
        const nombre = t.v.toLowerCase();
        if (!(nombre in FUNCIONES)) throw new ErrorFormula(`No existe la función "${t.v}"`, t.p);
        const f = FUNCIONES[nombre];
        if (args.length < f.min || args.length > f.max) {
          throw new ErrorFormula(`"${t.v}" lleva ${f.min === f.max ? f.min : `entre ${f.min} y ${f.max}`} valores`, t.p);
        }
        return { k: 'fn', nombre, args, p: t.p };
      }
      const bajo = t.v.toLowerCase();
      if (bajo === 'verdadero' || bajo === 'true') return { k: 'num', v: 1 };
      if (bajo === 'falso' || bajo === 'false') return { k: 'num', v: 0 };
      return { k: 'var', nombre: t.v, p: t.p };
    }
    if (t.t === 'op' && t.v === '(') {
      this.i++;
      const n = this.expresion(0);
      this.esperar(')');
      return n;
    }
    throw new ErrorFormula(t.t === 'fin' ? 'La fórmula está incompleta' : `No esperaba "${(t as { v: string }).v}"`, t.p);
  }
}

// ---------------------------------------------------------------------
// Funciones disponibles
// ---------------------------------------------------------------------
const num = (v: Valor, fn: string): number => {
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  const n = Number(v.replace(',', '.'));
  if (v.trim() === '' || !Number.isFinite(n)) throw new ErrorFormula(`"${fn}" necesita un número y recibió "${v}"`);
  return n;
};
const verdad = (v: Valor) => (typeof v === 'string' ? v !== '' : Boolean(v));

type Fn = { min: number; max: number; f: (args: Valor[]) => Valor };
const FUNCIONES: Record<string, Fn> = {
  min: { min: 1, max: 20, f: (a) => Math.min(...a.map((x) => num(x, 'min'))) },
  max: { min: 1, max: 20, f: (a) => Math.max(...a.map((x) => num(x, 'max'))) },
  abs: { min: 1, max: 1, f: (a) => Math.abs(num(a[0], 'abs')) },
  techo: { min: 1, max: 1, f: (a) => Math.ceil(num(a[0], 'techo') - 1e-9) },
  piso: { min: 1, max: 1, f: (a) => Math.floor(num(a[0], 'piso') + 1e-9) },
  redondear: {
    min: 1,
    max: 2,
    f: (a) => {
      const d = a.length > 1 ? Math.round(num(a[1], 'redondear')) : 0;
      if (d < -6 || d > 6) throw new ErrorFormula('"redondear" admite entre -6 y 6 decimales');
      const m = 10 ** d;
      return Math.round(num(a[0], 'redondear') * m) / m;
    },
  },
  // si(condición, si_es_verdad, si_no)
  si: { min: 3, max: 3, f: () => 0 }, // se evalúa aparte: solo calcula la rama que corresponde
  // en(valor, 'a', 'b', ...) → verdadero si valor es alguno de los siguientes
  en: { min: 2, max: 30, f: (a) => a.slice(1).some((x) => String(x) === String(a[0])) },
  // numero('10') → 10, útil para opciones como el espesor
  numero: { min: 1, max: 1, f: (a) => num(a[0], 'numero') },
};

export const NOMBRES_FUNCIONES = Object.keys(FUNCIONES);

// ---------------------------------------------------------------------
// Evaluación
// ---------------------------------------------------------------------
function buscarVariable(nombre: string, vars: Variables, p: number): Valor {
  const partes = nombre.split('.');
  if (partes.length > 2) throw new ErrorFormula(`"${nombre}": solo se admite un punto (ej. tapa.m2)`, p);
  const base = Object.prototype.hasOwnProperty.call(vars, partes[0]) ? vars[partes[0]] : undefined;
  if (base === undefined) throw new ErrorFormula(`No existe "${partes[0]}"`, p);
  if (partes.length === 1) {
    if (typeof base === 'object') throw new ErrorFormula(`"${nombre}" necesita un dato después del punto (ej. ${nombre}.m2)`, p);
    return base;
  }
  if (typeof base !== 'object' || base === null) throw new ErrorFormula(`"${partes[0]}" no tiene datos con punto`, p);
  const v = Object.prototype.hasOwnProperty.call(base, partes[1]) ? base[partes[1]] : undefined;
  if (v === undefined) throw new ErrorFormula(`No existe "${nombre}"`, p);
  return v;
}

function evaluarNodo(n: Nodo, vars: Variables): Valor {
  switch (n.k) {
    case 'num':
      return n.v;
    case 'txt':
      return n.v;
    case 'var':
      return buscarVariable(n.nombre, vars, n.p);
    case 'un': {
      const a = evaluarNodo(n.a, vars);
      return n.op === '-' ? -num(a, '-') : !verdad(a);
    }
    case 'fn': {
      const f = FUNCIONES[n.nombre];
      if (n.nombre === 'si') return verdad(evaluarNodo(n.args[0], vars)) ? evaluarNodo(n.args[1], vars) : evaluarNodo(n.args[2], vars);
      return f.f(n.args.map((x) => evaluarNodo(x, vars)));
    }
    case 'bin': {
      if (n.op === '&&') return verdad(evaluarNodo(n.a, vars)) && verdad(evaluarNodo(n.b, vars));
      if (n.op === '||') return verdad(evaluarNodo(n.a, vars)) || verdad(evaluarNodo(n.b, vars));
      const a = evaluarNodo(n.a, vars);
      const b = evaluarNodo(n.b, vars);
      if (n.op === '==' || n.op === '!=') {
        const iguales = typeof a === 'string' || typeof b === 'string' ? String(a) === String(b) : num(a, n.op) === num(b, n.op);
        return n.op === '==' ? iguales : !iguales;
      }
      const x = num(a, n.op);
      const y = num(b, n.op);
      switch (n.op) {
        case '+':
          return x + y;
        case '-':
          return x - y;
        case '*':
          return x * y;
        case '/':
          if (y === 0) throw new ErrorFormula('División por cero', n.p);
          return x / y;
        case '%':
          if (y === 0) throw new ErrorFormula('División por cero', n.p);
          return x % y;
        case '<':
          return x < y;
        case '<=':
          return x <= y;
        case '>':
          return x > y;
        case '>=':
          return x >= y;
      }
      throw new ErrorFormula(`Operación desconocida "${n.op}"`, n.p);
    }
  }
}

// ---------------------------------------------------------------------
// API
// ---------------------------------------------------------------------
const cache = new Map<string, Nodo>();

export function compilar(texto: string): Nodo {
  const limpio = String(texto ?? '').trim();
  if (limpio === '') throw new ErrorFormula('La fórmula está vacía');
  const guardado = cache.get(limpio);
  if (guardado) return guardado;
  const nodo = new Lector(leerTokens(limpio)).todo();
  if (cache.size > 2000) cache.clear();
  cache.set(limpio, nodo);
  return nodo;
}

export function evaluar(texto: string | number, vars: Variables): Valor {
  if (typeof texto === 'number') return texto;
  const v = evaluarNodo(compilar(texto), vars);
  if (typeof v === 'number' && !Number.isFinite(v)) throw new ErrorFormula('El resultado no es un número válido');
  return v;
}

export function evaluarNumero(texto: string | number, vars: Variables): number {
  return num(evaluar(texto, vars), 'la fórmula');
}

export function evaluarTexto(texto: string | number, vars: Variables): string {
  const v = evaluar(texto, vars);
  return typeof v === 'boolean' ? (v ? '1' : '0') : String(v);
}

export function evaluarCondicion(texto: string | number, vars: Variables): boolean {
  return verdad(evaluar(texto, vars));
}

/** Nombres de las variables que usa una fórmula (para validar recetas al guardar). */
export function variablesDe(texto: string | number): string[] {
  if (typeof texto === 'number') return [];
  const out = new Set<string>();
  const recorrer = (n: Nodo) => {
    if (n.k === 'var') out.add(n.nombre);
    else if (n.k === 'un') recorrer(n.a);
    else if (n.k === 'bin') {
      recorrer(n.a);
      recorrer(n.b);
    } else if (n.k === 'fn') n.args.forEach(recorrer);
  };
  recorrer(compilar(texto));
  return [...out];
}
