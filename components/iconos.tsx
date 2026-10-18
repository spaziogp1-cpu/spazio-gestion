type P = { className?: string };
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export const IconoPedidos = (p: P) => (
  <svg {...base} {...p}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  </svg>
);
export const IconoProduccion = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="4" width="5" height="16" rx="1.5" />
    <rect x="10" y="4" width="5" height="10" rx="1.5" />
    <rect x="17" y="4" width="4" height="13" rx="1.5" />
  </svg>
);
export const IconoMas = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconoClientes = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M3 20c.8-3.4 3.2-5 6-5s5.2 1.6 6 5" />
    <path d="M16 4.5a3.5 3.5 0 0 1 0 7M21 20c-.5-2.4-1.8-3.9-3.5-4.6" />
  </svg>
);
export const IconoVolver = (p: P) => (
  <svg {...base} {...p} width="16" height="16">
    <path d="M15 18l-6-6 6-6" />
  </svg>
);
export const IconoWhatsApp = (p: P) => (
  <svg {...base} {...p} width="16" height="16">
    <path d="M4 20l1.3-3.8A8 8 0 1 1 8 19z" />
    <path d="M9 9.5c.3 2.2 2.3 4.2 4.5 4.5l1-1.2 2 .9c-.3 1.1-1.2 1.8-2.3 1.8C10.6 15.5 8 12.9 8 9.8 8 8.7 8.7 7.8 9.8 7.5l.9 2z" />
  </svg>
);
