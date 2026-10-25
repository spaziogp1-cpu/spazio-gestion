import 'server-only';

// Geocoding API de Google (servidor). La clave va en GOOGLE_MAPS_SERVER_KEY (Vercel),
// restringida en Google Cloud a "Geocoding API". Nunca se manda el nombre ni el teléfono:
// solo la dirección.

export type Ubicacion = {
  lat: number;
  lng: number;
  placeId: string | null;
  direccionGoogle: string;
  precision: 'exacta' | 'aproximada';
};

export const mapsConfigurado = () => Boolean(process.env.GOOGLE_MAPS_SERVER_KEY);

import { precisionDe, type ResultadoGeocoding as Resultado } from './tipos';

export async function geocodificar(direccion: string): Promise<{ ok: true; ubicacion: Ubicacion } | { ok: false; error: string; noEncontrada?: boolean }> {
  const clave = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!clave) return { ok: false, error: 'Falta la clave de Google Maps (GOOGLE_MAPS_SERVER_KEY)' };
  const q = new URLSearchParams({ address: direccion, components: 'country:AR', region: 'ar', language: 'es', key: clave });
  let r: Response;
  try {
    r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${q.toString()}`, { cache: 'no-store' });
  } catch {
    return { ok: false, error: 'No se pudo conectar con Google Maps' };
  }
  const j = (await r.json().catch(() => ({}))) as { status?: string; error_message?: string; results?: Resultado[] };
  if (j.status === 'ZERO_RESULTS') return { ok: false, error: 'Google no encontró esa dirección', noEncontrada: true };
  if (j.status !== 'OK' || !j.results?.length) {
    const motivo =
      j.status === 'REQUEST_DENIED'
        ? 'Google rechazó la clave: revisá que tenga habilitada la Geocoding API y la facturación'
        : j.status === 'OVER_QUERY_LIMIT' || j.status === 'OVER_DAILY_LIMIT'
          ? 'Se llegó al tope de uso de Google Maps'
          : `Google Maps respondió ${j.status ?? r.status}`;
    return { ok: false, error: motivo };
  }
  const x = j.results[0];
  return {
    ok: true,
    ubicacion: {
      lat: x.geometry.location.lat,
      lng: x.geometry.location.lng,
      placeId: x.place_id ?? null,
      direccionGoogle: x.formatted_address,
      // Si devolvió varias opciones, la dirección es ambigua.
      precision: j.results.length > 1 ? 'aproximada' : precisionDe(x),
    },
  };
}
