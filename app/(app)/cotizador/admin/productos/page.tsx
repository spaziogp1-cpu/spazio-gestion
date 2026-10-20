import type { Metadata } from 'next';
import Link from 'next/link';
import { conPermisoCostos } from '@/lib/cotizador/permisos';
import { FormNuevoProducto } from './partes';

export const metadata: Metadata = { title: 'Productos del cotizador' };

type Fila = {
  id: string;
  nombre: string;
  activo: boolean;
  foto_url: string | null;
  categoria_id: string | null;
  receta_publicada_id: string | null;
  cot_margenes: { margen: number | string } | { margen: number | string }[] | null;
  cot_recetas: { version: number; estado: string }[];
};

export default async function ProductosCotizadorPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver } = await searchParams;
  const todos = ver === 'todos';
  const { supabase } = await conPermisoCostos();
  const [{ data: cats }, { data: prods }] = await Promise.all([
    supabase.from('cot_categorias').select('id, nombre, orden').order('orden'),
    supabase
      .from('cot_productos')
      .select('id, nombre, activo, foto_url, categoria_id, receta_publicada_id, cot_margenes(margen), cot_recetas!cot_recetas_producto_id_fkey(version, estado)')
      .order('orden')
      .order('nombre'),
  ]);
  const categorias = (cats ?? []) as { id: string; nombre: string }[];
  const productos = ((prods ?? []) as unknown as Fila[]).filter((p) => todos || p.activo);
  const grupos = [
    ...categorias.map((c) => ({ id: c.id, nombre: c.nombre, lista: productos.filter((p) => p.categoria_id === c.id) })),
    { id: 'sin', nombre: 'Sin categoría', lista: productos.filter((p) => !p.categoria_id || !categorias.some((c) => c.id === p.categoria_id)) },
  ].filter((g) => g.lista.length);

  const margenDe = (p: Fila) => {
    const m = Array.isArray(p.cot_margenes) ? p.cot_margenes[0] : p.cot_margenes;
    return m ? Number(m.margen) : null;
  };
  const estadoDe = (p: Fila) => {
    const pub = p.cot_recetas.find((r) => r.estado === 'publicada');
    const bor = p.cot_recetas.find((r) => r.estado === 'borrador');
    if (!pub) return { txt: 'Sin publicar', clase: 'chip chip-atrasado' };
    return { txt: `Versión ${pub.version}${bor ? ' · con cambios en borrador' : ''}`, clase: 'chip chip-entregado' };
  };

  return (
    <>
      <div className="cabecera">
        <div>
          <h1>Productos del cotizador</h1>
          <p className="sub">Cada producto tiene su receta: qué piezas lleva y cómo salen sus medidas. Solo se cotiza la versión publicada.</p>
        </div>
        <div className="acciones">
          <Link href="/cotizador/admin" className="btn">
            Precios
          </Link>
        </div>
      </div>

      <div className="grid-ficha">
        <div className="col">
          <div className="filtros">
            <Link href="/cotizador/admin/productos" className="filtro" aria-current={!todos ? 'true' : undefined}>
              Activos
            </Link>
            <Link href="/cotizador/admin/productos?ver=todos" className="filtro" aria-current={todos ? 'true' : undefined}>
              Todos
            </Link>
          </div>
          {grupos.length === 0 && (
            <section className="card">
              <p className="vacio">Todavía no hay productos. Creá el primero con el formulario.</p>
            </section>
          )}
          {grupos.map((g) => (
            <section className="card" key={g.id}>
              <div className="card-titulo">
                <h2>{g.nombre}</h2>
                <span className="quiet small">{g.lista.length}</span>
              </div>
              <ul className="lista">
                {g.lista.map((p) => {
                  const est = estadoDe(p);
                  const m = margenDe(p);
                  return (
                    <li key={p.id}>
                      <Link href={`/cotizador/admin/productos/${p.id}`} className="producto-fila">
                        {p.foto_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.foto_url} alt="" className="producto-foto" />
                        ) : (
                          <span className="producto-foto" aria-hidden="true" />
                        )}
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontWeight: 600, display: 'block' }}>
                            {p.nombre} {!p.activo && <span className="chip chip-cancelado">inactivo</span>}
                          </span>
                          <span className="small quiet">{m != null ? `Margen ${Math.round(m * 1000) / 10}%` : 'Sin margen'}</span>
                        </span>
                        <span className={est.clase}>{est.txt}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
        <div className="col">
          <section className="card">
            <div className="card-titulo">
              <h2>Nuevo producto</h2>
            </div>
            <div className="seccion">
              <FormNuevoProducto categorias={categorias} />
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
