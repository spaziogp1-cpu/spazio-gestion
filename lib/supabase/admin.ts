import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { supabaseUrl } from './config';

// Cliente con permisos completos. Solo para procesos del servidor (el resumen diario),
// nunca en el navegador ni en respuesta a lo que pide un usuario.
// `usuario` queda registrado en el historial como autor de los cambios
// (un email, "email#ia" para el asistente, o un texto como "Tienda Nube").
export function crearAdmin(usuario?: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY');
  return createClient(supabaseUrl(), key.trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: usuario ? { headers: { 'x-spazio-usuario': usuario } } : undefined,
  });
}
