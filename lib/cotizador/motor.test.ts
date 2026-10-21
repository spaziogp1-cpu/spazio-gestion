import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conPiezasAgregadas, cotizar, entradasVisibles, validarReceta } from './motor';
import type { Catalogo, Receta } from './tipos';

// Precios reales de la lista de Vidpro (15/10/2026) y de STG.
const catalogo: Catalogo = {
  insumos: {
    'vidrio-float': {
      codigo: 'vidrio-float',
      nombre: 'Vidrio float',
      tipo: 'vidrio',
      unidad: 'm2',
      atributos: ['espesor', 'color'],
      minimo: 0.2,
      minimo_por: 'pieza',
      tarifas: [
        { id: 1, variante: { espesor: '8', color: 'incoloro' }, precio: 69300 },
        { id: 2, variante: { espesor: '10', color: 'incoloro' }, precio: 73500 },
        { id: 3, variante: { espesor: '8', color: 'gris-bronce' }, precio: 105000 },
        { id: 4, variante: { espesor: '10', color: 'gris-bronce' }, precio: 115500 },
      ],
    },
    'vidrio-laminado': {
      codigo: 'vidrio-laminado',
      nombre: 'Vidrio laminado',
      tipo: 'vidrio',
      unidad: 'm2',
      atributos: ['composicion', 'color'],
      minimo: 0.2,
      minimo_por: 'pieza',
      tarifas: [
        { id: 10, variante: { composicion: '5+5', color: 'incoloro' }, precio: 108700 },
        { id: 11, variante: { composicion: '5+5', color: 'color' }, precio: 189000 },
        { id: 12, variante: { composicion: '5+5', color: 'combinado' }, precio: 324090 },
      ],
    },
    'pegado-uv': {
      codigo: 'pegado-uv',
      nombre: 'Pegado UV',
      tipo: 'proceso',
      unidad: 'ml',
      atributos: ['tipo_vidrio'],
      minimo: 1,
      minimo_por: 'item',
      tarifas: [
        { id: 20, variante: { tipo_vidrio: 'float' }, precio: 21500 },
        { id: 21, variante: { tipo_vidrio: 'laminado' }, precio: 31000 },
      ],
    },
    'estructura-stg': {
      codigo: 'estructura-stg',
      nombre: 'Estructura STG',
      tipo: 'estructura',
      unidad: 'unidad',
      atributos: ['modelo'],
      tarifas: [
        { id: 30, variante: { modelo: 'saturno' }, referencia: 50, precio: 200000 },
        { id: 31, variante: { modelo: 'saturno' }, referencia: 60, precio: 220000 },
        { id: 32, variante: { modelo: 'saturno' }, referencia: 70, precio: 240000 },
        { id: 33, variante: { modelo: 'saturno' }, referencia: 80, precio: 250000 },
        { id: 34, variante: { modelo: 'saturno' }, referencia: 90, precio: 270000 },
        { id: 35, variante: { modelo: 'helios' }, referencia: 130, precio: 200000 },
        { id: 36, variante: { modelo: 'helios' }, referencia: 170, precio: 230000 },
        { id: 37, variante: { modelo: 'modulo' }, referencia: 110, precio: 240000 },
        { id: 38, variante: { modelo: 'silla-duna' }, precio: 160000 },
      ],
    },
  },
  valores: {
    color: {
      incoloro: { etiqueta: 'Incoloro', grupos: [] },
      gris: { etiqueta: 'Gris', grupos: ['gris-bronce'] },
      bronce: { etiqueta: 'Bronce', grupos: ['gris-bronce'] },
      rosa: { etiqueta: 'Rosa', grupos: ['color'] },
      ambar: { etiqueta: 'Ámbar', grupos: ['color'] },
    },
  },
  ajustes: { redondeo: 1000, recargo_cuotas: 0.27, ajuste_vidpro: 0.2 },
};

