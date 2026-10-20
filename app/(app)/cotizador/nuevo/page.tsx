import type { Metadata } from 'next';
import Link from 'next/link';
import { puedeVerCostos } from '@/lib/cotizador/permisos';
import { catalogoVenta, reglasPresupuesto } from '@/lib/cotizador/servicio';
import FormPresupuesto from '../form-presupuesto';

export const metadata: Metadata = { title: 'Nuevo presupuesto' };

export default async function NuevoPresupuestoPage() {
  const [verCostos, catalogo, reglas] = await Promise.all([puedeVerCostos(), catalogoVenta(), reglasPresupuesto()]);
  return (
    <>
      <div className="cabecera">
        <div>
          <Link href="/cotizador" className="volver">
            ← Presupuestos
          </Link>
          <h1>Nuevo presupuesto</h1>
        </div>
      </div>
      <FormPresupuesto catalogo={catalogo} verCostos={verCostos} reglas={reglas} />
    </>
  );
}
