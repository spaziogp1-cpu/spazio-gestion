import { CANALES, ENVIOS, TIPOS_PAGO, TIPOS_VENTA, nombreDe, nombreEtapa } from '@/lib/constantes';
import { fechaCorta } from '@/lib/fechas';
import { plata } from '@/lib/formato';
import type { Evento } from '@/lib/tipos';

const CAMPOS: Record<string, string> = {
  etapa: 'la etapa',
  fecha_limite: 'la fecha límite',
  fecha_entrega_programada: 'la entrega programada',
  hora_entrega_programada: 'el horario de entrega',
  fecha_entrega_real: 'la fecha de entrega',
  envio: 'la modalidad de envío',
  total: 'el total',
  precio_envio_cliente: 'el envío al cliente',
  responsable_id: 'el vendedor',
  canal: 'el canal',
  tipo_venta: 'el tipo de venta',
  forma_pago: 'la forma de pago',
  observaciones: 'las observaciones',
  direccion_entrega: 'la dirección de entrega',
  cliente_id: 'el cliente',
  producto: 'el producto',
  modelo: 'el modelo',
  medidas: 'las medidas',
  color: 'el color',
  material: 'el material',
  cantidad: 'la cantidad',
  precio: 'el precio',
  monto: 'el monto',
  estado: 'el estado',
  detalle: 'el detalle',
  fecha_pedido: 'la fecha de pedido',
  fecha_esperada: 'la fecha esperada',
  fecha_recepcion: 'la fecha de recepción',
  link_drive: 'el link de Drive',
  titulo: 'el título',
  vencimiento: 'el vencimiento',
  prioridad: 'la prioridad',
};

const ENTIDAD: Record<string, string> = {
  pedidos: 'el pedido',
  pedido_items: 'un producto',
  pagos: 'un pago',
  archivos: 'un archivo',
  pedidos_proveedor: 'un pedido a proveedor',
  tareas: 'una tarea',
};

function valor(campo: string, v: string | null): string {
  if (v == null || v === '') return 'vacío';
  if (campo === 'etapa') return nombreEtapa(v);
  if (campo === 'canal') return nombreDe(CANALES, v);
  if (campo === 'envio') return nombreDe(ENVIOS, v);
  if (campo === 'tipo_venta') return nombreDe(TIPOS_VENTA, v);
  if (campo === 'tipo') return nombreDe(TIPOS_PAGO, v);
  if (campo === 'estado') return ({ pedido: 'pedido', recibido: 'recibido', cancelado: 'cancelado', pendiente: 'pendiente', en_curso: 'en curso', bloqueada: 'trabada', hecha: 'hecha' } as Record<string, string>)[v] ?? v;
  if (campo.startsWith('hora')) return v.slice(0, 5);
  if (campo.startsWith('fecha') || campo === 'vencimiento') return fechaCorta(v);
  if (['total', 'precio_envio_cliente', 'precio', 'monto'].includes(campo)) return plata(v);
  return v.length > 40 ? v.slice(0, 40) + '…' : v;
}

/** Quién hizo el cambio: persona del equipo, "Teo (con IA)", "Tienda Nube" o "Sistema". */
export function autorEvento(valor: string | null, nombrePorEmail: Map<string, string>): string {
  if (!valor) return 'Sistema';
  const [email, via] = valor.split('#');
  if (!email.includes('@')) return email;
  const nombre = nombrePorEmail.get(email.toLowerCase()) ?? email;
  return via === 'ia' ? `${nombre} (con IA)` : nombre;
}

export function textoEvento(ev: Evento): string {
  const ent = ENTIDAD[ev.entidad] ?? ev.entidad;
  if (ev.accion === 'creado') return ev.entidad === 'pedidos' ? 'creó el pedido' : `agregó ${ent}`;
  if (ev.accion === 'eliminado') return `eliminó ${ent}`;
  const campo = ev.campo ?? '';
  const nombre = CAMPOS[campo] ?? campo.replace(/_/g, ' ');
  if (campo === 'responsable_id' || campo === 'cliente_id') return `cambió ${nombre}`;
  const donde = ev.entidad === 'pedidos' ? '' : ` de ${ent}`;
  return `cambió ${nombre}${donde}: ${valor(campo, ev.valor_anterior)} → ${valor(campo, ev.valor_nuevo)}`;
}

// Cambios internos que no aportan al historial.
export const CAMPOS_OCULTOS = new Set(['completada_en', 'bloqueo', 'orden', 'creado_por', 'subido_por']);
