// Display helpers — all monetary values use $ + comma separators, percentages 2 decimals.

export const fmtMoney = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const v = Math.round(n);
  const sign = v < 0 ? '-' : '';
  return `${sign}$${Math.abs(v).toLocaleString('en-US')}`;
};

export const fmtMoneyCents = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const fmtPct = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return `${Number(n).toFixed(2)}%`;
};
