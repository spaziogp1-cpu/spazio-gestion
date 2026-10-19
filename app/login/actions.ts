'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type EstadoLogin = { ok?: boolean; error?: string; email?: string };

export async function pedirLink(_prev: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: 'Escribí un email válido.', email };

  const supabase = await createClient();
  const { data: habilitado, error: errHab } = await supabase.rpc('email_habilitado', { p_email: email });
  if (errHab) {
    console.error('email_habilitado', errHab);
    return { error: `No pudimos verificar el email (${errHab.code ?? ''} ${errHab.message}).`, email };
  }
  if (!habilitado) return { error: 'Ese email no está en el equipo. Pedile a Teo que te agregue.', email };

  const h = await headers();
  const origen = h.get('origin') ?? `https://${h.get('host')}`;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origen}/auth/callback`, shouldCreateUser: true },
  });
  if (error) {
    const espera = /seconds|rate/i.test(error.message);
    return {
      error: espera ? 'Ya te mandamos un link hace un momento. Esperá un minuto y probá de nuevo.' : 'No pudimos mandar el link. Probá de nuevo.',
      email,
    };
  }
  return { ok: true, email };
}

export type EstadoCodigo = { error?: string };

// Alternativa al link: el código de 6 dígitos que viene en el mismo email.
// Útil en el celular cuando la app está instalada en la pantalla de inicio.
export async function verificarCodigo(_prev: EstadoCodigo, formData: FormData): Promise<EstadoCodigo> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const token = String(formData.get('codigo') ?? '').replace(/\D/g, '');
  if (token.length < 6) return { error: 'El código tiene 6 dígitos.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) return { error: 'El código no es válido o venció. Pedí uno nuevo.' };
  redirect('/');
}

// Ingreso con email y contraseña (la contraseña se crea en Ajustes o la define un administrador).
export async function entrarConContrasena(_prev: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: 'Escribí un email válido.', email };
  if (!password) return { error: 'Escribí tu contraseña.', email };

  const supabase = await createClient();
  const { data: habilitado } = await supabase.rpc('email_habilitado', { p_email: email });
  if (habilitado === false) return { error: 'Ese email no está en el equipo. Pedile a Teo que te agregue.', email };

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (/rate|too many/i.test(error.message)) return { error: 'Demasiados intentos. Esperá un minuto.', email };
    return { error: 'Email o contraseña incorrectos. Si todavía no tenés contraseña, entrá con un código por email y creala en Ajustes.', email };
  }
  redirect('/');
}
