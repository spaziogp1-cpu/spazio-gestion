'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { entradasVisibles } from '@/lib/cotizador/motor';
import type { ProductoVenta, ResultadoVenta } from '@/lib/cotizador/servicio';
import { guardarPresupuesto, precioItem } from './actions';

type Catalogo = { productos: ProductoVenta[]; etiquetas: Record<string, Record<string, string>>; muestras: Record<string, string> };
type CampoPieza = { cantidad?: string; ancho?: string; largo?: string };
type CampoExtra = { id: string; nombre: string; como: string; cantidad: string; ancho: string; largo: string; forma: boolean };
type ClienteSel = { id: string | null; nombre: string; telefono: string | null };
type Item = {
  key: number;
  productoId: string;
  valores: Record<string, string>;
  cantidad: number;
  // Piezas cambiadas a mano (texto de los campos; vacío = lo de la receta).
  piezas: Record<string, CampoPieza>;
  // Vidrios agregados a mano.
  extras: CampoExtra[];
  resultado?: ResultadoVenta;
  error?: string;
  cargando?: boolean;
};
export type InicialPresupuesto = {
  id: string;
  cliente: ClienteSel;
  items: {
    productoId: string;
    valores: Record<string, number | string>;
    cantidad: number;
    margen?: number | null;
    piezas?: Record<string, { cantidad?: number; ancho?: number; largo?: number }> | null;
    extras?: { id: string; nombre: string; como: string; cantidad: number; ancho: number; largo: number; forma?: boolean }[] | null;
  }[];
  descuentoPct: number;
  observaciones: string | null;
};

