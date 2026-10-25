// Planificación de un día de reparto. Sin servidor: se puede probar.
//  - armarPedidoGoogle(): el pedido para Route Optimization API (Google).
//  - leerRespuestaGoogle(): su respuesta, como rutas y entregas que no entran.
//  - planificarEstimado(): lo mismo sin Google, con distancias en línea recta (para
//    cuando no está configurado o falla), con las mismas reglas.
//  - horariosConOrden(): llegadas para un orden fijo (después de reordenar a mano).

export type Punto = { lat: number; lng: number };

export type EntregaPlan = {
  id: string;
  punto: Punto;
  desde: string | null; // HH:MM, franja del cliente (opcional: sin franja, cualquier hora de la jornada)
  hasta: string | null;
  minutos: number; // en la parada
  unidades: number;
  personas: number;
  medidas: number[][]; // de cada mesa, en cm
  urgente: boolean; // vence antes del próximo día de reparto
};

export type VehiculoPlan = {
  id: string;
  nombre: string;
  capacidad: number;
  largo: number;
  ancho: number;
  alto: number;
  personas: number;
  desde: string; // jornada
  hasta: string;
  vuelve: boolean;
};

export type Parada = { entregaId: string; llegada: string; salida: string; minutosViaje: number; km: number; espera: number; fueraDeFranja: boolean };
export type RutaPlan = { vehiculoId: string; paradas: Parada[]; salida: string; regreso: string | null; km: number; minutos: number; polyline?: string };
export type Omitida = { entregaId: string; motivo: string };
export type Plan = { rutas: RutaPlan[]; omitidas: Omitida[]; calculo: 'google' | 'estimado' };

/** Margen al final de la franja: se planifica llegar antes, por los retrasos. */
export const MARGEN_FRANJA = 30;

