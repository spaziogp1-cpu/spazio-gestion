import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoPlanilla, filasDelPedido, filasPedido, fechaPlanilla, type PedidoParaPlanilla } from './filas';

const base: PedidoParaPlanilla = {
  numero: 543, fecha_venta: '2026-10-19', tipo_venta: 'minorista', canal: 'instagram', etapa: 'senado', envio: 'flete',
  forma_pago: 'transferencia', total: 1000000, precio_envio_cliente: 80000, fecha_limite: '2026-12-07', fecha_entrega_real: null,
  observaciones: 'urgente', pauta: true, campana: 'MESA SOL', dm_inbound: 'DM', pagado: 500000, vendedor: 'Tete',
  cliente: { nombre: 'Ana Pérez', telefono: '11 5555-5555', email: 'ana@x.com', dni: '30111222', direccion: 'Calle 1', localidad: 'CABA', codigo_postal: '1414' },
  items: [
    { producto: 'mesa alta', modelo: 'sol', color: 'rojo', puntas: null, tapa: 'S/ INSERTOS', material: '5+5', medidas: '100x75', cantidad: 1, precio: 700000 },
    { producto: 'sillas', modelo: 'cesca', color: 'negro', puntas: null, tapa: null, material: null, medidas: null, cantidad: 2, precio: 150000 },
  ],
};

test('una fila por producto, 36 columnas, montos como la planilla', () => {
  const f = filasPedido(base);
  assert.equal(f.length, 2);
  assert.equal(f[0].length, 36);
  assert.equal(f[0][0], '19/10/2026');
  assert.equal(f[0][10], 'Tomar pedido');
  assert.equal(f[0][20], 700000); // total fila
  assert.equal(f[0][21], 500000); // seña en la primera fila
  assert.equal(f[0][24], 80000); // envío al cliente
  assert.equal(f[0][25], 700000 + 80000 - 500000); // saldo
  assert.equal(f[1][20], 300000); // 2 sillas
  assert.equal(f[1][25], 300000);
  assert.equal(f[0][26], 'Instagram');
  assert.equal(f[0][27], 'Tete');
  assert.equal(f[0][28], '7/12/2026');
  assert.equal(f[0][31], 'SI');
});

test('sin precios por producto, el total va en la primera fila', () => {
  const f = filasPedido({ ...base, items: base.items.map((i) => ({ ...i, precio: null })) });
  assert.equal(f[0][20], 1000000);
  assert.equal(f[1][20], 0);
});

test('estados y fechas', () => {
  assert.equal(estadoPlanilla('en_fabricacion'), 'en producción');
  assert.equal(estadoPlanilla('cliente_avisado'), 'Listo');
  assert.equal(fechaPlanilla('2026-01-05'), '5/1/2026');
});

test('encuentra las filas por número y cliente (el 488 está repetido)', () => {
  const B = [['N DE COMPRA'], ['487'], ['488'], ['488'], ['489']];
  const D = [['CLIENTE'], ['19 Puntos SRL'], ['19 Puntos SRL'], ['Oriana Huici'], ['María']];
  assert.deepEqual(filasDelPedido(B, D, 488, '19 Puntos SRL'), [3]);
  assert.deepEqual(filasDelPedido(B, D, 488, 'oriana huici '), [4]);
});
