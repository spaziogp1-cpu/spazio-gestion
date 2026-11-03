import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Miembro } from '@/lib/tipos';

// Devuelve la persona del equipo que está usando la app.
// Si alguien entró con un email que no es del equipo, lo saca.
// `cache`: el layout, la página y los metadatos de una misma visita comparten una sola
// consulta en vez de repetirla cada uno.
export const miembroActual = cache(async (): Promise<{ miembro: Miembro; supabase: Awaited<ReturnType<typeof createClient>> }> => {
  const supabase = await createClient();
  // getClaims valida la sesión sin consultar al servidor de Supabase en cada visita
  // (si el proyecto usa claves de firma nuevas; si no, consulta igual que antes).
  const { data: auth } = await supabase.auth.getClaims();
  const email = typeof auth?.claims?.email === 'string' ? auth.claims.email : null;
  if (!email) redirect('/login');

  const { data } = await supabase
    .from('equipo')
    .select('id, nombre, alias_planilla, email, rol')
    .ilike('email', email)
    .eq('activo', true)
    .maybeSingle();

  if (!data) {
    await supabase.auth.signOut();
    redirect('/login?error=no-habilitado');
  }
  return { miembro: data as Miembro, supabase };
});
