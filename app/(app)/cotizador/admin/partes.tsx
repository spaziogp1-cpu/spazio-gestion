'use client';

import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { aumentoMasivo, cambiarPrecio, guardarAjustes, guardarColor, type EstadoPanel } from './actions';

const numero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const mostrarPrecio = (n: number | null | undefined) => (n == null ? '' : numero.format(n));

function enviar(accion: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => accion(fd));
  };
}

/** Un precio editable: se guarda al salir del campo o con Enter. */
export function CeldaPrecio({
  insumoId,
  variante,
  referencia = null,
  tarifaId,
  precio,
  etiqueta,
}: {
  insumoId: string;
  variante: Record<string, string>;
  referencia?: number | null;
  tarifaId: number | string | null;
  precio: number | null;
  etiqueta: string;
}) {
  const [valor, setValor] = useState(mostrarPrecio(precio));
  const [guardado, setGuardado] = useState(mostrarPrecio(precio));
  const [estado, setEstado] = useState<'ok' | 'error' | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const tiempo = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValor(mostrarPrecio(precio));
    setGuardado(mostrarPrecio(precio));
  }, [precio]);
  useEffect(() => () => void (tiempo.current && clearTimeout(tiempo.current)), []);

  const guardar = () => {
    if (valor.trim() === guardado.trim()) return;
    if (valor.trim() === '' && tarifaId != null && !confirm(`¿Quitar el precio de ${etiqueta}?`)) {
      setValor(guardado);
      return;
    }
    empezar(async () => {
      const r = await cambiarPrecio(insumoId, variante, referencia, tarifaId, valor);
      if (r.error) {
        setEstado('error');
        setMensaje(r.error);
        return;
      }
      const nuevo = mostrarPrecio(r.precio ?? null);
      setValor(nuevo);
      setGuardado(nuevo);
      setEstado('ok');
      setMensaje(null);
      if (tiempo.current) clearTimeout(tiempo.current);
      tiempo.current = setTimeout(() => setEstado(null), 1800);
    });
  };

  return (
    <span className="precio-celda" data-estado={pendiente ? 'guardando' : (estado ?? undefined)}>
      <input
        type="text"
        inputMode="decimal"
        value={valor}
        placeholder="—"
        aria-label={`Precio de ${etiqueta}`}
        title={mensaje ?? undefined}
        onChange={(e) => {
          setValor(e.target.value);
          setEstado(null);
        }}
        onBlur={guardar}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setValor(guardado);
            setEstado(null);
          }
        }}
      />
      {estado === 'error' && mensaje && <span className="precio-error" role="alert">{mensaje}</span>}
    </span>
  );
}

type Ajuste = { clave: string; nombre: string; valor: number; nota: string | null };
const ES_PORCENTAJE = new Set(['recargo_cuotas', 'tope_descuento', 'ajuste_vidpro']);

export function FormAjustes({ ajustes }: { ajustes: Ajuste[] }) {
  const [estado, accion, guardando] = useActionState<EstadoPanel, FormData>(guardarAjustes, {});
  return (
    <form onSubmit={enviar(accion)} className="form-bloque">
      <div className="fila fila-2">
        {ajustes.map((a) => {
          const pct = ES_PORCENTAJE.has(a.clave);
          return (
            <div className="campo" key={a.clave}>
              <label htmlFor={`aj-${a.clave}`}>
                {a.nombre}
                {pct ? ' (%)' : a.clave === 'redondeo' ? ' ($)' : a.clave === 'validez_dias' ? ' (días)' : ''}
              </label>
              <input
                id={`aj-${a.clave}`}
                name={a.clave}
                type="number"
                step="any"
                min={0}
                defaultValue={pct ? Math.round(a.valor * 10000) / 100 : a.valor}
              />
              {a.nota && <span className="ayuda">{a.nota}</span>}
            </div>
          );
        })}
      </div>
      {estado.error && <p className="error-form">{estado.error}</p>}
      <div className="acciones" style={{ alignItems: 'center' }}>
        <button className="btn btn-primario btn-chico" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar reglas'}
        </button>
        {estado.ok && <span className="small" style={{ color: 'var(--ok)' }}>{estado.ok}</span>}
      </div>
    </form>
  );
}