// ---------------------------------------------------------------- utilidades
export const aMin = (h: string) => {
  const [hh, mm] = h.slice(0, 5).split(':').map(Number);
  return hh * 60 + mm;
};
export const aHora = (m: number) => {
  const x = Math.max(0, Math.round(m));
  return `${String(Math.floor(x / 60) % 24).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
};

/** "160x90x75" → [160, 90, 75]; si no se entiende, []. */
export function leerMedidas(texto: string | null | undefined): number[] {
  const n = (texto ?? '').match(/\d+(?:[.,]\d+)?/g)?.map((x) => Number(x.replace(',', '.'))) ?? [];
  return n.filter((x) => x > 0 && x < 1000).slice(0, 3);
}

/** ¿Entra cada mesa en el vehículo? Medidas ordenadas de mayor a menor contra el largo, ancho y alto máximos. */
export function entraEnVehiculo(medidas: number[][], v: Pick<VehiculoPlan, 'largo' | 'ancho' | 'alto'>): boolean {
  const lim = [v.largo, v.ancho, v.alto].sort((a, b) => b - a);
  return medidas.every((m) => {
    const d = [...m].sort((a, b) => b - a);
    return d.every((x, i) => x <= (lim.at(i) ?? Infinity));
  });
}

export function puedeIr(e: EntregaPlan, v: VehiculoPlan): string | null {
  if (e.unidades > v.capacidad) return `supera la capacidad (${e.unidades} de ${v.capacidad})`;
  if (!entraEnVehiculo(e.medidas, v)) return 'no entra por sus medidas';
  if (e.personas > v.personas) return `necesita ${e.personas} personas`;
  return null;
}

/** Distancia en km entre dos puntos (línea recta). */
export function kmEntre(a: Punto, b: Punto): number {
  const r = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/** Viaje estimado sin Google: la calle suma ~35% a la línea recta, a 22 km/h promedio en ciudad, más 5 minutos. */
export function viajeEstimado(a: Punto, b: Punto): { km: number; minutos: number } {
  const km = kmEntre(a, b) * 1.35;
  return { km, minutos: km === 0 ? 0 : 5 + (km / 22) * 60 };
}

export type Viaje = (a: Punto, b: Punto) => { km: number; minutos: number };

/**
 * Horarios de una ruta con un orden fijo. Si llega antes de la franja, espera.
 * `tramos` (opcional) = viaje real de cada tramo (depósito → 1 → 2 … → depósito), por ejemplo de Google.
 */
export function horariosConOrden(
  deposito: Punto,
  v: VehiculoPlan,
  entregas: EntregaPlan[],
  viaje: Viaje = viajeEstimado,
  tramos?: { km: number; minutos: number }[],
): Omit<RutaPlan, 'vehiculoId'> {
  const paradas: Parada[] = [];
  let t = aMin(v.desde);
  let donde = deposito;
  let km = 0;
  // Sale lo más tarde posible sin llegar tarde a la primera parada.
  if (entregas.length) {
    const ida = tramos?.[0] ?? viaje(deposito, entregas[0].punto);
    t = entregas[0].desde ? Math.max(aMin(v.desde), aMin(entregas[0].desde) - ida.minutos) : aMin(v.desde);
  }
  const salida = t;
  entregas.forEach((e, i) => {
    const tramo = tramos?.[i] ?? viaje(donde, e.punto);
    t += tramo.minutos;
    km += tramo.km;
    const espera = e.desde ? Math.max(0, aMin(e.desde) - t) : 0;
    t += espera;
    const llegada = t;
    t += e.minutos;
    paradas.push({
      entregaId: e.id,
      llegada: aHora(llegada),
      salida: aHora(t),
      minutosViaje: Math.round(tramo.minutos),
      km: Math.round(tramo.km * 10) / 10,
      espera: Math.round(espera),
      fueraDeFranja: e.hasta ? llegada > aMin(e.hasta) : false,
    });
    donde = e.punto;
  });
  let regreso: number | null = null;
  if (v.vuelve && entregas.length) {
    const vuelta = tramos?.[entregas.length] ?? viaje(donde, deposito);
    t += vuelta.minutos;
    km += vuelta.km;
    regreso = t;
  }
  return { paradas, salida: aHora(salida), regreso: regreso == null ? null : aHora(regreso), km: Math.round(km * 10) / 10, minutos: Math.round(t - salida) };
}

/** ¿La ruta cumple franjas, jornada y capacidad? */
function rutaValida(r: Omit<RutaPlan, 'vehiculoId'>, v: VehiculoPlan, es: EntregaPlan[]): boolean {
  const carga = es.reduce((s, e) => s + e.unidades, 0);
  if (carga > v.capacidad + 1e-9) return false;
  const hasta = (e: EntregaPlan) => (e.hasta ? aMin(e.hasta) - MARGEN_FRANJA : Infinity);
  if (r.paradas.some((p, i) => aMin(p.llegada) > hasta(es[i]))) return false;
  const fin = r.regreso ?? r.paradas.at(-1)?.salida ?? v.desde;
  return aMin(fin) <= aMin(v.hasta);
}

/**
 * Sin Google: inserción voraz. Primero lo urgente y lo de franja más temprana; cada entrega
 * va donde suma menos tiempo respetando todas las reglas. Usar un vehículo más cuesta
 * (preferimos juntar entregas en un viaje: los fleteros hacen precio desde 3).
 */
export function planificarEstimado(deposito: Punto, vehiculos: VehiculoPlan[], entregas: EntregaPlan[], viaje: Viaje = viajeEstimado): Plan {
  const rutas = new Map<string, EntregaPlan[]>(vehiculos.map((v) => [v.id, []]));
  const omitidas: Omitida[] = [];
  const m = (h: string | null, def: number) => (h ? aMin(h) : def);
  // Primero lo urgente, después lo que tiene franja (más restringido), y por hora.
  const orden = [...entregas].sort(
    (a, b) => Number(b.urgente) - Number(a.urgente) || Number(!a.hasta) - Number(!b.hasta) || m(a.desde, 0) - m(b.desde, 0) || m(a.hasta, 1440) - m(b.hasta, 1440),
  );
  const COSTO_VEHICULO = 45; // minutos equivalentes por sumar un vehículo

  for (const e of orden) {
    let mejor: { v: VehiculoPlan; lista: EntregaPlan[]; costo: number } | null = null;
    const motivos = new Set<string>();
    for (const v of vehiculos) {
      const no = puedeIr(e, v);
      if (no) {
        motivos.add(`${v.nombre}: ${no}`);
        continue;
      }
      const actual = rutas.get(v.id)!;
      const antes = actual.length ? horariosConOrden(deposito, v, actual, viaje).minutos : 0;
      for (let i = 0; i <= actual.length; i++) {
        const lista = [...actual.slice(0, i), e, ...actual.slice(i)];
        const r = horariosConOrden(deposito, v, lista, viaje);
        if (!rutaValida(r, v, lista)) continue;
        const costo = r.minutos - antes + (actual.length ? 0 : COSTO_VEHICULO);
        if (!mejor || costo < mejor.costo) mejor = { v, lista, costo };
      }
    }
    if (mejor) rutas.set(mejor.v.id, mejor.lista);
    else
      omitidas.push({
        entregaId: e.id,
        motivo: motivos.size === vehiculos.length ? [...motivos].join('; ') : 'no entra en la franja o en la jornada con lo que ya está asignado',
      });
  }

  return {
    calculo: 'estimado',
    omitidas,
    rutas: vehiculos
      .filter((v) => rutas.get(v.id)!.length)
      .map((v) => ({ vehiculoId: v.id, ...horariosConOrden(deposito, v, rutas.get(v.id)!, viaje) })),
  };
}

// ---------------------------------------------------------------- Google Route Optimization
const iso = (fecha: string, hora: string) => {
  // Hora de Buenos Aires (UTC−3, sin horario de verano) → UTC.
  const [a, m, d] = fecha.split('-').map(Number);
  const min = aMin(hora) + 180;
  return new Date(Date.UTC(a, m - 1, d, 0, min)).toISOString().replace('.000', '');
};
const latLng = (p: Punto) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });

/** Cargas en enteros: Google pide cantidades enteras, la unidad es un cuarto de ratona. */
const cuartos = (u: number) => String(Math.round(u * 4));

export function armarPedidoGoogle(fecha: string, deposito: Punto, vehiculos: VehiculoPlan[], entregas: EntregaPlan[]) {
  const inicio = vehiculos.reduce((m, v) => Math.min(m, aMin(v.desde)), 24 * 60);
  const fin = vehiculos.reduce((m, v) => Math.max(m, aMin(v.hasta)), 0);
  return {
    model: {
      globalStartTime: iso(fecha, aHora(Math.min(inicio, ...entregas.filter((e) => e.desde).map((e) => aMin(e.desde!))))),
      globalEndTime: iso(fecha, aHora(Math.max(fin, ...entregas.filter((e) => e.hasta).map((e) => aMin(e.hasta!))))),
      shipments: entregas.map((e) => ({
        label: e.id,
        deliveries: [
          {
            arrivalWaypoint: latLng(e.punto),
            duration: `${Math.round(e.minutos * 60)}s`,
            ...(e.desde && e.hasta
              ? { timeWindows: [{ startTime: iso(fecha, e.desde), endTime: iso(fecha, aHora(Math.max(aMin(e.desde), aMin(e.hasta) - MARGEN_FRANJA))) }] }
              : {}),
          },
        ],
        loadDemands: { unidades: { amount: cuartos(e.unidades) } },
        allowedVehicleIndices: vehiculos.map((v, i) => (puedeIr(e, v) ? -1 : i)).filter((i) => i >= 0),
        // Dejar afuera algo urgente cuesta mucho más que manejar de más.
        penaltyCost: e.urgente ? 1_000_000 : 50_000,
      })),
      vehicles: vehiculos.map((v) => ({
        label: v.id,
        travelMode: 'DRIVING',
        startWaypoint: latLng(deposito),
        ...(v.vuelve ? { endWaypoint: latLng(deposito) } : {}),
        loadLimits: { unidades: { maxLoad: cuartos(v.capacidad) } },
        startTimeWindows: [{ startTime: iso(fecha, v.desde) }],
        endTimeWindows: [{ endTime: iso(fecha, v.hasta) }],
        costPerHour: 60,
        costPerKilometer: 1,
        // Usar un vehículo más cuesta: se prefiere juntar entregas en un viaje.
        fixedCost: 45,
      })),
    },
    populatePolylines: true,
    considerRoadTraffic: true,
  };
}

type RespuestaGoogle = {
  routes?: {
    vehicleIndex?: number;
    vehicleStartTime?: string;
    vehicleEndTime?: string;
    visits?: { shipmentIndex?: number; startTime: string }[];
    transitions?: { travelDuration?: string; travelDistanceMeters?: number }[];
    metrics?: { travelDistanceMeters?: number; totalDuration?: string };
    routePolyline?: { points?: string };
  }[];
  skippedShipments?: { index?: number; label?: string; reasons?: { code?: string }[] }[];
};

const MOTIVOS: Record<string, string> = {
  NO_VEHICLE: 'no hay vehículo disponible',
  DEMAND_EXCEEDS_VEHICLE_CAPACITY: 'supera la capacidad de carga',
  CANNOT_BE_PERFORMED_WITHIN_VEHICLE_DISTANCE_LIMIT: 'queda demasiado lejos',
  CANNOT_BE_PERFORMED_WITHIN_VEHICLE_DURATION_LIMIT: 'no alcanza la jornada',
  CANNOT_BE_PERFORMED_WITHIN_VEHICLE_TRAVEL_DURATION_LIMIT: 'no alcanza la jornada',
  CANNOT_BE_PERFORMED_WITHIN_VEHICLE_TIME_WINDOWS: 'no entra en la franja horaria',
  VEHICLE_NOT_ALLOWED: 'no entra en ningún vehículo (medidas o personas)',
};
export const motivoGoogle = (codigo?: string) => (codigo && MOTIVOS[codigo]) || 'no entra en la jornada con lo demás';

const seg = (d?: string) => Number((d ?? '0s').replace('s', '')) || 0;
const horaLocal = (t: string) => {
  const d = new Date(t);
  return aHora(d.getUTCHours() * 60 + d.getUTCMinutes() - 180 + (d.getUTCSeconds() >= 30 ? 1 : 0));
};

export function leerRespuestaGoogle(r: RespuestaGoogle, vehiculos: VehiculoPlan[], entregas: EntregaPlan[]): Plan {
  const rutas: RutaPlan[] = [];
  for (const ru of r.routes ?? []) {
    const visitas = ru.visits ?? [];
    if (!visitas.length) continue;
    const v = vehiculos.at(ru.vehicleIndex ?? 0)!;
    const tr = ru.transitions ?? [];
    const paradas: Parada[] = visitas.map((vi, i) => {
      const e = entregas.at(vi.shipmentIndex ?? 0)!;
      const llegada = horaLocal(vi.startTime);
      const viajeSeg = seg(tr.at(i)?.travelDuration);
      const prev = i === 0 ? null : visitas.at(i - 1)!;
      const salidaPrev = prev ? aMin(horaLocal(prev.startTime)) + entregas.at(prev.shipmentIndex ?? 0)!.minutos : null;
      return {
        entregaId: e.id,
        llegada,
        salida: aHora(aMin(llegada) + e.minutos),
        minutosViaje: Math.round(viajeSeg / 60),
        km: Math.round((tr.at(i)?.travelDistanceMeters ?? 0) / 100) / 10,
        espera: salidaPrev == null ? 0 : Math.max(0, Math.round(aMin(llegada) - salidaPrev - viajeSeg / 60)),
        fueraDeFranja: e.hasta ? aMin(llegada) > aMin(e.hasta) : false,
      };
    });
    const salida = ru.vehicleStartTime ? horaLocal(ru.vehicleStartTime) : v.desde;
    const regreso = v.vuelve && ru.vehicleEndTime ? horaLocal(ru.vehicleEndTime) : null;
    rutas.push({
      vehiculoId: v.id,
      paradas,
      salida,
      regreso,
      km: Math.round((ru.metrics?.travelDistanceMeters ?? 0) / 100) / 10,
      minutos: Math.round(seg(ru.metrics?.totalDuration) / 60),
      polyline: ru.routePolyline?.points,
    });
  }
  const omitidas = (r.skippedShipments ?? []).map((s) => ({
    entregaId: s.label ?? entregas.at(s.index ?? 0)!.id,
    motivo: motivoGoogle(s.reasons?.[0]?.code),
  }));
  return { rutas, omitidas, calculo: 'google' };
}

/** Costo estimado de un viaje: precio por entrega, con el precio especial desde N entregas. */
export function costoViaje(n: number, v: { precio_entrega: number; descuento_desde: number; precio_descuento: number | null }): number {
  const precio = v.precio_descuento != null && n >= v.descuento_desde ? v.precio_descuento : v.precio_entrega;
  return n * Number(precio);
}

/** Link a Google Maps con el recorrido completo (hasta 9 paradas en la computadora; en el celular, 3). */
export function linkRecorrido(deposito: Punto, puntos: Punto[], vuelve: boolean): string {
  const p = (x: Punto) => `${x.lat},${x.lng}`;
  const destino = vuelve ? deposito : puntos.at(-1)!;
  const intermedios = (vuelve ? puntos : puntos.slice(0, -1)).slice(0, 9);
  const q = new URLSearchParams({ api: '1', origin: p(deposito), destination: p(destino), travelmode: 'driving' });
  if (intermedios.length) q.set('waypoints', intermedios.map(p).join('|'));
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

/** Link para navegar hasta una parada (lo usa el fletero). */
export function linkNavegar(p: Punto): string {
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: '1', destination: `${p.lat},${p.lng}`, travelmode: 'driving', dir_action: 'navigate' }).toString()}`;
}
