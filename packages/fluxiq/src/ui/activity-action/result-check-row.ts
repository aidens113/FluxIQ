/**
 * The title a result check's rows carry: "Result check started" as it starts
 * and "Result check" with the verdict
 * (`programs/automation-studio/runtime/result-verification/verify.ts`).
 */
const RESULT_CHECK_TITLE = /^Result check\b/u;

/**
 * True for a row of a run's result check, which checks what a run left and
 * runs nothing. Its start and its end carry different titles and no ref, so
 * this, not the title, is what ties the two to one card (`./key.ts`).
 */
export function activityActionResultCheckRow(detail: { kind: string; title: string } | undefined): boolean {
  return detail?.kind === "check" && RESULT_CHECK_TITLE.test(detail.title);
}
