import { Sidebar, TabBar } from '@/components/navegacion';
import { miembroActual } from '@/lib/sesion';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { miembro, supabase } = await miembroActual();
  const { count } = await supabase
    .from('notificaciones')
    .select('id', { count: 'exact', head: true })
    .eq('usuario_id', miembro.id)
    .is('leida_en', null);
  const avisos = count ?? 0;
  return (
    <div className="shell">
      <Sidebar nombre={miembro.nombre} avisos={avisos} />
      <main className="main">
        <div className="contenido">{children}</div>
      </main>
      <TabBar avisos={avisos} />
    </div>
  );
}