// Mesa ratona tipo Luna: tapa + 2 laterales pegados con UV.
const luna: Receta = {
  entradas: {
    L: { tipo: 'medida', nombre: 'Largo', min: 60, max: 200, def: 120 },
    P: { tipo: 'medida', nombre: 'Profundidad', min: 40, max: 100, def: 60 },
    H: { tipo: 'medida', nombre: 'Alto', min: 30, max: 45, def: 35 },
    color: { tipo: 'opcion', nombre: 'Color', atributo: 'color', permitidos: ['incoloro', 'gris', 'bronce'] },
    espesor: { tipo: 'opcion', nombre: 'Espesor', permitidos: ['8', '10'], def: '10' },
  },
  lineas: [
    { id: 'tapa', nombre: 'Tapa', regla: 'm2', insumo: 'vidrio-float', ancho: 'L', largo: 'P' },
    { id: 'lat', nombre: 'Laterales', regla: 'm2', insumo: 'vidrio-float', cantidad: '2', ancho: 'P', largo: 'H - espesor / 10' },
    { id: 'ajuste', nombre: 'Ajuste', regla: 'porcentaje', porcentaje: 'aj.ajuste_vidpro', sobre: ['tapa', 'lat'] },
    { id: 'uv', nombre: 'Pegado UV', regla: 'ml', insumo: 'pegado-uv', variante: { tipo_vidrio: "'float'" }, cantidad: '2', metros: 'P / 100' },
  ],
};

const costo = (r: ReturnType<typeof cotizar>, id: string) => r.lineas.find((l) => l.id === id)?.costo;

test('Mesa Luna 140 × 60 × 35 en bronce 10 mm', () => {
  const r = cotizar({ receta: luna, catalogo, valores: { L: 140, P: 60, H: 35, color: 'bronce' }, margen: 0.45 });
  assert.equal(r.ok, true, JSON.stringify(r.avisos));
  assert.equal(costo(r, 'tapa'), 97020); // 0,84 m² × 115.500
  assert.equal(costo(r, 'lat'), 47124); // 2 × 0,204 m² × 115.500
  assert.equal(costo(r, 'ajuste'), 28828.8); // 20% de los vidrios
  assert.equal(costo(r, 'uv'), 25800); // 1,2 m × 21.500
  assert.equal(r.costoUnitario, 198772.8);
  assert.equal(r.precioUnitario, 362000); // 198.772,8 ÷ 0,55 = 361.405 → redondeo
  assert.equal(r.precioUnitarioCuotas, 460000); // 362.000 × 1,27 = 459.740 → redondeo
  assert.ok(r.margenReal > 0.45);
  assert.deepEqual(r.lineas.find((l) => l.id === 'lat')?.variante, { espesor: '10', color: 'bronce' });
  assert.equal(r.tarifasUsadas.length, 3);
});

test('mínimos: 0,20 m² por vidrio y 1 m de pegado por mesa', () => {
  const r = cotizar({ receta: luna, catalogo, valores: { L: 30, P: 30, H: 40, color: 'incoloro' }, margen: 0.45 });
  assert.equal(r.ok, true, JSON.stringify(r.avisos));
  const tapa = r.lineas.find((l) => l.id === 'tapa')!;
  assert.equal(tapa.medidaReal, 0.09);
  assert.equal(tapa.medida, 0.2);
  assert.equal(tapa.costo, 14700);
  assert.equal(costo(r, 'lat'), 29400); // 2 × 0,20 m² (cada vidrio por separado)
  const uv = r.lineas.find((l) => l.id === 'uv')!;
  assert.equal(uv.medidaReal, 0.6);
  assert.equal(uv.medida, 1);
  assert.equal(uv.costo, 21500);
  assert.match(uv.minimoAplicado ?? '', /por mesa/);
  assert.equal(costo(r, 'ajuste'), 8820);
  assert.equal(r.costoUnitario, 74420);
  // Fuera del rango habitual avisa pero calcula.
  assert.ok(r.avisos.some((a) => a.nivel === 'advertencia' && /Largo 30/.test(a.mensaje)));
});

