'use client';

import Link from 'next/link';
import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { ESTADOS_VISITA, RESULTADOS_VISITA, nombreDe } from '@/lib/constantes';
import { fechaCorta, hoyAR, horaCorta, sumarDiasCorridos } from '@/lib/fechas';
import { linkWhatsApp } from '@/lib/formato';
import type { Visita } from '@/lib/tipos';
import { borrarVisita, cambiarEstadoVisita, cerrarVisita, crearVisita, reprogramarVisita, type EstadoVisita } from './actions';

type Miembro = { id: string; nombre: string };

function enviar(accion: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => accion(fd));
  };
}

// ---------------------------------------------------------------------
// Link de turnos online para mandarle al cliente
// ---------------------------------------------------------------------
export function LinkTurnos({ url, activo }: { url: string; activo: boolean }) {
  const [copiado, setCopiado] = useState(false);
  const mensaje = `¡Hola! Podés elegir el día y el horario para visitar nuestro showroom acá: ${url}`;
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      window.prompt('Copiá el link', url);
    }
  };
  return (
    <div className="form-bloque">
      <p className="small">
        Mandale este link al cliente: elige el día y el horario libre, y el turno aparece acá y en el calendario.
        {!activo && <strong> Ahora está apagado (se prende en Ajustes).</strong>}
      </p>
      <code className="small" style={{ wordBreak: 'break-all' }}>{url}</code>
      <div className="acciones">
        <button type="button" className="btn btn-chico btn-primario" onClick={copiar}>
          {copiado ? '¡Copiado!' : 'Copiar link'}
        </button>
        <a className="btn btn-chico" href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`} target="_blank" rel="noopener noreferrer">
          Enviar por WhatsApp
        </a>
        <a className="btn btn-chico btn-fantasma" href={url} target="_blank" rel="noopener noreferrer">
          Ver la página
        </a>
        <Link className="btn btn-chico btn-fantasma" href="/ajustes#turnos">
          Horarios
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Alta: con turno o "llegó sin turno"
// ---------------------------------------------------------------------
export function NuevaVisita({ equipo, yo }: { equipo: Miembro[]; yo: string }) {
  const [modo, setModo] = useState<null | 'turno' | 'sin_turno'>(null);
  const [estado, accion, guardando] = useActionState<EstadoVisita, FormData>(crearVisita, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) {
      form.current?.reset();
      setModo(null);
    }
  }, [estado]);

  if (!modo)
    return (
      <div className="acciones" style={{ alignItems: 'center' }}>
        <button type="button" className="btn btn-primario" onClick={() => setModo('sin_turno')}>
          Llegó alguien sin turno
        </button>
        <button type="button" className="btn" onClick={() => setModo('turno')}>
          + Agendar visita
        </button>
        {estado.ok && <span className="small" style={{ color: 'var(--ok)' }}>{estado.ok}</span>}
      </div>
    );

  const sinTurno = modo === 'sin_turno';
  return (
    <section className="card card-pad" style={{ maxWidth: 640 }}>
      <form ref={form} onSubmit={enviar(accion)} className="form-bloque">
        <h2>{sinTurno ? 'Llegó sin turno' : 'Agendar visita'}</h2>
        {sinTurno && <input type="hidden" name="sin_turno" value="1" />}
        <div className="fila fila-2">
          <div className="campo">
            <label htmlFor="v_nombre">Nombre</label>
            <input id="v_nombre" name="nombre" type="text" required autoFocus />
          </div>
          <div className="campo">
            <label htmlFor="v_tel">Teléfono</label>
            <input id="v_tel" name="telefono" type="tel" inputMode="tel" />
          </div>
        </div>
        {!sinTurno && (
          <div className="fila fila-2m">
            <div className="campo">
              <label htmlFor="v_fecha">Día</label>
              <input id="v_fecha" name="fecha" type="date" required defaultValue={sumarDiasCorridos(hoyAR(), 1)} />
            </div>
            <div className="campo">
              <label htmlFor="v_hora">Hora</label>
              <input id="v_hora" name="hora" type="time" step={900} defaultValue="11:00" />
            </div>
          </div>
        )}
        <div className="fila fila-2">
          <div className="campo">
            <label htmlFor="v_motivo">{sinTurno ? 'Qué buscaba' : 'Motivo'}</label>
            <input id="v_motivo" name="motivo" type="text" placeholder="Mesa alta para 8, ver colores…" />
          </div>
          <div className="campo">
            <label htmlFor="v_atiende">{sinTurno ? 'Quién atendió' : 'Quién atiende'}</label>
            <select id="v_atiende" name="atiende_id" defaultValue={yo}>
              {equipo.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
        {sinTurno && (
          <div className="campo">
            <label htmlFor="v_notas">Notas</label>
            <textarea id="v_notas" name="notas" style={{ minHeight: 60 }} placeholder="Qué le gustó, medidas, presupuesto…" />
          </div>
        )}
        {estado.error && <p className="error-form">{estado.error}</p>}
        <div className="acciones">
          <button className="btn btn-primario" disabled={guardando}>
            {guardando ? 'Guardando…' : sinTurno ? 'Registrar visita' : 'Agendar'}
          </button>
          <button type="button" className="btn" onClick={() => setModo(null)}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------
// Una visita
// ---------------------------------------------------------------------
export function FilaVisita({ v, equipo, mostrarFecha = false }: { v: Visita; equipo: Miembro[]; mostrarFecha?: boolean }) {
  const [panel, setPanel] = useState<null | 'cerrar' | 'reprogramar'>(null);
  const [pendiente, iniciar] = useTransition();
  const [estadoCierre, accionCierre, guardandoCierre] = useActionState<EstadoVisita, FormData>(cerrarVisita.bind(null, v.id), {});
  const [estadoRepro, accionRepro, guardandoRepro] = useActionState<EstadoVisita, FormData>(reprogramarVisita.bind(null, v.id), {});
  useEffect(() => {
    if (estadoCierre.ok || estadoRepro.ok) setPanel(null);
  }, [estadoCierre, estadoRepro]);

  const hoy = hoyAR();
  const pasada = v.fecha < hoy;
  const atiende = equipo.find((m) => m.id === v.atiende_id)?.nombre;
  const wa = linkWhatsApp(v.telefono);
  const cambiar = (estado: string) => iniciar(async () => void (await cambiarEstadoVisita(v.id, estado)));
  const chip =
    v.estado === 'vino' ? 'chip-lista' : v.estado === 'confirmada' ? 'chip-cliente_avisado' : v.estado === 'agendada' ? 'chip-pedido_fabrica' : 'chip-cancelado';

  const ventaHref = `/pedidos/nuevo?nombre=${encodeURIComponent(v.nombre)}${v.telefono ? `&telefono=${encodeURIComponent(v.telefono)}` : ''}&canal=showroom`;

  return (
    <div className="item" id={`visita-${v.id}`} style={{ scrollMarginTop: 80 }}>
      <div className="acciones" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <div style={{ display: 'flex', gap: 12, minWidth: 0 }}>
          <div className="visita-hora num">
            {mostrarFecha && <div className="xs faint">{fechaCorta(v.fecha)}</div>}
            {horaCorta(v.hora) || '—'}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="item-titulo">
              {v.nombre}
              {!v.con_turno && <span className="chip" style={{ marginLeft: 6 }}>Sin turno</span>}
              {v.origen === 'web' && <span className="chip" style={{ marginLeft: 6 }}>Reservó online</span>}
            </div>
            <div className="item-detalle">
              {[v.motivo, atiende && `atiende ${atiende}`].filter(Boolean).join(' · ') || '—'}
            </div>
            {v.resultado && <div className="xs" style={{ color: 'var(--accent)', fontWeight: 600 }}>{nombreDe(RESULTADOS_VISITA, v.resultado)}</div>}
            {v.notas && <div className="xs faint" style={{ whiteSpace: 'pre-wrap' }}>{v.notas}</div>}
          </div>
        </div>
        <span className={`chip ${chip}`}>{nombreDe(ESTADOS_VISITA, v.estado)}</span>
      </div>

      <div className="acciones" style={{ marginTop: 8 }}>
        {(v.estado === 'agendada' || v.estado === 'confirmada') && (
          <>
            {v.estado === 'agendada' && !pasada && (
              <button type="button" className="btn btn-chico" disabled={pendiente} onClick={() => cambiar('confirmada')}>
                Confirmó
              </button>
            )}
            <button type="button" className="btn btn-chico btn-primario" disabled={pendiente} onClick={() => setPanel('cerrar')}>
              Vino
            </button>
            <button type="button" className="btn btn-chico" disabled={pendiente} onClick={() => cambiar('no_vino')}>
              No vino
            </button>
            <button type="button" className="btn btn-chico" disabled={pendiente} onClick={() => setPanel(panel === 'reprogramar' ? null : 'reprogramar')}>
              Reprogramar
            </button>
            <button type="button" className="btn btn-chico btn-fantasma" disabled={pendiente} onClick={() => cambiar('cancelada')}>
              Canceló
            </button>
          </>
        )}
        {v.estado === 'vino' && (
          <>
            <button type="button" className="btn btn-chico" onClick={() => setPanel(panel === 'cerrar' ? null : 'cerrar')}>
              {v.resultado ? 'Editar resultado' : 'Cargar resultado'}
            </button>
            {v.resultado === 'compro' && !v.pedido_id && (
              <Link href={ventaHref} className="btn btn-chico btn-primario">
                Cargar la venta
              </Link>
            )}
          </>
        )}
        {(v.estado === 'no_vino' || v.estado === 'cancelada') && (
          <button type="button" className="btn btn-chico" onClick={() => setPanel('reprogramar')}>
            Volver a agendar
          </button>
        )}
        {wa && (
          <a href={wa} target="_blank" rel="noreferrer" className="btn btn-chico btn-fantasma">
            WhatsApp
          </a>
        )}
        <button
          type="button"
          className="btn btn-chico btn-fantasma btn-peligro"
          style={{ marginLeft: 'auto' }}
          disabled={pendiente}
          onClick={() => confirm('¿Borrar esta visita?') && iniciar(() => borrarVisita(v.id))}
        >
          Borrar
        </button>
      </div>

      {panel === 'reprogramar' && (
        <form onSubmit={enviar(accionRepro)} className="acciones" style={{ marginTop: 8, alignItems: 'flex-end' }}>
          <div className="campo">
            <label>Nuevo día</label>
            <input name="fecha" type="date" required defaultValue={v.fecha < hoy ? sumarDiasCorridos(hoy, 1) : v.fecha} />
          </div>
          <div className="campo">
            <label>Hora</label>
            <input name="hora" type="time" step={900} defaultValue={horaCorta(v.hora) || '11:00'} />
          </div>
          <button className="btn btn-primario btn-chico" disabled={guardandoRepro}>
            Guardar
          </button>
          {estadoRepro.error && <p className="error-form">{estadoRepro.error}</p>}
        </form>
      )}

      {panel === 'cerrar' && (
        <form onSubmit={enviar(accionCierre)} className="form-bloque" style={{ marginTop: 8 }}>
          <div className="segmentado">
            {RESULTADOS_VISITA.map((r) => (
              <label key={r.id}>
                <input type="radio" name="resultado" value={r.id} defaultChecked={v.resultado === r.id} />
                {r.nombre}
              </label>
            ))}
          </div>
          <div className="campo">
            <label>Notas</label>
            <textarea name="notas" defaultValue={v.notas ?? ''} style={{ minHeight: 60 }} placeholder="Qué le gustó, medidas, presupuesto…" />
          </div>
          <div className="fila fila-2">
            <div className="campo">
              <label>Seguimiento (opcional)</label>
              <input name="seguimiento" type="text" placeholder="Mandarle presupuesto, llamarlo…" />
            </div>
            <div className="campo">
              <label>Para cuándo</label>
              <input name="seguimiento_fecha" type="date" defaultValue={sumarDiasCorridos(hoy, 2)} />
            </div>
          </div>
          {estadoCierre.error && <p className="error-form">{estadoCierre.error}</p>}
          <div className="acciones">
            <button className="btn btn-primario btn-chico" disabled={guardandoCierre}>
              Guardar
            </button>
            <button type="button" className="btn btn-chico" onClick={() => setPanel(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
