/**
 * What is left of a source's wait hint once the time already passed since the
 * failed attempt settled is counted against it.
 *
 * A hint is measured from the refusal -- a page's "try again in 5 seconds" from
 * the notice -- but the run only begins its wait after the failed attempt's
 * after-action snapshot, which lane D (`run-mv0fuual-f9e6f089`) measured at
 * 2.7-4.6 s. Waiting the full hint on top of that kept the site's notice up for
 * 12-14 s where 5.5 s was asked. The time passed is credited in whole tenths of
 * a second, so a refusal handled at once still waits the full hint and the
 * ledger keeps round numbers.
 */
export function automationStudioCreditedHintMs(hintMs: number, settledAt: number, now: number): { remainingMs: number; creditedMs: number } {
  const passed = Number.isFinite(settledAt) && Number.isFinite(now) ? Math.max(0, now - settledAt) : 0;
  const creditedMs = Math.min(Math.max(0, hintMs), Math.floor(passed / 100) * 100);
  return { remainingMs: Math.max(0, hintMs - creditedMs), creditedMs };
}