test('el mínimo de pegado se suma entre todas las uniones de la mesa', () => {
  const receta: Receta = {
    ...luna,
    lineas: [
      ...luna.lineas.slice(0, 3),
      { id: 'uv1', nombre: 'Pegado lateral 1', regla: 'ml', insumo: 'pegado-uv', variante: { tipo_vidrio: "'float'" }, metros: '0.4' },
      { id: 'uv2', nombre: 'Pegado lateral 2', regla: 'ml', insumo: 'pegado-uv', variante: { tipo_vidrio: "'float'" }, metros: '0.4' },
    ],
  };
  const r = cotizar({ receta, catalogo, valores: { L: 100, P: 40, H: 35, color: 'incoloro' }, margen: 0.4 });
  assert.equal(r.ok, true, JSON.stringify(r.avisos));
  assert.equal(costo(r, 'uv1'), 8600);
  assert.equal(costo(r, 'uv2'), 12900); // completa hasta 1 m entre las dos
});

test('colores: rosa toma la columna "Color" y el combinado la suya', () => {
  const receta: Receta = {
    entradas: {
      L: { tipo: 'medida', nombre: 'Largo' },
      P: { tipo: 'medida', nombre: 'Profundidad' },
      color: { tipo: 'opcion', nombre: 'Color', atributo: 'color' },
      terminacion: { tipo: 'opcion', nombre: 'Terminación', permitidos: ['simple', 'combinado'], def: 'simple' },
    },
    lineas: [
      {
        id: 'tapa',
        nombre: 'Tapa',
        regla: 'm2',
        insumo: 'vidrio-laminado',
        variante: { composicion: "'5+5'", color: "si(terminacion == 'combinado', 'combinado', color)" },
        ancho: 'L',
        largo: 'P',
      },
    ],
  };
  const simple = cotizar({ receta, catalogo, valores: { L: 100, P: 50, color: 'rosa' }, margen: 0.5 });
  assert.equal(simple.ok, true, JSON.stringify(simple.avisos));
  assert.equal(costo(simple, 'tapa'), 94500); // 0,5 m² × 189.000
  const comb = cotizar({ receta, catalogo, valores: { L: 100, P: 50, color: 'rosa', terminacion: 'combinado' }, margen: 0.5 });
  assert.equal(costo(comb, 'tapa'), 162045);
  const inc = cotizar({ receta, catalogo, valores: { L: 100, P: 50, color: 'incoloro' }, margen: 0.5 });
  assert.equal(costo(inc, 'tapa'), 54350);
});

test('si falta un precio, frena y dice cuál', () => {
  const receta: Receta = {
    entradas: { L: { tipo: 'medida', nombre: 'Largo' }, color: { tipo: 'opcion', nombre: 'Color', atributo: 'color' } },
    lineas: [{ id: 'tapa', nombre: 'Tapa', regla: 'm2', insumo: 'vidrio-laminado', variante: { composicion: "'5+5'" }, ancho: 'L', largo: 'L' }],
  };
  const r = cotizar({ receta, catalogo, valores: { L: 50, color: 'gris' }, margen: 0.4 });
  assert.equal(r.ok, false);
  assert.equal(r.precioUnitario, 0);
  assert.match(r.avisos[0].mensaje, /Falta el precio de Vidrio laminado para 5\+5 · Gris/);
});

