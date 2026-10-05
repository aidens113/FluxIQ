// The verdict a build finished on, as its proposal records it.
//
// **What was wrong (live run `run-musp8nz1-dbd3905a`, cause R2).** A build
// finishes only on a judged `yes` about a test of the Flow as it finally stands
// (`./phases.ts`, user 2026-10-02), but neither the verdict nor the Flow
// signature it was about was kept anywhere: that a build finished on such a yes
// could be proved only from the order of `core.log` lines. Now the finished
// outcome carries this record, and the service writes it on the proposal's
// `created` audit event as `buildJudged`, beside the evidence loop's counts.
//
// **A yes's advice is not a directive (`run-murwd8le-79e735a8`, cause 10).** A
// yes with `patchNeeded: true` advised "Remove or reorder step 11"; the advice
// was wrong, and a re-author that trusted it would have broken the Flow. Where
// the judge gave advice beside a yes it is kept here under `unconfirmed`, and
// nothing reads it back: the build never repaired on it, and no judgement,
// resume or seed carries it.
import { createHash } from "node:crypto";
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioFlowDraftFlowSignature, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioFlowBootstrapTestVerdict, AutomationStudioFlowBootstrapYesAdvice } from "./contracts.ts";

/** The most of a yes's advice the record keeps: the judge is asked for at most 500 characters. */
const ADVICE_MAX_CHARS = 500;

/**
 * The judged `yes` a build finished on.
 *
 * - `round`: the round whose Flow was judged (0 for the exploration).
 * - `judgedAt`: `finished_round` when the model said the Flow was ready and the
 *   loop's own test was judged; `judging_reserve` when a round the judging
 *   reserve stopped -- on money or on calls -- had its Flow tested and judged
 *   with that reserve; `stopped_short` when a round that stopped short of a
 *   completion had its changed Flow tested and judged (t195-w42).
 * - `flowSignature`: a digest (`sha256:` and hex) of the Flow signature of the
 *   test the judge read, `null` when it named none. A digest, because the
 *   signature itself holds every step's input and target.
 * - `standingFlowSignature`: the same digest of the Flow the build finished
 *   with.
 * - `matchesStandingFlow`: whether the two are the same Flow; always `true` on a
 *   finished build, recorded so a reader need not take that on trust.
 * - `confidence`: the judge's, where it gave one.
 * - `unconfirmed`: the advice and `patchNeeded` the judge gave beside its yes,
 *   where it gave any. Unconfirmed, never a repair directive.
 */
export type AutomationStudioFlowBootstrapFinishingVerdict = {
  verdict: "yes";
  round: number;
  judgedAt: "finished_round" | "judging_reserve" | "stopped_short";
  flowSignature: string | null;
  standingFlowSignature: string;
  matchesStandingFlow: boolean;
  confidence?: number;
  unconfirmed?: AutomationStudioFlowBootstrapYesAdvice;
};

/** The record of the `yes` a build finished on, about `steps`, the Flow it finished with. */
export function automationStudioFlowBootstrapFinishingVerdict(input: {
  verdict: Extract<AutomationStudioFlowBootstrapTestVerdict, { verdict: "yes" }>;
  round: number;
  judgedAt: AutomationStudioFlowBootstrapFinishingVerdict["judgedAt"];
  steps: readonly AutomationStudioFlowDraftStep[];
}): AutomationStudioFlowBootstrapFinishingVerdict {
  const standing = automationStudioFlowDraftFlowSignature(input.steps);
  const judged = input.verdict.flowSignature;
  const confidence = input.verdict.confidence;
  const unconfirmed = yesAdvice(input.verdict.unconfirmedAdvice);
  return {
    verdict: "yes",
    round: input.round,
    judgedAt: input.judgedAt,
    flowSignature: judged === undefined ? null : digest(judged),
    standingFlowSignature: digest(standing),
    matchesStandingFlow: judged === standing,
    ...(typeof confidence === "number" && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? { confidence } : {}),
    ...(unconfirmed ? { unconfirmed } : {})
  };
}

/** The record as the proposal's `created` audit event carries it: plain JSON. */
export function automationStudioFlowBootstrapFinishingVerdictDetail(record: AutomationStudioFlowBootstrapFinishingVerdict): JsonObject {
  return {
    verdict: record.verdict,
    round: record.round,
    judgedAt: record.judgedAt,
    flowSignature: record.flowSignature,
    standingFlowSignature: record.standingFlowSignature,
    matchesStandingFlow: record.matchesStandingFlow,
    ...(record.confidence !== undefined ? { confidence: record.confidence } : {}),
    ...(record.unconfirmed ? { unconfirmed: { ...record.unconfirmed } } : {})
  };
}

/** A Flow signature as the record keeps it. */
function digest(signature: string): string {
  return `sha256:${createHash("sha256").update(signature).digest("hex")}`;
}

/** A yes's advice, bounded, or nothing where it gave none. */
function yesAdvice(value: AutomationStudioFlowBootstrapYesAdvice | undefined): AutomationStudioFlowBootstrapYesAdvice | undefined {
  if (!value) return undefined;
  const advice = typeof value.advice === "string" ? value.advice.trim().slice(0, ADVICE_MAX_CHARS) : "";
  const kept: AutomationStudioFlowBootstrapYesAdvice = {
    ...(advice ? { advice } : {}),
    ...(typeof value.patchNeeded === "boolean" ? { patchNeeded: value.patchNeeded } : {})
  };
  return Object.keys(kept).length ? kept : undefined;
}