export function FormAumento({ proveedores, tipos }: { proveedores: { id: string; nombre: string }[]; tipos: { valor: string; nombre: string }[] }) {
  const [estado, accion, guardando] = useActionState<EstadoPanel, FormData>(aumentoMasivo, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado]);
  return (
    <form
      ref={form}
      className="form-bloque"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const prov = proveedores.find((p) => p.id === fd.get('proveedor_id'))?.nombre ?? 'ese proveedor';
        const tipo = tipos.find((t) => t.valor === fd.get('tipo'))?.nombre;
        const pct = String(fd.get('porcentaje') ?? '');
        if (!confirm(`¿Cambiar ${pct}% todos los precios de ${prov}${tipo ? ` (${tipo.toLowerCase()})` : ''}? Los presupuestos ya hechos no cambian.`)) return;
        startTransition(() => accion(fd));
      }}
    >
      <div className="fila fila-3">
        <div className="campo">
          <label htmlFor="au-prov">Proveedor</label>
          <select id="au-prov" name="proveedor_id" required defaultValue="">
            <option value="" disabled>
              Elegir…
            </option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="au-tipo">Qué precios</label>
          <select id="au-tipo" name="tipo" defaultValue="">
            <option value="">Todos</option>
            {tipos.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="au-pct">Aumento (%)</label>
          <input id="au-pct" name="porcentaje" type="number" step="any" placeholder="8" required />
        </div>
      </div>
      <div className="campo">
        <label htmlFor="au-nota">Nota (opcional)</label>
        <input id="au-nota" name="nota" type="text" placeholder="Lista de noviembre" />
      </div>
      {estado.error && <p className="error-form">{estado.error}</p>}
      <div className="acciones" style={{ alignItems: 'center' }}>
        <button className="btn btn-chico" disabled={guardando}>
          {guardando ? 'Aplicando…' : 'Aplicar aumento'}
        </button>
        {estado.ok && <span className="small" style={{ color: 'var(--ok)' }}>{estado.ok}</span>}
      </div>
    </form>
  );
}

type Color = { id: string; valor: string; etiqueta: string; grupos: string[]; muestra: string | null; activo: boolean };
const GRUPOS_COLOR = [
  { valor: '', nombre: 'Incoloro (sin grupo)' },
  { valor: 'gris-bronce', nombre: 'Gris / bronce (float)' },
  { valor: 'color', nombre: 'Color (laminado)' },
  { valor: 'blanco', nombre: 'Blanco (laminado)' },
  { valor: 'gris-oscuro', nombre: 'Gris oscuro (laminado)' },
];

export function FilaColor({ color }: { color: Color | null }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, guardando] = useActionState<EstadoPanel, FormData>(guardarColor.bind(null, color?.id ?? null), {});
  useEffect(() => {
    if (estado.ok) setAbierto(false);
  }, [estado]);
  const grupo = color?.grupos[0] ?? '';

  if (!abierto)
    return color ? (
      <div className="item acciones" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="muestra-color" style={{ background: color.muestra ?? 'var(--surface-2)' }} aria-hidden="true" />
          <div>
            <div style={{ fontWeight: 600 }}>
              {color.etiqueta} {!color.activo && <span className="chip chip-cancelado">no se ofrece</span>}
            </div>
            <div className="small quiet">{GRUPOS_COLOR.find((g) => g.valor === grupo)?.nombre ?? (grupo || 'Sin grupo')}</div>
          </div>
        </div>
        <button type="button" className="btn btn-chico" onClick={() => setAbierto(true)}>
          Editar
        </button>
      </div>
    ) : (
      <div className="acciones" style={{ marginTop: 8, alignItems: 'center' }}>
        <button type="button" className="btn btn-chico" onClick={() => setAbierto(true)}>
          + Agregar color
        </button>
        {estado.ok && <span className="small" style={{ color: 'var(--ok)' }}>{estado.ok}</span>}
      </div>
    );

  return (
    <form onSubmit={enviar(accion)} className="item form-bloque">
      <div className="fila fila-3">
        <div className="campo">
          <label>Nombre</label>
          <input name="etiqueta" type="text" defaultValue={color?.etiqueta} placeholder="Ámbar" required />
        </div>
        <div className="campo">
          <label>Columna de precio en Vidpro</label>
          <select name="grupo" defaultValue={color ? grupo : 'color'}>
            {GRUPOS_COLOR.map((g) => (
              <option key={g.valor} value={g.valor}>
                {g.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label>Color de muestra</label>
          <input name="muestra" type="color" defaultValue={color?.muestra ?? '#e87ea1'} />
        </div>
      </div>
      {color && (
        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" name="activo" defaultChecked={color.activo} /> Se ofrece al cotizar
        </label>
      )}
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
