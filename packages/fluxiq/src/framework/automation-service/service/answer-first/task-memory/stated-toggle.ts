import type { JsonObject } from "../../../../../core/index.ts";

/**
 * A saved step on a control its attempt saw flip, and the state that press left: what a later run of
 * the step checks before it presses (`../flow-run/stated-toggles.ts`). Kept beside the steps and not in
 * them, because it is Core's own: a person's Run again leaves it off (`../run-again/`), and the steps'
 * digest does not move for it. `step` is the draft step's id, or `#<position>` for one with none.
 */
export type AutomationStudioAnswerFirstStatedToggle = { step: string; ensureState: JsonObject };
