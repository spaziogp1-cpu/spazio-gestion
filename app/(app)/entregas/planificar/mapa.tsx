'use client';

import { useEffect, useRef, useState } from 'react';

// Mapa con Maps JavaScript API (clave del navegador NEXT_PUBLIC_GOOGLE_MAPS_KEY, restringida al dominio).
// Muestra el depósito, las paradas numeradas por vehículo y el trazado (si Google lo devolvió).

type Punto = { lat: number; lng: number };
export type CapaMapa = { color: string; paradas: (Punto & { n: number; titulo: string })[]; polyline?: string | null };

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google?: any;
    __spazioMapa?: Promise<void>;
  }
}

function cargar(clave: string): Promise<void> {
  if (window.google?.maps?.geometry) return Promise.resolve();
  window.__spazioMapa ??= new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(clave)}&libraries=geometry&language=es&region=AR&v=weekly`;
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => mal(new Error('No se pudo cargar Google Maps'));
    document.head.appendChild(s);
  });
  return window.__spazioMapa;
}

export function MapaRutas({ clave, deposito, capas }: { clave: string; deposito: Punto; capas: CapaMapa[] }) {
  const div = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let vivo = true;
    cargar(clave)
      .then(() => {
        if (!vivo || !div.current) return;
        const g = window.google.maps;
        const mapa = new g.Map(div.current, { center: deposito, zoom: 12, mapTypeControl: false, streetViewControl: false, fullscreenControl: true });
        const limites = new g.LatLngBounds();
        new g.Marker({ position: deposito, map: mapa, title: 'Depósito', label: { text: 'D', color: '#fff', fontWeight: '700' } });
        limites.extend(deposito);
        for (const c of capas) {
          for (const p of c.paradas) {
            new g.Marker({
              position: p,
              map: mapa,
              title: p.titulo,
              label: { text: String(p.n), color: '#fff', fontWeight: '700' },
              icon: { path: g.SymbolPath.CIRCLE, scale: 12, fillColor: c.color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
            });
            limites.extend(p);
          }
          const camino = c.polyline ? g.geometry.encoding.decodePath(c.polyline) : [deposito, ...c.paradas];
          new g.Polyline({ path: camino, map: mapa, strokeColor: c.color, strokeOpacity: 0.85, strokeWeight: 4 });
        }
        if (capas.some((c) => c.paradas.length)) mapa.fitBounds(limites, 40);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
    };
  }, [clave, deposito, capas]);
  if (error) return <p className="small quiet">{error}</p>;
  return <div ref={div} style={{ width: '100%', height: 360, borderRadius: 12, border: '1px solid var(--line)' }} aria-label="Mapa de las rutas" />;
}
