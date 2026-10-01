/**
 * What a check that cleared by itself says to the person: how long it stood,
 * in whole seconds and never less than one, when that is known. The same
 * sentence for the pair a check that cleared by itself is told in
 * (`./cleared-wait.ts`) and for any `waited_out` an ask settles with
 * (`./resolved.ts`).
 */
export function automationStudioActivityClearedText(waitedMs?: number): string {
  if (waitedMs === undefined) return "The check cleared by itself.";
  return `The check cleared on its own after ${Math.max(1, Math.round(waitedMs / 1000))} s.`;
}
