export const CURRENCY_OPTIONS = [
  { value: "CNY", label: "RMB (CNY) — Chinese yuan" },
  { value: "RUB", label: "RUB — Russian ruble" },
  { value: "USD", label: "USD — US dollar" },
  { value: "MYR", label: "MYR — Malaysian ringgit" },
] as const;

export type CurrencyCode = (typeof CURRENCY_OPTIONS)[number]["value"];
