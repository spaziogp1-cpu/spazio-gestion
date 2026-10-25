'use client';

import Link from 'next/link';
import { startTransition, useActionState, useEffect, useState, useTransition } from 'react';
import { franja, linkMapa, nombreEstadoEntrega, unidadesTexto, type Entrega } from '@/lib/entregas/tipos';
import { fechaCorta } from '@/lib/fechas';
import { linkWhatsApp } from '@/lib/formato';
import { confirmarUbicacion, guardarEntrega, sacarEntrega, ubicarEntrega, type EstadoEntregaForm } from './actions';

export type PedidoDeEntrega = {
  id: string;
  numero: number;
  cliente_nombre: string;
  productos: string;
  envio: string;
  etapa: string;
  fecha_limite: string;
  saldo: number;
};

const CHIP: Record<string, string> = {
  revisar: 'chip-atrasado',
  lista: 'chip-lista',
  propuesta: 'chip-embalada',
  confirmada: 'chip-envio_coordinado',
  en_camino: 'chip-envio_coordinado',
  entregada: 'chip-entregado',
  no_entregada: 'chip-atrasado',
  cancelada: 'chip-cancelado',
};

function enviar(accion: (fd: FormData) => void) {
  return (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    startTransition(() => accion(fd));
  };
}

export function FilaEntrega({ e, pedido, maps }: { e: Entrega; pedido?: PedidoDeEntrega; maps: boolean }) {
  const editable = e.estado === 'revisar' || e.estado === 'lista';
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, guardando] = useActionState<EstadoEntregaForm, FormData>(guardarEntrega.bind(null, e.id), {});
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<EstadoEntregaForm>({});
  const [sacando, setSacando] = useState(false);
  useEffect(() => {
    if (estado.ok) setAbierto(false);
  }, [estado]);

  const mapa = linkMapa(e);
  const wa = linkWhatsApp(e.recibe_telefono);
  const destino =
    e.tipo === 'expreso'
      ? [e.expreso_nombre && `Expreso ${e.expreso_nombre}`, e.direccion].filter(Boolean).join(' · ')
      : [e.direccion, e.piso_depto, e.localidad].filter(Boolean).join(', ');
  const acceso = [
    e.ascensor === 'si' ? 'con ascensor' : e.ascensor === 'no' ? 'sin ascensor' : null,
    e.ayuda_descarga ? 'necesita ayuda para subir' : null,
    e.instalacion ? 'con instalación' : null,
    e.acceso_notas,
  ].filter(Boolean);
  const correr = (f: () => Promise<EstadoEntregaForm>) => iniciar(async () => setMensaje(await f()));

  return (
    <div className="item" id={`entrega-${e.id}`} style={{ scrollMarginTop: 80 }}>
      <div className="acciones" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <div style={{ minWidth: 0 }}>
          <div className="item-titulo">
            {pedido ? (
              <Link href={`/pedidos/${pedido.id}`}>
                #{pedido.numero} {pedido.cliente_nombre}
              </Link>
            ) : (
              e.recibe_nombre
            )}
            {e.intento > 1 && <span className="chip" style={{ marginLeft: 6 }}>Intento {e.intento}</span>}
            {e.tipo === 'expreso' && <span className="chip" style={{ marginLeft: 6 }}>Expreso</span>}
          </div>
          <div className="item-detalle">{destino || <span style={{ color: 'var(--danger)' }}>Sin dirección</span>}</div>
          {pedido?.productos && <div className="xs faint">{pedido.productos}</div>}
          <div className="xs" style={{ marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span>
              {e.fecha_acordada ? fechaCorta(e.fecha_acordada) : 'Sin fecha'}
              {franja(e.franja_desde, e.franja_hasta) ? ` · ${franja(e.franja_desde, e.franja_hasta)}` : ' · sin franja (horario de la ruta)'}
            </span>
            <span className="faint">
              Carga {unidadesTexto(e.unidades)} · {e.minutos} min · {e.personas} {e.personas === 1 ? 'persona' : 'personas'}
            </span>
            {pedido && <span className="faint">Límite {fechaCorta(pedido.fecha_limite)}</span>}
          </div>
          {acceso.length > 0 && <div className="xs faint">{acceso.join(' · ')}</div>}
          {e.motivos.length > 0 && editable && (
            <ul className="xs" style={{ margin: '6px 0 0', paddingLeft: 18, color: 'var(--danger)' }}>
              {e.motivos.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
          {e.direccion_google && e.precision === 'aproximada' && !e.ubicacion_confirmada && (
            <div className="xs faint">Google la entendió como: {e.direccion_google}</div>
          )}
          {e.estado === 'cancelada' && e.notas && <div className="xs faint" style={{ whiteSpace: 'pre-wrap' }}>{e.notas}</div>}
        </div>
        <span className={`chip ${CHIP[e.estado] ?? ''}`}>{nombreEstadoEntrega(e.estado)}</span>
      </div>

      {editable && (
        <div className="acciones" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-chico btn-primario" onClick={() => setAbierto((a) => !a)}>
            {abierto ? 'Cerrar' : 'Editar datos'}
          </button>
          {maps && e.direccion && e.lat == null && (
            <button type="button" className="btn btn-chico" disabled={pendiente} onClick={() => correr(() => ubicarEntrega(e.id))}>
              Ubicar en el mapa
            </button>
          )}
          {e.lat != null && e.precision !== 'exacta' && !e.ubicacion_confirmada && (
            <button type="button" className="btn btn-chico" disabled={pendiente} onClick={() => correr(() => confirmarUbicacion(e.id))}>
              La ubicación es correcta
            </button>
          )}
          {mapa && (
            <a className="btn btn-chico btn-fantasma" href={mapa} target="_blank" rel="noopener noreferrer">
              Ver en Google Maps
            </a>
          )}
          {wa && (
            <a className="btn btn-chico btn-fantasma" href={wa} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
          )}
          {!sacando ? (
            <button type="button" className="btn btn-chico btn-fantasma" onClick={() => setSacando(true)}>
              Sacar de la lista
            </button>
          ) : (
            <form
              className="acciones"
              onSubmit={(ev) => {
                ev.preventDefault();
                const motivo = String(new FormData(ev.currentTarget).get('motivo') ?? '');
                correr(() => sacarEntrega(e.id, motivo));
              }}
            >
              <input name="motivo" type="text" placeholder="Por qué (retira, lo lleva el cliente…)" required style={{ minWidth: 220 }} />
              <button className="btn btn-chico btn-peligro" disabled={pendiente}>
                Sacar
              </button>
              <button type="button" className="btn btn-chico btn-fantasma" onClick={() => setSacando(false)}>
                No
              </button>
            </form>
          )}
        </div>
      )}
      {(mensaje.ok || mensaje.error) && <p className={`small ${mensaje.error ? 'error-form' : 'aviso aviso-ok'}`} style={{ marginTop: 6 }}>{mensaje.error ?? mensaje.ok}</p>}
      {estado.ok && !abierto && <p className="small aviso aviso-ok" style={{ marginTop: 6 }}>{estado.ok}</p>}

      {abierto && editable && (
        <form onSubmit={enviar(accion)} className="form-bloque" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
          {e.tipo === 'expreso' && (
            <div className="campo">
              <label htmlFor={`ex-${e.id}`}>Expreso que eligió el cliente</label>
              <input id={`ex-${e.id}`} name="expreso_nombre" type="text" defaultValue={e.expreso_nombre ?? ''} placeholder="Vía Cargo, Andreani, Cruz del Sur…" />
            </div>
          )}
          <div className="campo">
            <label htmlFor={`dir-${e.id}`}>{e.tipo === 'expreso' ? 'Dirección de la sucursal' : 'Dirección (calle y número)'}</label>
            <input id={`dir-${e.id}`} name="direccion" type="text" defaultValue={e.direccion ?? ''} />
          </div>
          <div className="fila fila-3">
            <div className="campo">
              <label htmlFor={`piso-${e.id}`}>Piso y depto</label>
              <input id={`piso-${e.id}`} name="piso_depto" type="text" defaultValue={e.piso_depto ?? ''} placeholder="3 B" />
            </div>
            <div className="campo">
              <label htmlFor={`loc-${e.id}`}>Localidad o barrio</label>
              <input id={`loc-${e.id}`} name="localidad" type="text" defaultValue={e.localidad ?? ''} placeholder="CABA" />
            </div>
            <div className="campo">
              <label htmlFor={`cp-${e.id}`}>CP</label>
              <input id={`cp-${e.id}`} name="codigo_postal" type="text" defaultValue={e.codigo_postal ?? ''} />
            </div>
          </div>
          <div className="campo">
            <label htmlFor={`co-${e.id}`}>
              Coordenadas <span className="quiet">(opcional: en Google Maps, tocá el punto y copiá los números)</span>
            </label>
            <input id={`co-${e.id}`} name="coordenadas" type="text" placeholder="-34.5975, -58.4372" />
          </div>
          <div className="fila fila-2">
            <div className="campo">
              <label htmlFor={`rn-${e.id}`}>Recibe</label>
              <input id={`rn-${e.id}`} name="recibe_nombre" type="text" defaultValue={e.recibe_nombre ?? ''} />
            </div>
            <div className="campo">
              <label htmlFor={`rt-${e.id}`}>Teléfono de quien recibe</label>
              <input id={`rt-${e.id}`} name="recibe_telefono" type="tel" defaultValue={e.recibe_telefono ?? ''} />
            </div>
          </div>
          <div className="fila fila-3">
            <div className="campo">
              <label htmlFor={`fe-${e.id}`}>Fecha acordada</label>
              <input id={`fe-${e.id}`} name="fecha_acordada" type="date" defaultValue={e.fecha_acordada ?? ''} />
            </div>
            <div className="campo">
              <label htmlFor={`fd-${e.id}`}>{e.tipo === 'expreso' ? 'Recibe desde' : 'Franja desde'} <span className="quiet">(opcional)</span></label>
              <input id={`fd-${e.id}`} name="franja_desde" type="time" step={900} defaultValue={e.franja_desde?.slice(0, 5) ?? ''} />
            </div>
            <div className="campo">
              <label htmlFor={`fh-${e.id}`}>{e.tipo === 'expreso' ? 'Recibe hasta' : 'Franja hasta'} <span className="quiet">(opcional)</span></label>
              <input id={`fh-${e.id}`} name="franja_hasta" type="time" step={900} defaultValue={e.franja_hasta?.slice(0, 5) ?? ''} />
            </div>
          </div>
          {e.tipo === 'cliente' && (
            <>
              <div className="campo">
                <span className="etiqueta">Ascensor</span>
                <div className="acciones" style={{ gap: 14 }}>
                  {[
                    ['si', 'Sí, entra la mesa'],
                    ['no', 'No hay o no entra'],
                    ['no_sabe', 'No sabemos'],
                  ].map(([v, n]) => (
                    <label key={v} className="small" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input type="radio" name="ascensor" value={v} defaultChecked={(e.ascensor ?? 'no_sabe') === v} /> {n}
                    </label>
                  ))}
                </div>
              </div>
              <div className="acciones" style={{ gap: 14 }}>
                <label className="small" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input type="checkbox" name="ayuda_descarga" defaultChecked={e.ayuda_descarga} /> Necesita ayuda para subir
                </label>
                <label className="small" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input type="checkbox" name="instalacion" defaultChecked={e.instalacion} /> Con instalación
                </label>
              </div>
              <div className="campo">
                <label htmlFor={`ac-${e.id}`}>Acceso</label>
                <input id={`ac-${e.id}`} name="acceso_notas" type="text" defaultValue={e.acceso_notas ?? ''} placeholder="Barrio cerrado, portero hasta las 18, no hay dónde estacionar…" />
              </div>
            </>
          )}
          <div className="fila fila-2">
            <div className="campo">
              <label htmlFor={`un-${e.id}`}>
                Carga <span className="quiet">(ahora {unidadesTexto(e.unidades)}; 1 = una ratona; vacío = automática)</span>
              </label>
              <input id={`un-${e.id}`} name="unidades_manual" type="number" min={0.25} max={20} step={0.25} defaultValue={e.unidades_manual ?? ''} placeholder="Automática" />
            </div>
            <div className="campo">
              <label htmlFor={`pe-${e.id}`}>
                Personas <span className="quiet">(ahora {e.personas}; vacío = automático)</span>
              </label>
              <input id={`pe-${e.id}`} name="personas_manual" type="number" min={1} max={4} defaultValue={e.personas_manual ?? ''} placeholder="Automático" />
            </div>
          </div>
          <div className="campo">
            <label htmlFor={`no-${e.id}`}>Notas para la entrega</label>
            <textarea id={`no-${e.id}`} name="notas" rows={2} defaultValue={e.notas ?? ''} />
          </div>
          {estado.error && <p className="error-form">{estado.error}</p>}
          <div>
            <button className="btn btn-primario btn-chico" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