test('estructuras de STG: medida de la lista, estimada entre medidas y fuera de la lista', () => {
  const receta = (modelo: string, ref: string): Receta => ({
    entradas: { D: { tipo: 'medida', nombre: 'Medida' } },
    lineas: [{ id: 'est', nombre: 'Estructura', regla: 'tabla', insumo: 'estructura-stg', variante: { modelo: `'${modelo}'` }, referencia: ref }],
  });
  const de = (modelo: string, D: number) => cotizar({ receta: receta(modelo, 'D'), catalogo, valores: { D }, margen: 0.4 });

  const exacta = de('saturno', 90);
  assert.equal(costo(exacta, 'est'), 270000);
  assert.equal(exacta.lineas[0].estimado, undefined);

  const entre = de('saturno', 75);
  assert.equal(costo(entre, 'est'), 245000);
  assert.match(entre.lineas[0].estimado ?? '', /confirmar con el proveedor/);
  assert.ok(entre.avisos.some((a) => /precio estimado/.test(a.mensaje)));

  const helios = de('helios', 150); // largo + profundidad
  assert.equal(costo(helios, 'est'), 215000);

  const lejos = de('saturno', 130);
  assert.equal(costo(lejos, 'est'), 350000); // sigue la pendiente de 80 a 90
  assert.ok(lejos.avisos.some((a) => /poco confiable/.test(a.mensaje)));

  const unica = de('modulo', 120);
  assert.equal(unica.ok, false);
  assert.match(unica.avisos[0].mensaje, /una sola medida/);

  const conIncremento: Catalogo = structuredClone(catalogo);
  conIncremento.insumos['estructura-stg'].tarifas.find((t) => t.id === 37)!.incremento = 1000;
  const r = cotizar({ receta: receta('modulo', 'D'), catalogo: conIncremento, valores: { D: 120 }, margen: 0.4 });
  assert.equal(costo(r, 'est'), 250000);

  const silla = cotizar({
    receta: { entradas: {}, lineas: [{ id: 'silla', nombre: 'Silla', regla: 'unidad', insumo: 'estructura-stg', variante: { modelo: "'silla-duna'" } }] },
    catalogo,
    valores: {},
    margen: 0.4,
  });
  assert.equal(silla.costoUnitario, 160000);
});

test('mesa alta: el ajuste va solo sobre las bases y las líneas condicionales', () => {
  const receta: Receta = {
    entradas: {
      L: { tipo: 'medida', nombre: 'Largo' },
      P: { tipo: 'medida', nombre: 'Profundidad' },
      H: { tipo: 'medida', nombre: 'Alto' },
      color: { tipo: 'opcion', nombre: 'Color', atributo: 'color' },
      espesor: { tipo: 'opcion', nombre: 'Espesor', def: '10' },
    },
    lineas: [
      { id: 'tapa', nombre: 'Tapa', regla: 'm2', insumo: 'vidrio-float', ancho: 'L', largo: 'P' },
      { id: 'base', nombre: 'Bases', regla: 'm2', insumo: 'vidrio-float', cantidad: '2', ancho: 'P - 10', largo: 'H - 1' },
      { id: 'refuerzo', nombre: 'Base central', regla: 'm2', insumo: 'vidrio-float', condicion: 'L > 180', ancho: 'P - 10', largo: 'H - 1' },
      { id: 'ajuste', nombre: 'Ajuste', regla: 'porcentaje', porcentaje: 'aj.ajuste_vidpro', sobre: ['base', 'refuerzo'] },
    ],
  };
  const corta = cotizar({ receta, catalogo, valores: { L: 160, P: 90, H: 75, color: 'incoloro' }, margen: 0.4 });
  assert.equal(corta.ok, true, JSON.stringify(corta.avisos));
  assert.equal(corta.lineas.some((l) => l.id === 'refuerzo'), false);
  // bases: 2 × 0,8 × 0,74 = 1,184 m² × 73.500 = 87.024 → ajuste 17.404,8
  assert.equal(costo(corta, 'base'), 87024);
  assert.equal(costo(corta, 'ajuste'), 17404.8);
  const larga = cotizar({ receta, catalogo, valores: { L: 200, P: 90, H: 75, color: 'incoloro' }, margen: 0.4 });
  assert.equal(costo(larga, 'refuerzo'), 43512);
  assert.equal(costo(larga, 'ajuste'), 26107.2);
});

