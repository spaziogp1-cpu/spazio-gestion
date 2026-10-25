import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fechaRemito, generarRemitoPdf, lineasProducto, nombreRemito, pesos, textosPago } from './pdf';

test('textos del remito', () => {
  assert.equal(fechaRemito('2026-10-02'), '02 / 10 / 2026');
  assert.equal(pesos(734400), '$ 734.400');
  assert.equal(nombreRemito(557, 'Pepe / Puig'), 'Remito 557 - Pepe Puig.pdf');
  assert.equal(nombreRemito(557, 'Pepe Puig', 2), 'Remito 557 - Pepe Puig (2).pdf');
  const l = lineasProducto({ producto: 'mesa auxiliar', modelo: 'nube', color: 'azul', puntas: 'redondeadas', tapa: null, material: '10mm', medidas: '37x40x60', cantidad: 2 });
  assert.deepEqual(l, { nombre: 'Mesa auxiliar Nube', specs: '37 x 40 x 60 cm / 10mm / Cantidad: 2', color: 'Azul / Puntas redondeadas' });
});

test('pago total, seña y sin pago', () => {
  const total = textosPago({ total: 100, envioPrecio: 0, pagado: 100, formaPago: 'transferencia', envio: 'coordinar' });
  assert.match(total.constancia, /mediante transferencia el pago total/);
  assert.equal(total.filaPago, 'Pago total abonado - 100%');
  assert.equal(total.envioTexto, 'A convenir');
  const sena = textosPago({ total: 1000, envioPrecio: 100, pagado: 550, formaPago: 'efectivo', envio: 'flete' });
  assert.equal(sena.filaPago, 'Seña abonada - 50%');
  assert.equal(sena.saldo, 550);
  assert.match(sena.cierre, /Saldo a abonar antes de la entrega: \$ 550/);
  const nada = textosPago({ total: 1000, envioPrecio: 0, pagado: 0, formaPago: null, envio: 'retira' });
  assert.equal(nada.filaPago, 'Pago abonado - 0%');
  assert.equal(nada.envioTexto, 'Retira en el showroom');
});

test('arma un PDF de dos páginas', async () => {
  const pdf = await generarRemitoPdf({ numero: 1, fecha: '2026-10-25', cliente: 'Ana 😀 Ñandú', dniCuit: null, telefono: null, email: null, items: [], formaPago: null, total: 0, envioPrecio: 0, envio: 'coordinar', pagado: 0 });
  assert.ok(pdf.byteLength > 1000);
  assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), '%PDF-');
});
