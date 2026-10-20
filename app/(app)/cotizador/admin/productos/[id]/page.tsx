import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cargarDatosEditor } from '@/lib/cotizador/editor-datos';
import { conPermisoCostos } from '@/lib/cotizador/permisos';
import { leerReceta } from '@/lib/cotizador/receta';
import { FormProducto } from '../partes';
import EditorReceta from './editor';

export const metadata: Metadata = { title: 'Receta del producto' };

type Receta = { id: string; version: number; estado: string; definicion: unknown; nota: string | null; publicado_en: string | null; actualizado_en: string };

const fecha = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' }) : '';

export default async function ProductoCotizadorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase } = await conPermisoCostos();

  const [{ data: producto }, { data: cats }, { data: margen }] = await Promise.all([
    supabase.from('cot_productos').select('id, nombre, categoria_id, descripcion, foto_url, tiendanube_url, activo').eq('id', id).maybeSingle(),
    supabase.from('cot_categorias').select('id, nombre').order('orden'),
    supabase.from('cot_margenes').select('margen').eq('producto_id', id).maybeSingle(),
  ]);
  if (!producto) notFound();

  // Siempre hay un borrador para editar (si no existe, se crea copiando la versión publicada).
  await supabase.rpc('cot_borrador', { p_producto: id });
  const [{ data: recetas }, datos] = await Promise.all([
    supabase.from('cot_recetas').select('id, version, estado, definicion, nota, publicado_en, actualizado_en').eq('producto_id', id).order('version', { ascending: false }),
    cargarDatosEditor(supabase),
  ]);
  const lista = (recetas ?? []) as Receta[];
  const borrador = lista.find((r) => r.estado === 'borrador');
  const publicada = lista.find((r) => r.estado === 'publicada');
  const m = margen ? Number(margen.margen) : 0.45;

  return (
    <>
      <div className="cabecera">
        <div>
          <Link href="/cotizador/admin/productos" className="volver">
            ← Productos
          </Link>
          <h1>{producto.nombre}</h1>
          <p className="sub">
            {publicada ? `Se cotiza con la versión ${publicada.version} (publicada el ${fecha(publicada.publicado_en)}).` : 'Todavía no tiene una versión publicada: no se puede cotizar.'}
          </p>
        </div>
      </div>

      {borrador ? (
        <EditorReceta
          key={borrador.id}
          productoId={id}
          inicial={leerReceta(borrador.definicion)}
          margen={m}
          datos={datos}
          version={borrador.version}
          hayPublicada={Boolean(publicada)}
        />
      ) : (
        <p className="error-form">No se pudo abrir el borrador de la receta.</p>
      )}

      <div className="grid-ficha" style={{ marginTop: 12 }}>
        <section className="card">
          <div className="card-titulo">
            <h2>Datos del producto</h2>
          </div>
          <div className="seccion">
            <FormProducto producto={producto} categorias={(cats ?? []) as { id: string; nombre: string }[]} margen={margen ? Number(margen.margen) : null} />
          </div>
        </section>
        <section className="card">
          <div className="card-titulo">
            <h2>Versiones</h2>
          </div>
          <div className="seccion">
            {lista.filter((r) => r.estado !== 'borrador').length === 0 && <p className="small quiet">Ninguna publicada todavía.</p>}
            <ul className="lista">
              {lista
                .filter((r) => r.estado !== 'borrador')
                .map((r) => (
                  <li key={r.id} className="item">
                    <div className="item-titulo">
                      Versión {r.version} {r.estado === 'publicada' && <span className="chip chip-entregado">en uso</span>}
                    </div>
                    <div className="item-detalle">
                      {fecha(r.publicado_en)}
                      {r.nota ? ` · ${r.nota}` : ''}
                    </div>
                  </li>
                ))}
            </ul>
            <p className="small quiet" style={{ marginTop: 8 }}>
              Las versiones anteriores quedan guardadas: cada presupuesto recuerda con cuál se calculó.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
