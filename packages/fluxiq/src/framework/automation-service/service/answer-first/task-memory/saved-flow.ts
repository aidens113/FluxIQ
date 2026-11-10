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
  /**
   * What the attempt that kept this Flow read, by shape (task speed S9): a later replay is accepted on
   * its own record only when it reads the same (`../completion/replay-stands.ts`). Absent on a Flow
   * kept before t895, which a replay then cannot be compared with, so its judge is asked.
   */
  shape?: AutomationStudioAnswerFirstReadShape;
  savedAtMs: number;
  spend: { calls: number; usd: number };
};

/** What an attempt's reads came to, by shape: the columns kept and whether any row was. Never the rows themselves. */
export type AutomationStudioAnswerFirstReadShape = {
  columns: readonly string[];
  empty: boolean;
};
