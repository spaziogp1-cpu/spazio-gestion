'use client';

import { startTransition, useActionState, useState, useTransition } from 'react';
import { cambiarMiContrasena, crearClaveIA, traerDePlanillaOriginal, definirContrasena, enviarmeResumen, guardarMiembro, guardarAvisos, guardarParametros, importarTiendaNube, probarPlanilla, probarReporte, revocarClaveIA, type EstadoAjustes } from './actions';

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
            {m.nombre} {m.rol === 'admin' && <span className="chip">admin</span>} {m.rol === 'vendedor' && <span className="chip">vendedor</span>} {!m.activo && <span className="chip chip-cancelado">sin acceso</span>}
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
          Rol
          <select name="rol" defaultValue={m?.rol ?? 'equipo'}>
            <option value="equipo">Equipo</option>
            <option value="vendedor">Vendedor (no ve costos)</option>
            <option value="admin">Administrador</option>
          </select>
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
      {m && <ContrasenaDe miembroId={m.id} />}
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
      <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="checkbox" name="whatsapp_activo" defaultChecked={valores.whatsapp_activo === 'si'} disabled={!editable} /> Mandar el resumen
        diario por WhatsApp (si no, llega solo por email)
      </label>
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

export function ImportarTiendaNube() {
  const [pendiente, iniciar] = useTransition();
  const [estado, setEstado] = useState<EstadoAjustes>({});
  return (
    <div className="form-bloque">
      <div>
        <button type="button" className="btn" disabled={pendiente} onClick={() => iniciar(async () => setEstado(await importarTiendaNube(7)))}>
          {pendiente ? 'Buscando…' : 'Traer ventas pagadas de los últimos 7 días'}
        </button>
      </div>
      {estado.ok && <p className="aviso aviso-ok">{estado.ok}</p>}
      {estado.error && <p className="error-form">{estado.error}</p>}
    </div>
  );
}

type ClaveIA = { id: string; nombre: string; ultimos: string; creada_en: string; ultimo_uso: string | null };

