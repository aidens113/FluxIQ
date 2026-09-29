// What a Flow build that ended without an accepted completion leaves behind.
//
// Until this record a build that ran out wrote nothing. `run-mum0ke7z-940cbd27`
// (bigbox-retail) spent 34 decisions on a draft of twelve steps, and the
// crossborder builds of round 1 the same, and every one of those steps went
// with the build: the next attempt paid again for navigation already proved,
// and the repair loop had nothing to improve.
//
// **This is not a Flow, and nothing may treat it as one.** It is kept in a
// store of its own (`runtime/service/incomplete-drafts.ts`), never as an
// adaptation: an adaptation is something a person can approve and apply, and
// this is a draft Core refused to propose. `status` is the literal
// `"incomplete"` so that a reader that does get hold of one cannot mistake it,
// and the only thing that reads it back is a later build of the same Flow,
// which seeds its draft from `steps` and is told `outstandingIssueCodes`
// (`./continuation.ts`, `runtime/llm/evidence-loop/resume.ts`). A
// continuation is held to every completion gate a first build is, the dry run
// included, so a kept step reaches a Flow only by being proved again.
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopResume } from "../../llm/evidence-loop/index.ts";

export type AutomationStudioFlowBootstrapIncompleteDraft = {
  kind: "flow_bootstrap_incomplete_draft";
  /** Always this word. A record without it is not one of these. */
  status: "incomplete";
  projectId: string;
  flowId: string;
  /**
   * Which version of the draft this is, counting from 1. A continuation that
   * also ends without finishing writes the next one over this; a build that
   * starts afresh (the Flow or its instructions changed) writes 1 again.
   */
  revision: number;
  /**
   * The Flow's execution digest when the build ran. A draft written against a
   * different Flow, or different settings, is not continued: its steps were
   * proved against something that no longer exists.
   */
  baseDependencyDigest: string;
  /** The instructions the build was answering, sorted. Changed instructions mean a new build. */
  sourceInstructionIds: string[];
  /** Why the build stopped: which allowance ran out, or that its decisions kept coming back unusable. */
  stopped: AutomationStudioLlmEvidenceLoopResume["stopped"];
  /** The completion failures the build had not answered when it stopped, by issue code. */
  outstandingIssueCodes: string[];
  /** Times the build asked to finish. */
  completionAttempts: number;
  /**
   * The steps a Flow could be proposed from -- kept, and proposable -- in draft
   * order, renumbered from 1. Each keeps its id, so a routing statement that
   * names another kept step still names it, and the replay a dry run needs.
   * What it does not keep is what belonged to the build that took it: the call
   * id and iteration (a continuation made no call for it) and the outcome of
   * that build's last replay (a continuation replays it again first).
   */
  steps: AutomationStudioFlowDraftStep[];
  createdAt: number;
  updatedAt: number;
};
