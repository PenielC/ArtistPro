export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

/** Formats an exchange rate without trailing noise, keeping enough precision for weak currencies (e.g. 0.007715). */
export function formatRate(rate: number) {
  if (rate >= 1) return Number(rate.toFixed(4)).toString()
  return Number(rate.toPrecision(4)).toString()
}
