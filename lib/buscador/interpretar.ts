// Interpreta lo que se escribe en el buscador global: separa número de pedido, teléfono,
// filtros ("atrasados", "con saldo", "fabricada", "octubre", "flete"…) y el texto libre.
// Sin IA: reglas simples, rápidas y predecibles.

export type Filtros = {
  etapas?: string[];
  atrasado?: boolean;
  con_saldo?: boolean;
  desde?: string;
  hasta?: string;
  envio?: string;
  canal?: string;
  tipo_venta?: string;
  vendedor?: string;
  solo?: 'pedidos' | 'clientes' | 'presupuestos' | 'tareas' | 'visitas' | 'proveedores';
};

export type Consulta = {
  texto: string;
  numero: number | null;
  digitos: string | null;
  filtros: Filtros;
  entendido: string[]; // lo que se interpretó, para mostrarlo como chips
};

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

type Regla = { re: RegExp; aplicar: (f: Filtros, m: RegExpMatchArray) => string };

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
// Sin abreviaturas que son palabras comunes ("mar" del plata, "set" de sillas…).
const MESES_RE = '(enero|ene|febrero|feb|marzo|abril|abr|mayo|junio|julio|agosto|ago|septiembre|setiembre|sept?|octubre|oct|noviembre|nov|diciembre|dic)';

