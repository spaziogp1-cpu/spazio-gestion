import type { Metadata } from 'next';
import Link from 'next/link';
import { IconoVolver } from '@/components/iconos';
import { hoyAR } from '@/lib/fechas';
import { leerReglaPlazo } from '@/lib/parametros';
import { miembroActual } from '@/lib/sesion';
import { datosParaPedido } from '@/lib/cotizador/a-pedido';
import FormPedido from './form-pedido';

export const metadata: Metadata = { title: 'Nuevo pedido' };

export default async function NuevoPedidoPage({
  searchParams,
}: {
  searchParams: Promise<{ nombre?: string; telefono?: string; canal?: string; presupuesto?: string }>;
}) {
  const inicial = await searchParams;
  const { miembro, supabase } = await miembroActual();
  const [{ data: equipo }, plazo, desde] = await Promise.all([
    supabase.from('equipo').select('id, nombre').eq('activo', true).order('nombre'),
    leerReglaPlazo(supabase),
    inicial.presupuesto ? datosParaPedido(inicial.presupuesto) : Promise.resolve(null),
  ]);
  const presu = desde?.datos;

  return (
    <>
      <Link href="/pedidos" className="volver">
        <IconoVolver /> Pedidos
      </Link>
      <div className="cabecera">
        <h1>Nuevo pedido</h1>
      </div>
      {desde?.error && <p className="error-form">{desde.error}</p>}
      <FormPedido
        equipo={(equipo ?? []) as { id: string; nombre: string }[]}
        yo={miembro.id}
        hoy={hoyAR()}
        regla={plazo.regla}
        feriados={plazo.feriados}
        inicial={
          presu
            ? {
                nombre: presu.nombre,
                telefono: presu.telefono,
                canal: inicial.canal ?? '',
                cliente: presu.cliente,
                items: presu.items,
                total: presu.total,
                observaciones: presu.observaciones,
                presupuestoId: presu.presupuestoId,
                presupuestoNumero: presu.numero,
              }
            : { nombre: inicial.nombre ?? '', telefono: inicial.telefono ?? '', canal: inicial.canal ?? '' }
        }
      />
    </>
  );
}
