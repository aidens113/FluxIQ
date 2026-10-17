// Split from the former `../draft-amendment-feedback.ts` (t694); the module's account is in `./index.ts`.

import type { AutomationStudioFlowDraftStepCondition } from "../../flow-draft/index.ts";

/**
 * What the feedback reads of a draft step. The position always; from the loop,
 * which passes the draft itself, also whether the step changes something
 * (`effect`), whether that worked, and whether it is in the Flow -- enough to
 * tell a listing from a press. A step given as a position alone still gets a
 * `next` by its number, from the reason alone (`fallback`).
 *
 * The rest is what tells a step that did not work from one that ran, read
 * exactly as the draft entry and the amendments read it (`../flow-draft/entry.ts`,
 * `shownDisposition`; `../flow-draft/amendment/apply.ts`), and what the step's
 * own call said of it: its codes and call id, quoted only when code-shaped
 * (`coded`), never a value from a page. `resultReason` is read when the draft
 * step carries it; today's draft records only `resultCode` (`../evidence-loop.ts`).
 */
export type AutomationStudioDraftAmendmentFeedbackStep = {
  position: number;
  id?: string;
  effect?: string;
  effectApplied?: boolean;
  disposition?: string;
  routing?: { kind: string; over?: string; through?: string; while?: string };
  proposes?: boolean;
  written?: true;
  checkedCandidate?: object;
  resultCode?: string;
  resultReason?: string;
  callId?: string;
  /** The host says the step answered a layer in front of the page (`../flow-draft/step.ts`): never a loop's act (`rowAct`). */
  interruption?: true;
  /** What each of a read's conditions kept, as its host said (`../flow-draft/step.ts`): an unchanged rerun names one that left out no row. */
  conditions?: readonly AutomationStudioFlowDraftStepCondition[];
};
