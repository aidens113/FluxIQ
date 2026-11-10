/**
 * What one message may spend on model calls when the person has not chosen,
 * in US dollars. Enough for a few dozen steps on the providers' normal models;
 * a person changes it in Settings, beside the assistant's key and model.
 */
export const PANEL_ASSISTANT_DEFAULT_ALLOWANCE_USD = 0.5;

/** A spending allowance a person may set: a finite number of dollars, zero or more, to the cent. */
export function panelAssistantAllowanceOrRefuse(value: unknown): number {
  const usd = typeof value === "string" && value.trim() ? Number(value) : value;
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd < 0) throw new Error("A spending allowance is a number of dollars, zero or more.");
  return Math.round(usd * 100) / 100;
}
