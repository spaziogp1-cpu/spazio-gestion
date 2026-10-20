import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ErrorFormula, evaluar, evaluarNumero, evaluarTexto, variablesDe } from './formula';

const vars = { L: 140, P: 60, H: 35, espesor: '10', color: 'bronce', tapa: { m2: 0.84, costo: 97020 }, aj: { ajuste_vidpro: 0.2 } };

test('cuentas con medidas', () => {
  assert.equal(evaluarNumero('H - espesor / 10', vars), 34);
  assert.equal(evaluarNumero('L * P / 10000', vars), 0.84);
  assert.equal(evaluarNumero('(L + P) * 2 / 100', vars), 4);
  assert.equal(evaluarNumero('-P + 100', vars), 40);
  assert.equal(evaluarNumero('L % 50', vars), 40);
  assert.equal(evaluarNumero('2 + 3 * 4', vars), 14);
  assert.equal(evaluarNumero('(2 + 3) * 4', vars), 20);
  assert.equal(evaluarNumero('0.5 * 4', vars), 2);
});

test('funciones', () => {
  assert.equal(evaluarNumero('si(L > 160, 3, 2)', vars), 2);
  assert.equal(evaluarNumero('si(L >= 140 && P == 60, 1, 0)', vars), 1);
  assert.equal(evaluarNumero('techo(L / 50)', vars), 3);
  assert.equal(evaluarNumero('techo(100 / 50)', vars), 2);
  assert.equal(evaluarNumero('piso(L / 50)', vars), 2);
  assert.equal(evaluarNumero('min(L, P, H)', vars), 35);
  assert.equal(evaluarNumero('max(L, 200)', vars), 200);
  assert.equal(evaluarNumero('redondear(10 / 3, 2)', vars), 3.33);
  assert.equal(evaluarNumero('numero(espesor) + 2', vars), 12);
  assert.equal(evaluar("en(color, 'incoloro', 'gris', 'bronce')", vars), true);
  assert.equal(evaluarTexto("si(en(color, 'incoloro', 'gris', 'bronce'), 'float', 'laminado')", vars), 'float');
  assert.equal(evaluar("color == 'bronce'", vars), true);
  assert.equal(evaluar("color != 'bronce'", vars), false);
  assert.equal(evaluar("espesor == 10", vars), true);
  assert.equal(evaluar('!(L > P)', vars), false);
});

test('datos de líneas anteriores y reglas generales', () => {
  assert.equal(evaluarNumero('tapa.m2 * 2', vars), 1.68);
  assert.equal(evaluarNumero('tapa.costo * aj.ajuste_vidpro', vars), 19404);
});

test('si evalúa solo la rama que corresponde', () => {
  assert.equal(evaluarNumero('si(P > 0, L / P, L / 0)', { L: 120, P: 60 }), 2);
});

test('errores claros', () => {
  const falla = (f: string, texto: RegExp, v: Record<string, never> | typeof vars = vars) =>
    assert.throws(() => evaluar(f, v), (e: unknown) => e instanceof ErrorFormula && texto.test(e.message));
  falla('L / 0', /División por cero/);
  falla('ancho * 2', /No existe "ancho"/);
  falla('tapa.precio', /No existe "tapa.precio"/);
  falla('tapa * 2', /necesita un dato después del punto/);
  falla('L +', /incompleta/);
  falla('(L + 2', /Se esperaba "\)"/);
  falla('L 2', /Sobra algo/);
  falla('raiz(L)', /No existe la función/);
  falla('si(L, 1)', /lleva 3 valores/);
  falla("'abierta", /comillas/);
  falla('L $ 2', /No entiendo/);
  falla('1.2.3', /Número inválido/);
  falla('', /vacía/);
  falla("color * 2", /necesita un número/);
});

test('no accede a nada fuera de las variables', () => {
  const falla = (f: string) => assert.throws(() => evaluar(f, vars), ErrorFormula);
  falla('constructor');
  falla('__proto__');
  falla('toString');
  falla('tapa.constructor');
  falla('tapa.__proto__');
  falla('process.env');
  falla('globalThis');
  assert.throws(() => evaluar('1+'.repeat(300) + '1', vars), /demasiado larga/);
  assert.throws(() => evaluar('('.repeat(60) + '1' + ')'.repeat(60), vars), /demasiado anidada/);
});

test('lista las variables de una fórmula', () => {
  assert.deepEqual(variablesDe('si(L > 160, tapa.m2, H - espesor / 10)').sort(), ['H', 'L', 'espesor', 'tapa.m2']);
  assert.deepEqual(variablesDe(12), []);
});

test('admite varios si() anidados', () => {
  const f = 'si(P >= 120, si(L < 300, 80, 90), si(L >= 250, 90, si(L >= 190, 80, si(L >= 160, 62 + (L - 160) * 0.6, si(L > 120, 38.5 + (L - 120) * 0.5875, L * 38.5 / 120)))))';
  assert.equal(evaluarNumero(f, { L: 175, P: 90 }), 71);
  assert.equal(evaluarNumero(f, { L: 250, P: 120 }), 80);
});
