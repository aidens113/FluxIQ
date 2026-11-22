import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioJudgeEvidenceFinding } from "../judge-evidence/index.ts";

/**
 * One thing a run or an attempt did on its target, from Core's own record of it (`../run-trail/`, t963): a look at a
 * page, a read, an act, or any other call, with what the domain answered. Never a model's words.
 *
 * `did` is what ran (a node's or a tool's id), `on` the words of what it acted on where the domain said them, `asked`
 * what it was asked to do with (its parameters as the call gave them), `outcome` how it ended in Core's or the domain's
 * code, `where` the place it answered from (an address), and `found` what it found there: the domain's whole answer.
 */
export type AutomationStudioResultTrailStep = {
  /** The call's own id, where the step was a call of the attempt's: the same id its decider's evidence names it by (t965). */
  callId?: string | undefined;
  did: string;
  on?: string | undefined;
  asked?: JsonValue | undefined;
  outcome?: string | undefined;
  where?: string | undefined;
  found?: JsonValue | undefined;
  /** Actual framework status/failure/effect facts; a domain projector cannot overwrite them. */
  framework?: JsonObject | undefined;
  /** Private, versioned semantic checkpoint. Request construction reads/rescreens it and never sends this beside raw findings. */
  judgeEvidence?: AutomationStudioJudgeEvidenceFinding | undefined;
};

/**
 * One trail entry as a judge is shown it: numbered from 1 in the order it ran (`n`), screened (`../run-trail/screen.ts`).
 * Neither `n` nor `entries` says "step": the judge of an attempt with no Flow is told nothing of a Flow's steps.
 */
export type AutomationStudioResultTrailShownStep = { n: number } & AutomationStudioResultTrailStep;

/**
 * Everything a run or an attempt did, in order, as every judge is shown it beside the final data (t963, user,
 * 2026-11-19: "the judge is supposed to see everything that happened during the run to get the final data, then make a
 * judgement off that and the final data"). `note` says how to read it, in Core's generic words.
 */
export type AutomationStudioResultTrail = { note: string; entries: AutomationStudioResultTrailShownStep[] };
