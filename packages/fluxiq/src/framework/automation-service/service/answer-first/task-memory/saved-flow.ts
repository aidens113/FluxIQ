import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioAnswerFirstStatedToggle } from "./stated-toggle.ts";

/** One Flow a task kept: its steps, how sure we are of it, and what it cost to get. */
export type AutomationStudioAnswerFirstSavedFlow = {
  attemptId: string;
  flowId: string;
  candidateId?: string;
  steps: AutomationStudioFlowDraftStep[];
  /** Digest of the steps' position, action and input (`./steps-digest.ts`). */
  stepsDigest: string;
  label: "confirmed" | "refuted" | "unverified";
  /** This exact Flow ran from its start to its end with no repair and was judged yes. */
  provenWhole: boolean;
  /** The steps on a control seen to flip, and the state each checks for before it presses. */
  stated?: AutomationStudioAnswerFirstStatedToggle[];
  savedAtMs: number;
  spend: { calls: number; usd: number };
};
