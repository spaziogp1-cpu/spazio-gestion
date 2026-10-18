import type { Metadata } from 'next';
import { ETAPAS_ACTIVAS } from '@/lib/constantes';
import { miembroActual } from '@/lib/sesion';
import type { PedidoResumen } from '@/lib/tipos';
import Tablero from './tablero';

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
  const atrasados = pedidos.filter((p) => p.atrasado).length;

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Producción</h1>
          <p className="sub">
            {pedidos.length} pedidos activos
            {atrasados > 0 && <span style={{ color: 'var(--danger)', fontWeight: 600 }}> · {atrasados} atrasados</span>}
            <span className="faint"> · Arrastrá una tarjeta a otra columna o tocá la flecha para avanzarla.</span>
          </p>
        </div>
      </div>
      <Tablero pedidos={pedidos} />
    </>
  );
}
