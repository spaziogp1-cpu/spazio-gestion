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
export const IconoProveedores = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" />
    <circle cx="7" cy="17.5" r="1.8" />
    <circle cx="17" cy="17.5" r="1.8" />
  </svg>
);
export const IconoTareas = (p: P) => (
  <svg {...base} {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M8.5 12.5l2.5 2.5 4.5-5" />
  </svg>
);
export const IconoObjetivos = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" />
  </svg>
);
export const IconoShowroom = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 10l9-6 9 6" />
    <path d="M5 9v11h14V9" />
    <path d="M10 20v-5h4v5" />
  </svg>
);
export const IconoCalendario = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);
export const IconoMasMenu = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="5" cy="12" r="1.4" fill="currentColor" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    <circle cx="19" cy="12" r="1.4" fill="currentColor" />
  </svg>
);
export const IconoInicio = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 11l8-7 8 7" />
    <path d="M6 10v10h12V10" />
  </svg>
);
export const IconoAvisos = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" />
    <path d="M10 20a2 2 0 0 0 4 0" />
  </svg>
);
export const IconoAjustes = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
  </svg>
);
export const IconoContenido = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3.5" y="6" width="17" height="13" rx="2" />
    <circle cx="12" cy="12.5" r="3.2" />
    <path d="M8.5 6l1.2-2h4.6l1.2 2" />
  </svg>
);
export const IconoCotizador = (p: P) => (
  <svg {...base} {...p}>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M8 7h8M8.5 11h1M11.5 11h1M14.5 11h1M8.5 14h1M11.5 14h1M14.5 14h1M8.5 17h1M11.5 17h4" />
  </svg>
);
export const IconoEntregas = (p: P) => (
  <svg {...base} {...p}>
    <path d="M2 6h11v10H2zM13 9h4l4 4v3h-8z" />
    <circle cx="6" cy="17.5" r="1.8" />
    <circle cx="17" cy="17.5" r="1.8" />
  </svg>
);
