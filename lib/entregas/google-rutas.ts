import 'server-only';
import { proyectoGoogle, tokenGoogle } from '@/lib/google/cuenta-servicio';
import type { Punto } from './planificador';

// Route Optimization API (arma el recorrido con franjas, carga y jornada) y Routes API
// (km y tiempos de un orden fijo, después de reordenar a mano). Solo se mandan coordenadas.

export const optimizacionConfigurada = () => process.env.GOOGLE_ROUTE_OPTIMIZATION !== 'no' && Boolean(proyectoGoogle());

export async function optimizarConGoogle(pedido: unknown): Promise<{ ok: true; respuesta: unknown } | { ok: false; error: string }> {
  const proyecto = proyectoGoogle();
  if (!proyecto) return { ok: false, error: 'Falta la cuenta de servicio de Google' };
  try {
    const token = await tokenGoogle();
    const r = await fetch(`https://routeoptimization.googleapis.com/v1/projects/${proyecto}:optimizeTours`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': proyecto },
      body: JSON.stringify(pedido),
      cache: 'no-store',
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (j as { error?: { message?: string; status?: string } }).error;
      const texto =
        r.status === 403
          ? `Google rechazó el pedido (${/disabled|not been used/i.test(msg?.message ?? '') ? 'la Route Optimization API no está habilitada' : /permission/i.test(msg?.message ?? '') ? 'a la cuenta de servicio le falta el rol "Route Optimization Editor"' : 'habilitá Route Optimization API y dale a la cuenta de servicio el rol "Route Optimization Editor"'})${msg?.message ? `. Google dice: ${msg.message.slice(0, 220)}` : ''}`
          : `Route Optimization respondió ${r.status}${msg?.message ? `: ${msg.message.slice(0, 160)}` : ''}`;
      return { ok: false, error: texto };
    }
    return { ok: true, respuesta: j };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Km y minutos de cada tramo de un recorrido en orden fijo (depósito → paradas → destino). Hasta 10 paradas intermedias. */
export async function tramosConGoogle(origen: Punto, paradas: Punto[], destino: Punto | null): Promise<{ km: number; minutos: number }[] | null> {
  const clave = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!clave || !paradas.length) return null;
  const fin = destino ?? paradas.at(-1)!;
  const intermedias = destino ? paradas : paradas.slice(0, -1);
  if (intermedias.length > 10) return null;
  const wp = (p: Punto) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  try {
    const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': clave, 'X-Goog-FieldMask': 'routes.legs.duration,routes.legs.distanceMeters' },
      body: JSON.stringify({ origin: wp(origen), destination: wp(fin), intermediates: intermedias.map(wp), travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE' }),
      cache: 'no-store',
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { routes?: { legs?: { duration?: string; distanceMeters?: number }[] }[] };
    const legs = j.routes?.[0]?.legs ?? [];
    if (legs.length !== intermedias.length + 1) return null;
    return legs.map((l) => ({ km: (l.distanceMeters ?? 0) / 1000, minutos: (Number((l.duration ?? '0s').replace('s', '')) || 0) / 60 }));
  } catch {
    return null;
  }
}
