import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fechaAR, formaPago, leerVariante, modeloProducto, pagoMarcadoDespues, pedidoDesdeOrden, tipoProducto, type OrdenTN } from './mapeo';

const orden: OrdenTN = {
  id: 1712345678,
  number: 1203,
  created_at: '2026-10-19T01:30:00+0000', // 18/10 22:30 en Buenos Aires
  paid_at: '2026-10-19T01:35:00+0000',
  payment_status: 'paid',
  subtotal: '850000.00',
  discount: '85000.00',
  total: '815000.00', // 850000 - 85000 + 50000 de envío
  gateway: 'pago-nube',
  gateway_name: 'Pago Nube',
  payment_details: { method: 'credit_card', installments: '6' },
  contact_email: 'ana@x.com',
  contact_phone: '+5491155555555',
  contact_identification: '30111222',
  customer: { name: 'Ana Pérez' },
  shipping_address: { address: 'Av. Corrientes', number: '1234', floor: '5 B', city: 'Rosario', province: 'Santa Fe', zipcode: '2000' },
  shipping_option: 'Envío a domicilio',
  note: 'Tocar timbre',
  products: [
    { name: 'Mesa Ratona Gravedad', variant_values: ['100x60', 'Incoloro', '10mm'], quantity: '1', price: '700000.00' },
    { name: 'Silla Cesca', variant_values: ['Negro', 'Pata cromada'], quantity: '2', price: '75000.00' },
  ],
};

test('arma el pedido con montos separados de envío', () => {
  const p = pedidoDesdeOrden(orden);
  assert.equal(p.tiendanube_id, '1712345678');
  assert.equal(p.fecha_venta, '2026-10-18');
  assert.equal(p.precio_envio_cliente, 50000);
  assert.equal(p.total, 765000); // productos con descuento
  assert.equal(p.sena, 815000); // pagó todo
  assert.equal(p.forma_pago, 'pagonube');
  assert.equal(p.envio, 'coordinar');
  assert.equal(p.cliente.nombre, 'Ana Pérez');
  assert.equal(p.cliente.localidad, 'Rosario, Santa Fe');
  assert.equal(p.cliente.direccion, 'Av. Corrientes 1234, 5 B');
  assert.match(p.observaciones ?? '', /Tienda Nube #1203/);
  assert.match(p.observaciones ?? '', /Pata cromada/);
  assert.match(p.observaciones ?? '', /6 cuotas/);
});

test('productos: tipo, modelo y variante como en la planilla', () => {
  const [mesa, silla] = pedidoDesdeOrden(orden).items;
  assert.deepEqual(
    { producto: mesa.producto, modelo: mesa.modelo, medidas: mesa.medidas, color: mesa.color, material: mesa.material, cantidad: mesa.cantidad, precio: mesa.precio },
    { producto: 'mesa ratona', modelo: 'gravedad', medidas: '100x60', color: 'incoloro', material: '10mm', cantidad: 1, precio: 700000 },
  );
  assert.equal(silla.producto, 'sillas');
  assert.equal(silla.modelo, 'cesca');
  assert.equal(silla.cantidad, 2);
  assert.equal(silla.color, 'negro');
});

test('retiro en showroom, transferencia y sin pagar', () => {
  const p = pedidoDesdeOrden({ ...orden, shipping_pickup_type: 'pickup', total: '765000', payment_status: 'pending', gateway: 'offline', gateway_name: 'Transferencia bancaria', payment_details: { method: 'custom' } });
  assert.equal(p.envio, 'retira');
  assert.equal(p.direccion_entrega, null);
  assert.equal(p.precio_envio_cliente, 0);
  assert.equal(p.sena, 0);
  assert.equal(p.forma_pago, 'transferencia');
});

test('pago marcado al entregar: fecha de venta = compra, y se detecta como ya cargada', () => {
  // Compró el 23/9 por transferencia (seña) y se marcó "pago recibido" al entregar, el 28/10.
  const tarde: OrdenTN = { ...orden, created_at: '2026-09-23T15:00:00+0000', paid_at: '2026-10-28T18:00:00+0000', gateway: 'offline', payment_details: { method: 'custom' } };
  assert.equal(pedidoDesdeOrden(tarde).fecha_venta, '2026-09-23');
  assert.equal(pagoMarcadoDespues(tarde), true);
  // Tarjeta / Pago Nube: se acredita en el momento.
  assert.equal(pagoMarcadoDespues(orden), false);
  assert.equal(pagoMarcadoDespues({ ...orden, paid_at: null }), false);
});

test('detecciones sueltas', () => {
  assert.equal(tipoProducto('Mesa de Luz Luna'), 'mesa de luz');
  assert.equal(modeloProducto('Mesa de Luz Luna'), 'luna');
  assert.equal(tipoProducto('Mesa de Comedor Atlas'), 'mesa alta');
  assert.equal(tipoProducto('Escritorio Orión'), 'escritorio');
  assert.equal(modeloProducto('Escritorio Orión'), 'orion');
  assert.equal(modeloProducto('Mesa Galaxia II'), 'galaxia ii');
  assert.equal(tipoProducto('Algo raro'), 'Personalizado');
  assert.deepEqual(leerVariante(['120 x 80', '5+5', 'Gris claro']), { medidas: '120x80', color: 'gris claro', material: '5+5', resto: [] });
  assert.equal(formaPago({ id: 1, gateway: 'mercadopago' }), 'cuotas/mp');
  assert.equal(fechaAR('2026-10-19T02:59:00Z'), '2026-10-18');
});
