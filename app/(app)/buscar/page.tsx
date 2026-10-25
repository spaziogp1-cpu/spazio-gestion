import type { Metadata } from 'next';
import { FilaResultado } from '@/components/buscador';
import { agrupar, buscar, NOMBRE_TIPO } from '@/lib/buscador/servicio';
import { plata } from '@/lib/formato';
import { miembroActual } from '@/lib/sesion';

export const metadata: Metadata = { title: 'Buscar' };

export default async function BuscarPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams;
  const { supabase } = await miembroActual();
  const texto = q.trim();
  const resp = texto ? await buscar(supabase, texto, 30) : null;
  const grupos = agrupar(resp?.resultados ?? []);
  const saldo = resp?.soloPedidos ? resp.resultados.reduce((s, r) => s + Math.max(r.monto ?? 0, 0), 0) : 0;

  return (
    <>
      <h1>Buscar</h1>
      <form action="/buscar" className="buscar-pagina-form" role="search">
        <input
          name="q"
          type="search"
          defaultValue={texto}
          placeholder="Pedido, cliente, teléfono, producto… o «atrasados con saldo»"
          aria-label="Buscar"
          autoFocus={!texto}
          enterKeyHint="search"
        />
        <button className="btn btn-primario">Buscar</button>
      </form>

      {resp && resp.consulta.entendido.length > 0 && (
        <div className="paleta-entendido" style={{ padding: '12px 0 0' }}>
          <span>Entendí:</span>
          {resp.consulta.entendido.map((e) => (
            <span key={e} className="chip-entendido">
              {e}
            </span>
          ))}
          {resp.consulta.texto && <span className="chip-entendido chip-texto">“{resp.consulta.texto}”</span>}
        </div>
      )}

      {resp?.error && <p className="paleta-error">{resp.error}</p>}

      {resp && !resp.error && resp.resultados.length === 0 && (
        <p className="paleta-tenue" style={{ marginTop: 24 }}>
          No encontré nada con «{texto}». {resp.consulta.entendido.length > 0 ? 'Probá sacando algún filtro.' : 'Probá con menos palabras o solo el apellido.'}
        </p>
      )}

      {resp?.soloPedidos && resp.resultados.length > 0 && (
        <p className="paleta-total" style={{ padding: '16px 0 0' }}>
          {resp.resultados.length === 50 ? 'Más de 50 pedidos (se muestran los primeros 50)' : `${resp.resultados.length} pedido${resp.resultados.length === 1 ? '' : 's'}`}
          {saldo > 0 && ` · saldo total ${plata(saldo)}`}
        </p>
      )}

      {grupos.map(([tipo, rs]) => (
        <section key={tipo} className="card buscar-pagina-grupo">
          <h2>
            {NOMBRE_TIPO[tipo]} <span className="paleta-tenue">({rs.length})</span>
          </h2>
          <div className="buscar-pagina-lista">
            {rs.map((r) => (
              <FilaResultado key={r.id} r={r} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
