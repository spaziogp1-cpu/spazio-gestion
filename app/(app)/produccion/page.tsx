import type { Metadata } from 'next';
import Link from 'next/link';
import { ETAPAS, ETAPAS_ACTIVAS } from '@/lib/constantes';
import { fechaCorta, relativo } from '@/lib/fechas';
import { miembroActual } from '@/lib/sesion';
import type { PedidoResumen } from '@/lib/tipos';

export const metadata: Metadata = { title: 'Producción' };

export default async function ProduccionPage() {
  const { supabase } = await miembroActual();
  const { data } = await supabase
    .from('pedidos_resumen')
    .select('*')
    .in('etapa', ETAPAS_ACTIVAS)
    .order('fecha_limite', { ascending: true })
    .limit(500);
  const pedidos = (data ?? []) as PedidoResumen[];
  const columnas = ETAPAS.filter((e) => ETAPAS_ACTIVAS.includes(e.id));

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Producción</h1>
          <p className="sub">Pedidos activos por etapa, ordenados por fecha límite. Para mover uno, abrilo.</p>
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridAutoFlow: 'column',
          gridAutoColumns: 'minmax(250px, 1fr)',
          gap: 12,
          overflowX: 'auto',
          paddingBottom: 8,
        }}
      >
        {columnas.map((col) => {
          const lista = pedidos.filter((p) => p.etapa === col.id);
          return (
            <section key={col.id} className="card" style={{ alignSelf: 'start' }}>
              <div className="card-titulo">
                <span className={`chip chip-${col.id}`}>{col.nombre}</span>
                <span className="quiet small num">{lista.length}</span>
              </div>
              <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {lista.length === 0 && <p className="faint small" style={{ padding: 8 }}>Vacío</p>}
                {lista.map((p) => (
                  <Link
                    key={p.id}
                    href={`/pedidos/${p.id}`}
                    style={{
                      display: 'block',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: `1px solid ${p.atrasado ? 'var(--danger)' : 'var(--line)'}`,
                      background: p.atrasado ? 'var(--danger-soft)' : 'var(--surface)',
                    }}
                  >
                    <div style={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.cliente_nombre}</span>
                      <span className="mono faint small">#{p.numero}</span>
                    </div>
                    <div className="small quiet" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.productos || '—'}
                    </div>
                    <div className="xs" style={{ marginTop: 4, color: p.atrasado ? 'var(--danger)' : 'var(--ink-3)', fontWeight: p.atrasado ? 600 : 400 }}>
                      {fechaCorta(p.fecha_entrega_programada ?? p.fecha_limite)} · {relativo(p.dias_restantes)}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
