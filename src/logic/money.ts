/** Store currency. One module so screens, PDFs and CSV exports always agree. */
export const CURRENCIES = {
  GBP: { symbol: '£', locale: 'en-GB', label: 'British pound (£)' },
  EUR: { symbol: '€', locale: 'de-DE', label: 'Euro (€)' },
  USD: { symbol: '$', locale: 'en-US', label: 'US dollar ($)' },
  INR: { symbol: '₹', locale: 'en-IN', label: 'Indian rupee (₹)' },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

let current: CurrencyCode = 'GBP';

export function isCurrencyCode(x: unknown): x is CurrencyCode {
  return typeof x === 'string' && x in CURRENCIES;
}

export function setCurrency(code: CurrencyCode) {
  current = code;
}

export function getCurrency(): CurrencyCode {
  return current;
}

export function currencySymbol(): string {
  return CURRENCIES[current].symbol;
}

/** e.g. £1,149.00 / 1.149,00 € style grouping is kept simple: symbol first, two decimals. */
export function formatMoney(n: number): string {
  const sign = n < 0 ? '−' : '';
  const body = Math.abs(n).toLocaleString(CURRENCIES[current].locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${currencySymbol()}${body}`;
}

/** Plain number with two decimals, for CSV cells. */
export function money2(n: number): string {
  return n.toFixed(2);
}
