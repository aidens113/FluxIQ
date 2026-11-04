// Dollars as a person reads them: "$0.34", "$5.00".

/** `usd` to the cent. */
export function usdWords(usd: number): string {
  return `$${Math.max(0, usd).toFixed(2)}`;
}
