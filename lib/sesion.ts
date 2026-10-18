import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Miembro } from '@/lib/tipos';

// Devuelve la persona del equipo que está usando la app.
// Si alguien entró con un email que no es del equipo, lo saca.
export async function miembroActual(): Promise<{ miembro: Miembro; supabase: Awaited<ReturnType<typeof createClient>> }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login');

  const { data } = await supabase
    .from('equipo')
    .select('id, nombre, alias_planilla, email, rol')
    .ilike('email', user.email)
    .eq('activo', true)
    .maybeSingle();

  if (!data) {
    await supabase.auth.signOut();
    redirect('/login?error=no-habilitado');
  }
  return { miembro: data as Miembro, supabase };
}