function indiceMes(s: string): number {
  if (s.startsWith('set')) return 8;
  const i = MESES.findIndex((m) => m.startsWith(s.slice(0, 3)));
  return i;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const fechaUTC = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

function etapa(ids: string[], nombre: string): Regla['aplicar'] {
  return (f) => {
    f.etapas = [...new Set([...(f.etapas ?? []), ...ids])];
    f.solo = 'pedidos';
    return nombre;
  };
}

function reglas(hoy: Date): Regla[] {
  const y = hoy.getUTCFullYear();
  const m = hoy.getUTCMonth();
  const d = hoy.getUTCDate();
  const rango = (f: Filtros, desde: Date, hasta: Date) => {
    f.desde = iso(desde);
    f.hasta = iso(hasta);
    f.solo = 'pedidos';
  };
  return [
    { re: /\b(atrasad[oa]s?|demorad[oa]s?|vencid[oa]s?|fuera de (plazo|termino))\b/, aplicar: (f) => ((f.atrasado = true), (f.solo = 'pedidos'), 'Atrasados') },
    { re: /\b(con saldo|saldo pendiente|que deben|deben plata|deben|adeudad[oa]s?|sin pagar|impag[oa]s?)\b/, aplicar: (f) => ((f.con_saldo = true), (f.solo = 'pedidos'), 'Con saldo') },
    { re: /\b(senad[oa]s?|sena)\b/, aplicar: etapa(['senado'], 'Señado') },
    { re: /\b(en fabricacion|fabricando|en produccion)\b/, aplicar: etapa(['en_fabricacion'], 'En fabricación') },
    { re: /\b(fabricad[oa]s?|terminad[oa]s?|listas?|listos?)\b/, aplicar: etapa(['lista'], 'Fabricada') },
    { re: /\b(embalad[oa]s?)\b/, aplicar: etapa(['embalada'], 'Embalada') },
    { re: /\b(coordinad[oa]s?|envio coordinado|retiro coordinado)\b/, aplicar: etapa(['envio_coordinado'], 'Coordinado') },
    { re: /\b(entregad[oa]s?)\b/, aplicar: etapa(['entregado'], 'Entregado') },
    { re: /\b(cancelad[oa]s?)\b/, aplicar: etapa(['cancelado'], 'Cancelado') },
    { re: /\b(activ[oa]s?|en curso|abiert[oa]s?|pendientes de entrega)\b/, aplicar: etapa(['senado', 'en_fabricacion', 'lista', 'embalada', 'envio_coordinado'], 'Activos') },
    { re: /\b(por flete|con flete|flete|fletes)\b/, aplicar: (f) => ((f.envio = 'flete'), (f.solo = 'pedidos'), 'Flete') },
    { re: /\b(por expreso|expreso|expresos)\b/, aplicar: (f) => ((f.envio = 'expreso'), (f.solo = 'pedidos'), 'Expreso') },
    { re: /\b(retira|retiran|retiro en local|retiros)\b/, aplicar: (f) => ((f.envio = 'retira'), (f.solo = 'pedidos'), 'Retira') },
    { re: /\b(tienda ?nube|web|pagina)\b/, aplicar: (f) => ((f.canal = 'tiendanube'), (f.solo = 'pedidos'), 'Tienda Nube') },
    { re: /\b(instagram|ig)\b/, aplicar: (f) => ((f.canal = 'instagram'), (f.solo = 'pedidos'), 'Instagram') },
    { re: /\b(whatsapp|wpp|whats|wsp)\b/, aplicar: (f) => ((f.canal = 'whatsapp'), (f.solo = 'pedidos'), 'WhatsApp') },
    { re: /\b(mayoristas?)\b/, aplicar: (f) => ((f.tipo_venta = 'mayorista'), (f.solo = 'pedidos'), 'Mayorista') },
    { re: /\b(profesionales?|arquitect[oa]s?|decorador[ae]s?)\b/, aplicar: (f) => ((f.tipo_venta = 'profesional'), (f.solo = 'pedidos'), 'Profesional') },
    { re: /\bhoy\b/, aplicar: (f) => (rango(f, hoy, hoy), 'Hoy') },
    { re: /\bayer\b/, aplicar: (f) => (rango(f, fechaUTC(y, m, d - 1), fechaUTC(y, m, d - 1)), 'Ayer') },
    {
      re: /\besta semana\b/,
      aplicar: (f) => {
        const lunes = fechaUTC(y, m, d - ((hoy.getUTCDay() + 6) % 7));
        rango(f, lunes, fechaUTC(lunes.getUTCFullYear(), lunes.getUTCMonth(), lunes.getUTCDate() + 6));
        return 'Esta semana';
      },
    },
    { re: /\beste mes\b/, aplicar: (f) => (rango(f, fechaUTC(y, m, 1), fechaUTC(y, m + 1, 0)), 'Este mes') },
    { re: /\b(el )?mes pasado\b/, aplicar: (f) => (rango(f, fechaUTC(y, m - 1, 1), fechaUTC(y, m, 0)), 'Mes pasado') },
    {
      re: new RegExp(`\\b(de |en |del mes de )?${MESES_RE}( (de |del )?(20\\d\\d))?\\b`),
      aplicar: (f, mt) => {
        const mes = indiceMes(mt[2]);
        let anio = mt[5] ? Number(mt[5]) : y;
        if (!mt[5] && mes > m) anio -= 1; // "noviembre" en octubre = el del año pasado
        rango(f, fechaUTC(anio, mes, 1), fechaUTC(anio, mes + 1, 0));
        const nombre = MESES[mes][0].toUpperCase() + MESES[mes].slice(1);
        return anio === y ? nombre : `${nombre} ${anio}`;
      },
    },
    { re: /\b(clientes?)\b/, aplicar: (f) => ((f.solo ??= 'clientes'), '') },
    { re: /\b(presupuestos?|cotizacion(es)?)\b/, aplicar: (f) => ((f.solo ??= 'presupuestos'), 'Presupuestos') },
    { re: /\b(tareas?|pendientes)\b/, aplicar: (f) => ((f.solo ??= 'tareas'), 'Tareas') },
    { re: /\b(visitas?|turnos?)\b/, aplicar: (f) => ((f.solo ??= 'visitas'), 'Visitas') },
    { re: /\b(proveedor(es)?)\b/, aplicar: (f) => ((f.solo ??= 'proveedores'), 'Proveedores') },
    { re: /\b(pedidos?|ventas?)\b/, aplicar: (f) => ((f.solo ??= 'pedidos'), '') },
  ];
}

// Palabras de relleno que no aportan a la búsqueda.
const RELLENO = new Set(['los', 'las', 'el', 'la', 'de', 'del', 'que', 'con', 'en', 'y', 'a', 'mis', 'todos', 'todas', 'buscar', 'ver', 'mostrar', 'mostrame', 'quiero', 'hay', 'cuales', 'por']);

export function interpretar(entrada: string, hoy = new Date()): Consulta {
  const filtros: Filtros = {};
  const entendido: string[] = [];
  let numero: number | null = null;
  let digitos: string | null = null;

  let s = sinAcentos(entrada).replace(/[¿?¡!,;]/g, ' ').replace(/\s+/g, ' ').trim();

  // "#557", "pedido 557", "n° 557", "presupuesto 120"
  const num = s.match(/(?:#|\bn[°º]?\s?|\bnro\.?\s?|\bnumero\s)(\d{1,6})\b/) ?? s.match(/^(\d{1,5})$/);
  if (num) {
    numero = Number(num[1]);
    s = s.replace(num[0], ' ');
    entendido.push(`N° ${numero}`);
  }

  // Teléfono o DNI: 6 dígitos o más, con o sin espacios/guiones ("11 5555-4321", "+54 9 11…")
  const tel = s.match(/\+?\d[\d\s\-().]{5,}\d/);
  if (tel) {
    const solo = tel[0].replace(/\D/g, '');
    if (solo.length >= 6) {
      // Nos quedamos con los últimos 8 (el número sin 54/9/11 delante) para que coincida con cualquier formato.
      digitos = solo.length > 8 ? solo.slice(-8) : solo;
      s = s.replace(tel[0], ' ');
      entendido.push(`Tel./DNI …${digitos.slice(-4)}`);
    }
  }

  // "de tete", "vendidos por tete", "vendedor tete"
  const vend = s.match(/\b(?:vendid[oa]s? por|vendedor[a]?|de vendedor[a]?)\s+([a-zñ]{2,})/);
  if (vend) {
    filtros.vendedor = vend[1];
    filtros.solo = 'pedidos';
    s = s.replace(vend[0], ' ');
    entendido.push(`Vendió ${vend[1][0].toUpperCase()}${vend[1].slice(1)}`);
  }

  for (const r of reglas(hoy)) {
    const m = s.match(r.re);
    if (!m) continue;
    const etiqueta = r.aplicar(filtros, m);
    if (etiqueta) entendido.push(etiqueta);
    s = s.replace(m[0], ' ');
  }

  // Un número suelto con filtros alrededor ("557 entregado") también es número de pedido.
  if (numero === null) {
    const suelto = s.match(/(?:^|\s)(\d{1,5})(?:\s|$)/);
    if (suelto && !/\d\s*x\s*\d/.test(s)) {
      // Pero no si parece una medida ("160x90")
      const resto = s.replace(suelto[0], ' ').trim();
      if (!resto || Object.keys(filtros).length) {
        numero = Number(suelto[1]);
        s = resto;
        entendido.unshift(`N° ${numero}`);
      }
    }
  }

  const texto = s
    .split(' ')
    .filter((w) => w && !RELLENO.has(w))
    .join(' ')
    .trim();

  // "clientes" solo, sin nada para buscar, no filtra nada: lo sacamos.
  if (filtros.solo && filtros.solo !== 'pedidos' && !texto && numero === null && !digitos) delete filtros.solo;

  return { texto, numero, digitos, filtros, entendido };
}

export function hayFiltrosDePedido(f: Filtros): boolean {
  return Boolean(f.etapas || f.atrasado || f.con_saldo || f.desde || f.hasta || f.envio || f.canal || f.tipo_venta || f.vendedor);
}
