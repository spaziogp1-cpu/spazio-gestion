const pesos = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

export function plata(valor: number | string | null | undefined): string {
  const n = typeof valor === 'string' ? Number(valor) : valor ?? 0;
  return pesos.format(Number.isFinite(n) ? n : 0);
}

// Acepta "1.350.000", "1350000", "$ 1.350.000,50"
export function leerMonto(texto: FormDataEntryValue | number | null | undefined): number {
  if (texto == null) return 0;
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : 0;
  let s = String(texto).replace(/[^\d,.-]/g, '');
  if (s.includes(',')) {
    // Formato argentino: 1.350.000,50
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/\.\d{1,2}$/.test(s)) {
    // Decimal con punto (1350000.50): los otros puntos son de miles
    const i = s.lastIndexOf('.');
    s = s.slice(0, i).replace(/\./g, '') + s.slice(i);
  } else {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function texto(v: FormDataEntryValue | null): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

export function linkWhatsApp(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  let d = telefono.replace(/\D/g, '');
  if (!d) return null;
  if (!d.startsWith('54')) d = '54' + d.replace(/^0/, '');
  if (!d.startsWith('549')) d = '549' + d.slice(2).replace(/^15/, '');
  return `https://wa.me/${d}`;
}
