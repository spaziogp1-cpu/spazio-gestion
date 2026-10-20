export const ESTADOS_PRESUPUESTO = [
  { id: 'borrador', nombre: 'Borrador', clase: 'chip-cancelado' },
  { id: 'enviado', nombre: 'Enviado', clase: 'chip-pedido' },
  { id: 'seguimiento', nombre: 'Seguimiento', clase: 'chip-en' },
  { id: 'aprobado', nombre: 'Aprobado', clase: 'chip-entregado' },
  { id: 'rechazado', nombre: 'Rechazado', clase: 'chip-atrasado' },
  { id: 'vencido', nombre: 'Vencido', clase: 'chip-cancelado' },
] as const;
