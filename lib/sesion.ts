import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Miembro } from '@/lib/tipos';

type Cliente = Awaited<ReturnType<typeof createClient>>;

// Email de quien está usando la app.
// getClaims() valida la sesión localmente (firma del token) sin ir al servidor de Supabase en cada
// pantalla; si el proyecto todavía usa la clave de firma vieja, la propia librería cae en getUser().
export async function emailSesion(supabase: Cliente): Promise<string | null> {
  const auth = supabase.auth as Cliente['auth'] & {
    getClaims?: () => Promise<{ data: { claims?: { email?: string } } | null }>;
  };
  if (typeof auth.getClaims === 'function') {
    const { data } = await auth.getClaims();
    const email = (data?.claims as { email?: string } | undefined)?.email;
    if (email) return email;
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? null;
}

// Devuelve la persona del equipo que está usando la app.
// Si alguien entró con un email que no es del equipo, lo saca.
// Va con cache(): el layout y la página lo piden en la misma carga y así se resuelve una sola vez.
export const miembroActual = cache(async (): Promise<{ miembro: Miembro; supabase: Cliente }> => {
  const supabase = await createClient();
  const email = await emailSesion(supabase);
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

// Equipo activo (para selects de responsable, etc.), una sola vez por carga.
export const equipoActivo = cache(async (): Promise<{ id: string; nombre: string }[]> => {
  const { supabase } = await miembroActual();
  const { data } = await supabase.from('equipo').select('id, nombre').eq('activo', true).order('nombre');
  return (data ?? []) as { id: string; nombre: string }[];
});
