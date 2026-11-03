// The steps a trial runs with no witness (t791 fix 4; user, 2026-10-27: reset
// as rarely as possible, and judge the change, not the absolute state).
//
// A reversible lasting step (lasting classes all among create_new,
// modify_existing and delete) whose node carries no witness stamp that still
// resolves -- no place was named where its change shows -- no longer keeps its
// trial from running (t751 R3 refused it unrun). The trial runs; its act is
// recorded as on the site, as an explored act with no witness is (t775); and it
// is judged by its end view and each step's done-when check. Core reads no
// change of that step, so a part it serves is `unproven` by what Core read,
// never a no (`./unwitnessed-outcome.ts`).
//
// A project build's reset answers these steps on its admission
// (`../site-reset/project-reset.ts`, `admit`) with the builder's words, and a
// trial gate copies that note into its answer. This reads the note off an
// admission, whatever reset answered it: a note of any other shape is none.

/** One trial step with no witness: its number as the trial door numbers it, and its label where it has one. */
export type AutomationStudioTrialUnwitnessedStep = { step: number; label?: string };

/** What a trial's admission notes of its steps with no witness: each step, and what the builder is told of them. */
export type AutomationStudioTrialUnwitnessed = { steps: AutomationStudioTrialUnwitnessedStep[]; instruction: string };

/** The admission's note of the steps with no witness (header); none where it carries none, or one of another shape. */
export function automationStudioTrialUnwitnessedOf(admission: unknown): AutomationStudioTrialUnwitnessed | undefined {
  const note = admission && typeof admission === "object" && (admission as { kind?: unknown }).kind === "admit" ? (admission as { unwitnessed?: unknown }).unwitnessed : undefined;
  if (!note || typeof note !== "object" || Array.isArray(note)) return undefined;
  const { steps, instruction } = note as { steps?: unknown; instruction?: unknown };
  if (!Array.isArray(steps) || !steps.length || typeof instruction !== "string") return undefined;
  const read = steps.flatMap((entry): AutomationStudioTrialUnwitnessedStep[] => {
    const step = entry && typeof entry === "object" ? (entry as { step?: unknown }).step : undefined;
    const label = entry && typeof entry === "object" ? (entry as { label?: unknown }).label : undefined;
    return typeof step === "number" && Number.isSafeInteger(step) ? [{ step, ...(typeof label === "string" ? { label } : {}) }] : [];
  });
  return read.length === steps.length ? { steps: read, instruction } : undefined;
}
