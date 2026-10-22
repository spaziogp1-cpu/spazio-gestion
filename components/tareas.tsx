'use client';

import Link from 'next/link';
import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { actualizarTarea, borrarTarea, cambiarEstadoTarea, crearTarea, type EstadoTarea } from '@/app/(app)/tareas/actions';
import { ESTADOS_TAREA, PRIORIDADES } from '@/lib/constantes';
import { diasEntre, fechaCorta, hoyAR, relativo } from '@/lib/fechas';
import type { Tarea } from '@/lib/tipos';

type Miembro = { id: string; nombre: string };

function enviar(accion: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => accion(fd));
  };
}

// ---------------------------------------------------------------------
// Alta rápida
// ---------------------------------------------------------------------
export function NuevaTarea({
  equipo,
  yo,
  pedidoId,
  objetivoId,
  visitaId,
  placeholder = 'Nueva tarea… (ej: llamar a Vidpro por la mesa de Koury)',
}: {
  equipo: Miembro[];
  yo: string;
  pedidoId?: string;
  objetivoId?: string;
  visitaId?: string;
  placeholder?: string;
}) {
  const [estado, accion, guardando] = useActionState<EstadoTarea, FormData>(crearTarea, {});
  const [abierto, setAbierto] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const titulo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (estado.ok) {
      form.current?.reset();
      titulo.current?.focus();
    }
  }, [estado]);

  return (
    <form ref={form} onSubmit={enviar(accion)} className="nueva-tarea">
      {pedidoId && <input type="hidden" name="pedido_id" value={pedidoId} />}
      {objetivoId && <input type="hidden" name="objetivo_id" value={objetivoId} />}
      {visitaId && <input type="hidden" name="visita_id" value={visitaId} />}
      <div className="acciones" style={{ flexWrap: 'nowrap' }}>
        <input ref={titulo} name="titulo" type="text" placeholder={placeholder} required onFocus={() => setAbierto(true)} aria-label="Nueva tarea" />
        <button className="btn btn-primario" disabled={guardando} aria-label="Agregar tarea">
          {guardando ? '…' : 'Agregar'}
        </button>
      </div>
      {abierto && (
        <div className="fila fila-3" style={{ marginTop: 8 }}>
          <div className="campo">
            <label>Responsable</label>
            <select name="responsable_id" defaultValue={yo}>
              <option value="equipo">Todo el equipo</option>
              {equipo.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>Para cuándo</label>
            <div className="fecha-hora">
              <input name="vencimiento" type="date" defaultValue={hoyAR()} aria-label="Día" />
              <input name="hora" type="time" step={900} aria-label="Hora (opcional)" title="Hora (opcional): va al calendario y avisa antes" />
            </div>
          </div>
          <div className="campo">
            <label>Prioridad</label>
            <select name="prioridad" defaultValue="media">
              {PRIORIDADES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      {estado.error && <p className="error-form" style={{ marginTop: 8 }}>{estado.error}</p>}
    </form>
  );
}

// ---------------------------------------------------------------------
// Una tarea
// ---------------------------------------------------------------------
export function FilaTarea({ t, equipo, contexto = true }: { t: Tarea; equipo: Miembro[]; contexto?: boolean }) {
  const [hecha, setHecha] = useState(t.estado === 'hecha');
  const [abierta, setAbierta] = useState(false);
  const [pendiente, iniciar] = useTransition();
  const [estadoForm, accion, guardando] = useActionState<EstadoTarea, FormData>(actualizarTarea.bind(null, t.id), {});
  useEffect(() => setHecha(t.estado === 'hecha'), [t.estado]);
  useEffect(() => {
    if (estadoForm.ok) setAbierta(false);
  }, [estadoForm]);

  const alternar = () => {
    const nuevo = !hecha;
    setHecha(nuevo);
    iniciar(async () => {
      const r = await cambiarEstadoTarea(t.id, nuevo ? 'hecha' : 'pendiente');
      if (r.error) setHecha(!nuevo);
    });
  };

  const trabar = () => {
    const motivo = prompt('¿Por qué está trabada? (opcional)', t.bloqueo ?? '');
    if (motivo === null) return;
    iniciar(async () => {
      await cambiarEstadoTarea(t.id, 'bloqueada', motivo);
    });
  };

  const dias = t.vencimiento ? diasEntre(hoyAR(), t.vencimiento) : null;

  return (
    <div className={`tarea${hecha ? ' tarea-hecha' : ''}${t.vencida && !hecha ? ' tarea-vencida' : ''}`}>
      <button
        type="button"
        className={`check${hecha ? ' check-on' : ''}`}
        onClick={alternar}
        disabled={pendiente}
        aria-label={hecha ? 'Marcar como pendiente' : 'Marcar como hecha'}
        aria-pressed={hecha}
      >
        {hecha ? '✓' : ''}
      </button>
      <div style={{ minWidth: 0, flex: 1 }}>
        <button type="button" className="tarea-titulo" onClick={() => setAbierta((a) => !a)}>
          {t.prioridad === 'alta' && !hecha && <span className="prioridad-alta" aria-label="Prioridad alta">!</span>}
          {t.titulo}
        </button>
        <div className="tarea-meta">
          <span>{t.responsable_nombre ?? 'Todo el equipo'}</span>
          {t.vencimiento && !hecha && (
            <span className={t.vencida ? 'mal' : dias === 0 ? 'hoy' : ''}>
              {dias !== null && dias >= -1 && dias <= 1 ? relativo(dias) : fechaCorta(t.vencimiento)}
              {t.hora ? ` · ${t.hora.slice(0, 5)}` : ''}
            </span>
          )}
          {t.estado === 'bloqueada' && <span className="chip chip-atrasado">Trabada{t.bloqueo ? `: ${t.bloqueo}` : ''}</span>}
          {t.estado === 'en_curso' && <span className="chip chip-en_fabricacion">En curso</span>}
          {contexto && t.pedido_id && (
            <Link href={`/pedidos/${t.pedido_id}`} className="enlace">
              #{t.pedido_numero} {t.pedido_cliente}
            </Link>
          )}
          {contexto && t.objetivo_id && (
            <Link href="/objetivos" className="enlace">
              {t.objetivo_titulo}
            </Link>
          )}
          {contexto && t.visita_id && t.visita_nombre && <span>Visita: {t.visita_nombre}</span>}
        </div>

        {abierta && (
          <form onSubmit={enviar(accion)} className="form-bloque" style={{ marginTop: 10 }}>
            <div className="campo">
              <label>Tarea</label>
              <input name="titulo" type="text" defaultValue={t.titulo} required />
            </div>
            <div className="campo">
              <label>Detalle</label>
              <textarea name="descripcion" defaultValue={t.descripcion ?? ''} style={{ minHeight: 60 }} />
            </div>
            <div className="fila fila-3">
              <div className="campo">
                <label>Responsable</label>
                <select name="responsable_id" defaultValue={t.responsable_id ?? 'equipo'}>
                  <option value="equipo">Todo el equipo</option>
                  {equipo.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="campo">
                <label>Para cuándo</label>
                <div className="fecha-hora">
                  <input name="vencimiento" type="date" defaultValue={t.vencimiento ?? ''} aria-label="Día" />
                  <input name="hora" type="time" step={900} defaultValue={t.hora?.slice(0, 5) ?? ''} aria-label="Hora (opcional)" />
                </div>
              </div>
              <div className="campo">
                <label>Prioridad</label>
                <select name="prioridad" defaultValue={t.prioridad}>
                  {PRIORIDADES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {estadoForm.error && <p className="error-form">{estadoForm.error}</p>}
            <div className="acciones">
              <button className="btn btn-primario btn-chico" disabled={guardando}>
                Guardar
              </button>
              {ESTADOS_TAREA.filter((e) => e.id !== t.estado && e.id !== 'hecha').map((e) =>
                e.id === 'bloqueada' ? (
                  <button key={e.id} type="button" className="btn btn-chico" onClick={trabar} disabled={pendiente}>
                    Está trabada
                  </button>
                ) : (
                  <button
                    key={e.id}
                    type="button"
                    className="btn btn-chico"
                    disabled={pendiente}
                    onClick={() => iniciar(async () => void (await cambiarEstadoTarea(t.id, e.id)))}
                  >
                    {e.id === 'en_curso' ? 'Empecé' : 'Volver a pendiente'}
                  </button>
                ),
              )}
              <button
                type="button"
                className="btn btn-chico btn-fantasma btn-peligro"
                style={{ marginLeft: 'auto' }}
                disabled={pendiente}
                onClick={() => confirm('¿Borrar esta tarea?') && iniciar(() => borrarTarea(t.id))}
              >
                Borrar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Lista agrupada: vencidas, hoy, próximas, sin fecha
// ---------------------------------------------------------------------
export function ListaTareas({ tareas, equipo, contexto = true, agrupar = true }: { tareas: Tarea[]; equipo: Miembro[]; contexto?: boolean; agrupar?: boolean }) {
  if (tareas.length === 0) return <p className="quiet small">No hay tareas.</p>;
  if (!agrupar) return <>{tareas.map((t) => <FilaTarea key={t.id} t={t} equipo={equipo} contexto={contexto} />)}</>;

  const hoy = hoyAR();
  const grupos: { titulo: string; tareas: Tarea[] }[] = [
    { titulo: 'Vencidas', tareas: tareas.filter((t) => t.estado !== 'hecha' && t.vencimiento && t.vencimiento < hoy) },
    { titulo: 'Hoy', tareas: tareas.filter((t) => t.estado !== 'hecha' && t.vencimiento === hoy) },
    { titulo: 'Próximas', tareas: tareas.filter((t) => t.estado !== 'hecha' && t.vencimiento && t.vencimiento > hoy) },
    { titulo: 'Sin fecha', tareas: tareas.filter((t) => t.estado !== 'hecha' && !t.vencimiento) },
    { titulo: 'Hechas', tareas: tareas.filter((t) => t.estado === 'hecha') },
  ];
  return (
    <>
      {grupos
        .filter((g) => g.tareas.length > 0)
        .map((g) => (
          <div key={g.titulo} className="grupo-tareas">
            <h3 className={g.titulo === 'Vencidas' ? 'mal' : ''}>
              {g.titulo} <span className="faint num">{g.tareas.length}</span>
            </h3>
            {g.tareas.map((t) => (
              <FilaTarea key={t.id} t={t} equipo={equipo} contexto={contexto} />
            ))}
          </div>
        ))}
    </>
  );
}
