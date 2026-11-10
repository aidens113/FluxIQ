/** Dollars as a person reads them; "—" when the amount is not known, never a made-up number. */
export function formatSpend(usd: number | null | undefined): string {
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd < 0) return "—";
  return `$${usd.toFixed(2)}`;
}