export function AsistenteIA({ claves }: { claves: ClaveIA[] }) {
  const [pendiente, iniciar] = useTransition();
  const [nueva, setNueva] = useState<{ clave?: string; url?: string; error?: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const crear = (nombre: string) =>
    iniciar(async () => {
      setCopiado(false);
      setNueva(await crearClaveIA(nombre));
    });
  return (
    <div className="form-bloque">
      {claves.length > 0 && (
        <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
          {claves.map((c) => (
            <li key={c.id}>
              {c.nombre} · termina en <span className="num">{c.ultimos}</span> ·{' '}
              {c.ultimo_uso ? `usada ${new Date(c.ultimo_uso).toLocaleDateString('es-AR')}` : 'sin usar'}{' '}
              <button type="button" className="btn btn-fantasma btn-chico" disabled={pendiente} onClick={() => iniciar(async () => void (await revocarClaveIA(c.id)))}>
                Revocar
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="acciones">
        <button type="button" className="btn" disabled={pendiente} onClick={() => crear('Claude')}>
          {pendiente ? 'Creando…' : 'Conectar Claude'}
        </button>
        <button type="button" className="btn" disabled={pendiente} onClick={() => crear('ChatGPT')}>
          Conectar ChatGPT
        </button>
      </div>
      {nueva?.error && <p className="error-form">{nueva.error}</p>}
      {nueva?.url && (
        <div className="aviso aviso-ok" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <strong>Copiá esta dirección ahora: no se vuelve a mostrar.</strong>
          <code style={{ wordBreak: 'break-all', fontSize: 12 }}>{nueva.url}</code>
          <div>
            <button
              type="button"
              className="btn btn-chico"
              onClick={() => {
                void navigator.clipboard?.writeText(nueva.url!).then(() => setCopiado(true));
              }}
            >
              {copiado ? '✓ Copiada' : 'Copiar'}
            </button>
          </div>
          <span className="small">
            En Claude: Configuración → Conectores → Agregar conector personalizado. Nombre: Spazio, URL: esta dirección. Es personal: no la compartas.
          </span>
        </div>
      )}
    </div>
  );
}

// Un admin le define la contraseña inicial a alguien del equipo.
function ContrasenaDe({ miembroId }: { miembroId: string }) {
  const [estado, accion, guardando] = useActionState<EstadoAjustes, FormData>(definirContrasena.bind(null, miembroId), {});
  const [valor, setValor] = useState('');
  return (
    <div className="form-bloque" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
      <div className="campo">
        <label htmlFor={`pass-${miembroId}`}>Contraseña para entrar (mínimo 8 caracteres)</label>
        <div className="acciones" style={{ flexWrap: 'nowrap' }}>
          <input id={`pass-${miembroId}`} type="text" autoComplete="off" value={valor} onChange={(e) => setValor(e.target.value)} />
          <button
            type="button"
            className="btn btn-chico"
            disabled={guardando || valor.length < 8}
            onClick={() => {
              const fd = new FormData();
              fd.set('password', valor);
              startTransition(() => accion(fd));
            }}
          >
            {guardando ? 'Guardando…' : 'Definir'}
          </button>
        </div>
      </div>
      {estado.ok && <p className="aviso aviso-ok">{estado.ok}</p>}
      {estado.error && <p className="error-form">{estado.error}</p>}
    </div>
  );
}

// Cada persona crea o cambia su propia contraseña.
export function MiContrasena() {
  const [estado, accion, guardando] = useActionState<EstadoAjustes, FormData>(cambiarMiContrasena, {});
  return (
    <form onSubmit={enviar(accion)} className="form-bloque">
      <div className="fila fila-2">
        <div className="campo">
          <label htmlFor="mi-pass">Contraseña nueva</label>
          <input id="mi-pass" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <div className="campo">
          <label htmlFor="mi-pass2">Repetila</label>
          <input id="mi-pass2" name="password2" type="password" autoComplete="new-password" minLength={8} required />
        </div>
      </div>
      {estado.ok && <p className="aviso aviso-ok">{estado.ok}</p>}
      {estado.error && <p className="error-form">{estado.error}</p>}
      <div>
        <button className="btn btn-primario btn-chico" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </div>
    </form>
  );
}

export function TraerDeOriginal() {
  const [pendiente, iniciar] = useTransition();
  const [estado, setEstado] = useState<EstadoAjustes>({});
  return (
    <div className="form-bloque">
      <div className="acciones">
        <button type="button" className="btn btn-chico" disabled={pendiente} onClick={() => iniciar(async () => setEstado(await traerDePlanillaOriginal(true)))}>
          Ver qué traería
        </button>
        <button type="button" className="btn btn-chico" disabled={pendiente} onClick={() => iniciar(async () => setEstado(await traerDePlanillaOriginal(false)))}>
          {pendiente ? 'Revisando…' : 'Traer ahora'}
        </button>
      </div>
      {estado.ok && <p className="aviso aviso-ok">{estado.ok}</p>}
      {estado.error && <p className="error-form">{estado.error}</p>}
    </div>
  );
}

const NOMBRES_DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function FormAvisos({ valores, editable }: { valores: Record<string, string>; editable: boolean }) {
  const [estado, accion, guardando] = useActionState<EstadoAjustes, FormData>(guardarAvisos, {});
  const dias = (valores.reporte_dias ?? '1,2,3,4,5,6').split(',').map((d) => d.trim());
  return (
    <form onSubmit={enviar(accion)} className="form-bloque">
      <div className="fila fila-3">
        <div className="campo">
          <label htmlFor="av-manana">Reporte de la mañana</label>
          <input id="av-manana" name="reporte_manana_hora" type="time" step={300} defaultValue={valores.reporte_manana_hora ?? '08:30'} disabled={!editable} />
        </div>
        <div className="campo">
          <label htmlFor="av-tarde">Reporte de la tarde</label>
          <input id="av-tarde" name="reporte_tarde_hora" type="time" step={300} defaultValue={valores.reporte_tarde_hora ?? '18:00'} disabled={!editable} />
        </div>
        <div className="campo">
          <label htmlFor="av-min">Recordatorio (minutos antes)</label>
          <input id="av-min" name="recordatorio_minutos" type="number" min={5} max={240} defaultValue={valores.recordatorio_minutos ?? '40'} disabled={!editable} />
        </div>
      </div>
      <div className="campo">
        <span className="etiqueta">Días con reporte</span>
        <div className="acciones" style={{ gap: 12 }}>
          {NOMBRES_DIAS.map((n, i) => (
            <label key={n} className="small" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="checkbox" name={`dia_${i + 1}`} defaultChecked={dias.includes(String(i + 1))} disabled={!editable} /> {n}
            </label>
          ))}
        </div>
      </div>
      <div className="campo">
        <label htmlFor="av-zona">Zona horaria</label>
        <input id="av-zona" name="zona_horaria" type="text" defaultValue={valores.zona_horaria ?? 'America/Argentina/Buenos_Aires'} disabled={!editable} />
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

export function ProbarReportes() {
  const [pendiente, iniciar] = useTransition();
  const [estado, setEstado] = useState<EstadoAjustes & { id?: string }>({});
  const probar = (tipo: 'manana' | 'tarde') => iniciar(async () => setEstado(await probarReporte(tipo)));
  return (
    <div className="form-bloque">
      <div className="acciones">
        <button type="button" className="btn btn-chico" disabled={pendiente} onClick={() => probar('manana')}>
          Ver mi reporte de la mañana
        </button>
        <button type="button" className="btn btn-chico" disabled={pendiente} onClick={() => probar('tarde')}>
          Ver mi reporte de la tarde
        </button>
      </div>
      {estado.ok && (
        <p className="aviso aviso-ok">
          {estado.ok} {estado.id && <a href={`/avisos/${estado.id}`}>Abrirlo</a>}
        </p>
      )}
      {estado.error && <p className="error-form">{estado.error}</p>}
    </div>
  );
}
