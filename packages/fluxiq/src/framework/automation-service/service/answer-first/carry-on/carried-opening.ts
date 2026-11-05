// What a carried-on attempt starts from: everything it already had (design, "Carry on"), read from
// its row and its task as the press found them, in the shape a new attempt's opening has. Nothing
// here asks whether the Flow would run, because it never runs again: the rounds go on from the
// page as it stands, told what stands.

import type { AutomationStudioTaskAttemptLoopsCaught, AutomationStudioTaskAttemptPath, AutomationStudioTaskResult, AutomationStudioTriedRecord } from "@fluxiq/contracts/automation";
import type { AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioAnswerFirstRoute } from "../route/index.ts";
import { type AutomationStudioAnswerFirstAttemptProvenance, type AutomationStudioAnswerFirstTaskMemory } from "../task-memory/index.ts";
import type { AutomationStudioAnswerFirstCarryOnHold } from "./hold.ts";
import type { AutomationStudioAnswerFirstAttemptPrior } from "./prior.ts";

export type AutomationStudioAnswerFirstCarriedOpening = {
  route: AutomationStudioAnswerFirstRoute;
  ordinal: number;
  startedAtMs: number;
  steps: AutomationStudioFlowDraftStep[];
  startedWith: AutomationStudioFlowDraftStep[];
  startedFrom?: AutomationStudioAnswerFirstAttemptProvenance["startedFrom"];
  path: AutomationStudioTaskAttemptPath;
  /** A round had already decided something after the Flow's run (`../attempt/path.ts`). */
  decidedAfterRun: boolean;
  tried: AutomationStudioTriedRecord;
  loopsCaught: AutomationStudioTaskAttemptLoopsCaught;
  result: AutomationStudioTaskResult | undefined;
  runId: string | undefined;
  prior: AutomationStudioAnswerFirstAttemptPrior;
};

export function automationStudioAnswerFirstCarriedOpening(hold: AutomationStudioAnswerFirstCarryOnHold): AutomationStudioAnswerFirstCarriedOpening {
  const { before, kept } = hold;
  const { attempt } = before;
  const provenance = kept?.attempts.find((each) => each.attemptId === hold.attemptId);
  const steps = [...(before.steps ?? [])];
  const origins = provenance?.steps ?? [];
  const ran = attempt.path !== "explore";
  return {
    route: routeOf(kept, provenance),
    ordinal: attempt.ordinal,
    startedAtMs: attempt.startedAtMs,
    steps,
    startedWith: startedWith(steps, kept, provenance),
    ...(provenance?.startedFrom ? { startedFrom: provenance.startedFrom } : {}),
    // This press is a fresh start, which is no longer the repair of the step the Flow stopped at (`../attempt/path.ts`).
    path: attempt.path === "run_flow_then_repair" ? "run_flow_then_explore" : attempt.path,
    decidedAfterRun: attempt.path === "run_flow_then_repair" || attempt.path === "run_flow_then_explore",
    tried: before.tried,
    loopsCaught: structuredClone(attempt.loopsCaught),
    result: before.result,
    runId: attempt.runId,
    prior: {
      spend: { ...attempt.spend },
      budgetUsd: hold.budgetUsd,
      askedUsd: hold.askedUsd,
      path: attempt.path,
      liveSteps: attempt.liveSteps,
      origins,
      flowFailedLive: ran && (origins.some((origin) => origin.ran === "failed" || origin.ran === "not_reached") || before.result?.label === "refuted")
    }
  };
}

/** Its route as the task remembers it, for what its provenance says. The saved Flow in it never runs again. */
function routeOf(kept: AutomationStudioAnswerFirstTaskMemory | undefined, provenance: AutomationStudioAnswerFirstAttemptProvenance | undefined): AutomationStudioAnswerFirstRoute {
  const notes = kept?.notes ?? [];
  if (provenance?.route === "use" && kept?.best) return { kind: "use", saved: kept.best, notes };
  if (provenance?.route === "repair" && kept?.best) return { kind: "repair", saved: kept.best, notes, why: "" };
  return { kind: "build", notes };
}

/** The steps it started with: those its last ending said were saved, else the Flow it started from, where the task still holds it. */
function startedWith(steps: readonly AutomationStudioFlowDraftStep[], kept: AutomationStudioAnswerFirstTaskMemory | undefined, provenance: AutomationStudioAnswerFirstAttemptProvenance | undefined): AutomationStudioFlowDraftStep[] {
  const saved = new Set((provenance?.steps ?? []).filter((origin) => origin.from === "saved").map((origin) => origin.position));
  if (saved.size) return steps.filter((step) => saved.has(step.position));
  const from = provenance?.startedFrom;
  return from && kept?.best && kept.best.stepsDigest === from.stepsDigest ? [...kept.best.steps] : [];
}
