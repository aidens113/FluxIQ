// A builder run for the t811 tests (`../../../../subflow-submit-then/submit-then.ts`, `../../../../subflow-submit-then/builder-auto-complete.ts`):
// a scripted fake provider's decide through `runAutomationStudioSubflowBuilderLoop`,
// a trial port that answers each test with the next scripted answer (a yes once
// they run out) and, where asked, runs the part from a step. Counts every
// provider decide, and keeps each decision the loop was handed, after the
// builder's own wrapper, as the activity observer would see it.
import type { JsonObject } from "../../../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput, AutomationStudioLlmEvidenceTool } from "../../../../../llm/index.ts";
import {
  AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID,
  AutomationStudioSubflowPendingRepair,
  runAutomationStudioSubflowBuilderLoop,
  type AutomationStudioSubflowFromStepRequest,
  type AutomationStudioSubflowFromStepResult,
  type AutomationStudioSubflowTrialPreparingPort,
  type AutomationStudioSubflowTrialRequest,
  type AutomationStudioSubflowTrialResult
} from "../../../index.ts";
import { SIBLINGS, testScope, testSubmission } from "../../subflow-fixture.ts";

export type Entry = { callId: string; toolId: string; value: unknown };
export type Step = (evidence: readonly Entry[]) => JsonObject;
/** A scripted trial answer: its verdict and what else it carries. */
export type Trial = { verdict: AutomationStudioSubflowTrialResult["verdict"]; feedback?: JsonObject; keptEveryRow?: unknown };

/** The page the opening look and every later look show. */
export const PAGE = { ok: true, page: "a listings page" };

const look: AutomationStudioLlmEvidenceTool = { toolId: "core.run_node", description: "Run a node", inputSchema: { type: "object" }, effect: "mutate", perCallEffect: true, initialObservation: { input: { node: "web.inspect" } } };

/** The value the call `callId` was answered with, the latest of that id. */
export function answerOf(evidence: readonly Entry[], callId: string): JsonObject {
  return [...evidence].reverse().find((entry) => entry.callId === callId)!.value as JsonObject;
}

/** A submit call of `lines`, with `extra` beside its script. */
export function submitCall(callId: string, lines: readonly string[], extra: JsonObject = {}): Step {
  return () => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID, callId, input: { flow: lines.join("\n"), ...extra } });
}

/** A plain script of two steps: open the page, then the step labelled `second`, pressing `selector`. */
export function twoSteps(selector = ".filter"): string[] {
  return ["flow: Find the listings", "step: open the listings", "  node: web.browser.navigate", "  url: https://listings.test/all", "step second: press the filter", "  node: web.dom.click", `  selector: ${selector}`, "  consequences: none"];
}

/** Runs `steps` as the provider's decisions; `afterCall` is told each call answered, with the repair memory the builder shares with the other briefs of its subflow. */
export async function runBuilder(steps: Step[], options: { trials?: Trial[]; fromStep?: boolean; checkRows?: AutomationStudioSubflowTrialPreparingPort["checkRows"]; iterations?: number; fixedState?: boolean; afterCall?: ((callId: string, repair: AutomationStudioSubflowPendingRepair) => void) | undefined } = {}) {
  const trials = [...(options.trials ?? [])];
  const cap = options.iterations ?? steps.length + 2;
  const asked: AutomationStudioSubflowTrialRequest[] = [];
  const ran: AutomationStudioSubflowFromStepRequest[] = [];
  const decisions: unknown[] = [];
  const observed: AutomationStudioLlmEvidenceLoopInput[] = [];
  const seen: Entry[][] = [];
  /** Each call's answer by its id, as the builder gave it. */
  const answers = new Map<string, JsonObject>();
  let decides = 0;
  const decide: AutomationStudioLlmEvidenceLoopInput["decide"] = async ({ evidence }) => {
    seen.push([...(evidence as Entry[])]);
    const step = steps[decides++];
    if (!step) throw new Error("script exhausted");
    return step(evidence as Entry[]);
  };
  const trial = async (request: AutomationStudioSubflowTrialRequest): Promise<AutomationStudioSubflowTrialResult> => {
    asked.push(request);
    const next = trials.shift() ?? { verdict: "yes" };
    const failed = next.verdict === "execution_failed";
    const stoppedAtKey = request.proposal.subflows[0]!.nodes[1]?.key;
    return {
      partial: true, scope: "subflow", identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, verdict: next.verdict, entryPrepared: true, trialRunId: `trial.${asked.length}`,
      feedback: next.feedback ?? (failed ? { code: "candidate.execution_incomplete", steps: [{ step: 2, status: "failed", failureCode: "web.target.not_found" }] } : {}),
      ...(failed && stoppedAtKey ? { stoppedAtKey } : {}),
      ...(next.keptEveryRow !== undefined ? { keptEveryRow: next.keptEveryRow } : {})
    } as AutomationStudioSubflowTrialResult;
  };
  const fromStep = async (request: AutomationStudioSubflowFromStepRequest): Promise<AutomationStudioSubflowFromStepResult> => {
    ran.push(request);
    return { fromStep: true, identity: { ...request.proposal.scope }, revision: request.proposal.revision, digest: request.proposal.digest, fromKey: request.fromKey, status: "ended", passedKeys: [request.fromKey], feedback: {} };
  };
  const port: AutomationStudioSubflowTrialPreparingPort = Object.assign(trial, options.fromStep ? { fromStep } : {}, options.checkRows ? { checkRows: options.checkRows } : {});
  const pendingRepair = new AutomationStudioSubflowPendingRepair();
  const outcome = await runAutomationStudioSubflowBuilderLoop({
    scope: testScope(), siblings: [...SIBLINGS], submission: testSubmission(), trial: { port }, pendingRepair,
    // What the observer would wrap: every decision the builder's decide returns.
    observe: (loop) => {
      observed.push(loop);
      return {
        ...loop,
        decide: async (request) => {
          const decision = await loop.decide(request);
          decisions.push(decision);
          return decision;
        },
        executeTool: async (call) => {
          const answered = await loop.executeTool(call);
          answers.set(call.callId, (answered as { evidence?: JsonObject }).evidence ?? {});
          options.afterCall?.(call.callId, pendingRepair);
          return answered;
        }
      };
    },
    loop: {
      // The guards against steps without progress and unusable replies are held to the iteration cap, as the loop's configuration requires.
      tools: [look], maxIterations: cap, maxToolCalls: steps.length + 6,
      unusableDecisions: { maxConsecutive: cap, maxInARow: cap, stalled: () => new Error("stalled") },
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: PAGE, effectApplied: false, targetsUnchanged: true }),
      ...(options.fixedState ? { captureStateDigest: () => "the-same-page" } : {}),
      decide
    }
  });
  return { outcome, asked, ran, decisions, observed, seen, answers, pendingRepair, decides: () => decides };
}
