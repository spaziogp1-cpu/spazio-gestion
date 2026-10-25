'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { linkRecorrido } from '@/lib/entregas/planificador';
import { unidadesTexto } from '@/lib/entregas/tipos';
import { plata } from '@/lib/formato';
import { confirmarRuta, deshacerRuta, moverEntrega, proponer, reordenar, type EstadoPlan } from './actions';
import { MapaRutas, type CapaMapa } from './mapa';

type Punto = { lat: number; lng: number };
export type ParadaVista = {
  id: string;
  llegada: string | null;
  salida: string | null;
  minutosViaje: number | null;
  km: number | null;
  fueraDeFranja: boolean;
  espera: number;
  entrega: {
    id: string;
    pedidoId: string;
    titulo: string;
    productos: string;
    direccion: string;
    franja: string;
    unidades: number;
    personas: number;
    lat: number | null;
    lng: number | null;
    estado: string;
  };
};
export type RutaVista = {
  id: string;
  vehiculo: { id: string; nombre: string; fletero: string | null; capacidad: number; vuelve_deposito: boolean; personas_max: number } | null;
  estado: string;
  salida: string | null;
  regreso: string | null;
  km: number | null;
  minutos: number | null;
  costo: number | null;
  polyline: string | null;
  calculo: string;
  desactualizada: boolean;
  conCambios: string | null;
  paradas: ParadaVista[];
};

