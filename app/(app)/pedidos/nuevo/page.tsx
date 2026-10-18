import type { Metadata } from 'next';
import Link from 'next/link';
import { IconoVolver } from '@/components/iconos';
import { hoyAR } from '@/lib/fechas';
import { leerReglaPlazo } from '@/lib/parametros';
import { miembroActual } from '@/lib/sesion';
import FormPedido from './form-pedido';

export const metadata: Metadata = { title: 'Nuevo pedido' };

export default async function NuevoPedidoPage() {
  const { miembro, supabase } = await miembroActual();
  const [{ data: equipo }, plazo] = await Promise.all([
    supabase.from('equipo').select('id, nombre').eq('activo', true).order('nombre'),
    leerReglaPlazo(supabase),
  ]);

  return (
    <>
      <Link href="/pedidos" className="volver">
        <IconoVolver /> Pedidos
      </Link>
      <div className="cabecera">
        <h1>Nuevo pedido</h1>
      </div>
      <FormPedido
        equipo={(equipo ?? []) as { id: string; nombre: string }[]}
        yo={miembro.id}
        hoy={hoyAR()}
        regla={plazo.regla}
        feriados={plazo.feriados}
      />
    </>
  );
}