const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const plata = (n: number) => pesos.format(n);
const subirA = (n: number, m: number) => (m > 0 ? Math.ceil(n / m - 1e-9) * m : Math.round(n));
/** "45" o "45,5" → 0.45 / 0.455; vacío o inválido → null (se usa el de cada producto). */
function margenFraccion(s: string): number | null {
  const t = s.trim().replace(',', '.').replace('%', '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n < 95 ? n / 100 : null;
}
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
/** Campos de piezas → números para el servidor (vacío = lo de la receta). */
function piezasNumeros(p: Record<string, CampoPieza>) {
  const out: Record<string, { cantidad?: number; ancho?: number; largo?: number }> = {};
  for (const [id, c] of Object.entries(p)) {
    const x: { cantidad?: number; ancho?: number; largo?: number } = {};
    for (const k of ['cantidad', 'ancho', 'largo'] as const) {
      const t = (c[k] ?? '').trim().replace(',', '.');
      if (t !== '' && Number.isFinite(Number(t))) x[k] = Number(t);
    }
    if (Object.keys(x).length) out[id] = x;
  }
  return out;
}
const extrasEnviar = (xs: CampoExtra[]) =>
  xs.map((x) => ({
    ...x,
    cantidad: Number(x.cantidad.replace(',', '.')),
    ancho: Number(x.ancho.replace(',', '.') || NaN),
    largo: Number(x.largo.replace(',', '.') || NaN),
  }));
const num = (n: number) => String(n).replace('.', ',');
const aCampos = (p?: Record<string, { cantidad?: number; ancho?: number; largo?: number }> | null) =>
  Object.fromEntries(
    Object.entries(p ?? {}).map(([id, v]) => [
      id,
      Object.fromEntries(Object.entries(v).map(([k, n]) => [k, String(n).replace('.', ',')])) as CampoPieza,
    ]),
  );
let siguiente = 1;

export default function FormPresupuesto({
  catalogo,
  inicial,
  verCostos,
  reglas,
}: {
  catalogo: Catalogo;
  inicial?: InicialPresupuesto;
  verCostos: boolean;
  reglas: { redondeo: number; recargoCuotas: number; topeDescuento: number };
}) {
  const [cliente, setCliente] = useState<ClienteSel | null>(inicial?.cliente ?? null);
  const [items, setItems] = useState<Item[]>(() =>
    (inicial?.items ?? []).map((i) => ({
      key: siguiente++,
      productoId: i.productoId,
      cantidad: i.cantidad,
      piezas: aCampos(i.piezas),
      extras: (i.extras ?? []).map((x) => ({ ...x, cantidad: String(x.cantidad), ancho: num(x.ancho), largo: num(x.largo), forma: Boolean(x.forma) })),
      valores: Object.fromEntries(Object.entries(i.valores).map(([k, v]) => [k, String(v)])),
    })),
  );
  // Un solo margen para todo el presupuesto (solo quien ve costos); vacío = el de cada producto.
  const margenInicial = inicial?.items.find((i) => i.margen != null)?.margen;
  const [margen, setMargen] = useState(margenInicial != null ? String(Math.round(margenInicial * 1000) / 10) : '');
  const margenRef = useRef(margen);
  const [abierto, setAbierto] = useState<number | null>(inicial ? null : -1); // -1 = eligiendo producto
  const [descuento, setDescuento] = useState(inicial ? String(Math.round(inicial.descuentoPct * 1000) / 10) : '');
  const [observaciones, setObservaciones] = useState(inicial?.observaciones ?? '');
  const [error, setError] = useState<string | null>(null);
  const [guardando, empezar] = useTransition();

  const productos = useMemo(() => new Map(catalogo.productos.map((p) => [p.id, p])), [catalogo]);

  // Precio en vivo de cada ítem (en el servidor).
  const turnos = useRef(new Map<number, number>());
  const pedirPrecio = (it: Item) => {
    const n = (turnos.current.get(it.key) ?? 0) + 1;
    turnos.current.set(it.key, n);
    const p = productos.get(it.productoId);
    if (!p) return;
    const valores: Record<string, number | string> = {};
    for (const [k, v] of Object.entries(it.valores)) {
      if (v === '') continue;
      valores[k] = p.entradas[k]?.tipo === 'medida' ? Number(v.replace(',', '.')) : v;
    }
    setItems((xs) => xs.map((x) => (x.key === it.key ? { ...x, cargando: true } : x)));
    setTimeout(async () => {
      if (turnos.current.get(it.key) !== n) return;
      const r = await precioItem(
        it.productoId,
        valores,
        it.cantidad,
        verCostos ? margenFraccion(margenRef.current) : null,
        verCostos ? piezasNumeros(it.piezas) : null,
        verCostos ? extrasEnviar(it.extras) : null,
      );
      if (turnos.current.get(it.key) !== n) return;
      setItems((xs) => xs.map((x) => (x.key === it.key ? { ...x, resultado: r.resultado, error: r.error, cargando: false } : x)));
    }, 350);
  };
  useEffect(() => {
    items.forEach(pedirPrecio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cambiarItem = (key: number, cambios: Partial<Item>) => {
    const actual = items.find((x) => x.key === key);
    if (!actual) return;
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...cambios } : x)));
    pedirPrecio({ ...actual, ...cambios });
    setError(null);
  };
  const agregar = (productoId: string) => {
    const p = productos.get(productoId);
    if (!p) return;
    const valores: Record<string, string> = {};
    for (const [k, e] of Object.entries(p.entradas)) if (e.def != null) valores[k] = String(e.def);
    const it: Item = { key: siguiente++, productoId, valores, cantidad: 1, piezas: {}, extras: [] };
    setItems((xs) => [...xs, it]);
    setAbierto(it.key);
    pedirPrecio(it);
  };

  const cambiarMargen = (v: string) => {
    setMargen(v);
    margenRef.current = v;
    items.forEach(pedirPrecio);
    setError(null);
  };

  const pct = Math.min(80, Math.max(0, Number(descuento.replace(',', '.')) || 0)) / 100;
  const subtotal = items.reduce((s, i) => s + (i.resultado?.ok ? i.resultado.precioTotal : 0), 0);
  const total = subirA(subtotal * (1 - pct), reglas.redondeo);
  const cuotas = subirA(total * (1 + reglas.recargoCuotas), reglas.redondeo);
  const listos = items.length > 0 && items.every((i) => i.resultado?.ok && !i.cargando);
  const costoTotal = verCostos ? items.reduce((s, i) => s + (i.resultado?.costos?.costoUnitario ?? 0) * i.cantidad, 0) : 0;
  const sinMargen = items.filter((i) => i.resultado?.faltaMargen && !i.cargando).map((i) => productos.get(i.productoId)?.nombre ?? '');

  const guardar = () => {
    if (!cliente?.nombre.trim()) return setError('Falta el cliente.');
    if (!items.length) return setError('Agregá al menos un producto.');
    if (verCostos && sinMargen.length) return setError('Falta el margen: escribilo en el resumen.');
    if (!listos) return setError('Hay productos sin precio: revisá los avisos.');
    empezar(async () => {
      const r = await guardarPresupuesto(inicial?.id ?? null, {
        cliente: { id: cliente.id, nombre: cliente.nombre.trim(), telefono: cliente.telefono },
        items: items.map((i) => {
          const p = productos.get(i.productoId)!;
          const valores: Record<string, number | string> = {};
          for (const [k, v] of Object.entries(i.valores)) if (v !== '') valores[k] = p.entradas[k]?.tipo === 'medida' ? Number(v.replace(',', '.')) : v;
          return {
            productoId: i.productoId,
            valores,
            cantidad: i.cantidad,
            margen: verCostos ? margenFraccion(margen) : null,
            piezas: verCostos ? piezasNumeros(i.piezas) : null,
            extras: verCostos ? extrasEnviar(i.extras) : null,
          };
        }),
        descuentoPct: pct,
        observaciones,
      });
      if (r?.error) setError(r.error);
    });
  };

  return (
    <div className="presu">
      <div className="presu-col">
        <BuscadorCliente cliente={cliente} onElegir={setCliente} />

        {items.map((it, i) => {
          const p = productos.get(it.productoId);
          if (!p) return null;
          return (
            <ItemPresupuesto
              key={it.key}
              numero={i + 1}
              item={it}
              producto={p}
              catalogo={catalogo}
              abierto={abierto === it.key}
              verCostos={verCostos}
              onAbrir={() => setAbierto(abierto === it.key ? null : it.key)}
              onCambiar={(c) => cambiarItem(it.key, c)}
              onQuitar={() => setItems((xs) => xs.filter((x) => x.key !== it.key))}
            />
          );
        })}

        {abierto === -1 || items.length === 0 ? (
          <ElegirProducto productos={catalogo.productos} onElegir={agregar} onCerrar={items.length ? () => setAbierto(null) : undefined} />
        ) : (
          <button type="button" className="btn btn-bloque" onClick={() => setAbierto(-1)}>
            + Agregar otro producto
          </button>
        )}
      </div>

      <aside className="presu-resumen">
        <section className="card card-pad form-bloque">
          {verCostos && (
            <div className="presu-costo">
              <div className="campo">
                <span className="etiqueta">Costo</span>
                <span className="num presu-costo-valor">{items.length ? plata(costoTotal) : '—'}</span>
                <span className="ayuda">no lo ve el cliente</span>
              </div>
              <div className="campo">
                <label htmlFor="pr-margen">Margen (%)</label>
                <input
                  id="pr-margen"
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min={0}
                  max={94}
                  value={margen}
                  placeholder="Ej. 50"
                  onChange={(e) => cambiarMargen(e.target.value)}
                />
                <span className="ayuda">
                  {margen.trim() === ''
                    ? sinMargen.length
                      ? 'Escribilo para ver el precio'
                      : 'Vacío: usa el de cada producto'
                    : 'Para todo el presupuesto'}
                </span>
              </div>
            </div>
          )}
          <div>
            <div className="small quiet">Total por transferencia</div>
            <div className="presu-total num">{listos ? plata(total) : items.length ? '…' : '—'}</div>
            <div className="small">
              {listos
                ? `${plata(cuotas)} en cuotas`
                : sinMargen.length && verCostos
                  ? 'Poné el margen para ver el precio'
                  : sinMargen.length
                    ? `Sin margen cargado: ${sinMargen.join(', ')}. Pedíselo a un administrador.`
                    : 'Completá los productos para ver el precio'}
            </div>
            {listos && pct > 0 && (
              <div className="small quiet">
                Antes del descuento: {plata(subtotal)} · −{plata(subtotal - total)}
              </div>
            )}
            {verCostos && listos && costoTotal > 0 && (
              <div className="small quiet" style={{ marginTop: 6 }}>
                Costo {plata(costoTotal)} · ganancia {plata(total - costoTotal)} · margen {Math.round((1 - costoTotal / total) * 1000) / 10}%
              </div>
            )}
          </div>
          <div className="campo">
            <label htmlFor="pr-desc">Descuento (%)</label>
            <input id="pr-desc" type="number" inputMode="decimal" min={0} max={80} step="0.5" value={descuento} placeholder="0" onChange={(e) => setDescuento(e.target.value)} />
            {pct > reglas.topeDescuento && (
              <span className="ayuda" style={{ color: 'var(--warn)' }}>
                Más del {Math.round(reglas.topeDescuento * 100)}%: un administrador tiene que aprobarlo antes de enviarlo.
              </span>
            )}
          </div>
          <div className="campo">
            <label htmlFor="pr-obs">Notas internas</label>
            <textarea id="pr-obs" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Lo vio en el showroom, quiere entrega antes de fin de mes…" />
          </div>
          {error && <p className="error-form" role="alert">{error}</p>}
          <button type="button" className="btn btn-primario btn-bloque" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : inicial ? 'Guardar cambios' : 'Guardar presupuesto'}
          </button>
          {inicial && <p className="small quiet">Al guardar se recalcula con los precios de hoy.</p>}
        </section>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------
function BuscadorCliente({ cliente, onElegir }: { cliente: ClienteSel | null; onElegir: (c: ClienteSel | null) => void }) {
  const [busqueda, setBusqueda] = useState('');
  const [sugeridos, setSugeridos] = useState<{ id: string; nombre: string; telefono: string | null; localidad: string | null }[]>([]);
  const [nuevo, setNuevo] = useState(false);
  const [telefono, setTelefono] = useState('');
  const supabase = useMemo(() => createClient(), []);
  const turno = useRef(0);

  useEffect(() => {
    const q = busqueda.trim();
    if (cliente || q.length < 2) {
      setSugeridos([]);
      return;
    }
    const n = ++turno.current;
    const t = setTimeout(async () => {
      const seguro = q.replace(/[%,()]/g, ' ');
      const { data } = await supabase.from('clientes').select('id, nombre, telefono, localidad').or(`nombre.ilike.%${seguro}%,telefono.ilike.%${seguro}%`).limit(5);
      if (n === turno.current) setSugeridos((data ?? []) as typeof sugeridos);
    }, 250);
    return () => clearTimeout(t);
  }, [busqueda, cliente, supabase]);

  if (cliente)
    return (
      <section className="card card-pad presu-cliente">
        <div>
          <div className="small quiet">Cliente{cliente.id ? '' : ' nuevo'}</div>
          <div style={{ fontWeight: 600 }}>{cliente.nombre}</div>
          {cliente.telefono && <div className="small quiet">{cliente.telefono}</div>}
        </div>
        <button type="button" className="btn btn-chico" onClick={() => onElegir(null)}>
          Cambiar
        </button>
      </section>
    );

  return (
    <section className="card card-pad form-bloque">
      <div className="campo">
        <label htmlFor="pr-cli">Cliente</label>
        <input
          id="pr-cli"
          type="search"
          value={busqueda}
          autoComplete="off"
          placeholder="Nombre o teléfono"
          onChange={(e) => {
            setBusqueda(e.target.value);
            setNuevo(false);
          }}
          autoFocus
        />
      </div>
      {sugeridos.length > 0 && (
        <ul className="lista">
          {sugeridos.map((c) => (
            <li key={c.id}>
              <button type="button" className="presu-sugerido" onClick={() => onElegir({ id: c.id, nombre: c.nombre, telefono: c.telefono })}>
                <strong>{c.nombre}</strong> <span className="small quiet">{[c.telefono, c.localidad].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {busqueda.trim().length >= 2 &&
        (nuevo ? (
          <div className="fila fila-2m">
            <input type="tel" inputMode="tel" placeholder="Teléfono (opcional)" value={telefono} onChange={(e) => setTelefono(e.target.value)} aria-label="Teléfono" />
            <button type="button" className="btn btn-primario" onClick={() => onElegir({ id: null, nombre: busqueda.trim(), telefono: telefono.trim() || null })}>
              Usar
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-chico" style={{ alignSelf: 'flex-start' }} onClick={() => setNuevo(true)}>
            + Cliente nuevo: “{busqueda.trim()}”
          </button>
        ))}
    </section>
  );
}

// ---------------------------------------------------------------------
function ElegirProducto({ productos, onElegir, onCerrar }: { productos: ProductoVenta[]; onElegir: (id: string) => void; onCerrar?: () => void }) {
  const [q, setQ] = useState('');
  const filtrados = productos.filter((p) => !q.trim() || p.nombre.toLowerCase().includes(q.trim().toLowerCase()));
  const grupos = [...new Set(filtrados.map((p) => p.categoria ?? 'Otros'))];
  return (
    <section className="card">
      <div className="card-titulo">
        <h2>Elegí el producto</h2>
        {onCerrar && (
          <button type="button" className="btn btn-fantasma btn-chico" onClick={onCerrar}>
            Cerrar
          </button>
        )}
      </div>
      <div className="seccion form-bloque">
        {productos.length === 0 ? (
          <p className="small quiet">Todavía no hay productos con receta publicada. Se cargan en Ajustes → Cotizador → Productos y recetas.</p>
        ) : (
          <>
            {productos.length > 8 && <input type="search" placeholder="Buscar producto" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar producto" />}
            {grupos.map((g) => (
              <div key={g}>
                <div className="small quiet" style={{ marginBottom: 6 }}>
                  {g}
                </div>
                <div className="presu-productos">
                  {filtrados
                    .filter((p) => (p.categoria ?? 'Otros') === g)
                    .map((p) => (
                      <button type="button" key={p.id} className="presu-producto" onClick={() => onElegir(p.id)}>
                        {p.foto_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.foto_url} alt="" />
                        ) : (
                          <span className="presu-producto-foto" aria-hidden="true" />
                        )}
                        <span>{p.nombre}</span>
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------
function ItemPresupuesto({
  numero,
  item,
  producto,
  catalogo,
  abierto,
  verCostos,
  onAbrir,
  onCambiar,
  onQuitar,
}: {
  numero: number;
  item: Item;
  producto: ProductoVenta;
  catalogo: Catalogo;
  abierto: boolean;
  verCostos: boolean;
  onAbrir: () => void;
  onCambiar: (c: Partial<Item>) => void;
  onQuitar: () => void;
}) {
  const r = item.resultado;
  const visibles = new Set(entradasVisibles({ entradas: producto.entradas, lineas: [] }, item.valores));
  // Para quien ve costos, la falta de margen se resuelve en el resumen: no es un error del producto.
  const errores = r?.avisos.filter((a) => a.nivel === 'error' && !(verCostos && r.faltaMargen && a.mensaje.startsWith('Falta el margen'))) ?? [];
  const advertencias = r?.avisos.filter((a) => a.nivel === 'advertencia') ?? [];

  return (
    <section className="card presu-item">
      <button type="button" className="presu-item-cabecera" onClick={onAbrir} aria-expanded={abierto}>
        {producto.foto_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={producto.foto_url} alt="" className="presu-miniatura" />
        ) : (
          <span className="editor-numero">{numero}</span>
        )}
        <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <strong>
            {item.cantidad > 1 ? `${item.cantidad} × ` : ''}
            {producto.nombre}
          </strong>
          <span className="small quiet" style={{ display: 'block' }}>
            {r?.detalle || 'Completá medidas y opciones'}
          </span>
          {!item.cargando && (item.error || errores[0]) && (
            <span className="small" style={{ display: 'block', color: 'var(--danger)' }}>
              Sin precio: {item.error ?? errores[0].mensaje}
            </span>
          )}
        </span>
        <span className="num" style={{ fontWeight: 600, textAlign: 'right' }}>
          {item.cargando ? '…' : r?.ok ? plata(r.precioTotal) : '—'}
          {verCostos && !item.cargando && r?.costos && (
            <span className="small quiet" style={{ display: 'block', fontWeight: 400 }}>
              costo {plata(r.costos.costoTotal)}
            </span>
          )}
        </span>
      </button>

      {abierto && (
        <div className="seccion form-bloque">
          {Object.entries(producto.entradas)
            .filter(([k]) => visibles.has(k))
            .map(([k, e]) => {
              if (e.tipo === 'medida')
                return (
                  <div className="campo" key={k}>
                    <label htmlFor={`m-${item.key}-${k}`}>
                      {e.nombre}{' '}
                      {e.min === 0 ? (
                        // Cantidad (bases, regatones…): sin "cm".
                        e.max != null && <span className="quiet">(0 a {e.max})</span>
                      ) : (
                        <span className="quiet">(cm{e.min != null && e.max != null ? `, ${e.min} a ${e.max}` : ''})</span>
                      )}
                    </label>
                    <input
                      id={`m-${item.key}-${k}`}
                      className="presu-medida"
                      type="number"
                      inputMode="decimal"
                      value={item.valores[k] ?? ''}
                      onChange={(x) => onCambiar({ valores: { ...item.valores, [k]: x.target.value } })}
                    />
                  </div>
                );
              const nombres = e.atributo ? catalogo.etiquetas[e.atributo] ?? {} : {};
              const opciones = e.permitidos?.length ? e.permitidos : Object.keys(nombres);
              return (
                <div className="campo" key={k}>
                  <span className="etiqueta">{e.nombre}</span>
                  <div className="chips-opcion" role="radiogroup" aria-label={e.nombre}>
                    {opciones.map((v) => {
                      const muestra = e.atributo === 'color' ? catalogo.muestras[v] : undefined;
                      return (
                        <button
                          type="button"
                          role="radio"
                          key={v}
                          aria-checked={item.valores[k] === v}
                          className="chip-opcion"
                          onClick={() => onCambiar({ valores: { ...item.valores, [k]: v } })}
                        >
                          {muestra && <span className="chip-muestra" style={{ background: muestra }} aria-hidden="true" />}
                          {nombres[v] ?? v}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          {verCostos && (
            <div className="presu-costo">
              <div className="campo">
                <span className="etiqueta">Costo</span>
                <span className="num presu-costo-valor">{item.cargando ? '…' : r?.costos ? plata(r.costos.costoUnitario) : '—'}</span>
                <span className="ayuda">por unidad · no lo ve el cliente</span>
              </div>
            </div>
          )}
          <div className="fila fila-2m">
            <div className="campo">
              <label htmlFor={`c-${item.key}`}>Cantidad</label>
              <input
                id={`c-${item.key}`}
                type="number"
                min={1}
                inputMode="numeric"
                value={item.cantidad}
                onChange={(x) => onCambiar({ cantidad: Math.max(1, Math.round(Number(x.target.value) || 1)) })}
              />
            </div>
            <div className="campo" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-fantasma btn-chico" onClick={onQuitar}>
                Quitar producto
              </button>
            </div>
          </div>

          {item.error && <p className="error-form">{item.error}</p>}
          {errores.length > 0 && (
            <ul className="editor-avisos">
              {errores.map((a, i) => (
                <li key={i}>{a.mensaje}</li>
              ))}
            </ul>
          )}
          {advertencias.length > 0 && (
            <ul className="editor-avisos">
              {advertencias.map((a, i) => (
                <li key={i} data-nivel="advertencia">
                  {a.mensaje}
                </li>
              ))}
            </ul>
          )}
          {r?.ok && (
            <div className="presu-precio-item">
              <span>
                {plata(r.precioUnitario)} c/u · {plata(r.precioUnitarioCuotas)} en cuotas
              </span>
              {verCostos && r.costos && (
                <span className="small quiet">
                  Ganancia {plata(r.precioUnitario - r.costos.costoUnitario)} c/u · margen real {pct(r.costos.margenReal)} (con redondeo)
                </span>
              )}
            </div>
          )}
          {verCostos && r?.costos && <Desglose item={item} lineas={r.costos.lineas} onCambiar={onCambiar} />}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// Desglose del costo: las piezas de vidrio se pueden cambiar a mano (cantidad y medidas).
type LineaCosto = NonNullable<ResultadoVenta['costos']>['lineas'][number];

function Desglose({ item, lineas, onCambiar }: { item: Item; lineas: LineaCosto[]; onCambiar: (c: Partial<Item>) => void }) {
  const cambiadas = lineas.filter((l) => l.pieza?.original).length + item.extras.length;
  const propias = lineas.filter((l) => !l.id.startsWith('extra_'));
  const vidrios = propias.filter((l) => l.pieza).map((l) => ({ id: l.id, nombre: l.nombre }));
  const costoExtra = (id: string) => {
    const ls = lineas.filter((l) => l.id === id || l.id === `${id}_forma`);
    return ls.length ? ls.reduce((s, l) => s + l.costo, 0) : null;
  };
  const cambiarExtra = (id: string, c: Partial<CampoExtra>) => onCambiar({ extras: item.extras.map((x) => (x.id === id ? { ...x, ...c } : x)) });
  const agregar = () => {
    const n = Math.max(0, ...item.extras.map((x) => Number(x.id.split('_')[1]) || 0)) + 1;
    const como = vidrios.find((v) => /base|pata|lateral/i.test(v.nombre))?.id ?? vidrios[0]?.id ?? '';
    onCambiar({ extras: [...item.extras, { id: `extra_${n}`, nombre: 'Vidrio agregado', como, cantidad: '1', ancho: '', largo: '', forma: false }] });
  };
  const campo = (l: LineaCosto, k: keyof CampoPieza) => {
    const escrito = item.piezas[l.id]?.[k];
    if (escrito != null) return escrito;
    const v = l.pieza ? l.pieza[k] : '';
    return String(Math.round(Number(v) * 10) / 10).replace('.', ',');
  };
  const cambiar = (id: string, k: keyof CampoPieza, v: string) =>
    onCambiar({ piezas: { ...item.piezas, [id]: { ...item.piezas[id], [k]: v } } });
  const restablecer = (id: string) => {
    const resto = { ...item.piezas };
    delete resto[id];
    onCambiar({ piezas: resto });
  };
  return (
    <details className="presu-desglose" open={cambiadas > 0}>
      <summary className="small">
        <strong>Desglose</strong>{' '}
        <span className="quiet">
          · {cambiadas ? `${cambiadas} ${cambiadas === 1 ? 'cambio' : 'cambios'} · ` : ''}cambiá medidas, cantidades o agregá vidrios
        </span>
      </summary>
      <table className="tabla probador-tabla presu-desglose-tabla">
        <tbody>
          {propias.map((l) => (
            <tr key={l.id} className={l.pieza?.original ? 'presu-pieza-cambiada' : undefined}>
              <td>
                {l.nombre}
                {l.pieza && (
                  <div className="presu-pieza">
                    <input aria-label={`${l.nombre}: cantidad`} inputMode="numeric" value={campo(l, 'cantidad')} onChange={(e) => cambiar(l.id, 'cantidad', e.target.value)} />
                    <span>×</span>
                    <input aria-label={`${l.nombre}: ancho (cm)`} inputMode="decimal" value={campo(l, 'ancho')} onChange={(e) => cambiar(l.id, 'ancho', e.target.value)} />
                    <span>×</span>
                    <input aria-label={`${l.nombre}: largo (cm)`} inputMode="decimal" value={campo(l, 'largo')} onChange={(e) => cambiar(l.id, 'largo', e.target.value)} />
                    <span className="quiet">cm</span>
                  </div>
                )}
                {l.pieza?.original && (
                  <div className="xs quiet">
                    Receta: {l.pieza.original.cantidad} × {Math.round((l.pieza.original.ancho ?? 0) * 10) / 10} × {Math.round((l.pieza.original.largo ?? 0) * 10) / 10} ·{' '}
                    <button type="button" className="link-boton" onClick={() => restablecer(l.id)}>
                      volver a la receta
                    </button>
                  </div>
                )}
                {!l.pieza?.original && item.piezas[l.id] && (
                  <div className="xs">
                    <button type="button" className="link-boton" onClick={() => restablecer(l.id)}>
                      volver a la receta
                    </button>
                  </div>
                )}
                {(l.minimoAplicado || l.estimado) && <div className="xs quiet">{[l.minimoAplicado, l.estimado].filter(Boolean).join(' · ')}</div>}
              </td>
              <td className="der num">{plata(l.costo)}</td>
            </tr>
          ))}
          {item.extras.map((x) => {
            const c = costoExtra(x.id);
            return (
              <tr key={x.id} className="presu-pieza-cambiada">
                <td>
                  <div className="presu-pieza">
                    <input aria-label="Nombre del vidrio" className="presu-extra-nombre" value={x.nombre} onChange={(e) => cambiarExtra(x.id, { nombre: e.target.value })} />
                    <select aria-label="Del mismo vidrio que" value={x.como} onChange={(e) => cambiarExtra(x.id, { como: e.target.value })}>
                      {vidrios.map((v) => (
                        <option key={v.id} value={v.id}>
                          vidrio como {v.nombre.toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="presu-pieza">
                    <input aria-label="Cantidad" inputMode="numeric" value={x.cantidad} onChange={(e) => cambiarExtra(x.id, { cantidad: e.target.value })} />
                    <span>×</span>
                    <input aria-label="Ancho (cm)" inputMode="decimal" placeholder="ancho" value={x.ancho} onChange={(e) => cambiarExtra(x.id, { ancho: e.target.value })} />
                    <span>×</span>
                    <input aria-label="Largo (cm)" inputMode="decimal" placeholder="largo" value={x.largo} onChange={(e) => cambiarExtra(x.id, { largo: e.target.value })} />
                    <span className="quiet">cm</span>
                    <label className="xs" style={{ display: 'inline-flex', gap: 4, alignItems: 'center', marginLeft: 6 }}>
                      <input type="checkbox" checked={x.forma} onChange={(e) => cambiarExtra(x.id, { forma: e.target.checked })} /> con forma
                    </label>
                  </div>
                  <div className="xs">
                    {c == null && <span className="quiet">Completá cantidad y medidas · </span>}
                    <button type="button" className="link-boton" onClick={() => onCambiar({ extras: item.extras.filter((y) => y.id !== x.id) })}>
                      quitar
                    </button>
                  </div>
                </td>
                <td className="der num">{c == null ? '—' : plata(c)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {vidrios.length > 0 && item.extras.length < 20 && (
        <button type="button" className="btn btn-chico" style={{ marginTop: 8 }} onClick={agregar}>
          + Agregar vidrio
        </button>
      )}
      <p className="xs quiet" style={{ margin: '6px 0 0' }}>Solo para este presupuesto: la receta del producto no cambia. El cliente no ve el desglose.</p>
    </details>
  );
}
