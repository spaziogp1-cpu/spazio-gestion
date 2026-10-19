import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etapaDesdeEstado, fecha, monto, ventasDesdeFilas } from './origen';

const fila = (o: Record<number, unknown>) => Array.from({ length: 36 }, (_, i) => (o[i] ?? '') as string | number);

test('montos y fechas en los formatos de la planilla', () => {
  assert.equal(monto('$750,750.00'), 750750);
  assert.equal(monto('$1.350.000,50'), 1350000.5);
  assert.equal(monto('$ 340.000'), 340000);
  assert.equal(monto('750,750'), 750750);
  assert.equal(monto(992000), 992000);
  assert.equal(monto('TRANSF 12/10'), 0);
  assert.equal(monto('-'), 0);
  assert.equal(fecha('15/10/2026'), '2026-10-15');
  assert.equal(fecha(46309), '2026-10-14');
  assert.equal(fecha('16/2/1900'), null);
  assert.equal(etapaDesdeEstado('en producción'), 'en_fabricacion');
  assert.equal(etapaDesdeEstado('Listo'), 'lista');
  assert.equal(etapaDesdeEstado('Tomar pedido'), 'senado');
});

test('agrupa filas seguidas de la misma venta y saltea vacías y viejas', () => {
  const filas = [
    fila({ 0: 'FECHA' }),
    fila({ 0: '30/9/2026', 1: 480, 3: 'Viejo' }),
    fila({ 0: '17/10/2026', 1: 540, 2: 'minorista', 3: 'Florencia Gomez', 5: 'Flor@x.com', 10: 'Tomar pedido', 11: 'mesa auxiliar', 12: 'cubo', 13: 'bronce', 16: '8mm', 17: '40x40x50', 18: 1, 19: 'transferencia', 20: 340000, 21: 156000, 22: 'coordinar', 26: 'Whatsapp', 27: 'Tete', 28: '4/12/2026', 31: '-', 34: 'WSP', 35: 'WSP' }),
    fila({ 0: '17/10/2026', 1: 540, 3: 'Florencia Gomez', 11: 'vinilero', 12: 'lyra', 18: 2, 20: 284000, 21: 0 }),
    fila({ 0: '18/10/2026', 1: 542, 3: 'Macarena Salgado', 10: 'en producción', 20: '$337,000.00', 21: '$337,000.00', 26: 'Tiendanube', 27: 'no aplica', 31: 'SI' }),
    fila({ 1: 544, 25: 0, 28: '16/2/1900' }),
  ];
  const v = ventasDesdeFilas(filas, '2026-10-01');
  assert.equal(v.length, 2);
  const [flor, maca] = v;
  assert.deepEqual(flor.filas, [3, 4]);
  assert.equal(flor.items.length, 2);
  assert.equal(flor.total, 624000);
  assert.equal(flor.sena, 156000);
  assert.equal(flor.items[1].precio, 142000);
  assert.equal(flor.vendedor, 'Tete');
  assert.equal(flor.cliente.email, 'flor@x.com');
  assert.equal(flor.fecha_limite, '2026-12-04');
  assert.equal(flor.observaciones, 'Cierre: WSP');
  assert.equal(maca.canal, 'tiendanube');
  assert.equal(maca.vendedor, null);
  assert.equal(maca.etapa, 'en_fabricacion');
  assert.equal(maca.pauta, true);
  assert.equal(maca.total, 337000);
});
