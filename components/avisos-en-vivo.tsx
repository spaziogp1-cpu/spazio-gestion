'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Nuevo = { id: string; titulo: string; cuerpo: string | null };

// Con la app abierta: cuando llega un aviso se actualiza el número de sin leer y se muestra un cartel.
// Con la app cerrada, los avisos quedan guardados y se ven al entrar.
export function AvisosEnVivo({ usuarioId }: { usuarioId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [nuevo, setNuevo] = useState<Nuevo | null>(null);

  useEffect(() => {
    const canal = supabase
      .channel(`avisos-${usuarioId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `usuario_id=eq.${usuarioId}` }, (p) => {
        const n = p.new as Nuevo;
        setNuevo({ id: n.id, titulo: n.titulo, cuerpo: n.cuerpo });
        router.refresh();
      })
      .subscribe();
    // Al volver a la pestaña (por ejemplo, después de tener el celular bloqueado) se trae lo nuevo.
    const alVolver = () => document.visibilityState === 'visible' && router.refresh();
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      supabase.removeChannel(canal);
    };
  }, [supabase, usuarioId, router]);

  useEffect(() => {
    if (!nuevo) return;
    const t = setTimeout(() => setNuevo(null), 12000);
    return () => clearTimeout(t);
  }, [nuevo]);

  if (!nuevo) return null;
  return (
    <div className="aviso-toast" role="status">
      <Link href={`/avisos/abrir/${nuevo.id}`} prefetch={false} onClick={() => setNuevo(null)}>
        <strong>{nuevo.titulo}</strong>
        {nuevo.cuerpo && <span>{nuevo.cuerpo}</span>}
      </Link>
      <button type="button" onClick={() => setNuevo(null)} aria-label="Cerrar">
        ×
      </button>
    </div>
  );
}
