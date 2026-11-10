export type AllowanceParse = { ok: true; usd: number | null } | { ok: false; message: string };

/**
 * What a person typed as the per-message allowance, in dollars. Empty means
 * "the usual amount" (null). It is a spending amount the person chooses, not a
 * limit this page imposes: any positive amount is accepted.
 */
export function parseAllowance(text: string): AllowanceParse {
  const trimmed = text.trim().replace(/^\$/, "");
  if (!trimmed) return { ok: true, usd: null };
  const usd = Number(trimmed);
  if (!Number.isFinite(usd) || usd <= 0) return { ok: false, message: "Type an amount in dollars, like 0.50." };
  return { ok: true, usd };
}
