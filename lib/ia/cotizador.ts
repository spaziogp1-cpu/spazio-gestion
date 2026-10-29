import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cargarCatalogo } from '@/lib/cotizador/catalogo';
import { cargarDatosEditor } from '@/lib/cotizador/editor-datos';
import { cotizar, validarReceta } from '@/lib/cotizador/motor';
import { insumosDeReceta, leerReceta } from '@/lib/cotizador/receta';
import type { Receta } from '@/lib/cotizador/tipos';
import { ErrorUsuario } from './errores';

// Herramientas del cotizador para la IA: productos, márgenes y recetas.
// Solo las ve y las usa quien tiene el permiso de costos (admin o rol con "cotizador.costos").
// Hacen lo mismo que el panel /cotizador/admin/productos, pero con la clave de servicio:
// por eso el permiso se revisa acá y no con las funciones de la base.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = SupabaseClient<any, any, any>;
type Yo = { id: string; nombre: string; email: string };
type Args = Record<string, unknown>;
type Ctx = { db: Cliente; yo: Yo };

export const PERMISO_COSTOS = 'cotizador.costos';

export type HerramientaCotizador = {
  name: string;
  title: string;
  description: string;
  soloLectura: boolean;
  permiso: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  ejecutar: (ctx: Ctx, args: Args) => Promise<unknown>;
};

const str = (v: unknown) => (v == null || v === '' ? null : String(v).trim() || null);
const esUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const pct = (m: number | null | undefined) => (m == null ? null : Math.round(m * 1000) / 10);

/** Margen como lo escribe una persona: 45, "45%" o 0.45 → 0.45. null si no vino. */
export function leerMargenIA(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.').replace('%', '').trim());
  if (!Number.isFinite(n)) throw new ErrorUsuario('El margen tiene que ser un número (por ejemplo 45 para 45%)');
  const m = n > 1 ? n / 100 : n;
  if (m < 0 || m >= 0.95) throw new ErrorUsuario('El margen tiene que estar entre 0 y 94%');
  return m;
}

function recetaDeArgs(v: unknown): Receta {
  let crudo = v;
  if (typeof v === 'string') {
    try {
      crudo = JSON.parse(v);
    } catch {
      throw new ErrorUsuario('La receta tiene que ser un objeto JSON con "entradas" y "lineas"');
    }
  }
  if (!crudo || typeof crudo !== 'object') throw new ErrorUsuario('Falta la receta');
  return leerReceta(crudo);
}

type Producto = { id: string; nombre: string; categoria_id: string | null; descripcion: string | null; foto_url: string | null; tiendanube_url: string | null; activo: boolean };

async function productoPor(db: Cliente, ref: unknown): Promise<Producto> {
  const s = str(ref);
  if (!s) throw new ErrorUsuario('Falta el producto (nombre o id)');
  const campos = 'id, nombre, categoria_id, descripcion, foto_url, tiendanube_url, activo';
  if (esUuid(s)) {
    const { data } = await db.from('cot_productos').select(campos).eq('id', s).maybeSingle();
    if (!data) throw new ErrorUsuario(`No existe el producto ${s}`);
    return data as Producto;
  }
  const { data } = await db.from('cot_productos').select(campos).ilike('nombre', `%${s.replace(/[%_]/g, '')}%`).order('activo', { ascending: false });
  const lista = (data ?? []) as Producto[];
  const exacto = lista.filter((p) => p.nombre.toLowerCase() === s.toLowerCase());
  if (exacto.length === 1) return exacto[0];
  if (lista.length === 1) return lista[0];
  if (!lista.length) throw new ErrorUsuario(`No hay ningún producto que se llame "${s}". Usá cotizador_productos para ver la lista.`);
  throw new ErrorUsuario(`Hay varios productos con "${s}": ${lista.map((p) => p.nombre).join(', ')}. Decime cuál.`);
}

async function categoriaPor(db: Cliente, v: unknown): Promise<string | null> {
  const s = str(v);
  if (!s) return null;
  const { data } = await db.from('cot_categorias').select('id, nombre');
  const cats = (data ?? []) as { id: string; nombre: string }[];
  const c = cats.find((x) => x.id === s || x.nombre.toLowerCase() === s.toLowerCase()) ?? cats.find((x) => x.nombre.toLowerCase().includes(s.toLowerCase()));
  if (!c) throw new ErrorUsuario(`No existe la categoría "${s}". Hay: ${cats.map((x) => x.nombre).join(', ')}`);
  return c.id;
}

