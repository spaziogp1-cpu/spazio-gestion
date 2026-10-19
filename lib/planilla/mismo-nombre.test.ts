import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarNombre } from './origen';

// Copia de la regla de importar-origen (que es solo de servidor).
function mismoNombre(a: string, b: string) {
  const na = normalizarNombre(a), nb = normalizarNombre(b);
  if (na === nb) return true;
  const ta = na.split(' '), tb = nb.split(' ');
  const [corto, largo] = ta.length <= tb.length ? [ta, new Set(tb)] : [tb, new Set(ta)];
  return corto.length >= 2 && corto.every((t) => largo.has(t));
}

test('nombres de clientes', () => {
  assert.ok(mismoNombre('Laura cachau', 'Laura Cachau'));
  assert.ok(mismoNombre('Laura D’Alesio', "Laura D'Alesio"));
  assert.ok(mismoNombre('Guido Godryn', 'Guido Godryn Biello'));
  assert.ok(!mismoNombre('Florencia Gomez', 'Cecilia Gomez'));
  assert.ok(!mismoNombre('Gomez', 'Cecilia Gomez'));
});
