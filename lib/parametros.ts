import type { createClient } from '@/lib/supabase/server';
import type { ReglaPlazo } from '@/lib/fechas';

type Cliente = Awaited<ReturnType<typeof createClient>>;

export async function leerReglaPlazo(supabase: Cliente): Promise<{ regla: ReglaPlazo; feriados: string[] }> {
  const [{ data: params }, { data: fer }] = await Promise.all([
    supabase.from('parametros').select('clave, valor').in('clave', ['plazo_entrega_dias', 'plazo_entrega_tipo']),
    supabase.from('feriados').select('fecha'),
  ]);
  const mapa = new Map((params ?? []).map((p: { clave: string; valor: string }) => [p.clave, p.valor]));
  const dias = Number(mapa.get('plazo_entrega_dias') ?? 28);
  const tipo = mapa.get('plazo_entrega_tipo') === 'habiles' ? 'habiles' : 'corridos';
  return {
    regla: { dias: Number.isFinite(dias) && dias > 0 ? dias : 28, tipo },
    feriados: (fer ?? []).map((f: { fecha: string }) => f.fecha),
  };
}
