'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { AtributoEditor, DatosEditor, InsumoEditor } from '@/lib/cotizador/editor-datos';
import { entradasVisibles } from '@/lib/cotizador/motor';
import type { Aviso, Entrada, Linea, Receta, Regla, ResultadoCalculo } from '@/lib/cotizador/tipos';
import { descartarBorrador, guardarBorrador, probarReceta, publicarReceta } from '../actions';

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
type EntradaFila = Entrada & { clave: string };

const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });
const plata = (n: number) => pesos.format(n);

const REGLAS: { valor: Regla; nombre: string; ayuda: string }[] = [
  { valor: 'm2', nombre: 'Por m² (pieza)', ayuda: 'Ancho × largo de la pieza, en cm. Aplica el mínimo por pieza.' },
  { valor: 'ml', nombre: 'Por metro lineal', ayuda: 'Metros por pieza (o el perímetro si cargás ancho y largo).' },
  { valor: 'unidad', nombre: 'Por unidad', ayuda: 'Cantidad × precio.' },
  { valor: 'fijo', nombre: 'Precio fijo', ayuda: 'Un monto por producto.' },
  { valor: 'tabla', nombre: 'Según medida (lista)', ayuda: 'Busca el precio por la medida; si no está, lo estima y lo marca para confirmar.' },
  { valor: 'porcentaje', nombre: 'Porcentaje de otras líneas', ayuda: 'Ej. el ajuste de Vidpro: 20% sobre los vidrios.' },
  { valor: 'formula', nombre: 'Fórmula libre', ayuda: 'Un monto calculado. Último recurso.' },
];
const TIPOS: Record<string, string> = {
  vidrio: 'Vidrios',
  espejo: 'Espejos',
  proceso: 'Procesos',
  mano_obra: 'Mano de obra',
  estructura: 'Estructuras',
  madera: 'Madera',
  herraje: 'Herrajes',
  embalaje: 'Embalaje',
  flete: 'Flete',
  otro: 'Otros',
};
const GRUPOS: Record<string, string> = {
  'gris-bronce': 'Gris / bronce',
  color: 'Columna "Color"',
  combinado: 'Combinado',
  satinado: 'Satinado',
  'gris-oscuro': 'Gris oscuro',
  blanco: 'Blanco',
};

const aFilas = (r: Receta): EntradaFila[] => Object.entries(r.entradas).map(([clave, e]) => ({ ...e, clave }));
const aReceta = (filas: EntradaFila[], lineas: Linea[], precioMinimo: number | null): Receta => {
  const entradas: Record<string, Entrada> = {};
  for (const { clave, ...e } of filas) if (clave.trim()) entradas[clave.trim()] = e as Entrada;
  return { entradas, orden: Object.keys(entradas), lineas, ...(precioMinimo ? { precioMinimo } : {}) };
};
function slugLinea(nombre: string, usados: string[]): string {
  const base =
    nombre
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^[0-9_]+/, '')
      .slice(0, 24) || 'pieza';
  let id = base;
  for (let n = 2; usados.includes(id); n++) id = `${base}_${n}`;
  return id;
}
const mover = <T,>(arr: T[], i: number, d: number) => {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const c = [...arr];
  [c[i], c[j]] = [c[j], c[i]];
  return c;
};
const sinVacios = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))) as T;