test('cantidad, precio mínimo y valores inválidos', () => {
  const dos = cotizar({ receta: luna, catalogo, valores: { L: 140, P: 60, H: 35, color: 'bronce' }, margen: 0.45, cantidad: 2 });
  assert.equal(dos.precioTotal, 724000);
  assert.equal(dos.costoTotal, 397545.6);

  const minimo = cotizar({ receta: { ...luna, precioMinimo: 500000 }, catalogo, valores: { L: 140, P: 60, H: 35, color: 'bronce' }, margen: 0.45 });
  assert.equal(minimo.precioUnitario, 500000);

  const rosa = cotizar({ receta: luna, catalogo, valores: { L: 140, P: 60, H: 35, color: 'rosa' }, margen: 0.45 });
  assert.equal(rosa.ok, false);
  assert.match(rosa.avisos[0].mensaje, /no está disponible/);

  const sinColor = cotizar({ receta: luna, catalogo, valores: { L: 140, P: 60, H: 35 }, margen: 0.45 });
  assert.match(sinColor.avisos[0].mensaje, /Falta color/);

  const malMargen = cotizar({ receta: luna, catalogo, valores: { L: 140, P: 60, H: 35, color: 'bronce' }, margen: 1 });
  assert.equal(malMargen.ok, false);
});

test('validación de recetas', () => {
  assert.deepEqual(validarReceta(luna, catalogo), []);
  const mala: Receta = {
    entradas: { L: { tipo: 'medida', nombre: 'Largo' } },
    lineas: [
      { id: 'tapa', nombre: 'Tapa', regla: 'm2', insumo: 'vidrio-float', ancho: 'L', largo: 'ancho' },
      { id: 'ajuste', nombre: 'Ajuste', regla: 'porcentaje', porcentaje: '0.2', sobre: ['lat'] },
      { id: 'tapa', nombre: 'Repetida', regla: 'unidad', insumo: 'no-existe' },
      { id: 'uv', nombre: 'UV', regla: 'ml', insumo: 'pegado-uv' },
    ],
  };
  const msgs = validarReceta(mala, catalogo).map((a) => a.mensaje).join('\n');
  assert.match(msgs, /no existe "ancho"/);
  assert.match(msgs, /"lat" tiene que ser una línea anterior/);
  assert.match(msgs, /se repite/);
  assert.match(msgs, /no existe el insumo "no-existe"/);
  assert.match(msgs, /falta de dónde sale "espesor"/);
  assert.match(msgs, /necesita metros/);
});

test('entradas que se muestran solo cuando corresponden', () => {
  const receta: Receta = {
    entradas: {
      L: { tipo: 'medida', nombre: 'Largo' },
      color: { tipo: 'opcion', nombre: 'Color', atributo: 'color' },
      espesor: { tipo: 'opcion', nombre: 'Espesor', def: '10', mostrarSi: "en(color, 'incoloro', 'gris', 'bronce')" },
      composicion: { tipo: 'opcion', nombre: 'Composición', def: '5+5', mostrarSi: "!en(color, 'incoloro', 'gris', 'bronce')" },
    },
    lineas: [
      {
        id: 'tapa',
        nombre: 'Tapa',
        regla: 'm2',
        insumoFormula: "si(en(color, 'incoloro', 'gris', 'bronce'), 'vidrio-float', 'vidrio-laminado')",
        ancho: 'L',
        largo: 'L',
      },
    ],
  };
  assert.deepEqual(validarReceta(receta, catalogo), []);
  assert.deepEqual(entradasVisibles(receta, { color: 'bronce' }), ['L', 'color', 'espesor']);
  assert.deepEqual(entradasVisibles(receta, { color: 'rosa' }), ['L', 'color', 'composicion']);
  const rosa = cotizar({ receta, catalogo, valores: { L: 100, color: 'rosa' }, margen: 0.5 });
  assert.equal(rosa.ok, true, JSON.stringify(rosa.avisos));
  assert.equal(rosa.lineas[0].costo, 189000);
  assert.deepEqual(rosa.lineas[0].variante, { composicion: '5+5', color: 'rosa' });
  const bronce = cotizar({ receta, catalogo, valores: { L: 100, color: 'bronce' }, margen: 0.5 });
  assert.equal(bronce.lineas[0].costo, 115500);

  const mala: Receta = { ...receta, entradas: { a: { tipo: 'opcion', nombre: 'A', mostrarSi: "b == 'x'" }, b: { tipo: 'opcion', nombre: 'B' } } };
  assert.match(validarReceta(mala).map((x) => x.mensaje).join(), /solo puede usar entradas anteriores/);
});

