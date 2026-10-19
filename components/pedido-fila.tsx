import Link from 'next/link';
import { nombreEtapa } from '@/lib/constantes';
import { fechaCorta, relativo } from '@/lib/fechas';
import type { PedidoResumen } from '@/lib/tipos';

export function ChipEtapa({ etapa }: { etapa: string }) {
  return <span className={`chip chip-${etapa}`}>{nombreEtapa(etapa)}</span>;
}

export function PedidoFila({ p }: { p: PedidoResumen }) {
  const entregado = p.etapa === 'entregado' || p.etapa === 'cancelado';
  const fechaRef = p.fecha_entrega_programada ?? p.fecha_limite;
  return (
    <li>
      <Link href={`/pedidos/${p.id}`} className={`pedido-fila etapa-${p.atrasado ? 'atrasado' : p.etapa}`}>
        <div className="arriba">
          <span className="cliente">{p.cliente_nombre}</span>
          <span className="numero mono">#{p.numero}</span>
        </div>
        <div className="productos">{p.productos || 'Sin productos cargados'}</div>
        <div className="derecha">
          {p.atrasado ? <span className="chip chip-atrasado">Atrasado</span> : <ChipEtapa etapa={p.etapa} />}
          {entregado ? (
            <span className="fecha">{fechaCorta(p.fecha_entrega_real)}</span>
          ) : (
            <span className={`fecha${p.atrasado ? ' mal' : ''}`} title={p.fecha_entrega_programada ? 'Entrega programada' : 'Fecha límite'}>
              {fechaCorta(fechaRef)}
              {!p.fecha_entrega_programada && ` · ${relativo(p.dias_restantes)}`}
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}