type FilaReceta = { id: string; version: number; estado: string; definicion: unknown; nota: string | null; publicado_en: string | null; actualizado_en: string };

async function recetasDe(db: Cliente, productoId: string) {
  const { data, error } = await db
    .from('cot_recetas')
    .select('id, version, estado, definicion, nota, publicado_en, actualizado_en')
    .eq('producto_id', productoId)
    .in('estado', ['borrador', 'publicada']);
  if (error) throw new Error(error.message);
  const lista = (data ?? []) as FilaReceta[];
  return { borrador: lista.find((r) => r.estado === 'borrador') ?? null, publicada: lista.find((r) => r.estado === 'publicada') ?? null };
}

/** El borrador del producto: el que hay, o uno nuevo que copia la versión publicada (o la receta que se pase). */
async function borradorDe(db: Cliente, productoId: string, yo: Yo, inicial?: unknown): Promise<FilaReceta> {
  const { borrador, publicada } = await recetasDe(db, productoId);
  if (borrador) return borrador;
  const { data: max } = await db.from('cot_recetas').select('version').eq('producto_id', productoId).order('version', { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await db
    .from('cot_recetas')
    .insert({
      producto_id: productoId,
      version: (max?.version ?? 0) + 1,
      definicion: inicial ?? publicada?.definicion ?? { entradas: {}, lineas: [] },
      creado_por: yo.id,
    })
    .select('id, version, estado, definicion, nota, publicado_en, actualizado_en')
    .single();
  if (error) {
    // Otro pedido lo creó al mismo tiempo.
    const otra = await recetasDe(db, productoId);
    if (otra.borrador) return otra.borrador;
    throw new Error(error.message);
  }
  return data as FilaReceta;
}

const mismaReceta = (a: unknown, b: unknown) => JSON.stringify(leerReceta(a)) === JSON.stringify(leerReceta(b));

async function margenDe(db: Cliente, productoId: string): Promise<number | null> {
  const { data } = await db.from('cot_margenes').select('margen').eq('producto_id', productoId).maybeSingle();
  return data ? Number(data.margen) : null;
}

const GUIA = `RECETA DEL COTIZADOR (JSON). Una receta dice qué piezas e insumos lleva un producto según las medidas y opciones que se eligen.

{
  "entradas": {                      // lo que se le pregunta al vendedor
    "L": { "tipo": "medida", "nombre": "Largo", "min": 60, "max": 200, "def": 100 },      // cm
    "color": { "tipo": "opcion", "nombre": "Color", "atributo": "color", "permitidos": ["incoloro","gris"], "def": "incoloro" },
    "estante": { "tipo": "opcion", "nombre": "Estante", "permitidos": ["si","no"], "def": "no", "mostrarSi": "L > 80" }
  },
  "orden": ["L", "color", "estante"],  // orden en que se preguntan
  "lineas": [                         // costos, en orden; cada una puede usar las anteriores
    { "id": "tapa", "nombre": "Tapa", "regla": "m2", "insumo": "<código>", "variante": { "color": "color", "espesor": "'10'" }, "ancho": "A", "largo": "L", "cantidad": "1" },
    { "id": "uv", "nombre": "Pegado UV", "regla": "ml", "insumo": "<código>", "metros": "(A + L) * 2 / 100" },
    { "id": "aj", "nombre": "Ajuste Vidpro", "regla": "porcentaje", "porcentaje": "aj.ajuste_vidpro", "sobre": ["tapa"] }
  ],
  "precioMinimo": 0                   // opcional
}

Reglas de línea:
- m2: insumo por m² → ancho y largo en cm (fórmulas) y cantidad de piezas.
- ml: insumo por metro lineal → "metros" por pieza (si falta y hay ancho y largo, usa el perímetro).
- unidad: insumo por unidad → cantidad.
- fijo: el precio del insumo una vez.
- porcentaje: "porcentaje" (0.20 o aj.<ajuste>) sobre el costo de las líneas de "sobre".
- tabla: precio por medida (STG) → "referencia" = la medida con que se busca; si no está, se estima y queda un aviso interno.
- formula: "monto" = fórmula del costo; puede usar "precio" (la tarifa del insumo).
Campos opcionales en cualquier línea: "condicion" (si es falsa, la línea no va), "insumoFormula" (fórmula que devuelve el código del insumo, ej. si(en(color,'incoloro','gris','bronce'), 'float10', 'lam55')), "variante" (atributo del insumo → fórmula, los textos van entre comillas simples), "nota".

Fórmulas: números, textos entre comillas simples, + - * / %, comparaciones (== != < > <= >=), && || !, y las funciones si(cond, a, b), en(valor, 'a', 'b'...), min, max, abs, techo, piso, redondear(x, decimales), numero('10').
Variables: las claves de las entradas (L, A, H, color...), "cantidad", "aj.<ajuste>" (reglas generales; ver cotizador_catalogo) y los resultados de líneas anteriores por su id: tapa.costo, tapa.m2, tapa.ml, tapa.cantidad, tapa.ancho, tapa.largo, tapa.medida.

Cómo trabajar:
1. Para un modelo nuevo, buscá uno parecido (cotizador_productos / cotizador_ver_producto) y partí de su receta.
2. Los códigos de insumo y los valores de cada atributo salen de cotizador_catalogo: no inventes códigos.
3. Guardá con cotizador_guardar_borrador y revisá los avisos.
4. Probá con cotizador_probar con medidas reales y mostrale a la persona piezas, costo y precio.
5. Publicá con cotizador_publicar solo cuando la persona lo confirme: desde ese momento es lo que se cotiza.
Precio de venta = costo ÷ (1 − margen). El margen es por producto y se cambia con cotizador_editar_producto (no hace falta publicar).`;

export const HERRAMIENTAS_COTIZADOR: HerramientaCotizador[] = [
  {
    name: 'cotizador_guia',
    title: 'Cotizador: cómo se arma una receta',
    description: 'Explica el formato de las recetas del cotizador (entradas, líneas, reglas, fórmulas) y los pasos para cargar o cambiar un modelo. Leerla antes de crear o editar una receta.',
    soloLectura: true,
    permiso: PERMISO_COSTOS,
    inputSchema: { type: 'object', properties: {} },
    async ejecutar() {
      return GUIA;
    },
  },
  {
    name: 'cotizador_catalogo',
    title: 'Cotizador: insumos, atributos y reglas',
    description:
      'Lista los insumos (código, tipo, unidad, atributos y qué valores tienen precio), los atributos con sus valores, las categorías y las reglas generales (aj.*). Con "insumo" (código) trae además sus precios vigentes.',
    soloLectura: true,
    permiso: PERMISO_COSTOS,
    inputSchema: { type: 'object', properties: { insumo: { type: 'string', description: 'Código de un insumo para ver sus precios' } } },
    async ejecutar({ db }, a) {
      const codigo = str(a.insumo);
      if (codigo) {
        const { data: ins } = await db.from('cot_insumos').select('id, codigo, nombre, tipo, unidad, atributos, minimo, minimo_por').eq('codigo', codigo).maybeSingle();
        if (!ins) throw new ErrorUsuario(`No existe el insumo "${codigo}"`);
        const { data: tar } = await db
          .from('cot_tarifas')
          .select('variante, referencia, precio, minimo, incremento, nota, vigente_desde')
          .eq('insumo_id', ins.id)
          .is('vigente_hasta', null)
          .limit(2000);
        return { ...ins, id: undefined, precios_vigentes: tar ?? [] };
      }
      const [datos, cats, aj] = await Promise.all([
        cargarDatosEditor(db),
        db.from('cot_categorias').select('nombre').order('orden'),
        db.from('cot_ajustes').select('clave, valor'),
      ]);
      return {
        categorias: (cats.data ?? []).map((c: { nombre: string }) => c.nombre),
        ajustes: Object.fromEntries((aj.data ?? []).map((x: { clave: string; valor: number }) => [x.clave, Number(x.valor)])),
        atributos: datos.atributos,
        insumos: datos.insumos,
      };
    },
  },
  {
    name: 'cotizador_productos',
    title: 'Cotizador: lista de productos',
    description: 'Lista los productos del cotizador con categoría, margen, versión publicada y si tienen cambios en borrador sin publicar. "texto" filtra por nombre.',
    soloLectura: true,
    permiso: PERMISO_COSTOS,
    inputSchema: { type: 'object', properties: { texto: { type: 'string' }, incluir_inactivos: { type: 'boolean' } } },
    async ejecutar({ db }, a) {
      let q = db.from('cot_productos').select('id, nombre, activo, categoria:cot_categorias(nombre), margen:cot_margenes(margen)').order('nombre');
      if (!a.incluir_inactivos) q = q.eq('activo', true);
      const texto = str(a.texto);
      if (texto) q = q.ilike('nombre', `%${texto.replace(/[%_]/g, '')}%`);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const prods = (data ?? []) as unknown as { id: string; nombre: string; activo: boolean; categoria: { nombre: string } | null; margen: { margen: number } | { margen: number }[] | null }[];
      const ids = prods.map((p) => p.id);
      const { data: recs } = ids.length
        ? await db.from('cot_recetas').select('producto_id, version, estado, definicion').in('producto_id', ids).in('estado', ['borrador', 'publicada'])
        : { data: [] };
      const porProd = new Map<string, { borrador?: { definicion: unknown }; publicada?: { version: number; definicion: unknown } }>();
      for (const r of (recs ?? []) as { producto_id: string; version: number; estado: string; definicion: unknown }[]) {
        const x = porProd.get(r.producto_id) ?? {};
        if (r.estado === 'borrador') x.borrador = r;
        else x.publicada = r;
        porProd.set(r.producto_id, x);
      }
      return prods.map((p) => {
        const r = porProd.get(p.id) ?? {};
        const m = Array.isArray(p.margen) ? p.margen[0] : p.margen;
        return {
          id: p.id,
          nombre: p.nombre,
          categoria: p.categoria?.nombre ?? null,
          activo: p.activo,
          margen_pct: m ? pct(Number(m.margen)) : null,
          version_publicada: r.publicada?.version ?? null,
          borrador_sin_publicar: Boolean(r.borrador && (!r.publicada || !mismaReceta(r.borrador.definicion, r.publicada.definicion))),
        };
      });
    },
  },
  {
    name: 'cotizador_ver_producto',
    title: 'Cotizador: ver un producto y su receta',
    description: 'Trae un producto (por nombre o id): datos, margen, la receta publicada (la que se cotiza) y el borrador con sus avisos de validación.',
    soloLectura: true,
    permiso: PERMISO_COSTOS,
    inputSchema: { type: 'object', properties: { producto: { type: 'string', description: 'Nombre o id' } }, required: ['producto'] },
    async ejecutar({ db }, a) {
      const p = await productoPor(db, a.producto);
      const [{ borrador, publicada }, margen, cat, catalogo] = await Promise.all([
        recetasDe(db, p.id),
        margenDe(db, p.id),
        p.categoria_id ? db.from('cot_categorias').select('nombre').eq('id', p.categoria_id).maybeSingle() : Promise.resolve({ data: null }),
        cargarCatalogo(db),
      ]);
      const recBorrador = borrador ? leerReceta(borrador.definicion) : null;
      return {
        ...p,
        categoria: (cat.data as { nombre: string } | null)?.nombre ?? null,
        margen_pct: pct(margen),
        publicada: publicada ? { version: publicada.version, publicada_el: publicada.publicado_en, nota: publicada.nota, receta: leerReceta(publicada.definicion) } : null,
        borrador: borrador
          ? {
              version: borrador.version,
              actualizado: borrador.actualizado_en,
              igual_a_publicada: Boolean(publicada && mismaReceta(borrador.definicion, publicada.definicion)),
              receta: recBorrador,
              avisos: validarReceta(recBorrador!, catalogo),
            }
          : null,
      };
    },
  },
  {
    name: 'cotizador_crear_producto',
    title: 'Cotizador: crear producto',
    description:
      'Crea un producto nuevo en el cotizador, con su margen (por ejemplo 45 para 45%) y categoría. Con "copiar_receta_de" (otro producto) arranca el borrador con la receta publicada de ese producto. Queda sin publicar.',
    soloLectura: false,
    permiso: PERMISO_COSTOS,
    inputSchema: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        categoria: { type: 'string', description: 'Nombre de la categoría' },
        margen: { type: 'number', description: 'Porcentaje, ej. 45' },
        descripcion: { type: 'string', description: 'Texto que lee el cliente en el presupuesto' },
        tiendanube_url: { type: 'string' },
        foto_url: { type: 'string' },
        copiar_receta_de: { type: 'string', description: 'Nombre o id de un producto parecido' },
      },
      required: ['nombre'],
    },
    async ejecutar({ db, yo }, a) {
      const nombre = str(a.nombre);
      if (!nombre) throw new ErrorUsuario('Falta el nombre');
      const margen = leerMargenIA(a.margen);
      for (const campo of ['tiendanube_url', 'foto_url'] as const) {
        const v = str(a[campo]);
        if (v && !/^https:\/\//.test(v)) throw new ErrorUsuario(`${campo} tiene que empezar con https://`);
      }
      const base = a.copiar_receta_de ? await productoPor(db, a.copiar_receta_de) : null;
      const inicial = base ? (await recetasDe(db, base.id)).publicada?.definicion : undefined;
      if (base && !inicial) throw new ErrorUsuario(`${base.nombre} no tiene una receta publicada para copiar`);

      const { data, error } = await db
        .from('cot_productos')
        .insert({
          nombre,
          categoria_id: await categoriaPor(db, a.categoria),
          descripcion: str(a.descripcion),
          tiendanube_url: str(a.tiendanube_url),
          foto_url: str(a.foto_url),
        })
        .select('id, nombre')
        .single();
      if (error) throw new ErrorUsuario(error.message.includes('duplicate') ? `Ya hay un producto que se llama "${nombre}"` : error.message);
      if (margen != null) await db.from('cot_margenes').insert({ producto_id: data.id, margen });
      const b = await borradorDe(db, data.id, yo, inicial);
      return { ok: true, producto: data.nombre, id: data.id, margen_pct: pct(margen), borrador_version: b.version, copiado_de: base?.nombre ?? null };
    },
  },
  {
    name: 'cotizador_editar_producto',
    title: 'Cotizador: editar datos o margen de un producto',
    description:
      'Cambia nombre, categoría, descripción, links, si está activo o el margen (porcentaje, ej. 45) de un producto. El margen rige desde ya, sin publicar. Pasá solo lo que cambia; margen vacío ("") lo borra.',
    soloLectura: false,
    permiso: PERMISO_COSTOS,
    inputSchema: {
      type: 'object',
      properties: {
        producto: { type: 'string', description: 'Nombre o id actual' },
        nombre: { type: 'string' },
        categoria: { type: 'string' },
        margen: { type: ['number', 'string'] },
        descripcion: { type: 'string' },
        tiendanube_url: { type: 'string' },
        foto_url: { type: 'string' },
        activo: { type: 'boolean' },
      },
      required: ['producto'],
    },
    async ejecutar({ db }, a) {
      const p = await productoPor(db, a.producto);
      const cambios: Record<string, unknown> = {};
      if (a.nombre !== undefined) {
        const n = str(a.nombre);
        if (!n) throw new ErrorUsuario('El producto necesita un nombre');
        cambios.nombre = n;
      }
      if (a.categoria !== undefined) cambios.categoria_id = await categoriaPor(db, a.categoria);
      if (a.descripcion !== undefined) cambios.descripcion = str(a.descripcion);
      for (const campo of ['tiendanube_url', 'foto_url'] as const) {
        if (a[campo] === undefined) continue;
        const v = str(a[campo]);
        if (v && !/^https:\/\//.test(v)) throw new ErrorUsuario(`${campo} tiene que empezar con https://`);
        cambios[campo] = v;
      }
      if (typeof a.activo === 'boolean') cambios.activo = a.activo;
      if (Object.keys(cambios).length) {
        const { error } = await db.from('cot_productos').update(cambios).eq('id', p.id);
        if (error) throw new ErrorUsuario(error.message.includes('duplicate') ? 'Ya hay un producto con ese nombre' : error.message);
      }
      let margen: number | null | undefined;
      if (a.margen !== undefined) {
        margen = leerMargenIA(a.margen);
        const { error } =
          margen == null
            ? await db.from('cot_margenes').delete().eq('producto_id', p.id)
            : await db.from('cot_margenes').upsert({ producto_id: p.id, margen }, { onConflict: 'producto_id' });
        if (error) throw new Error(error.message);
      }
      return { ok: true, producto: (cambios.nombre as string) ?? p.nombre, cambios: Object.keys(cambios), ...(margen !== undefined ? { margen_pct: pct(margen) } : {}) };
    },
  },
  {
    name: 'cotizador_guardar_borrador',
    title: 'Cotizador: guardar el borrador de una receta',
    description:
      'Guarda la receta completa (JSON con "entradas", "orden" y "lineas"; ver cotizador_guia) como borrador del producto. No cambia lo que se cotiza hasta publicar. Devuelve los avisos de validación.',
    soloLectura: false,
    permiso: PERMISO_COSTOS,
    inputSchema: {
      type: 'object',
      properties: { producto: { type: 'string' }, receta: { type: 'object', description: 'La receta completa, no solo lo que cambia' } },
      required: ['producto', 'receta'],
    },
    async ejecutar({ db, yo }, a) {
      const p = await productoPor(db, a.producto);
      const receta = recetaDeArgs(a.receta);
      const b = await borradorDe(db, p.id, yo);
      const { error } = await db.from('cot_recetas').update({ definicion: receta }).eq('id', b.id).eq('estado', 'borrador');
      if (error) throw new Error(error.message);
      const avisos = validarReceta(receta, await cargarCatalogo(db));
      return { ok: true, producto: p.nombre, borrador_version: b.version, entradas: Object.keys(receta.entradas).length, lineas: receta.lineas.length, avisos };
    },
  },
  {
    name: 'cotizador_probar',
    title: 'Cotizador: probar una receta con medidas',
    description:
      'Calcula piezas, costo y precio de un producto con medidas y opciones de prueba ("valores", ej. {"L":120,"A":60,"color":"gris"}). Usa el borrador, salvo que pidas "version":"publicada" o pases una "receta" sin guardar. Margen: el del producto, o el que pases.',
    soloLectura: true,
    permiso: PERMISO_COSTOS,
    inputSchema: {
      type: 'object',
      properties: {
        producto: { type: 'string' },
        valores: { type: 'object' },
        version: { type: 'string', enum: ['borrador', 'publicada'] },
        receta: { type: 'object' },
        margen: { type: 'number', description: 'Porcentaje, ej. 45' },
        cantidad: { type: 'number' },
      },
      required: ['producto'],
    },
    async ejecutar({ db }, a) {
      const p = await productoPor(db, a.producto);
      let receta: Receta;
      if (a.receta) receta = recetaDeArgs(a.receta);
      else {
        const { borrador, publicada } = await recetasDe(db, p.id);
        const fila = a.version === 'publicada' ? publicada : borrador ?? publicada;
        if (!fila) throw new ErrorUsuario(`${p.nombre} todavía no tiene receta`);
        receta = leerReceta(fila.definicion);
      }
      const catalogo = await cargarCatalogo(db);
      const validacion = validarReceta(receta, catalogo);
      if (!receta.lineas.length) return { validacion, nota: 'La receta no tiene líneas' };
      const margen = leerMargenIA(a.margen) ?? (await margenDe(db, p.id)) ?? 0.45;
      const valores: Record<string, number | string> = {};
      if (a.valores && typeof a.valores === 'object')
        for (const [k, v] of Object.entries(a.valores as Record<string, unknown>)) if (v != null && v !== '') valores[k] = typeof v === 'number' ? v : String(v);
      const r = cotizar({ receta, catalogo, valores, margen, cantidad: Math.max(1, Math.round(Number(a.cantidad) || 1)) });
      return {
        producto: p.nombre,
        valores,
        margen_pct: pct(margen),
        piezas: r.lineas.map((l) => ({
          id: l.id,
          nombre: l.nombre,
          insumo: l.insumoNombre ?? l.insumo,
          variante: l.variante,
          cantidad: l.cantidad,
          ancho: l.ancho,
          largo: l.largo,
          medida: l.medida,
          unidad: l.unidad,
          precio_unitario: l.precioUnitario,
          costo: l.costo,
          minimo: l.minimoAplicado,
          estimado: l.estimado,
        })),
        costo_unitario: r.costoUnitario,
        precio_transferencia: r.precioUnitario,
        precio_cuotas: r.precioUnitarioCuotas,
        cantidad: r.cantidad,
        precio_total: r.precioTotal,
        margen_real_pct: pct(r.margenReal),
        avisos: [...validacion, ...r.avisos],
      };
    },
  },
  {
    name: 'cotizador_publicar',
    title: 'Cotizador: publicar la receta',
    description:
      'Publica el borrador del producto: desde ese momento es la versión con la que se cotiza (la anterior queda archivada). Usar SOLO después de probarla y de que la persona confirme que la publique. "nota": qué cambió.',
    soloLectura: false,
    permiso: PERMISO_COSTOS,
    inputSchema: { type: 'object', properties: { producto: { type: 'string' }, nota: { type: 'string' } }, required: ['producto'] },
    async ejecutar({ db, yo }, a) {
      const p = await productoPor(db, a.producto);
      const { borrador, publicada } = await recetasDe(db, p.id);
      if (!borrador) throw new ErrorUsuario(`${p.nombre} no tiene un borrador para publicar`);
      if (publicada && mismaReceta(borrador.definicion, publicada.definicion)) throw new ErrorUsuario('El borrador es igual a la versión publicada: no hay nada que publicar');
      const receta = leerReceta(borrador.definicion);
      if (!receta.lineas.length) throw new ErrorUsuario('La receta no tiene líneas');
      const catalogo = await cargarCatalogo(db);
      const errores = validarReceta(receta, catalogo).filter((x) => x.nivel === 'error');
      if (errores.length) return { ok: false, error: 'La receta tiene errores: corregilos antes de publicar', avisos: errores };

      // Una prueba con las medidas por defecto, para no publicar algo que no calcula (igual que el panel).
      const valores: Record<string, number | string> = {};
      for (const [k, e] of Object.entries(receta.entradas)) {
        const def = e.def ?? (e.tipo === 'opcion' ? e.permitidos?.[0] : undefined);
        if (def != null) valores[k] = def;
      }
      const fallas = cotizar({ receta, catalogo, valores, margen: 0.4 }).avisos.filter((x) => x.nivel === 'error' && !/^Falta /.test(x.mensaje));
      if (fallas.length) return { ok: false, error: 'Con las medidas por defecto la receta no calcula: revisá los avisos', avisos: fallas };

      const ahora = new Date().toISOString();
      if (publicada) {
        const { error } = await db.from('cot_recetas').update({ estado: 'archivada' }).eq('id', publicada.id).eq('estado', 'publicada');
        if (error) throw new Error(error.message);
      }
      const { error: e2 } = await db
        .from('cot_recetas')
        .update({ definicion: receta, estado: 'publicada', publicado_por: yo.id, publicado_en: ahora, nota: str(a.nota) ?? borrador.nota })
        .eq('id', borrador.id)
        .eq('estado', 'borrador');
      if (e2) throw new Error(e2.message);
      await db.from('cot_productos').update({ receta_publicada_id: borrador.id }).eq('id', p.id);
      const usados = insumosDeReceta(receta, Object.keys(catalogo.insumos));
      if (usados.length) {
        const { data: ins } = await db.from('cot_insumos').select('id').in('codigo', usados);
        const filas = (ins ?? []).map((i: { id: string }) => ({ receta_id: borrador.id, insumo_id: i.id }));
        if (filas.length) await db.from('cot_receta_insumos').upsert(filas, { onConflict: 'receta_id,insumo_id', ignoreDuplicates: true });
      }
      return { ok: true, producto: p.nombre, version_publicada: borrador.version, anterior: publicada?.version ?? null };
    },
  },
  {
    name: 'cotizador_descartar_borrador',
    title: 'Cotizador: descartar cambios del borrador',
    description: 'Vuelve el borrador del producto a la versión publicada (pierde los cambios sin publicar). Confirmar con la persona antes.',
    soloLectura: false,
    permiso: PERMISO_COSTOS,
    inputSchema: { type: 'object', properties: { producto: { type: 'string' } }, required: ['producto'] },
    async ejecutar({ db }, a) {
      const p = await productoPor(db, a.producto);
      const { borrador, publicada } = await recetasDe(db, p.id);
      if (!publicada) throw new ErrorUsuario('No hay una versión publicada para volver');
      if (!borrador) return { ok: true, producto: p.nombre, nota: 'No había cambios sin publicar' };
      const { error } = await db.from('cot_recetas').update({ definicion: publicada.definicion }).eq('id', borrador.id).eq('estado', 'borrador');
      if (error) throw new Error(error.message);
      return { ok: true, producto: p.nombre, volvio_a_version: publicada.version };
    },
  },
];

/** Permisos extra de una persona del equipo (los admin tienen todos). */
export async function permisosDe(db: Cliente, equipoId: string): Promise<Set<string>> {
  const { data: m } = await db.from('equipo').select('rol, activo').eq('id', equipoId).maybeSingle();
  if (!m?.activo) return new Set();
  if (m.rol === 'admin') return new Set([PERMISO_COSTOS]);
  const { data } = await db.from('permisos').select('permiso').eq('rol', m.rol);
  return new Set((data ?? []).map((x: { permiso: string }) => x.permiso));
}