// ---------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------
export default function EditorReceta({
  productoId,
  inicial,
  margen,
  datos,
  version,
  hayPublicada,
}: {
  productoId: string;
  inicial: Receta;
  margen: number;
  datos: DatosEditor;
  version: number;
  hayPublicada: boolean;
}) {
  const [entradas, setEntradas] = useState<EntradaFila[]>(() => aFilas(inicial));
  const [lineas, setLineas] = useState<Linea[]>(() => inicial.lineas);
  const [precioMinimo, setPrecioMinimo] = useState<number | null>(inicial.precioMinimo ?? null);
  const [sucio, setSucio] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [avisosPub, setAvisosPub] = useState<Aviso[]>([]);
  const [verJson, setVerJson] = useState(false);
  const [guardando, empezarGuardar] = useTransition();

  const receta = useMemo(() => aReceta(entradas, lineas, precioMinimo), [entradas, lineas, precioMinimo]);
  const insumos = useMemo(() => new Map(datos.insumos.map((i) => [i.codigo, i])), [datos]);
  const atributos = useMemo(() => new Map(datos.atributos.map((a) => [a.clave, a])), [datos]);

  const cambiar = () => {
    setSucio(true);
    setMensaje(null);
  };
  const setEntrada = (i: number, e: EntradaFila) => {
    setEntradas((x) => x.map((y, k) => (k === i ? e : y)));
    cambiar();
  };
  const setLinea = (i: number, l: Linea) => {
    setLineas((x) => x.map((y, k) => (k === i ? l : y)));
    cambiar();
  };

  // Avisar si se va de la página con cambios sin guardar.
  useEffect(() => {
    if (!sucio) return;
    const f = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, [sucio]);

  const guardar = () =>
    empezarGuardar(async () => {
      const r = await guardarBorrador(productoId, receta);
      if (r.error) setMensaje({ tipo: 'error', texto: r.error });
      else {
        setSucio(false);
        const errores = (r.avisos ?? []).filter((a) => a.nivel === 'error').length;
        setMensaje({ tipo: 'ok', texto: errores ? `Borrador guardado (tiene ${errores} cosas para corregir antes de publicar)` : 'Borrador guardado' });
      }
    });
  const publicar = () => {
    const nota = prompt('Nota de esta versión (opcional), por ejemplo "nuevo largo máximo":', '');
    if (nota === null) return;
    empezarGuardar(async () => {
      const r = await publicarReceta(productoId, receta, nota.trim() || null);
      setAvisosPub(r.avisos ?? []);
      if (r.error) setMensaje({ tipo: 'error', texto: r.error });
      else {
        setSucio(false);
        setMensaje({ tipo: 'ok', texto: `${r.ok}. Ya se cotiza con esta versión.` });
      }
    });
  };
  const descartar = () => {
    if (!confirm('¿Descartar los cambios del borrador y volver a la versión publicada?')) return;
    empezarGuardar(async () => {
      const r = await descartarBorrador(productoId);
      if (r.error) setMensaje({ tipo: 'error', texto: r.error });
      else window.location.reload();
    });
  };

  const clavesEntradas = entradas.map((e) => e.clave);

  return (
    <div className="editor-receta">
      <div className="editor-columna">
        {/* Barra de acciones */}
        <div className="card card-pad editor-barra">
          <div>
            <strong>Borrador de la versión {version}</strong>
            <div className="small quiet">
              {sucio ? 'Hay cambios sin guardar.' : 'Sin cambios pendientes.'} Lo que se cotiza es la versión publicada hasta que publiques esta.
            </div>
          </div>
          <div className="acciones">
            <button type="button" className="btn btn-chico" onClick={guardar} disabled={guardando || !sucio}>
              {guardando ? 'Guardando…' : 'Guardar borrador'}
            </button>
            <button type="button" className="btn btn-primario btn-chico" onClick={publicar} disabled={guardando}>
              Publicar versión {version}
            </button>
            {hayPublicada && (
              <button type="button" className="btn btn-fantasma btn-chico" onClick={descartar} disabled={guardando}>
                Descartar cambios
              </button>
            )}
          </div>
          {mensaje && (
            <p className={mensaje.tipo === 'error' ? 'error-form' : 'small'} style={mensaje.tipo === 'ok' ? { color: 'var(--ok)' } : undefined} role="status">
              {mensaje.texto}
            </p>
          )}
          {avisosPub.length > 0 && (
            <ul className="editor-avisos">
              {avisosPub.map((a, i) => (
                <li key={i}>{a.mensaje}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Entradas */}
        <section className="card">
          <div className="card-titulo">
            <div>
              <h2>Qué se pide al cotizar</h2>
              <p className="small quiet">Medidas y opciones que completa el vendedor. El código corto (L, P, H, color…) es el que usan las fórmulas.</p>
            </div>
          </div>
          <div className="seccion">
            {entradas.length === 0 && <p className="small quiet">Todavía no pide nada. Agregá las medidas y opciones del producto.</p>}
            {entradas.map((e, i) => (
              <FilaEntrada
                key={i}
                e={e}
                atributos={datos.atributos}
                repetida={clavesEntradas.filter((c) => c === e.clave).length > 1}
                onChange={(x) => setEntrada(i, x)}
                onMover={(d) => {
                  setEntradas((x) => mover(x, i, d));
                  cambiar();
                }}
                onQuitar={() => {
                  setEntradas((x) => x.filter((_, k) => k !== i));
                  cambiar();
                }}
              />
            ))}
            <div className="acciones" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-chico"
                onClick={() => {
                  const libre = ['L', 'P', 'H', 'D', 'A'].find((c) => !clavesEntradas.includes(c)) ?? `M${entradas.length + 1}`;
                  const nombres: Record<string, string> = { L: 'Largo', P: 'Profundidad', H: 'Alto', D: 'Diámetro', A: 'Ancho' };
                  setEntradas((x) => [...x, { clave: libre, tipo: 'medida', nombre: nombres[libre] ?? 'Medida' }]);
                  cambiar();
                }}
              >
                + Medida
              </button>
              <button
                type="button"
                className="btn btn-chico"
                onClick={() => {
                  const libre = !clavesEntradas.includes('color') ? 'color' : `opcion${entradas.length + 1}`;
                  setEntradas((x) => [...x, { clave: libre, tipo: 'opcion', nombre: libre === 'color' ? 'Color' : 'Opción', atributo: libre === 'color' ? 'color' : undefined }]);
                  cambiar();
                }}
              >
                + Opción
              </button>
            </div>
          </div>
        </section>

        {/* Líneas */}
        <section className="card">
          <div className="card-titulo">
            <div>
              <h2>Piezas y costos</h2>
              <p className="small quiet">Cada vidrio, proceso, estructura o costo del producto, en el orden en que se suman.</p>
            </div>
          </div>
          <div className="seccion">
            {lineas.length === 0 && <p className="small quiet">Agregá la primera pieza (por ejemplo, la tapa).</p>}
            {lineas.map((l, i) => (
              <FilaLinea
                key={i}
                l={l}
                indice={i}
                anteriores={lineas.slice(0, i)}
                entradas={entradas}
                insumos={datos.insumos}
                insumo={l.insumo ? insumos.get(l.insumo) : undefined}
                atributos={atributos}
                repetida={lineas.filter((x) => x.id === l.id).length > 1}
                onChange={(x) => setLinea(i, x)}
                onMover={(d) => {
                  setLineas((x) => mover(x, i, d));
                  cambiar();
                }}
                onQuitar={() => {
                  if (!confirm(`¿Quitar "${l.nombre || 'esta línea'}"?`)) return;
                  setLineas((x) => x.filter((_, k) => k !== i));
                  cambiar();
                }}
              />
            ))}
            <div className="acciones" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-chico"
                onClick={() => {
                  const ids = lineas.map((x) => x.id);
                  const vidrio = datos.insumos.find((x) => x.codigo === 'vidrio-float') ?? datos.insumos[0];
                  setLineas((x) => [
                    ...x,
                    {
                      id: slugLinea(x.length ? 'Pieza' : 'Tapa', ids),
                      nombre: x.length ? 'Pieza' : 'Tapa',
                      regla: 'm2',
                      insumo: vidrio?.codigo,
                      ancho: clavesEntradas.includes('L') ? 'L' : '',
                      largo: clavesEntradas.includes('P') ? 'P' : '',
                    },
                  ]);
                  cambiar();
                }}
              >
                + Vidrio o pieza
              </button>
              <button
                type="button"
                className="btn btn-chico"
                onClick={() => {
                  const ids = lineas.map((x) => x.id);
                  const vidrios = lineas.filter((x) => insumos.get(x.insumo ?? '')?.tipo === 'vidrio' || x.insumoFormula).map((x) => x.id);
                  setLineas((x) => [...x, { id: slugLinea('Ajuste', ids), nombre: 'Ajuste', regla: 'porcentaje', porcentaje: 'aj.ajuste_vidpro', sobre: vidrios }]);
                  cambiar();
                }}
              >
                + Ajuste 20%
              </button>
              <button
                type="button"
                className="btn btn-chico"
                onClick={() => {
                  const ids = lineas.map((x) => x.id);
                  setLineas((x) => [
                    ...x,
                    { id: slugLinea('Pegado UV', ids), nombre: 'Pegado UV', regla: 'ml', insumo: 'pegado-uv', cantidad: '1', metros: '' },
                  ]);
                  cambiar();
                }}
              >
                + Pegado UV
              </button>
              <button
                type="button"
                className="btn btn-chico"
                onClick={() => {
                  const ids = lineas.map((x) => x.id);
                  setLineas((x) => [...x, { id: slugLinea('Costo', ids), nombre: 'Costo', regla: 'unidad', insumo: datos.insumos[0]?.codigo }]);
                  cambiar();
                }}
              >
                + Otro costo
              </button>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="seccion form-bloque">
            <div className="fila fila-2">
              <div className="campo">
                <label htmlFor="precio-minimo">Precio mínimo de venta (opcional)</label>
                <input
                  id="precio-minimo"
                  type="text"
                  inputMode="decimal"
                  value={precioMinimo ?? ''}
                  placeholder="Sin mínimo"
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/\./g, '').replace(',', '.'));
                    setPrecioMinimo(e.target.value.trim() === '' || !Number.isFinite(n) ? null : n);
                    cambiar();
                  }}
                />
                <span className="ayuda">Si el cálculo da menos, se cobra esto.</span>
              </div>
            </div>
            <details open={verJson} onToggle={(e) => setVerJson((e.target as HTMLDetailsElement).open)}>
              <summary className="small quiet">Ver la receta como texto (avanzado)</summary>
              {verJson && (
                <JsonReceta
                  receta={receta}
                  onAplicar={(r) => {
                    setEntradas(aFilas(r));
                    setLineas(r.lineas);
                    setPrecioMinimo(r.precioMinimo ?? null);
                    cambiar();
                  }}
                />
              )}
            </details>
          </div>
        </section>
      </div>

      <Probador receta={receta} margen={margen} entradas={entradas} atributos={atributos} />
    </div>
  );
}

// ---------------------------------------------------------------------
// Entrada (medida u opción)
// ---------------------------------------------------------------------
function FilaEntrada({
  e,
  atributos,
  repetida,
  onChange,
  onMover,
  onQuitar,
}: {
  e: EntradaFila;
  atributos: AtributoEditor[];
  repetida: boolean;
  onChange: (e: EntradaFila) => void;
  onMover: (d: number) => void;
  onQuitar: () => void;
}) {
  const at = e.tipo === 'opcion' && e.atributo ? atributos.find((a) => a.clave === e.atributo) : undefined;
  const numOrUndef = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(',', '.')));
  return (
    <div className="editor-fila">
      <div className="editor-fila-cabecera">
        <div className="fila fila-3" style={{ flex: 1 }}>
          <div className="campo">
            <label>Nombre</label>
            <input type="text" value={e.nombre} onChange={(x) => onChange({ ...e, nombre: x.target.value })} />
          </div>
          <div className="campo">
            <label>Código</label>
            <input
              type="text"
              className="mono"
              value={e.clave}
              aria-invalid={repetida || !/^[A-Za-z][A-Za-z0-9_]*$/.test(e.clave)}
              onChange={(x) => onChange({ ...e, clave: x.target.value.replace(/\s/g, '') })}
            />
            {repetida && <span className="ayuda" style={{ color: 'var(--danger)' }}>Repetido</span>}
          </div>
          <div className="campo">
            <label>Tipo</label>
            <select
              value={e.tipo}
              onChange={(x) =>
                onChange(x.target.value === 'medida' ? { clave: e.clave, nombre: e.nombre, tipo: 'medida' } : { clave: e.clave, nombre: e.nombre, tipo: 'opcion' })
              }
            >
              <option value="medida">Medida (cm)</option>
              <option value="opcion">Opción</option>
            </select>
          </div>
        </div>
        <Mover onMover={onMover} onQuitar={onQuitar} />
      </div>

      {e.tipo === 'medida' ? (
        <div className="fila fila-3">
          <div className="campo">
            <label>Mínimo</label>
            <input type="number" value={e.min ?? ''} onChange={(x) => onChange({ ...e, min: numOrUndef(x.target.value) })} />
          </div>
          <div className="campo">
            <label>Máximo</label>
            <input type="number" value={e.max ?? ''} onChange={(x) => onChange({ ...e, max: numOrUndef(x.target.value) })} />
          </div>
          <div className="campo">
            <label>Por defecto</label>
            <input type="number" value={e.def ?? ''} onChange={(x) => onChange({ ...e, def: numOrUndef(x.target.value) })} />
          </div>
        </div>
      ) : (
        <>
          <div className="fila fila-2">
            <div className="campo">
              <label>Valores de</label>
              <select value={e.atributo ?? ''} onChange={(x) => onChange({ ...e, atributo: x.target.value || undefined, permitidos: undefined, def: undefined })}>
                <option value="">Lista propia</option>
                {atributos.map((a) => (
                  <option key={a.clave} value={a.clave}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label>Por defecto</label>
              {at ? (
                <select value={e.def ?? ''} onChange={(x) => onChange({ ...e, def: x.target.value || undefined })}>
                  <option value="">Sin valor (lo elige el vendedor)</option>
                  {at.valores
                    .filter((v) => !e.permitidos?.length || e.permitidos.includes(v.valor))
                    .map((v) => (
                      <option key={v.valor} value={v.valor}>
                        {v.etiqueta}
                      </option>
                    ))}
                </select>
              ) : (
                <input type="text" value={e.def ?? ''} onChange={(x) => onChange({ ...e, def: x.target.value || undefined })} />
              )}
            </div>
          </div>
          {at ? (
            <div className="campo">
              <span className="etiqueta">Qué se puede elegir {e.permitidos?.length ? `(${e.permitidos.length})` : '(todos)'}</span>
              <div className="chips-eleccion">
                {at.valores.map((v) => {
                  const on = !e.permitidos?.length || e.permitidos.includes(v.valor);
                  return (
                    <button
                      type="button"
                      key={v.valor}
                      className="chip-eleccion"
                      aria-pressed={on}
                      onClick={() => {
                        const actuales = e.permitidos?.length ? e.permitidos : at.valores.map((x) => x.valor);
                        const nuevos = on ? actuales.filter((x) => x !== v.valor) : [...actuales, v.valor];
                        const todos = nuevos.length === at.valores.length;
                        onChange({ ...e, permitidos: todos ? undefined : nuevos, def: e.def && !nuevos.includes(e.def) ? undefined : e.def });
                      }}
                    >
                      {v.etiqueta}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="campo">
              <label>Valores (separados por coma)</label>
              <input
                type="text"
                value={(e.permitidos ?? []).join(', ')}
                placeholder="si, no"
                onChange={(x) =>
                  onChange({
                    ...e,
                    permitidos: x.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
          )}
        </>
      )}
      <details className="editor-avanzado" open={Boolean(e.mostrarSi)}>
        <summary className="small quiet">Mostrar solo si…</summary>
        <CampoFormula
          etiqueta="Condición (con las entradas de arriba)"
          valor={e.mostrarSi ?? ''}
          ejemplo="en(color, 'incoloro', 'gris', 'bronce')"
          onChange={(v) => onChange({ ...e, mostrarSi: v || undefined })}
        />
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------
// Línea (pieza, proceso o costo)
// ---------------------------------------------------------------------
function FilaLinea({
  l,
  indice,
  anteriores,
  entradas,
  insumos,
  insumo,
  atributos,
  repetida,
  onChange,
  onMover,
  onQuitar,
}: {
  l: Linea;
  indice: number;
  anteriores: Linea[];
  entradas: EntradaFila[];
  insumos: InsumoEditor[];
  insumo: InsumoEditor | undefined;
  atributos: Map<string, AtributoEditor>;
  repetida: boolean;
  onChange: (l: Linea) => void;
  onMover: (d: number) => void;
  onQuitar: () => void;
}) {
  const set = (cambios: Partial<Linea>) => onChange(sinVacios({ ...l, ...cambios }) as Linea);
  const regla = REGLAS.find((r) => r.valor === l.regla);
  const porFormula = Boolean(l.insumoFormula);
  const grupos = useMemo(() => {
    const g = new Map<string, InsumoEditor[]>();
    for (const i of insumos) g.set(i.tipo, [...(g.get(i.tipo) ?? []), i]);
    return [...g.entries()];
  }, [insumos]);

  return (
    <div className="editor-fila">
      <div className="editor-fila-cabecera">
        <span className="editor-numero">{indice + 1}</span>
        <div className="fila fila-2" style={{ flex: 1 }}>
          <div className="campo">
            <label>Nombre</label>
            <input type="text" value={l.nombre} onChange={(x) => set({ nombre: x.target.value })} placeholder="Tapa" />
          </div>
          <div className="campo">
            <label>Cómo se calcula</label>
            <select value={l.regla} onChange={(x) => set({ regla: x.target.value as Regla })}>
              {REGLAS.map((r) => (
                <option key={r.valor} value={r.valor}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Mover onMover={onMover} onQuitar={onQuitar} />
      </div>
      {regla && <p className="ayuda small quiet" style={{ margin: '-4px 0 8px' }}>{regla.ayuda}</p>}

      {l.regla !== 'porcentaje' && (
        <div className="campo">
          <label>Qué insumo</label>
          {porFormula ? (
            <CampoFormula
              etiqueta=""
              valor={l.insumoFormula ?? ''}
              ejemplo="si(en(color, 'incoloro', 'gris', 'bronce'), 'vidrio-float', 'vidrio-laminado')"
              onChange={(v) => set({ insumoFormula: v })}
            />
          ) : (
            <select value={l.insumo ?? ''} onChange={(x) => set({ insumo: x.target.value, variante: undefined })}>
              <option value="">Elegir…</option>
              {grupos.map(([tipo, lista]) => (
                <optgroup key={tipo} label={TIPOS[tipo] ?? tipo}>
                  {lista.map((i) => (
                    <option key={i.codigo} value={i.codigo}>
                      {i.nombre}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
          <button
            type="button"
            className="btn btn-fantasma btn-chico"
            style={{ alignSelf: 'flex-start', paddingLeft: 0 }}
            onClick={() =>
              porFormula
                ? set({ insumoFormula: undefined, insumo: '' })
                : set({ insumo: undefined, insumoFormula: "si(en(color, 'incoloro', 'gris', 'bronce'), 'vidrio-float', 'vidrio-laminado')", variante: undefined })
            }
          >
            {porFormula ? 'Elegir un insumo fijo' : 'Que dependa de una opción (ej. float o laminado según el color)'}
          </button>
        </div>
      )}

      {/* De dónde sale cada atributo del precio */}
      {insumo && insumo.atributos.length > 0 && (
        <div className="fila fila-2">
          {insumo.atributos.map((a) => (
            <SelectorVariante
              key={a}
              atributo={a}
              nombre={atributos.get(a)?.nombre ?? a}
              formula={l.variante?.[a]}
              entradas={entradas}
              valores={(insumo.valores[a] ?? []).map((v) => ({
                valor: v,
                etiqueta: atributos.get(a)?.valores.find((x) => x.valor === v)?.etiqueta ?? GRUPOS[v] ?? v,
              }))}
              onChange={(f) => set({ variante: sinVacios({ ...(l.variante ?? {}), [a]: f ?? '' }) })}
            />
          ))}
        </div>
      )}
      {porFormula && (
        <details className="editor-avanzado" open={Boolean(l.variante && Object.keys(l.variante).length)}>
          <summary className="small quiet">De dónde sale el espesor, color… (si no coincide con una entrada del mismo nombre)</summary>
          <CampoFormula
            etiqueta='Una por renglón: atributo = fórmula (ej. composicion = composicion)'
            valor={Object.entries(l.variante ?? {})
              .map(([a, f]) => `${a} = ${f}`)
              .join('\n')}
            multilinea
            onChange={(v) => {
              const variante: Record<string, string> = {};
              for (const r of v.split('\n')) {
                const m = r.match(/^\s*([a-z_][a-z0-9_]*)\s*=\s*(.+)$/i);
                if (m) variante[m[1]] = m[2].trim();
              }
              set({ variante });
            }}
          />
        </details>
      )}

      {/* Medidas según la regla */}
      {l.regla === 'm2' && (
        <div className="fila fila-3">
          <CampoFormula etiqueta="Cantidad" valor={l.cantidad ?? ''} ejemplo="1" onChange={(v) => set({ cantidad: v })} />
          <CampoFormula etiqueta="Ancho (cm)" valor={l.ancho ?? ''} ejemplo="L" onChange={(v) => set({ ancho: v })} />
          <CampoFormula etiqueta="Largo (cm)" valor={l.largo ?? ''} ejemplo="P" onChange={(v) => set({ largo: v })} />
        </div>
      )}
      {l.regla === 'ml' && (
        <div className="fila fila-2">
          <CampoFormula etiqueta="Cantidad" valor={l.cantidad ?? ''} ejemplo="2" onChange={(v) => set({ cantidad: v })} />
          <CampoFormula etiqueta="Metros por pieza" valor={l.metros ?? ''} ejemplo="P / 100" onChange={(v) => set({ metros: v })} />
        </div>
      )}
      {(l.regla === 'unidad' || l.regla === 'fijo') && (
        <div className="fila fila-2">
          <CampoFormula etiqueta="Cantidad" valor={l.cantidad ?? ''} ejemplo="1" onChange={(v) => set({ cantidad: v })} />
        </div>
      )}
      {l.regla === 'tabla' && (
        <div className="fila fila-2">
          <CampoFormula etiqueta="Medida para buscar el precio" valor={l.referencia ?? ''} ejemplo={insumo?.porMedida ? 'L + P' : 'L'} onChange={(v) => set({ referencia: v })} />
          <CampoFormula etiqueta="Cantidad" valor={l.cantidad ?? ''} ejemplo="1" onChange={(v) => set({ cantidad: v })} />
        </div>
      )}
      {l.regla === 'formula' && <CampoFormula etiqueta="Monto ($)" valor={l.monto ?? ''} ejemplo="precio * techo(L / 50)" onChange={(v) => set({ monto: v })} />}
      {l.regla === 'porcentaje' && (
        <>
          <CampoFormula etiqueta="Porcentaje (0.20 = 20%)" valor={l.porcentaje ?? ''} ejemplo="aj.ajuste_vidpro" onChange={(v) => set({ porcentaje: v })} />
          <div className="campo">
            <span className="etiqueta">Sobre qué líneas</span>
            {anteriores.length === 0 ? (
              <p className="small quiet">Tiene que ir después de las líneas sobre las que se calcula.</p>
            ) : (
              <div className="chips-eleccion">
                {anteriores.map((a) => {
                  const on = (l.sobre ?? []).includes(a.id);
                  return (
                    <button
                      type="button"
                      key={a.id}
                      className="chip-eleccion"
                      aria-pressed={on}
                      onClick={() => set({ sobre: on ? (l.sobre ?? []).filter((x) => x !== a.id) : [...(l.sobre ?? []), a.id] })}
                    >
                      {a.nombre || a.id}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      <details className="editor-avanzado" open={Boolean(l.condicion) || repetida}>
        <summary className="small quiet">Más opciones</summary>
        <div className="fila fila-2">
          <CampoFormula etiqueta="Solo si… (vacío = siempre)" valor={l.condicion ?? ''} ejemplo="L > 180" onChange={(v) => set({ condicion: v })} />
          <div className="campo">
            <label>Código de la línea</label>
            <input
              type="text"
              className="mono"
              value={l.id}
              aria-invalid={repetida}
              onChange={(x) => set({ id: x.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
            />
            <span className="ayuda" style={repetida ? { color: 'var(--danger)' } : undefined}>
              {repetida ? 'Repetido: cambialo' : `Para usarla en fórmulas: ${l.id || '…'}.m2, ${l.id || '…'}.costo`}
            </span>
          </div>
        </div>
      </details>
    </div>
  );
}

function SelectorVariante({
  atributo,
  nombre,
  formula,
  entradas,
  valores,
  onChange,
}: {
  atributo: string;
  nombre: string;
  formula: string | undefined;
  entradas: EntradaFila[];
  valores: { valor: string; etiqueta: string }[];
  onChange: (f: string | undefined) => void;
}) {
  // undefined = la entrada del mismo nombre; 'x' = entrada; "'v'" = fijo; otra cosa = fórmula
  const fijo = formula?.match(/^'([^']*)'$/)?.[1];
  const esEntrada = formula && entradas.some((e) => e.clave === formula);
  const modo = formula == null || formula === atributo ? 'auto' : fijo != null ? 'fijo' : esEntrada ? 'entrada' : 'formula';
  const hayHomonima = entradas.some((e) => e.clave === atributo);
  const valorSelect = modo === 'auto' ? '' : modo === 'fijo' ? `v:${fijo}` : modo === 'entrada' ? `e:${formula}` : 'f';
  return (
    <div className="campo">
      <label>{nombre}</label>
      <select
        value={valorSelect}
        aria-invalid={modo === 'auto' && !hayHomonima}
        onChange={(x) => {
          const v = x.target.value;
          if (v === '') onChange(undefined);
          else if (v.startsWith('e:')) onChange(v.slice(2));
          else if (v.startsWith('v:')) onChange(`'${v.slice(2)}'`);
          else onChange(formula && modo === 'formula' ? formula : `(${atributo})`);
        }}
      >
        <option value="">{hayHomonima ? `Lo que elijan en "${entradas.find((e) => e.clave === atributo)?.nombre}"` : 'Elegir…'}</option>
        <optgroup label="Lo que elijan en">
          {entradas
            .filter((e) => e.clave !== atributo)
            .map((e) => (
              <option key={e.clave} value={`e:${e.clave}`}>
                {e.nombre}
              </option>
            ))}
        </optgroup>
        <optgroup label="Siempre">
          {valores.map((v) => (
            <option key={v.valor} value={`v:${v.valor}`}>
              {v.etiqueta}
            </option>
          ))}
        </optgroup>
        <option value="f">Fórmula…</option>
      </select>
      {modo === 'formula' && <CampoFormula etiqueta="" valor={formula ?? ''} ejemplo="si(L > 160, '12', espesor)" onChange={(f) => onChange(f || undefined)} />}
    </div>
  );
}

function CampoFormula({
  etiqueta,
  valor,
  ejemplo,
  multilinea,
  onChange,
}: {
  etiqueta: string;
  valor: string;
  ejemplo?: string;
  multilinea?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="campo">
      {etiqueta && <label>{etiqueta}</label>}
      {multilinea ? (
        <textarea className="mono formula" value={valor} rows={3} onChange={(x) => onChange(x.target.value)} spellCheck={false} />
      ) : (
        <input type="text" className="mono formula" value={valor} placeholder={ejemplo} onChange={(x) => onChange(x.target.value)} spellCheck={false} autoCapitalize="off" />
      )}
    </div>
  );
}

function Mover({ onMover, onQuitar }: { onMover: (d: number) => void; onQuitar: () => void }) {
  return (
    <div className="editor-mover">
      <button type="button" className="btn btn-fantasma btn-chico" onClick={() => onMover(-1)} aria-label="Subir">
        ↑
      </button>
      <button type="button" className="btn btn-fantasma btn-chico" onClick={() => onMover(1)} aria-label="Bajar">
        ↓
      </button>
      <button type="button" className="btn btn-fantasma btn-chico" onClick={onQuitar} aria-label="Quitar">
        ✕
      </button>
    </div>
  );
}

function JsonReceta({ receta, onAplicar }: { receta: Receta; onAplicar: (r: Receta) => void }) {
  const [texto, setTexto] = useState(() => JSON.stringify(receta, null, 2));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setTexto(JSON.stringify(receta, null, 2)), [receta]);
  return (
    <div className="form-bloque" style={{ marginTop: 8 }}>
      <textarea className="mono formula" rows={16} value={texto} onChange={(e) => setTexto(e.target.value)} spellCheck={false} />
      {error && <p className="error-form">{error}</p>}
      <div className="acciones">
        <button
          type="button"
          className="btn btn-chico"
          onClick={() => {
            try {
              const r = JSON.parse(texto) as Receta;
              if (!r || typeof r !== 'object' || typeof r.entradas !== 'object' || !Array.isArray(r.lineas)) throw new Error('Tiene que tener "entradas" y "lineas"');
              setError(null);
              onAplicar(r);
            } catch (e) {
              setError(`No se pudo leer: ${(e as Error).message}`);
            }
          }}
        >
          Aplicar texto
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Probador: calcula en vivo con la receta del editor
// ---------------------------------------------------------------------
function Probador({
  receta,
  margen,
  entradas,
  atributos,
}: {
  receta: Receta;
  margen: number;
  entradas: EntradaFila[];
  atributos: Map<string, AtributoEditor>;
}) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [cantidad, setCantidad] = useState(1);
  const [margenPrueba, setMargenPrueba] = useState(Math.round(margen * 1000) / 10);
  const [resultado, setResultado] = useState<ResultadoCalculo | null>(null);
  const [validacion, setValidacion] = useState<Aviso[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [calculando, empezar] = useTransition();
  const turno = useRef(0);

  useEffect(() => setMargenPrueba(Math.round(margen * 1000) / 10), [margen]);

  const valoresMotor = useMemo(() => {
    const out: Record<string, number | string> = {};
    for (const e of entradas) {
      const v = valores[e.clave];
      if (v == null || v === '') continue;
      out[e.clave] = e.tipo === 'medida' ? Number(v.replace(',', '.')) : v;
    }
    return out;
  }, [valores, entradas]);

  useEffect(() => {
    const yo = ++turno.current;
    const t = setTimeout(() => {
      empezar(async () => {
        const r = await probarReceta(receta, valoresMotor, margenPrueba / 100, cantidad);
        if (yo !== turno.current) return;
        setError(r.error ?? null);
        setResultado(r.resultado ?? null);
        setValidacion(r.validacion ?? []);
      });
    }, 450);
    return () => clearTimeout(t);
  }, [receta, valoresMotor, margenPrueba, cantidad]);

  const visibles = useMemo(() => new Set(entradasVisibles(receta, valoresMotor)), [receta, valoresMotor]);
  const errores = [...validacion.filter((a) => a.nivel === 'error'), ...(resultado?.avisos ?? [])];
  const vistos = new Set<string>();
  const avisos = errores.filter((a) => (vistos.has(a.mensaje) ? false : (vistos.add(a.mensaje), true)));

  return (
    <aside className="editor-probador">
      <section className="card">
        <div className="card-titulo">
          <h2>Probar</h2>
          {calculando && <span className="small quiet">Calculando…</span>}
        </div>
        <div className="seccion form-bloque">
          {entradas.length === 0 && <p className="small quiet">Agregá medidas u opciones para probar.</p>}
          {entradas
            .filter((e) => visibles.has(e.clave))
            .map((e) => {
            const at = e.tipo === 'opcion' && e.atributo ? atributos.get(e.atributo) : undefined;
            const opciones =
              e.tipo === 'opcion'
                ? at
                  ? at.valores.filter((v) => !e.permitidos?.length || e.permitidos.includes(v.valor))
                  : (e.permitidos ?? []).map((v) => ({ valor: v, etiqueta: v }))
                : [];
            const def = e.def != null ? String(e.def) : '';
            return (
              <div className="campo" key={e.clave}>
                <label>
                  {e.nombre || e.clave} {e.tipo === 'medida' && <span className="quiet">(cm)</span>}
                  {e.mostrarSi && <span className="quiet small"> · condicional</span>}
                </label>
                {e.tipo === 'medida' ? (
                  <input
                    type="number"
                    inputMode="decimal"
                    value={valores[e.clave] ?? ''}
                    placeholder={def || '—'}
                    onChange={(x) => setValores((v) => ({ ...v, [e.clave]: x.target.value }))}
                  />
                ) : (
                  <select value={valores[e.clave] ?? ''} onChange={(x) => setValores((v) => ({ ...v, [e.clave]: x.target.value }))}>
                    <option value="">{def ? `Por defecto (${opciones.find((o) => o.valor === def)?.etiqueta ?? def})` : 'Elegir…'}</option>
                    {opciones.map((o) => (
                      <option key={o.valor} value={o.valor}>
                        {o.etiqueta}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
          <div className="fila fila-2m">
            <div className="campo">
              <label>Cantidad</label>
              <input type="number" min={1} value={cantidad} onChange={(x) => setCantidad(Math.max(1, Math.round(Number(x.target.value) || 1)))} />
            </div>
            <div className="campo">
              <label>Margen (%)</label>
              <input type="number" step="0.5" value={margenPrueba} onChange={(x) => setMargenPrueba(Number(x.target.value) || 0)} />
            </div>
          </div>
        </div>

        {error && <p className="error-form" style={{ padding: '0 16px 12px' }}>{error}</p>}

        {avisos.length > 0 && (
          <div className="seccion">
            <ul className="editor-avisos">
              {avisos.map((a, i) => (
                <li key={i} data-nivel={a.nivel}>
                  {a.mensaje}
                </li>
              ))}
            </ul>
          </div>
        )}

        {resultado && resultado.lineas.length > 0 && (
          <div className="seccion">
            <table className="tabla probador-tabla">
              <thead>
                <tr>
                  <th>Pieza</th>
                  <th className="der">Se cobra</th>
                  <th className="der">Costo</th>
                </tr>
              </thead>
              <tbody>
                {resultado.lineas.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{l.nombre}</div>
                      <div className="xs quiet">
                        {l.ancho != null && l.largo != null && l.unidad === 'm2' && `${l.cantidad > 1 ? `${dec.format(l.cantidad)} × ` : ''}${dec.format(l.ancho)} × ${dec.format(l.largo)} cm · `}
                        {l.unidad === 'porcentaje' ? `${dec.format(l.medida * 100)}% de ${plata(l.precioUnitario)}` : `${plata(l.precioUnitario)} ${l.unidad === 'm2' ? '/m²' : l.unidad === 'ml' ? '/m' : 'c/u'}`}
                        {l.minimoAplicado && ` · ${l.minimoAplicado}`}
                      </div>
                      {l.estimado && <div className="xs" style={{ color: 'var(--warn)' }}>{l.estimado}</div>}
                    </td>
                    <td className="der num">{l.unidad === 'porcentaje' ? '' : `${dec.format(l.medida)} ${l.unidad === 'm2' ? 'm²' : l.unidad === 'ml' ? 'm' : ''}`}</td>
                    <td className="der num">{plata(l.costo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {resultado && (
          <div className="seccion probador-totales">
            <div>
              <span>Costo{resultado.cantidad > 1 ? ` (×${resultado.cantidad})` : ''}</span>
              <strong className="num">{plata(resultado.costoTotal)}</strong>
            </div>
            <div>
              <span>Precio transferencia</span>
              <strong className="num probador-precio">{resultado.ok ? plata(resultado.precioTotal) : '—'}</strong>
            </div>
            <div>
              <span>En cuotas</span>
              <strong className="num">{resultado.ok ? plata(resultado.precioTotalCuotas) : '—'}</strong>
            </div>
            <div>
              <span>Ganancia · margen real</span>
              <strong className="num">
                {resultado.ok ? `${plata(resultado.precioTotal - resultado.costoTotal)} · ${dec.format(Math.round(resultado.margenReal * 1000) / 10)}%` : '—'}
              </strong>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="seccion small">
          <strong>Fórmulas</strong>
          <p className="quiet" style={{ margin: '4px 0 6px' }}>
            Medidas en cm. Podés usar <code>+ − * /</code>, paréntesis y:
          </p>
          <ul className="ayuda-formulas">
            <li>
              <code>si(L &gt; 160, 3, 2)</code> elige un valor
            </li>
            <li>
              <code>en(color, &apos;gris&apos;, &apos;bronce&apos;)</code> ¿es alguno de estos?
            </li>
            <li>
              <code>techo(L / 50)</code>, <code>piso()</code>, <code>min()</code>, <code>max()</code>, <code>redondear()</code>
            </li>
            <li>
              <code>numero(espesor)</code> pasa una opción a número
            </li>
            <li>
              <code>tapa.m2</code>, <code>tapa.costo</code> datos de una línea anterior
            </li>
            <li>
              <code>aj.ajuste_vidpro</code> reglas generales
            </li>
          </ul>
        </div>
      </section>
    </aside>
  );
}
