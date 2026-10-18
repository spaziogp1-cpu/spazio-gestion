'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { ETAPAS, ETAPAS_ACTIVAS, nombreEtapa, siguienteEtapa, type EtapaId } from '@/lib/constantes';
import { fechaCorta, relativo } from '@/lib/fechas';
import type { PedidoResumen } from '@/lib/tipos';
import { cambiarEtapa } from '../pedidos/actions';

export default function Tablero({ pedidos }: { pedidos: PedidoResumen[] }) {
  // Etapas cambiadas en esta pantalla, antes de que vuelva la respuesta del servidor.
  const [movidos, setMovidos] = useState<Record<string, string>>({});
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  const columnas = ETAPAS.filter((e) => ETAPAS_ACTIVAS.includes(e.id));
  const etapaDe = (p: PedidoResumen) => movidos[p.id] ?? p.etapa;
  const visibles = useMemo(
    () => pedidos.filter((p) => ETAPAS_ACTIVAS.includes((movidos[p.id] ?? p.etapa) as EtapaId) || movidos[p.id] === 'entregado'),
    [pedidos, movidos],
  );

  function mover(p: PedidoResumen, destino: string) {
    const anterior = etapaDe(p);
    if (anterior === destino) return;
    setError(null);
    setMovidos((m) => ({ ...m, [p.id]: destino }));
    iniciar(async () => {
      const r = await cambiarEtapa(p.id, destino);
      if (r.error) {
        setMovidos((m) => ({ ...m, [p.id]: anterior }));
        setError(`No se pudo mover el #${p.numero}: ${r.error}`);
      }
    });
  }

  return (
    <>
      {error && <p className="error-form" style={{ marginBottom: 12 }}>{error}</p>}
      <div className="tablero">
        {columnas.map((col) => {
          const lista = visibles.filter((p) => etapaDe(p) === col.id);
          return (
            <section
              key={col.id}
              className={`card columna${sobre === col.id ? ' columna-sobre' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                if (sobre !== col.id) setSobre(col.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setSobre(null);
                const id = e.dataTransfer.getData('text/plain') || arrastrando;
                const p = pedidos.find((x) => x.id === id);
                if (p) mover(p, col.id);
                setArrastrando(null);
              }}
            >
              <div className="card-titulo">
                <span className={`chip chip-${col.id}`}>{col.nombre}</span>
                <span className="quiet small num">{lista.length}</span>
              </div>
              <div className="columna-lista">
                {lista.length === 0 && <p className="faint small" style={{ padding: 8 }}>Vacío</p>}
                {lista.map((p) => {
                  const sig = siguienteEtapa(etapaDe(p));
                  return (
                    <article
                      key={p.id}
                      className={`tarjeta${p.atrasado ? ' tarjeta-mal' : ''}${arrastrando === p.id ? ' tarjeta-arrastrando' : ''}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', p.id);
                        e.dataTransfer.effectAllowed = 'move';
                        setArrastrando(p.id);
                      }}
                      onDragEnd={() => {
                        setArrastrando(null);
                        setSobre(null);
                      }}
                    >
                      <Link href={`/pedidos/${p.id}`} className="tarjeta-link" draggable={false}>
                        <div className="tarjeta-arriba">
                          <span className="tarjeta-cliente">{p.cliente_nombre}</span>
                          <span className="mono faint small">#{p.numero}</span>
                        </div>
                        <div className="small quiet tarjeta-productos">{p.productos || '—'}</div>
                        {p.prov_resumen && <div className="xs faint">{p.prov_resumen}</div>}
                        <div className={`xs tarjeta-fecha${p.atrasado ? ' mal' : ''}`}>
                          {fechaCorta(p.fecha_entrega_programada ?? p.fecha_limite)} · {relativo(p.dias_restantes)}
                        </div>
                      </Link>
                      {sig && (
                        <button
                          type="button"
                          className="btn btn-chico tarjeta-avanzar"
                          onClick={() => mover(p, sig)}
                          title={`Pasar a ${nombreEtapa(sig)}`}
                        >
                          → {ETAPAS.find((e) => e.id === sig)?.corto}
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
