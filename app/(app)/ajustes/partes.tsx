'use client';

import { startTransition, useActionState, useState, useTransition } from 'react';
import { enviarmeResumen, guardarMiembro, guardarParametros, probarPlanilla, type EstadoAjustes } from './actions';

type Miembro = { id: string; nombre: string; alias_planilla: string | null; email: string; telefono: string | null; rol: string; activo: boolean };

function enviar(accion: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => accion(fd));
  };
}

export function FormMiembro({ m, editable }: { m: Miembro | null; editable: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, guardando] = useActionState<EstadoAjustes, FormData>(guardarMiembro.bind(null, m?.id ?? null), {});

  if (!abierto)
    return m ? (
      <div className="item acciones" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 600 }}>
            {m.nombre} {m.rol === 'admin' && <span className="chip">admin</span>} {!m.activo && <span className="chip chip-cancelado">sin acceso</span>}
          </div>
          <div className="small quiet">{[m.email, m.telefono, m.alias_planilla && `en la planilla: ${m.alias_planilla}`].filter(Boolean).join(' · ')}</div>
        </div>
        {editable && (
          <button type="button" className="btn btn-chico" onClick={() => setAbierto(true)}>
            Editar
          </button>
        )}
      </div>
    ) : editable ? (
      <button type="button" className="btn btn-chico" style={{ marginTop: 8 }} onClick={() => setAbierto(true)}>
        + Agregar persona
      </button>
    ) : null;

  return (
    <form onSubmit={enviar(accion)} className="item form-bloque">
      <div className="fila fila-2">
        <div className="campo">
          <label>Nombre</label>
          <input name="nombre" type="text" defaultValue={m?.nombre} required />
        </div>
        <div className="campo">
          <label>Email con el que entra</label>
          <input name="email" type="email" defaultValue={m?.email} required />
        </div>
      </div>
      <div className="fila fila-2">
        <div className="campo">
          <label>Celular (para WhatsApp)</label>
          <input name="telefono" type="tel" defaultValue={m?.telefono ?? ''} placeholder="11 2345-6789" />
        </div>
        <div className="campo">
          <label>Cómo figura en la planilla</label>
          <input name="alias_planilla" type="text" defaultValue={m?.alias_planilla ?? ''} placeholder="Tete, Agui…" />
        </div>
      </div>
      <div className="acciones" style={{ alignItems: 'center' }}>
        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" name="activo" defaultChecked={m?.activo ?? true} /> Tiene acceso
        </label>
        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" name="rol" value="admin" defaultChecked={m?.rol === 'admin'} /> Administrador
        </label>
      </div>
      {estado.error && <p className="error-form">{estado.error}</p>}
      <div className="acciones">
        <button className="btn btn-primario btn-chico" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="btn btn-chico" onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function FormParametros({ valores, editable }: { valores: Record<string, string>; editable: boolean }) {
  const [estado, accion, guardando] = useActionState<EstadoAjustes, FormData>(guardarParametros, {});
  return (
    <form onSubmit={enviar(accion)} className="form-bloque">
      <div className="fila fila-3">
        <div className="campo">
          <label>Plazo de entrega (días)</label>
          <input name="plazo_entrega_dias" type="number" min={1} defaultValue={valores.plazo_entrega_dias ?? '49'} disabled={!editable} />
        </div>
        <div className="campo">
          <label>Tipo de días</label>
          <select name="plazo_entrega_tipo" defaultValue={valores.plazo_entrega_tipo ?? 'corridos'} disabled={!editable}>
            <option value="corridos">Corridos</option>
            <option value="habiles">Hábiles</option>
          </select>
        </div>
        <div className="campo">
          <label>Avisar antes del vencimiento (días)</label>
          <input name="aviso_dias_antes" type="number" min={0} defaultValue={valores.aviso_dias_antes ?? '3'} disabled={!editable} />
        </div>
      </div>
      {estado.error && <p className="error-form">{estado.error}</p>}
      {estado.ok && <p className="aviso aviso-ok">{estado.ok}</p>}
      {editable && (
        <div>
          <button className="btn btn-primario btn-chico" disabled={guardando}>
            Guardar
          </button>
        </div>
      )}
    </form>
  );
}

export function ProbarResumen() {
  const [pendiente, iniciar] = useTransition();
  const [estado, setEstado] = useState<EstadoAjustes>({});
  return (
    <div className="form-bloque">
      <div>
        <button
          type="button"
          className="btn"
          disabled={pendiente}
          onClick={() =>
            iniciar(async () => {
              setEstado(await enviarmeResumen());
            })
          }
        >
          {pendiente ? 'Enviando…' : 'Enviarme el resumen de hoy'}
        </button>
      </div>
      {estado.ok && <p className="aviso aviso-ok">{estado.ok}</p>}
      {estado.error && <p className="error-form">{estado.error}</p>}
    </div>
  );
}

export function ProbarPlanilla() {
  const [pendiente, iniciar] = useTransition();
  const [estado, setEstado] = useState<EstadoAjustes>({});
  return (
    <div className="form-bloque">
      <div>
        <button type="button" className="btn" disabled={pendiente} onClick={() => iniciar(async () => setEstado(await probarPlanilla()))}>
          {pendiente ? 'Probando…' : 'Probar conexión y escribir pendientes'}
        </button>
      </div>
      {estado.ok && <p className="aviso aviso-ok">{estado.ok}</p>}
      {estado.error && <p className="error-form">{estado.error}</p>}
    </div>
  );
}
