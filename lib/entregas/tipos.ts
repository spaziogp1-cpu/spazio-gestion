// Entregas: estados, textos y cálculos que no dependen del servidor (se pueden probar).

export const ESTADOS_ENTREGA = [
  { id: 'revisar', nombre: 'Revisar' },
  { id: 'lista', nombre: 'Lista para planificar' },
  { id: 'propuesta', nombre: 'En propuesta' },
  { id: 'confirmada', nombre: 'Confirmada' },
  { id: 'en_camino', nombre: 'En camino' },
  { id: 'entregada', nombre: 'Entregada' },
  { id: 'no_entregada', nombre: 'No entregada' },
  { id: 'cancelada', nombre: 'Cancelada' },
] as const;
export type EstadoEntrega = (typeof ESTADOS_ENTREGA)[number]['id'];
export const ABIERTAS: EstadoEntrega[] = ['revisar', 'lista', 'propuesta', 'confirmada', 'en_camino'];

export type Entrega = {
  id: string;
  pedido_id: string;
  intento: number;
  estado: EstadoEntrega;
  tipo: 'cliente' | 'expreso';
  direccion: string | null;
  piso_depto: string | null;
  localidad: string | null;
  codigo_postal: string | null;
  lat: number | null;
  lng: number | null;
  place_id: string | null;
  direccion_google: string | null;
  precision: 'exacta' | 'aproximada' | 'no_encontrada' | null;
  ubicacion_confirmada: boolean;
  expreso_nombre: string | null;
  recibe_nombre: string | null;
  recibe_telefono: string | null;
  fecha_acordada: string | null;
  franja_desde: string | null;
  franja_hasta: string | null;
  ascensor: 'si' | 'no' | 'no_sabe' | null;
  acceso_notas: string | null;
  ayuda_descarga: boolean;
  instalacion: boolean;
  unidades: number;
  unidades_manual: number | null;
  minutos: number;
  personas: number;
  personas_manual: number | null;
  motivos: string[];
  motivo_no_entrega: string | null;
  notas: string | null;
  cerrada_en: string | null;
  creado_en: string;
  actualizado_en: string;
};

export const nombreEstadoEntrega = (e: string) => ESTADOS_ENTREGA.find((x) => x.id === e)?.nombre ?? e;

/** Texto de la dirección para buscarla en el mapa. */
export function direccionCompleta(e: Pick<Entrega, 'direccion' | 'localidad' | 'codigo_postal'>): string {
  return [e.direccion, e.localidad, e.codigo_postal, 'Argentina'].map((x) => (x ?? '').trim()).filter(Boolean).join(', ');
}

/** Link a Google Maps (gratis, sin clave): por coordenadas si las hay, si no por la dirección. */
export function linkMapa(e: Pick<Entrega, 'lat' | 'lng' | 'direccion' | 'localidad' | 'codigo_postal' | 'place_id'>): string | null {
  if (e.lat != null && e.lng != null) {
    const q = new URLSearchParams({ api: '1', query: `${e.lat},${e.lng}` });
    if (e.place_id) q.set('query_place_id', e.place_id);
    return `https://www.google.com/maps/search/?${q.toString()}`;
  }
  if (!e.direccion) return null;
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query: direccionCompleta(e) }).toString()}`;
}

/** Acepta "-34.6037, -58.3816" (lo que copia Google Maps) y devuelve las coordenadas, o null. */
export function leerCoordenadas(texto: string | null | undefined): { lat: number; lng: number } | null {
  const m = /^\s*\(?\s*(-?\d{1,2}(?:[.,]\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*\)?\s*$/.exec(texto ?? '');
  if (!m) return null;
  const lat = Number(m[1].replace(',', '.'));
  const lng = Number(m[2].replace(',', '.'));
  // Argentina continental, con margen.
  if (!(lat < -20 && lat > -56 && lng < -52 && lng > -75)) return null;
  return { lat, lng };
}

/** "9:00 a 12:00" */
export function franja(desde: string | null, hasta: string | null): string {
  if (!desde || !hasta) return '';
  return `${desde.slice(0, 5)} a ${hasta.slice(0, 5)}`;
}

/** 0,25 → "¼"; 1,5 → "1½"; para mostrar la carga. */
export function unidadesTexto(u: number): string {
  const n = Number(u);
  const ent = Math.floor(n + 1e-9);
  const resto = Math.round((n - ent) * 100);
  const frac = resto === 25 ? '¼' : resto === 50 ? '½' : resto === 75 ? '¾' : resto ? `,${resto}` : '';
  return `${ent || frac ? (ent || '') : 0}${frac}`;
}

// Respuesta de la Geocoding API de Google (lo que se usa).
export type ResultadoGeocoding = {
  formatted_address: string;
  place_id?: string;
  partial_match?: boolean;
  types?: string[];
  address_components?: { types: string[] }[];
  geometry: { location: { lat: number; lng: number }; location_type: string };
};

/** Precisión según Google: exacta si ubicó el número de calle sin dudas. */
export function precisionDe(r: ResultadoGeocoding): 'exacta' | 'aproximada' {
  const conNumero = (r.address_components ?? []).some((c) => c.types.includes('street_number'));
  const exacto = ['ROOFTOP', 'RANGE_INTERPOLATED'].includes(r.geometry.location_type);
  return conNumero && exacto && !r.partial_match ? 'exacta' : 'aproximada';
}

