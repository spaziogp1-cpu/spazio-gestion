import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularFechaLimite, diasEntre, esHabil, hoyAR, sumarDiasHabiles } from './fechas';

const sinFeriados = new Set<string>();

test('28 días corridos coincide con la planilla (16/9 → 14/10)', () => {
  assert.equal(calcularFechaLimite('2026-09-16', { dias: 28, tipo: 'corridos' }, sinFeriados), '2026-10-14');
  assert.equal(calcularFechaLimite('2026-09-22', { dias: 28, tipo: 'corridos' }, sinFeriados), '2026-10-20');
});

test('cruza fin de mes y de año', () => {
  assert.equal(calcularFechaLimite('2026-12-20', { dias: 28, tipo: 'corridos' }, sinFeriados), '2027-01-17');
});

test('días hábiles salta fines de semana', () => {
  // viernes 16/10/2026 + 1 hábil = lunes 19/10
  assert.equal(sumarDiasHabiles('2026-10-16', 1, sinFeriados), '2026-10-19');
  // 25 hábiles desde lunes 19/10 = 5 semanas exactas → lunes 23/11
  assert.equal(sumarDiasHabiles('2026-10-19', 25, sinFeriados), '2026-11-23');
});

test('días hábiles salta feriados', () => {
  const feriados = new Set(['2026-11-23']);
  assert.equal(sumarDiasHabiles('2026-10-19', 25, feriados), '2026-11-24');
  assert.equal(esHabil('2026-11-23', feriados), false);
});

test('diferencia en días', () => {
  assert.equal(diasEntre('2026-10-18', '2026-10-21'), 3);
  assert.equal(diasEntre('2026-10-21', '2026-10-18'), -3);
});

test('hoy en Buenos Aires aunque en UTC ya sea mañana', () => {
  // 18/10 23:30 en Buenos Aires = 19/10 02:30 UTC
  assert.equal(hoyAR(new Date('2026-10-19T02:30:00Z')), '2026-10-18');
});