test('piezas cambiadas a mano: pisan medida y cantidad, y el ajuste las sigue', () => {
  const base = cotizar({ receta: luna, catalogo, valores: { L: 140, P: 60, H: 35, color: 'bronce' }, margen: 0.45 });
  const r = cotizar({ receta: luna, catalogo, valores: { L: 140, P: 60, H: 35, color: 'bronce' }, margen: 0.45, piezas: { lat: { cantidad: 4, ancho: 70 } } });
  const lat = r.lineas.find((l) => l.id === 'lat')!;
  assert.equal(lat.cantidad, 4);
  assert.equal(lat.ancho, 70);
  assert.equal(lat.largo, 34); // el largo sigue siendo el de la receta
  assert.deepEqual(lat.original, { cantidad: 2, ancho: 60, largo: 34 });
  assert.equal(lat.costo, 109956); // 4 × 0,238 m² × 115.500
  assert.equal(costo(r, 'ajuste'), Math.round((97020 + 109956) * 0.2 * 100) / 100);
  assert.ok(r.costoUnitario > base.costoUnitario);
  // Sin cambios reales no se marca como cambiada; las líneas que no son piezas no se tocan.
  const igual = cotizar({ receta: luna, catalogo, valores: { L: 140, P: 60, H: 35, color: 'bronce' }, margen: 0.45, piezas: { lat: { ancho: 60 }, uv: { cantidad: 9 } } });
  assert.equal(igual.lineas.find((l) => l.id === 'lat')!.original, undefined);
  assert.equal(igual.costoUnitario, base.costoUnitario);
});

test('vidrios agregados a mano: mismo vidrio que la pieza elegida y entran en el ajuste', () => {
  const receta = conPiezasAgregadas(luna, [
    { id: 'extra_1', nombre: 'Estante', como: 'tapa', cantidad: 1, ancho: 100, largo: 50 },
    { id: 'extra_2', nombre: 'Refuerzo', como: 'lat', cantidad: 2, ancho: 20, largo: 30, forma: true },
    { id: 'extra_3', nombre: 'No existe', como: 'uv', cantidad: 1, ancho: 10, largo: 10 },
  ]);
  assert.deepEqual(receta.lineas.map((l) => l.id), ['tapa', 'extra_1', 'lat', 'extra_2', 'extra_2_forma', 'ajuste', 'uv']);
  assert.deepEqual(receta.lineas.find((l) => l.id === 'ajuste')!.sobre, ['tapa', 'lat', 'extra_1', 'extra_2', 'extra_2_forma']);
  const conForma = { ...catalogo, ajustes: { ...catalogo.ajustes, recargo_forma: 0.2 } };
  assert.deepEqual(validarReceta(receta, conForma).filter((a) => a.nivel === 'error'), []);
  const r = cotizar({ receta, catalogo: conForma, valores: { L: 140, P: 60, H: 35, color: 'bronce' }, margen: 0.45 });
  assert.equal(r.ok, true, JSON.stringify(r.avisos));
  assert.equal(costo(r, 'extra_1'), 57750); // 0,5 m² × 115.500, bronce como la tapa
  assert.equal(costo(r, 'extra_2'), 46200); // 2 piezas de 0,06 m² → mínimo 0,20 m² cada una
  assert.equal(costo(r, 'extra_2_forma'), 9240); // 20%
  assert.equal(costo(r, 'ajuste'), Math.round((97020 + 47124 + 57750 + 46200 + 9240) * 0.2 * 100) / 100);
  assert.equal(conPiezasAgregadas(luna, []), luna);
});