const COLORES = ['#c2410c', '#2563eb', '#16a34a', '#9333ea'];
const duracion = (m: number | null) => (m == null ? '—' : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`);

export function PlanDelDia({
  fecha,
  vehiculos,
  rutas,
  omitidas,
  sinPlanificar,
  deposito,
  google,
  claveMapa,
}: {
  fecha: string;
  vehiculos: { id: string; nombre: string; fletero: string | null; trabaja: boolean }[];
  rutas: RutaVista[];
  omitidas: { entrega: ParadaVista['entrega']; motivo: string }[];
  sinPlanificar: ParadaVista['entrega'][];
  deposito: Punto | null;
  google: boolean;
  claveMapa: string | null;
}) {
  const confirmadas = new Set(rutas.filter((r) => r.estado !== 'propuesta').map((r) => r.vehiculo?.id));
  const [elegidos, setElegidos] = useState<string[]>(vehiculos.filter((v) => v.trabaja && !confirmadas.has(v.id)).map((v) => v.id));
  const [estado, setEstado] = useState<EstadoPlan>({});
  const [pendiente, iniciar] = useTransition();
  const correr = (f: () => Promise<EstadoPlan>) => iniciar(async () => setEstado(await f()));
  const propuestas = rutas.filter((r) => r.estado === 'propuesta');
  const hayDesactualizada = propuestas.some((r) => r.desactualizada) || (propuestas.length > 0 && sinPlanificar.length > 0);
  const listas = sinPlanificar.length + omitidas.length + propuestas.reduce((s, r) => s + r.paradas.length, 0);

  const capas: CapaMapa[] = useMemo(
    () =>
      rutas.map((r, i) => ({
        color: COLORES[i % COLORES.length],
        polyline: r.polyline,
        paradas: r.paradas.filter((p) => p.entrega.lat != null).map((p, j) => ({ lat: p.entrega.lat!, lng: p.entrega.lng!, n: j + 1, titulo: p.entrega.titulo })),
      })),
    [rutas],
  );

  return (
    <div className="form-bloque">
      <section className="card">
        <div className="seccion form-bloque">
          <div className="campo">
            <span className="etiqueta">Vehículos para este día</span>
            <div className="acciones" style={{ gap: 14 }}>
              {vehiculos.map((v) => (
                <label key={v.id} className="small" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={elegidos.includes(v.id)}
                    disabled={confirmadas.has(v.id)}
                    onChange={(ev) => setElegidos((x) => (ev.target.checked ? [...x, v.id] : x.filter((y) => y !== v.id)))}
                  />
                  {v.nombre}
                  {v.fletero ? ` (${v.fletero})` : ''}
                  {confirmadas.has(v.id) ? ' · ya tiene ruta confirmada' : !v.trabaja ? ' · no suele trabajar este día' : ''}
                </label>
              ))}
              {vehiculos.length === 0 && (
                <span className="small">
                  No hay vehículos: cargalos en <Link href="/ajustes#vehiculos">Ajustes → Vehículos</Link>.
                </span>
              )}
            </div>
          </div>
          <div className="acciones">
            <button type="button" className="btn btn-primario" disabled={pendiente || !deposito || !elegidos.length || listas === 0} onClick={() => correr(() => proponer(fecha, elegidos))}>
              {pendiente ? 'Calculando…' : propuestas.length ? 'Volver a proponer' : 'Proponer recorrido'}
            </button>
            <span className="small quiet">
              {listas} {listas === 1 ? 'entrega lista' : 'entregas listas'} para este día · {google ? 'con Google Route Optimization' : 'con tiempos estimados (sin Google)'}
            </span>
          </div>
          {hayDesactualizada && <p className="aviso" style={{ background: 'var(--c-amarillo-bg)' }}>Hubo cambios desde esta propuesta (entregas nuevas o editadas): conviene volver a proponer.</p>}
          {estado.error && <p className="error-form">{estado.error}</p>}
          {estado.ok && <p className="aviso aviso-ok">{estado.ok}</p>}
          {estado.aviso && <p className="small quiet">{estado.aviso}</p>}
        </div>
      </section>

      {claveMapa && deposito && rutas.length > 0 && <MapaRutas clave={claveMapa} deposito={deposito} capas={capas} />}

      {rutas.map((r, i) => (
        <TarjetaRuta key={r.id} r={r} color={COLORES[i % COLORES.length]} fecha={fecha} deposito={deposito} otros={vehiculos.filter((v) => v.id !== r.vehiculo?.id && !confirmadas.has(v.id))} />
      ))}

      {(omitidas.length > 0 || sinPlanificar.length > 0) && (
        <section className="card">
          <div className="card-titulo">
            <h2>No entran en este día</h2>
          </div>
          <div className="seccion">
            {[...omitidas, ...sinPlanificar.map((e) => ({ entrega: e, motivo: 'Todavía no está en ninguna propuesta' }))].map(({ entrega: e, motivo }) => (
              <div key={e.id} className="item">
                <div className="acciones" style={{ justifyContent: 'space-between' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="item-titulo">
                      <Link href={`/pedidos/${e.pedidoId}`}>{e.titulo}</Link>
                    </div>
                    <div className="item-detalle">
                      {e.direccion} · {e.franja} · carga {unidadesTexto(e.unidades)}
                    </div>
                    <div className="xs" style={{ color: 'var(--danger)' }}>{motivo}</div>
                  </div>
                  <select
                    aria-label="Pasar a un vehículo"
                    defaultValue=""
                    disabled={pendiente}
                    onChange={(ev) => ev.target.value && correr(() => moverEntrega(fecha, e.id, ev.target.value))}
                  >
                    <option value="">Pasar a…</option>
                    {vehiculos
                      .filter((v) => !confirmadas.has(v.id))
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.nombre}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            ))}
            <p className="small quiet" style={{ marginTop: 8 }}>
              Para pasarlas a otro día, cambiá la fecha acordada en <Link href="/entregas?ver=listas">Entregas</Link>.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

function TarjetaRuta({ r, color, fecha, deposito, otros }: { r: RutaVista; color: string; fecha: string; deposito: Punto | null; otros: { id: string; nombre: string }[] }) {
  const [estado, setEstado] = useState<EstadoPlan>({});
  const [pendiente, iniciar] = useTransition();
  const correr = (f: () => Promise<EstadoPlan>) => iniciar(async () => setEstado(await f()));
  const propuesta = r.estado === 'propuesta';
  const carga = r.paradas.reduce((s, p) => s + p.entrega.unidades, 0);
  const tarde = r.paradas.filter((p) => p.fueraDeFranja).length;
  const orden = r.paradas.map((p) => p.entrega.id);
  const mover = (i: number, d: -1 | 1) => {
    const x = [...orden];
    [x[i], x[i + d]] = [x[i + d], x[i]];
    correr(() => reordenar(r.id, x));
  };
  const puntos = r.paradas.filter((p) => p.entrega.lat != null).map((p) => ({ lat: p.entrega.lat!, lng: p.entrega.lng! }));
  const nombreEstado = { propuesta: 'Propuesta', confirmada: 'Confirmada', en_curso: 'En curso', terminada: 'Terminada' }[r.estado] ?? r.estado;

  return (
    <section className="card" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="card-titulo">
        <h2>
          {r.vehiculo?.nombre ?? 'Vehículo'}
          {r.vehiculo?.fletero ? ` · ${r.vehiculo.fletero}` : ''}
        </h2>
        <span className={`chip ${propuesta ? 'chip-embalada' : 'chip-envio_coordinado'}`}>{nombreEstado}</span>
      </div>
      <div className="seccion form-bloque">
        <p className="small">
          Sale {r.salida ?? '—'}
          {r.regreso ? ` · vuelve ${r.regreso}` : ''} · {duracion(r.minutos)} · {r.km ?? '—'} km · carga {unidadesTexto(carga)} de {unidadesTexto(r.vehiculo?.capacidad ?? 0)}
          {r.costo ? ` · costo estimado ${plata(r.costo)}` : ''}
          <span className="quiet"> · {r.calculo === 'google' ? 'calculado con Google' : 'tiempos estimados'}</span>
        </p>
        {tarde > 0 && <p className="error-form">{tarde === 1 ? 'Una parada llega' : `${tarde} paradas llegan`} fuera de la franja: reordená o pasala a otro vehículo.</p>}
        {r.conCambios && <p className="aviso" style={{ background: 'var(--c-amarillo-bg)' }}>Cambios después de confirmar: {r.conCambios}. Deshacé la confirmación y volvé a proponer el día.</p>}
        <ol style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
          {r.paradas.map((p, i) => {
            const cancelada = p.entrega.estado === 'cancelada';
            return (
              <li key={p.id} className="item" style={{ display: 'grid', gridTemplateColumns: '56px 1fr auto', gap: 10, opacity: cancelada ? 0.55 : 1 }}>
                <div className="num">
                  <div style={{ fontWeight: 700, color: p.fueraDeFranja ? 'var(--danger)' : undefined }}>{p.llegada ?? '—'}</div>
                  <div className="xs faint">
                    {i + 1}.{p.espera > 0 ? ` espera ${p.espera}′` : ''}
                  </div>
                </div>
                <div style={{ minWidth: 0, textDecoration: cancelada ? 'line-through' : undefined }}>
                  <div className="item-titulo">
                    <Link href={`/pedidos/${p.entrega.pedidoId}`}>{p.entrega.titulo}</Link>
                  </div>
                  <div className="item-detalle">{p.entrega.direccion}</div>
                  <div className="xs faint">
                    Franja {p.entrega.franja} · carga {unidadesTexto(p.entrega.unidades)} · {p.entrega.personas} {p.entrega.personas === 1 ? 'persona' : 'personas'}
                    {p.minutosViaje != null ? ` · ${p.minutosViaje} min de viaje` : ''}
                    {p.km != null ? ` (${p.km} km)` : ''}
                  </div>
                </div>
                {propuesta && (
                  <div className="acciones" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span className="acciones" style={{ gap: 4 }}>
                      <button type="button" className="btn btn-chico" aria-label="Subir" disabled={pendiente || i === 0} onClick={() => mover(i, -1)}>
                        ↑
                      </button>
                      <button type="button" className="btn btn-chico" aria-label="Bajar" disabled={pendiente || i === r.paradas.length - 1} onClick={() => mover(i, 1)}>
                        ↓
                      </button>
                    </span>
                    <select aria-label="Mover a" defaultValue="" disabled={pendiente} onChange={(ev) => ev.target.value && correr(() => moverEntrega(fecha, p.entrega.id, ev.target.value === 'quitar' ? null : ev.target.value))}>
                      <option value="">Mover…</option>
                      {otros.map((v) => (
                        <option key={v.id} value={v.id}>
                          A {v.nombre}
                        </option>
                      ))}
                      <option value="quitar">Sacar de la ruta</option>
                    </select>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <div className="acciones">
          {propuesta && (
            <button type="button" className="btn btn-primario btn-chico" disabled={pendiente || !r.paradas.length} onClick={() => correr(() => confirmarRuta(r.id))}>
              Confirmar ruta
            </button>
          )}
          {(r.estado === 'confirmada' || propuesta) && (
            <button type="button" className="btn btn-chico btn-fantasma" disabled={pendiente} onClick={() => correr(() => deshacerRuta(r.id))}>
              {propuesta ? 'Descartar' : 'Deshacer confirmación'}
            </button>
          )}
          {deposito && puntos.length > 0 && (
            <a className="btn btn-chico btn-fantasma" href={linkRecorrido(deposito, puntos, r.vehiculo?.vuelve_deposito ?? true)} target="_blank" rel="noopener noreferrer">
              Ver recorrido en Google Maps
            </a>
          )}
        </div>
        {estado.error && <p className="error-form">{estado.error}</p>}
        {estado.ok && <p className="aviso aviso-ok">{estado.ok}</p>}
      </div>
    </section>
  );
}
