export function formatCurrency(
  value: number | null | undefined,
  currency: string = 'USD',
  fallback: string = '---',
  allowZero = false,
  intlOptions: Intl.NumberFormatOptions = {}
): string {
  if (value == null || !Number.isFinite(value)) return fallback;
  if (value === 0 && !allowZero) return fallback;

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...intlOptions,
  }).format(value);
}

export function formatUsd(
  value: number | null | undefined,
  fallback: string = '---',
  allowZero = false
): string {
  return formatCurrency(value, 'USD', fallback, allowZero);
}
