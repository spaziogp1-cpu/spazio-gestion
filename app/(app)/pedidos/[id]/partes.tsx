'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { CANALES, ENVIOS, ETAPAS, FORMAS_PAGO, MATERIALES_SUGERIDOS, PRODUCTOS_SUGERIDOS, TIPOS_PAGO, TIPOS_VENTA, siguienteEtapa, nombreEtapa } from '@/lib/constantes';
import { plata } from '@/lib/formato';
import { createClient } from '@/lib/supabase/client';
import type { Item, PedidoResumen } from '@/lib/tipos';
import {
  actualizarPedido,
  agregarComentario,
  agregarPago,
  borrarArchivo,
  borrarItem,
  borrarPago,
  cambiarEtapa,
  guardarItem,
  registrarArchivo,
  type Estado,
} from '../actions';

// Envía el formulario sin que React lo vacíe si hay un error.
function enviar(accion: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => accion(fd));
  };
}

// ---------------------------------------------------------------------
// Etapa
// ---------------------------------------------------------------------
export function SelectorEtapa({ pedidoId, etapa }: { pedidoId: string; etapa: string }) {
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const siguiente = siguienteEtapa(etapa);

  const mover = (nueva: string) =>
    iniciar(async () => {
      setError(null);
      const r = await cambiarEtapa(pedidoId, nueva);
      if (r.error) setError(r.error);
    });

  return (
    <div className="form-bloque">
      {siguiente && (
        <button type="button" className="btn btn-primario btn-bloque" disabled={pendiente} onClick={() => mover(siguiente)}>
          {pendiente ? 'Guardando…' : `Pasar a “${nombreEtapa(siguiente)}”`}
        </button>
      )}
      <div className="campo">
        <label htmlFor="etapa">Etapa actual</label>
        <select id="etapa" value={etapa} disabled={pendiente} onChange={(e) => mover(e.target.value)}>
          {ETAPAS.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="error-form">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------
function CamposItem({ item }: { item?: Item }) {
  return (
    <>
      <datalist id="productos-sugeridos">
        {PRODUCTOS_SUGERIDOS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <datalist id="materiales-sugeridos">
        {MATERIALES_SUGERIDOS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <div className="fila fila-2m">
        <div className="campo">
          <label>Producto</label>
          <input name="producto" type="text" list="productos-sugeridos" defaultValue={item?.producto} required />
        </div>
        <div className="campo">
          <label>Modelo</label>
          <input name="modelo" type="text" defaultValue={item?.modelo ?? ''} />
        </div>
      </div>
      <div className="fila fila-2m">
        <div className="campo">
          <label>Medidas</label>
          <input name="medidas" type="text" className="mono" defaultValue={item?.medidas ?? ''} />
        </div>
        <div className="campo">
          <label>Color</label>
          <input name="color" type="text" defaultValue={item?.color ?? ''} />
        </div>
      </div>
      <div className="fila fila-3">
        <div className="campo">
          <label>Material</label>
          <input name="material" type="text" list="materiales-sugeridos" defaultValue={item?.material ?? ''} />
        </div>
        <div className="campo">
          <label>Puntas</label>
          <input name="puntas" type="text" defaultValue={item?.puntas ?? ''} />
        </div>
        <div className="campo">
          <label>Tapa</label>
          <input name="tapa" type="text" defaultValue={item?.tapa ?? ''} />
        </div>
      </div>
      <div className="fila fila-2m">
        <div className="campo">
          <label>Precio</label>
          <input name="precio" type="text" inputMode="numeric" className="num" defaultValue={item?.precio ?? ''} />
        </div>
        <div className="campo">
          <label>Cantidad</label>
          <input name="cantidad" type="number" min={1} defaultValue={item?.cantidad ?? 1} />
        </div>
      </div>
      <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" name="apto_fotos" defaultChecked={item?.apto_fotos} /> Sirve para fotos y videos
      </label>
    </>
  );
}

export function ItemEditable({ pedidoId, item }: { pedidoId: string; item: Item }) {
  const [editando, setEditando] = useState(false);
  const [estado, accion, guardando] = useActionState<Estado, FormData>(guardarItem.bind(null, pedidoId, item.id), {});
  const [borrando, iniciar] = useTransition();

  useEffect(() => {
    if (estado.ok) setEditando(false);
  }, [estado]);

  if (!editando) {
    const detalle = [item.medidas, item.color, item.material, item.puntas, item.tapa].filter(Boolean).join(' · ');
    return (
      <div className="item acciones" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <div style={{ minWidth: 0 }}>
          <div className="item-titulo">
            {item.cantidad > 1 && `${item.cantidad} × `}
            {item.producto} {item.modelo}
            {item.apto_fotos && <span className="chip" style={{ marginLeft: 6 }}>fotos</span>}
          </div>
          {detalle && <div className="item-detalle">{detalle}</div>}
        </div>
        <div className="acciones" style={{ flexWrap: 'nowrap', alignItems: 'center' }}>
          {item.precio != null && <span className="num small">{plata(item.precio)}</span>}
          <button type="button" className="btn btn-chico btn-fantasma" onClick={() => setEditando(true)}>
            Editar
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={enviar(accion)} className="item form-bloque">
      <CamposItem item={item} />
      {estado.error && <p className="error-form">{estado.error}</p>}
      <div className="acciones">
        <button className="btn btn-primario btn-chico" disabled={guardando}>
          Guardar
        </button>
        <button type="button" className="btn btn-chico" onClick={() => setEditando(false)}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-chico btn-fantasma btn-peligro"
          disabled={borrando}
          onClick={() => confirm('¿Quitar este producto del pedido?') && iniciar(() => borrarItem(pedidoId, item.id))}
          style={{ marginLeft: 'auto' }}
        >
          Quitar
        </button>
      </div>
    </form>
  );
}

export function NuevoItem({ pedidoId }: { pedidoId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, guardando] = useActionState<Estado, FormData>(guardarItem.bind(null, pedidoId, null), {});
  useEffect(() => {
    if (estado.ok) setAbierto(false);
  }, [estado]);

  if (!abierto)
    return (
      <button type="button" className="btn btn-chico" style={{ marginTop: 8 }} onClick={() => setAbierto(true)}>
        + Agregar producto
      </button>
    );
  return (
    <form onSubmit={enviar(accion)} className="item form-bloque">
      <CamposItem />
      {estado.error && <p className="error-form">{estado.error}</p>}
      <div className="acciones">
        <button className="btn btn-primario btn-chico" disabled={guardando}>
          Agregar
        </button>
        <button type="button" className="btn btn-chico" onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------
// Notas
// ---------------------------------------------------------------------
export function FormComentario({ pedidoId }: { pedidoId: string }) {
  const [estado, accion, guardando] = useActionState<Estado, FormData>(agregarComentario.bind(null, pedidoId), {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) ref.current?.reset();
  }, [estado]);
  return (
    <form ref={ref} onSubmit={enviar(accion)} className="form-bloque" style={{ marginTop: 10 }}>
      <textarea name="texto" placeholder="Agregar una nota…" aria-label="Nueva nota" required style={{ minHeight: 60 }} />
      {estado.error && <p className="error-form">{estado.error}</p>}
      <div>
        <button className="btn btn-chico" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Agregar nota'}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------
// Pagos
// ---------------------------------------------------------------------
export function FormPago({ pedidoId, saldo, formaPago }: { pedidoId: string; saldo: number; formaPago: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, guardando] = useActionState<Estado, FormData>(agregarPago.bind(null, pedidoId), {});
  useEffect(() => {
    if (estado.ok) setAbierto(false);
  }, [estado]);

  if (!abierto)
    return (
      <button type="button" className="btn btn-bloque" onClick={() => setAbierto(true)}>
        Registrar pago
      </button>
    );
  return (
    <form onSubmit={enviar(accion)} className="form-bloque">
      <div className="fila fila-2m">
        <div className="campo">
          <label htmlFor="pago_monto">Monto</label>
          <input id="pago_monto" name="monto" type="text" inputMode="numeric" className="num" defaultValue={saldo > 0 ? Math.round(saldo) : ''} required autoFocus />
        </div>
        <div className="campo">
          <label htmlFor="pago_tipo">Tipo</label>
          <select id="pago_tipo" name="tipo" defaultValue="saldo">
            {TIPOS_PAGO.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="fila fila-2m">
        <div className="campo">
          <label htmlFor="pago_medio">Medio</label>
          <select id="pago_medio" name="medio" defaultValue={formaPago ?? 'transferencia'}>
            {FORMAS_PAGO.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="pago_fecha">Fecha</label>
          <input id="pago_fecha" name="fecha" type="date" />
        </div>
      </div>
      {estado.error && <p className="error-form">{estado.error}</p>}
      <div className="acciones">
        <button className="btn btn-primario" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Registrar'}
        </button>
        <button type="button" className="btn" onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function BorrarPago({ pedidoId, pagoId }: { pedidoId: string; pagoId: string }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-fantasma btn-chico"
      aria-label="Borrar pago"
      title="Borrar pago"
      disabled={pendiente}
      style={{ minHeight: 24, padding: '0 4px' }}
      onClick={() => confirm('¿Borrar este pago?') && iniciar(() => borrarPago(pedidoId, pagoId))}
    >
      ×
    </button>
  );
}

// ---------------------------------------------------------------------
// Archivos
// ---------------------------------------------------------------------
export function SubirArchivos({ pedidoId }: { pedidoId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function subir(files: FileList | null) {
    if (!files?.length) return;
    const supabase = createClient();
    setError(null);
    for (const f of Array.from(files)) {
      if (f.size > 20 * 1024 * 1024) {
        setError(`${f.name} pesa más de 20 MB.`);
        continue;
      }
      setSubiendo(f.name);
      const limpio = f.name.normalize('NFD').replace(/[^\w.-]+/g, '_');
      const ruta = `pedidos/${pedidoId}/${crypto.randomUUID()}-${limpio}`;
      const { error: errSubida } = await supabase.storage.from('archivos').upload(ruta, f, { contentType: f.type || undefined });
      if (errSubida) {
        setError(`No se pudo subir ${f.name}.`);
        continue;
      }
      const r = await registrarArchivo(pedidoId, { nombre: f.name, ruta, tipo_mime: f.type || null, tamano: f.size });
      if (r.error) setError(r.error);
    }
    setSubiendo(null);
    if (input.current) input.current.value = '';
    router.refresh();
  }

  return (
    <div style={{ textAlign: 'right' }}>
      <input ref={input} type="file" multiple hidden onChange={(e) => subir(e.target.files)} accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.dwg,.dxf" />
      <button type="button" className="btn btn-chico" disabled={!!subiendo} onClick={() => input.current?.click()}>
        {subiendo ? `Subiendo…` : '+ Subir'}
      </button>
      {error && <div className="xs" style={{ color: 'var(--danger)', marginTop: 4 }}>{error}</div>}
    </div>
  );
}

export function BorrarArchivo({ pedidoId, archivoId, nombre }: { pedidoId: string; archivoId: string; nombre: string }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-fantasma btn-chico btn-peligro"
      disabled={pendiente}
      style={{ minHeight: 24, padding: 0, justifyContent: 'flex-start' }}
      onClick={() => confirm(`¿Borrar ${nombre}?`) && iniciar(() => borrarArchivo(pedidoId, archivoId))}
    >
      Borrar
    </button>
  );
}

// ---------------------------------------------------------------------
// Editar datos del pedido
// ---------------------------------------------------------------------
export function EditarPedido({ p, equipo }: { p: PedidoResumen; equipo: { id: string; nombre: string }[] }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, guardando] = useActionState<Estado, FormData>(actualizarPedido.bind(null, p.id), {});
  useEffect(() => {
    if (estado.ok) setAbierto(false);
  }, [estado]);

  if (!abierto)
    return (
      <button type="button" className="btn" onClick={() => setAbierto(true)}>
        Editar datos del pedido
      </button>
    );

  return (
    <section className="card card-pad">
      <form onSubmit={enviar(accion)} className="form-bloque">
        <h2>Editar pedido</h2>
        <div className="fila fila-2m">
          <div className="campo">
            <label>Canal</label>
            <select name="canal" defaultValue={p.canal}>
              {CANALES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>Tipo de venta</label>
            <select name="tipo_venta" defaultValue={p.tipo_venta}>
              {TIPOS_VENTA.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="campo">
          <label>Vendedor</label>
          <select name="responsable_id" defaultValue={p.responsable_id ?? ''}>
            <option value="">—</option>
            {equipo.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="fila fila-2m">
          <div className="campo">
            <label>Total</label>
            <input name="total" type="text" inputMode="numeric" className="num" defaultValue={Number(p.total) || ''} />
          </div>
          <div className="campo">
            <label>Envío al cliente</label>
            <input name="precio_envio_cliente" type="text" inputMode="numeric" className="num" defaultValue={Number(p.precio_envio_cliente) || ''} />
          </div>
        </div>
        <div className="campo">
          <label>Forma de pago</label>
          <select name="forma_pago" defaultValue={p.forma_pago ?? ''}>
            <option value="">—</option>
            {FORMAS_PAGO.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label>Modalidad de entrega</label>
          <select name="envio" defaultValue={p.envio}>
            {ENVIOS.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="fila fila-2m">
          <div className="campo">
            <label>Fecha límite</label>
            <input name="fecha_limite" type="date" defaultValue={p.fecha_limite} required />
          </div>
          <div className="campo">
            <label>Entrega programada</label>
            <input name="fecha_entrega_programada" type="date" defaultValue={p.fecha_entrega_programada ?? ''} />
          </div>
        </div>
        <div className="campo">
          <label>Horario de entrega</label>
          <input name="hora_entrega_programada" type="time" defaultValue={p.hora_entrega_programada?.slice(0, 5) ?? ''} />
        </div>
        <div className="campo">
          <label>Fecha real de entrega</label>
          <input name="fecha_entrega_real" type="date" defaultValue={p.fecha_entrega_real ?? ''} />
        </div>
        <div className="campo">
          <label>Dirección de entrega</label>
          <input name="direccion_entrega" type="text" defaultValue={p.direccion_entrega ?? ''} />
        </div>
        <div className="campo">
          <label>Observaciones</label>
          <textarea name="observaciones" defaultValue={p.observaciones ?? ''} />
        </div>
        <div className="campo">
          <span className="etiqueta">¿Vino por pauta?</span>
          <div className="segmentado">
            <label>
              <input type="radio" name="pauta" value="si" defaultChecked={p.pauta === true} /> Sí
            </label>
            <label>
              <input type="radio" name="pauta" value="no" defaultChecked={p.pauta === false} /> No
            </label>
            <label>
              <input type="radio" name="pauta" value="" defaultChecked={p.pauta == null} /> No sé
            </label>
          </div>
        </div>
        <div className="fila fila-2m">
          <div className="campo">
            <label>Campaña</label>
            <input name="campana" type="text" defaultValue={p.campana ?? ''} />
          </div>
          <div className="campo">
            <label>DM / Inbound</label>
            <input name="dm_inbound" type="text" defaultValue={p.dm_inbound ?? ''} />
          </div>
        </div>
        {estado.error && <p className="error-form">{estado.error}</p>}
        <div className="acciones">
          <button className="btn btn-primario" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <button type="button" className="btn" onClick={() => setAbierto(false)}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}
