'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { buscarGlobal } from '@/app/(app)/buscar/actions';
import { nombreEtapa } from '@/lib/constantes';
import { fechaCorta } from '@/lib/fechas';
import { plata } from '@/lib/formato';
import { agrupar, NOMBRE_TIPO, nombreEstado, type RespuestaBusqueda, type Resultado } from '@/lib/buscador/servicio';
import { EVENTO_BUSCADOR } from './boton-buscar';
import { IconoBuscar } from './iconos';
import { SECCIONES } from './navegacion';

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const ACCIONES = [
  { nombre: 'Nuevo pedido', href: '/pedidos/nuevo', claves: 'nuevo pedido venta cargar' },
  { nombre: 'Nuevo presupuesto', href: '/cotizador/nuevo', claves: 'nuevo presupuesto cotizar cotizacion' },
  { nombre: 'Planificar entregas', href: '/entregas/planificar', claves: 'planificar entregas ruta reparto fletero' },
  ...SECCIONES.map((s) => ({ nombre: s.nombre, href: s.href, claves: s.nombre })),
];

const EJEMPLOS = ['atrasados', 'con saldo', 'fabricadas', 'señados este mes', 'por expreso', 'mesa aire'];

const RECIENTES = 'spazio:busquedas';
function leerRecientes(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECIENTES) ?? '[]').slice(0, 5);
  } catch {
    return [];
  }
}
function guardarReciente(q: string) {
  try {
    const lista = [q, ...leerRecientes().filter((x) => x !== q)].slice(0, 5);
    localStorage.setItem(RECIENTES, JSON.stringify(lista));
  } catch {}
}

type Opcion = { clave: string; href: string };

