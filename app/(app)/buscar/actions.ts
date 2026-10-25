'use server';

import { buscar, type RespuestaBusqueda } from '@/lib/buscador/servicio';
import { miembroActual } from '@/lib/sesion';

export async function buscarGlobal(entrada: string): Promise<RespuestaBusqueda> {
  const { supabase } = await miembroActual();
  return buscar(supabase, String(entrada ?? ''), 6);
}
