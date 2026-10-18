import { Sidebar, TabBar } from '@/components/navegacion';
import { miembroActual } from '@/lib/sesion';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { miembro } = await miembroActual();
  return (
    <div className="shell">
      <Sidebar nombre={miembro.nombre} />
      <main className="main">
        <div className="contenido">{children}</div>
      </main>
      <TabBar />
    </div>
  );
}
