import { createBrowserClient } from '@supabase/ssr';

// En el navegador las variables NEXT_PUBLIC_* se reemplazan al compilar,
// por eso se leen directamente acá.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!,
  );
}
