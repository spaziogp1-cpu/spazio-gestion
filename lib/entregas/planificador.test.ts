import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  armarPedidoGoogle, costoViaje, entraEnVehiculo, horariosConOrden, leerMedidas, leerRespuestaGoogle, linkRecorrido,
  planificarEstimado, type EntregaPlan, type VehiculoPlan,
} from './planificador';

const deposito = { lat: -34.5985, lng: -58.4395 }; // Villa Crespo
const trafic: VehiculoPlan = { id: 't', nombre: 'Trafic', capacidad: 5, largo: 244, ancho: 127, alto: 132, personas: 3, desde: '08:30', hasta: '18:30', vuelve: true };
const kangoo: VehiculoPlan = { id: 'k', nombre: 'Kangoo', capacidad: 3, largo: 176, ancho: 117, alto: 110, personas: 2, desde: '08:30', hasta: '18:30', vuelve: true };
const ent = (id: string, lat: number, lng: number, extra: Partial<EntregaPlan> = {}): EntregaPlan => ({
  id, punto: { lat, lng }, desde: '09:00', hasta: '12:00', minutos: 25, unidades: 1, personas: 1, medidas: [[100, 50, 40]], urgente: false, ...extra,
});

test('medidas y vehículo', () => {
  assert.deepEqual(leerMedidas('160x90x75'), [160, 90, 75]);
  assert.deepEqual(leerMedidas('Ø 120 x 75'), [120, 75]);
  assert.deepEqual(leerMedidas(null), []);
  assert.equal(entraEnVehiculo([[180, 90, 75]], kangoo), false);
  assert.equal(entraEnVehiculo([[180, 90, 75]], trafic), true);
  assert.equal(entraEnVehiculo([[100, 50, 40]], kangoo), true);
});

test('horarios con orden fijo: espera la franja y marca lo tarde', () => {
  const r = horariosConOrden(deposito, trafic, [ent('a', -34.6037, -58.3816, { desde: '10:00', hasta: '13:00' }), ent('b', -34.5875, -58.4300, { desde: '09:00', hasta: '10:00' })]);
  assert.equal(r.paradas[0].llegada, '10:00');
  assert.equal(r.paradas[1].fueraDeFranja, true);
  assert.ok(r.regreso);
  assert.ok(r.km > 0);
});

test('sin Google: junta en un vehículo, respeta medidas y explica lo que queda afuera', () => {
  const es = [
    ent('a', -34.6037, -58.3816),
    ent('b', -34.5875, -58.4300),
    ent('grande', -34.5700, -58.4400, { medidas: [[180, 90, 75]], unidades: 3, personas: 2, desde: '13:00', hasta: '16:00' }),
    ent('imposible', -34.62, -58.45, { desde: '09:00', hasta: '09:10' }),
  ];
  const p = planificarEstimado(deposito, [trafic, kangoo], es);
  const enRutas = p.rutas.flatMap((r) => r.paradas.map((x) => x.entregaId));
  assert.ok(enRutas.includes('a') && enRutas.includes('b') && enRutas.includes('grande'));
  const rutaGrande = p.rutas.find((r) => r.paradas.some((x) => x.entregaId === 'grande'))!;
  assert.equal(rutaGrande.vehiculoId, 't');
  assert.equal(p.rutas.length, 1, 'todo entra en la Trafic: no hace falta la Kangoo');
  assert.deepEqual(p.omitidas.map((o) => o.entregaId), ['imposible']);
  for (const r of p.rutas) for (const x of r.paradas) assert.equal(x.fueraDeFranja, false);
});

test('sin Google: la capacidad reparte entre vehículos', () => {
  const es = Array.from({ length: 7 }, (_, i) => ent(`e${i}`, -34.60 + i * 0.005, -58.43, { desde: '09:00', hasta: '17:00' }));
  const p = planificarEstimado(deposito, [trafic, kangoo], es);
  const carga = Object.fromEntries(p.rutas.map((r) => [r.vehiculoId, r.paradas.length]));
  assert.equal(carga.t, 5);
  assert.equal(carga.k, 2);
  assert.equal(p.omitidas.length, 0);
});

test('pedido y respuesta de Google', () => {
  const es = [ent('a', -34.6037, -58.3816, { medidas: [[180, 90, 75]], unidades: 3, urgente: true })];
  const req = armarPedidoGoogle('2026-10-28', deposito, [trafic, kangoo], es);
  const s = req.model.shipments[0];
  assert.deepEqual(s.allowedVehicleIndices, [0]);
  assert.equal(s.loadDemands.unidades.amount, '12');
  assert.equal(s.deliveries[0].timeWindows[0].startTime, '2026-10-28T12:00:00Z');
  assert.equal(s.deliveries[0].timeWindows[0].endTime, '2026-10-28T14:30:00Z');
  assert.equal(req.model.vehicles[1].loadLimits.unidades.maxLoad, '12');
  const plan = leerRespuestaGoogle(
    {
      routes: [
        {
          vehicleIndex: 0, vehicleStartTime: '2026-10-28T11:40:00Z', vehicleEndTime: '2026-10-28T13:30:00Z',
          visits: [{ shipmentIndex: 0, startTime: '2026-10-28T12:05:00Z' }],
          transitions: [{ travelDuration: '1500s', travelDistanceMeters: 6400 }, { travelDuration: '1400s', travelDistanceMeters: 6200 }],
          metrics: { travelDistanceMeters: 12600, totalDuration: '6600s' }, routePolyline: { points: 'abc' },
        },
        { vehicleIndex: 1 },
      ],
      skippedShipments: [{ index: 0, label: 'x', reasons: [{ code: 'CANNOT_BE_PERFORMED_WITHIN_VEHICLE_TIME_WINDOWS' }] }],
    },
    [trafic, kangoo], es,
  );
  assert.equal(plan.rutas.length, 1);
  assert.equal(plan.rutas[0].paradas[0].llegada, '09:05');
  assert.equal(plan.rutas[0].salida, '08:40');
  assert.equal(plan.rutas[0].regreso, '10:30');
  assert.equal(plan.rutas[0].km, 12.6);
  assert.equal(plan.omitidas[0].motivo, 'no entra en la franja horaria');
});

test('costo y links', () => {
  const f = { precio_entrega: 20000, descuento_desde: 3, precio_descuento: 16000 };
  assert.equal(costoViaje(2, f), 40000);
  assert.equal(costoViaje(3, f), 48000);
  const l = linkRecorrido(deposito, [{ lat: -34.6, lng: -58.38 }], true);
  assert.match(l, /origin=-34.5985%2C-58.4395/);
  assert.match(l, /waypoints=-34.6%2C-58.38/);
});
