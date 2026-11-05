import type { createClient } from '@/lib/supabase/server';
import type { ReglaPlazo } from '@/lib/fechas';
import { CLAVES_PLAZO, leerPlazos, reglaDe, type Plazos } from '@/lib/plazos';

type Cliente = Awaited<ReturnType<typeof createClient>>;

/**
 * Plazos de producción y feriados.
 * `regla` es la de los productos sin estructura cromada; `reglaCromado`, la de los que la llevan.
 * Para un pedido puntual usá `reglaDe(pedidoLlevaCromado(items), plazos)`.
 */
export async function leerReglaPlazo(
  supabase: Cliente,
): Promise<{ regla: ReglaPlazo; reglaCromado: ReglaPlazo; plazos: Plazos; feriados: string[] }> {
  const [{ data: params }, { data: fer }] = await Promise.all([
    supabase.from('parametros').select('clave, valor').in('clave', Object.values(CLAVES_PLAZO)),
    supabase.from('feriados').select('fecha'),
  ]);
  const mapa = new Map<string, string>(((params ?? []) as { clave: string; valor: string }[]).map((p) => [p.clave, p.valor]));
  const plazos = leerPlazos(mapa);
  return {
    regla: reglaDe(false, plazos),
    reglaCromado: reglaDe(true, plazos),
    plazos,
    feriados: (fer ?? []).map((f: { fecha: string }) => f.fecha),
  };
}