export function Buscador() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const [resp, setResp] = useState<RespuestaBusqueda | null>(null);
  const [activo, setActivo] = useState(0);
  const [recientes, setRecientes] = useState<string[]>([]);
  const [buscando, iniciar] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const turno = useRef(0);

  const abrir = useCallback((texto?: string) => {
    setAbierto(true);
    setRecientes(leerRecientes());
    if (typeof texto === 'string') setQ(texto);
    requestAnimationFrame(() => input.current?.select());
  }, []);
  const cerrar = useCallback(() => setAbierto(false), []);

  // Atajos: Ctrl/⌘+K en cualquier lado, "/" si no se está escribiendo.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const escribiendo = e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable="true"]');
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        abierto ? cerrar() : abrir();
      } else if (e.key === '/' && !escribiendo && !abierto) {
        e.preventDefault();
        abrir();
      }
    };
    const evento = (e: Event) => abrir((e as CustomEvent<string | undefined>).detail);
    window.addEventListener('keydown', tecla);
    window.addEventListener(EVENTO_BUSCADOR, evento);
    return () => {
      window.removeEventListener('keydown', tecla);
      window.removeEventListener(EVENTO_BUSCADOR, evento);
    };
  }, [abierto, abrir, cerrar]);

  // Sin scroll de fondo mientras está abierto.
  useEffect(() => {
    if (!abierto) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = antes;
    };
  }, [abierto]);

  // Busca mientras se escribe (con una pausa corta para no buscar letra por letra).
  useEffect(() => {
    const texto = q.trim();
    if (!texto) {
      setResp(null);
      return;
    }
    const mio = ++turno.current;
    const t = setTimeout(() => {
      iniciar(async () => {
        const r = await buscarGlobal(texto);
        if (mio === turno.current) {
          setResp(r);
          setActivo(0);
        }
      });
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  const accionesQueCoinciden = useMemo(() => {
    const t = sinAcentos(q);
    if (t.length < 2) return [];
    return ACCIONES.filter((a) => sinAcentos(a.claves).split(' ').some((w) => w.startsWith(t)) || sinAcentos(a.nombre).startsWith(t)).slice(0, 3);
  }, [q]);

  const grupos = useMemo(() => agrupar(resp?.resultados ?? []), [resp]);

  // Lista plana de opciones navegables, en el mismo orden en que se ven.
  const opciones: Opcion[] = useMemo(() => {
    const o: Opcion[] = [];
    for (const [, rs] of grupos) for (const r of rs) o.push({ clave: r.tipo + r.id, href: r.href });
    for (const a of accionesQueCoinciden) o.push({ clave: 'a' + a.href, href: a.href });
    if (q.trim()) o.push({ clave: 'todos', href: `/buscar?q=${encodeURIComponent(q.trim())}` });
    return o;
  }, [grupos, accionesQueCoinciden, q]);

  const ir = (href: string) => {
    if (q.trim()) guardarReciente(q.trim());
    setAbierto(false);
    router.push(href);
  };

  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cerrar();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActivo((i) => Math.min(i + 1, opciones.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = opciones[activo];
      if (o) ir(o.href);
    }
  };

  useEffect(() => {
    lista.current?.querySelector('[data-activo="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activo]);

  if (!abierto) return null;

  const indice = (clave: string) => opciones.findIndex((o) => o.clave === clave);
  const sinResultados = resp && !resp.error && resp.resultados.length === 0 && accionesQueCoinciden.length === 0 && !buscando;

  return (
    <div className="paleta-fondo" onMouseDown={(e) => e.target === e.currentTarget && cerrar()}>
      <div className="paleta" role="dialog" aria-modal="true" aria-label="Buscar en la app">
        <div className="paleta-campo">
          <IconoBuscar />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={teclas}
            placeholder="Pedido, cliente, teléfono, producto… o «atrasados con saldo»"
            aria-label="Buscar"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            role="combobox"
            aria-expanded={opciones.length > 0}
            aria-controls="paleta-lista"
            aria-activedescendant={opciones[activo] ? `op-${opciones[activo].clave}` : undefined}
          />
          {buscando && <span className="paleta-cargando" aria-label="Buscando" />}
          <button type="button" className="btn btn-fantasma btn-chico paleta-cerrar" onClick={cerrar}>
            Cerrar
          </button>
        </div>

        {resp && resp.consulta.entendido.length > 0 && (
          <div className="paleta-entendido">
            <span>Entendí:</span>
            {resp.consulta.entendido.map((e) => (
              <span key={e} className="chip-entendido">
                {e}
              </span>
            ))}
            {resp.consulta.texto && <span className="chip-entendido chip-texto">“{resp.consulta.texto}”</span>}
          </div>
        )}

        <div className="paleta-lista" id="paleta-lista" role="listbox" ref={lista}>
          {!q.trim() && (
            <div className="paleta-vacio">
              {recientes.length > 0 && (
                <>
                  <div className="paleta-grupo">Recientes</div>
                  <div className="paleta-ejemplos">
                    {recientes.map((r) => (
                      <button key={r} type="button" className="filtro" onClick={() => setQ(r)}>
                        {r}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="paleta-grupo">Probá con</div>
              <div className="paleta-ejemplos">
                {EJEMPLOS.map((r) => (
                  <button key={r} type="button" className="filtro" onClick={() => setQ(r)}>
                    {r}
                  </button>
                ))}
              </div>
              <p className="paleta-ayuda">
                Busca en pedidos, clientes, presupuestos, tareas, visitas y proveedores. No importan los acentos ni algún error de tipeo. Podés
                escribir un número de pedido (#557), un teléfono en cualquier formato, o combinar filtros: etapa, «atrasados», «con saldo», un mes,
                «flete», «expreso», «tienda nube», «vendidos por …».
              </p>
            </div>
          )}

          {resp?.error && <p className="paleta-error">{resp.error}</p>}

          {resp?.soloPedidos && resp.resultados.length > 0 && (
            <div className="paleta-total">
              {resp.resultados.length === 50 ? 'Más de 50 pedidos' : `${resp.resultados.length} pedido${resp.resultados.length === 1 ? '' : 's'}`}
              {resp.resultados.some((r) => (r.monto ?? 0) > 0) &&
                ` · saldo ${plata(resp.resultados.reduce((s, r) => s + Math.max(r.monto ?? 0, 0), 0))}`}
            </div>
          )}

          {grupos.map(([tipo, rs]) => (
            <div key={tipo}>
              {!resp?.soloPedidos && <div className="paleta-grupo">{NOMBRE_TIPO[tipo]}</div>}
              {rs.map((r) => (
                <FilaResultado key={r.id} r={r} activo={indice(r.tipo + r.id) === activo} onIr={ir} onHover={() => setActivo(indice(r.tipo + r.id))} />
              ))}
            </div>
          ))}

          {accionesQueCoinciden.length > 0 && (
            <div>
              <div className="paleta-grupo">Ir a</div>
              {accionesQueCoinciden.map((a) => {
                const i = indice('a' + a.href);
                return (
                  <button
                    key={a.href}
                    id={`op-a${a.href}`}
                    type="button"
                    role="option"
                    aria-selected={i === activo}
                    data-activo={i === activo}
                    className="paleta-op"
                    onClick={() => ir(a.href)}
                    onMouseMove={() => setActivo(i)}
                  >
                    <span className="paleta-op-titulo">{a.nombre}</span>
                  </button>
                );
              })}
            </div>
          )}

          {sinResultados && (
            <p className="paleta-vacio-texto">
              No encontré nada con «{q.trim()}».{' '}
              {resp.consulta.entendido.length > 0 ? 'Probá sacando algún filtro.' : 'Probá con menos palabras o solo el apellido.'}
            </p>
          )}

          {q.trim() && (
            <button
              type="button"
              id="op-todos"
              role="option"
              aria-selected={indice('todos') === activo}
              data-activo={indice('todos') === activo}
              className="paleta-op paleta-todos"
              onClick={() => ir(`/buscar?q=${encodeURIComponent(q.trim())}`)}
              onMouseMove={() => setActivo(indice('todos'))}
            >
              Ver todos los resultados en una página →
            </button>
          )}
        </div>
        <div className="paleta-pie" aria-hidden="true">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> moverse
          </span>
          <span>
            <kbd>Enter</kbd> abrir
          </span>
          <span>
            <kbd>Esc</kbd> cerrar
          </span>
        </div>
      </div>
    </div>
  );
}

export function FilaResultado({
  r,
  activo = false,
  onIr,
  onHover,
}: {
  r: Resultado;
  activo?: boolean;
  onIr?: (href: string) => void;
  onHover?: () => void;
}) {
  const estado = nombreEstado(r.tipo, r.estado, nombreEtapa);
  const contenido = (
    <>
      <span className={`paleta-tipo tipo-${r.tipo}`} aria-hidden="true" />
      <span className="paleta-op-cuerpo">
        <span className="paleta-op-titulo">{r.titulo}</span>
        {r.detalle && <span className="paleta-op-detalle">{r.detalle}</span>}
      </span>
      <span className="paleta-op-meta">
        {estado && <span className="paleta-estado">{estado}</span>}
        {r.tipo === 'pedido' && (r.monto ?? 0) > 0 && r.estado !== 'cancelado' && <span className="paleta-saldo">debe {plata(r.monto)}</span>}
        {r.tipo === 'presupuesto' && r.monto !== null && <span>{plata(r.monto)}</span>}
        {r.fecha && <span>{r.tipo === 'pedido' ? `límite ${fechaCorta(r.fecha)}` : fechaCorta(r.fecha)}</span>}
      </span>
    </>
  );
  if (!onIr)
    return (
      <Link href={r.href} className="paleta-op">
        {contenido}
      </Link>
    );
  return (
    <button
      type="button"
      id={`op-${r.tipo}${r.id}`}
      role="option"
      aria-selected={activo}
      data-activo={activo}
      className="paleta-op"
      onClick={() => onIr(r.href)}
      onMouseMove={onHover}
    >
      {contenido}
    </button>
  );
}
