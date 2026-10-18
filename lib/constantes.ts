export const ETAPAS = [
  { id: 'senado', nombre: 'Señado', corto: 'Señado' },
  { id: 'pedido_fabrica', nombre: 'Pedido a fábrica', corto: 'A fábrica' },
  { id: 'en_fabricacion', nombre: 'En fabricación', corto: 'Fabricando' },
  { id: 'lista', nombre: 'Lista', corto: 'Lista' },
  { id: 'cliente_avisado', nombre: 'Cliente avisado', corto: 'Avisado' },
  { id: 'envio_coordinado', nombre: 'Envío o retiro coordinado', corto: 'Coordinado' },
  { id: 'entregado', nombre: 'Entregado', corto: 'Entregado' },
  { id: 'cancelado', nombre: 'Cancelado', corto: 'Cancelado' },
] as const;

export type EtapaId = (typeof ETAPAS)[number]['id'];

export const ETAPAS_ACTIVAS: EtapaId[] = [
  'senado',
  'pedido_fabrica',
  'en_fabricacion',
  'lista',
  'cliente_avisado',
  'envio_coordinado',
];

export function nombreEtapa(id: string): string {
  return ETAPAS.find((e) => e.id === id)?.nombre ?? id;
}

export function siguienteEtapa(id: string): EtapaId | null {
  const i = ETAPAS.findIndex((e) => e.id === id);
  if (i < 0 || i >= ETAPAS.findIndex((e) => e.id === 'entregado')) return null;
  return ETAPAS[i + 1].id;
}

export const CANALES = [
  { id: 'whatsapp', nombre: 'WhatsApp' },
  { id: 'instagram', nombre: 'Instagram' },
  { id: 'tiendanube', nombre: 'Tienda Nube' },
  { id: 'showroom', nombre: 'Showroom' },
  { id: 'propia', nombre: 'Propia' },
] as const;

export const TIPOS_VENTA = [
  { id: 'minorista', nombre: 'Minorista' },
  { id: 'mayorista', nombre: 'Mayorista' },
  { id: 'profesional', nombre: 'Profesional' },
] as const;

export const ENVIOS = [
  { id: 'coordinar', nombre: 'A coordinar' },
  { id: 'retira', nombre: 'Retira' },
  { id: 'flete', nombre: 'Flete' },
  { id: 'expreso', nombre: 'Expreso' },
] as const;

export const FORMAS_PAGO = ['transferencia', 'cuotas/mp', 'pagonube', 'efectivo', 'otro'] as const;

export const TIPOS_PAGO = [
  { id: 'sena', nombre: 'Seña' },
  { id: 'saldo', nombre: 'Saldo' },
  { id: 'total', nombre: 'Pago total' },
  { id: 'otro', nombre: 'Otro' },
] as const;

// Sugerencias tomadas de la planilla (se puede escribir cualquier otro valor).
export const PRODUCTOS_SUGERIDOS = ['mesa ratona', 'mesa alta', 'mesa auxiliar', 'mesa de luz', 'mueble', 'vidrio'];
export const MATERIALES_SUGERIDOS = ['10mm', '4+4', '5+5', '6+6', '3+3'];

export function nombreDe(lista: readonly { id: string; nombre: string }[], id: string | null | undefined) {
  if (!id) return '—';
  return lista.find((x) => x.id === id)?.nombre ?? id;
}

export const PRIORIDADES = [
  { id: 'alta', nombre: 'Alta' },
  { id: 'media', nombre: 'Media' },
  { id: 'baja', nombre: 'Baja' },
] as const;

export const ESTADOS_TAREA = [
  { id: 'pendiente', nombre: 'Pendiente' },
  { id: 'en_curso', nombre: 'En curso' },
  { id: 'bloqueada', nombre: 'Trabada' },
  { id: 'hecha', nombre: 'Hecha' },
] as const;

export const ESTADOS_VISITA = [
  { id: 'agendada', nombre: 'Agendada' },
  { id: 'confirmada', nombre: 'Confirmada' },
  { id: 'vino', nombre: 'Vino' },
  { id: 'no_vino', nombre: 'No vino' },
  { id: 'cancelada', nombre: 'Cancelada' },
] as const;

export const RESULTADOS_VISITA = [
  { id: 'compro', nombre: 'Compró' },
  { id: 'presupuesto', nombre: 'Pidió presupuesto' },
  { id: 'pensando', nombre: 'Lo está pensando' },
  { id: 'no_interesado', nombre: 'No le interesó' },
] as const;
