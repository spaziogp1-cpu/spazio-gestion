import { test } from 'node:test';
import assert from 'node:assert/strict';
import { condicionesPresupuesto, generarPresupuestoPdf, nombrePresupuesto, type DatosPresupuestoPdf } from './pdf';

const base: DatosPresupuestoPdf = {
  numero: 128,
  fecha: '2026-11-07',
  validoHasta: '2026-11-17',
  cliente: 'Ana Pérez',
  telefono: '11 5555-1234',
  vendedor: 'Tete',
  items: [
    { titulo: 'Mesa Luna', detalle: '140 × 60 × 35 cm · bronce 10 mm', cantidad: 1, precioUnitario: 420000, total: 420000 },
    { titulo: 'Silla Cesca', detalle: 'Negra', cantidad: 4, precioUnitario: 95000, total: 380000 },
  ],
  subtotal: 800000,
  descuentoPct: 0.05,
  descuentoMonto: 40000,
  total: 760000,
  totalCuotas: 965200,
};

test('nombre del archivo', () => {
  assert.equal(nombrePresupuesto(128, 'Ana / Pérez'), 'Presupuesto 128 - Ana Pérez.pdf');
  assert.equal(nombrePresupuesto(5, ''), 'Presupuesto 5.pdf');
});

test('condiciones: validez, plazo y las particulares primero', () => {
  const c = condicionesPresupuesto({ validoHasta: '2026-11-17', plazo: '30-35 días hábiles', condiciones: 'Incluye instalación\n\n' });
  assert.equal(c[0], 'Incluye instalación');
  assert.ok(c.some((x) => x.includes('17 / 11 / 2026')));
  assert.ok(c.some((x) => x.includes('30-35 días hábiles')));
});

test('arma el PDF con muchos productos, emojis y sin teléfono', async () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ titulo: `Mesa ${i} 😀 Ñandú`, detalle: 'detalle largo '.repeat(12), cantidad: 1, precioUnitario: 1000, total: 1000 }));
  const pdf = await generarPresupuestoPdf({ ...base, telefono: null, vendedor: null, items });
  assert.ok(pdf.byteLength > 5000);
  const vacio = await generarPresupuestoPdf({ ...base, items: [], descuentoPct: 0 });
  assert.ok(vacio.byteLength > 5000);
});
