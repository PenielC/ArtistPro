// Curated list. Live rates cover most of these; for any the rate services don't
// have, the invoice form falls back to asking for a manual rate.
export const CURRENCIES: { code: string; name: string }[] = [
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'ZAR', name: 'South African Rand' },
  { code: 'ZWG', name: 'Zimbabwe Gold' },
  { code: 'BWP', name: 'Botswana Pula' },
  { code: 'ZMW', name: 'Zambian Kwacha' },
  { code: 'NAD', name: 'Namibian Dollar' },
  { code: 'MZN', name: 'Mozambican Metical' },
  { code: 'MWK', name: 'Malawian Kwacha' },
  { code: 'TZS', name: 'Tanzanian Shilling' },
  { code: 'KES', name: 'Kenyan Shilling' },
  { code: 'UGX', name: 'Ugandan Shilling' },
  { code: 'NGN', name: 'Nigerian Naira' },
  { code: 'GHS', name: 'Ghanaian Cedi' },
  { code: 'EGP', name: 'Egyptian Pound' },
  { code: 'MAD', name: 'Moroccan Dirham' },
  { code: 'XOF', name: 'West African CFA Franc' },
  { code: 'XAF', name: 'Central African CFA Franc' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'AED', name: 'UAE Dirham' },
]

export function currencyLabel(code: string) {
  const match = CURRENCIES.find((c) => c.code === code)
  return match ? `${match.code} — ${match.name}` : code
}
