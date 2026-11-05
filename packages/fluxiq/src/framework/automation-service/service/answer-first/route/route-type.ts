import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioAnswerFirstSavedFlow, AutomationStudioAnswerFirstTaskNote } from "../task-memory/index.ts";

/**
 * Where an attempt starts: from nothing (`build`), from a saved Flow that runs (`use`), or from
 * a saved Flow whose steps no longer fit together as a Flow (`repair`: seeded, never run).
 * `related` is the same Flow's steps under another task key: a known start only, never run.
 */
export type AutomationStudioAnswerFirstRoute =
  | { kind: "build"; notes: AutomationStudioAnswerFirstTaskNote[]; related?: { steps: AutomationStudioFlowDraftStep[]; flowId: string } }
  | { kind: "use"; saved: AutomationStudioAnswerFirstSavedFlow; notes: AutomationStudioAnswerFirstTaskNote[] }
  | { kind: "repair"; saved: AutomationStudioAnswerFirstSavedFlow; notes: AutomationStudioAnswerFirstTaskNote[]; why: string };
