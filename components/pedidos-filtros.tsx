'use client';

import Link from 'next/link';
import { CANALES, ENVIOS, TIPOS_VENTA } from '@/lib/constantes';
import { ORDENES, type FiltrosExtra, type OrdenId } from '@/lib/pedidos-orden';

type Props = {
  filtro: string;
  busqueda: string;
  orden: OrdenId;
  ordenPorDefecto: OrdenId;
  extra: FiltrosExtra;
  equipo: { id: string; nombre: string }[];
  activosExtra: number;
};

/** Ordenar + filtros extra. Es un form GET: cada cambio vuelve a pedir la página con los parámetros nuevos. */
export function PedidosFiltros({ filtro, busqueda, orden, ordenPorDefecto, extra, equipo, activosExtra }: Props) {
  const enviar = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    const form = e.currentTarget.form;
    if (!form) return;
    // No ensuciar la URL con campos vacíos.
    for (const el of Array.from(form.elements) as HTMLInputElement[]) {
      if (el.name) el.disabled = !el.value || (el.name === 'orden' && el.value === ordenPorDefecto);
    }
    form.requestSubmit();
  };

  const limpiar = new URLSearchParams();
  if (filtro !== 'activos') limpiar.set('f', filtro);
  if (busqueda) limpiar.set('q', busqueda);
  if (orden !== ordenPorDefecto) limpiar.set('orden', orden);
  const hrefLimpiar = `/pedidos${limpiar.size ? `?${limpiar}` : ''}`;

  return (
    <form className="orden-pedidos" action="/pedidos" method="get">
      {filtro !== 'activos' && <input type="hidden" name="f" value={filtro} />}
      {busqueda && <input type="hidden" name="q" value={busqueda} />}

      <div className="orden-fila">
        <label className="orden-select">
          <span className="etiqueta">Ordenar por</span>
          <select name="orden" defaultValue={orden} onChange={enviar}>
            {ORDENES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </select>
        </label>

        <details className="mas-filtros" open={activosExtra > 0 || undefined}>
          <summary className="btn">
            Filtros{activosExtra > 0 && <span className="n">{activosExtra}</span>}
          </summary>
          <div className="mas-filtros-grilla">
            <label className="campo">
              <span className="etiqueta">Canal</span>
              <select name="canal" defaultValue={extra.canal ?? ''} onChange={enviar}>
                <option value="">Todos</option>
                {CANALES.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </label>
            <label className="campo">
              <span className="etiqueta">Responsable</span>
              <select name="resp" defaultValue={extra.responsable ?? ''} onChange={enviar}>
                <option value="">Todos</option>
                {equipo.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                <option value="ninguno">Sin responsable</option>
              </select>
            </label>
            <label className="campo">
              <span className="etiqueta">Envío</span>
              <select name="envio" defaultValue={extra.envio ?? ''} onChange={enviar}>
                <option value="">Todos</option>
                {ENVIOS.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </label>
            <label className="campo">
              <span className="etiqueta">Tipo de venta</span>
              <select name="tipo" defaultValue={extra.tipo ?? ''} onChange={enviar}>
                <option value="">Todos</option>
                {TIPOS_VENTA.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </label>
            <label className="campo">
              <span className="etiqueta">Vendido desde</span>
              <input type="date" name="desde" defaultValue={extra.desde ?? ''} onChange={enviar} />
            </label>
            <label className="campo">
              <span className="etiqueta">Vendido hasta</span>
              <input type="date" name="hasta" defaultValue={extra.hasta ?? ''} onChange={enviar} />
            </label>
          </div>
          {activosExtra > 0 && (
            <Link href={hrefLimpiar} className="limpiar-filtros">
              Limpiar filtros
            </Link>
          )}
        </details>
      </div>
    </form>
  );
}
