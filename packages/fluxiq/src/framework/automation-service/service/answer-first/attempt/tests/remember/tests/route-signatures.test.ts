// A step a task keeps carries what its attempt's routing signed for it, so the next attempt's Flow has the step's
// effect, and the run gate can look before it refuses a press held to a look (t1062).
//
// Company-website `run-mwxk0spp-0e94cbfe`: a booking widget's Next, pressed by the first attempt, was carried to every
// later attempt held to a look (`runtime/answer-first/act-record/seed.ts`). The later attempt assembles its Flow from
// the task's kept steps with its own routing (`../../../../flow-run/assemble.ts`), and that routing signs only the pages its
// own calls reported, so no node had an effect, the gate never looked (`../../../../run-acts/run-gate.ts`), and the Next was
// refused on every replay with nothing sent. A permit application's stepper stands in.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../../../core/index.ts";
import { edge, graph } from "../../../../../../../../engine/automation/lifecycle-run/tests/lifecycle-fixtures.ts";
import type { AutomationStudioFlowNode } from "../../../../../../../../flows/executable/graph/index.ts";
import { AutomationStudioAttemptActRecord, automationStudioAttemptActSeed } from "../../../../../../../../runtime/answer-first/act-record/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../../../../../../../../runtime/native-nodes/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../../../../../../executor/index.ts";
import { AUTOMATION_STUDIO_ROUTE_SIGNATURES_METADATA_KEY, startAutomationStudioBuildRouting, type AutomationStudioBuildRouting } from "../../../../../../route-state/index.ts";
import { automationStudioAnswerFirstRunActGate } from "../../../../run-acts/index.ts";
import { automationStudioAnswerFirstRemember } from "../../../remember.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "../../../state.ts";

const PRESS = "domain.press";
const NEXT = { selector: ".stepper .next", element: { tagName: "button", text: "Continue" } };
const OPTION = { selector: ".stepper .permit-kind", element: { tagName: "button", text: "Parking permit" } };
const NO_PROCESSING = { processingDeclaration: () => undefined };

/** A host that signs a page by its heading and a step's effect by the heading it left. */
const signer: Partial<AutomationStudioHostRuntimeBoundary> = {
  signRouteState: (state) => ({ heading: String(state.heading) }),
  signRouteEffect: (_before, after) => ({ heading: String(after.heading) })
};

async function routing(): Promise<AutomationStudioBuildRouting> {
  return await startAutomationStudioBuildRouting({ hostRuntime: { capabilities: [], observeRouteState: () => ({ heading: "first" }), ...signer }, projectId: "project.permits", flowId: "flow.permits", flowInputs: [], start: "first_look" });
}

const reply = (before: string, after: string, heading: string) => ({ kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: true, stateDigests: { before, after }, routeState: { heading } });

/** The first attempt's routing, which saw the stepper on its first step (D0) and moved it to its second (D1) with Continue. */
async function firstAttemptRouting(): Promise<AutomationStudioBuildRouting> {
  const first = await routing();
  const replies: Record<string, ReturnType<typeof reply>> = { "initial.core.run_node": reply("D0", "D0", "first"), "c.next": reply("D0", "D1", "second") };
  const executeTool = first.recording(async (call: { callId: string; toolId: string }) => replies[call.callId]!);
  for (const callId of Object.keys(replies)) await executeTool({ callId, toolId: "core.run_node" });
  return first;
}

const continueStep: AutomationStudioFlowDraftStep = {
  position: 1, id: "step.next", iteration: 1, callId: "c.next", actionId: PRESS, toolId: "core.run_node",
  input: { node: PRESS, parameters: { target: { handle: "t7" } } }, ranWith: { node: PRESS, parameters: NEXT },
  effect: "mutate", effectApplied: true, stateBefore: "D0", stateAfter: "D1", disposition: "kept"
};

/** What the task memory holds after the first attempt's ending remembers `steps` under `routingOf`. */
async function remembered(steps: AutomationStudioFlowDraftStep[], routingOf: AutomationStudioBuildRouting): Promise<AutomationStudioFlowDraftStep[]> {
  let memory: Record<string, unknown> = { attempts: [], notes: [] };
  const run = {
    input: { projectId: "project.permits", flowId: "flow.permits", routing: routingOf }, taskId: "task.permits", attemptId: "attempt.1", ordinal: 1, steps, startedWith: [], askedAgain: false,
    route: { kind: "build" }, completion: { state: {} }, record: new AutomationStudioAttemptActRecord(), result: NO_PROCESSING,
    memory: { update: async (_project: string, _task: string, change: (current: unknown) => Record<string, unknown>) => (memory = change(memory)) }
  } as unknown as AutomationStudioAnswerFirstAttemptRun;
  expect((await automationStudioAnswerFirstRemember(run, "achieved", { label: "confirmed", candidateId: undefined, stated: [], spend: { calls: 0, usd: 0 }, atMs: 1 })).ok).toBe(true);
  return (memory.best as { steps: AutomationStudioFlowDraftStep[] }).steps;
}

/** The first attempt's record: its Continue changed a line that stays and declared nothing, so it is carried held to a look. */
function heldSeed() {
  const record = new AutomationStudioAttemptActRecord();
  record.settled({ actionId: PRESS, parameters: NEXT, consequences: [], stage: "exploration" }, { effectApplied: true, words: { what: "Continue", where: "On the site" }, changedState: true });
  return automationStudioAttemptActSeed({ data: record.data() })!;
}

/** The second attempt's replay: its Continue node carries what assembly read for it, on a stepper back on its first step. */
async function replay(signatures: JsonObject | undefined) {
  let step = 1;
  const sent: string[] = [];
  const next: AutomationStudioFlowNode = { id: "next", label: "next", definitionId: PRESS, definitionVersion: "1", parameterValues: NEXT, ...(signatures ? { metadata: { [AUTOMATION_STUDIO_ROUTE_SIGNATURES_METADATA_KEY]: signatures } } : {}) };
  const pick: AutomationStudioFlowNode = { id: "pick", label: "pick", definitionId: PRESS, definitionVersion: "1", parameterValues: OPTION };
  const nodes = [{ id: "start", definitionId: "builtin.control.start" }, next, pick, { id: "done", definitionId: "builtin.control.end" }];
  const ids = nodes.map((node) => node.id);
  const flow = graph("graph.stepper", nodes, ids.slice(1).map((id, index) => edge(ids[index]!, id, index === 0 ? "next" : "success")));
  flow.metadata = { projectId: "project.permits" };
  const options: AutomationStudioGraphExecutionOptions = {
    inputs: {},
    resolveActionEffect: () => ({ effectClass: "commit", permissionConsequences: [] }),
    delay: async () => undefined,
    nativeNodeExecutor: async ({ node }) => {
      const selector = String((node.parameterValues as JsonObject | undefined)?.selector);
      if (selector !== (step === 1 ? NEXT.selector : OPTION.selector)) return { result: { status: "failed", route: "failed", outputs: {}, effects: [], message: "Not on the page.", failure: { category: "target_not_found", code: "web.target.not_found", retryable: false, stage: "target_resolution", effect: "unacted" } } };
      sent.push(selector);
      if (selector === NEXT.selector) step = 2;
      return { result: { status: "success", route: "success", outputs: { success: true } } };
    },
    hostRuntime: {
      capabilities: ["state-snapshot"],
      captureStateSnapshot: ({ attemptId, point }) => ({ stateSnapshotId: `${attemptId}.${point}`, stateRef: `${attemptId}.${point}`, capturedAt: 1 }),
      observeRouteState: () => ({ heading: step === 2 ? "second" : "first" }),
      routeEffectSeen: (effect, state) => (state.heading === effect.heading ? "seen" : "not_seen"),
      routeEffectHolds: (effect, state) => state.heading === effect.heading
    }
  };
  const record = new AutomationStudioAttemptActRecord({ seed: heldSeed() });
  const trace = await runAutomationStudioGraph(flow, automationStudioAnswerFirstRunActGate(options, { record, settle: true, scope: { projectId: "project.permits", flowId: "graph.stepper" } }));
  return { trace, sent };
}

describe("a kept step's route signatures, from one attempt to the next", () => {
  it("the first attempt remembers each step with what its routing signed for it", async () => {
    const [kept] = await remembered([continueStep], await firstAttemptRouting());
    expect(kept?.routeSignatures).toEqual({ before: { heading: "first" }, after: { heading: "second" }, effect: { heading: "second" } });
    // What it keeps is a copy: the attempt's own step is untouched.
    expect(continueStep.routeSignatures).toBeUndefined();
  });

  it("the second attempt's own routing, which saw none of those pages, assembles the step with its effect, and the gate releases the held Continue", async () => {
    const [kept] = await remembered([continueStep], await firstAttemptRouting());
    const second = await routing();
    const assembled = second.signaturesOf(kept!);
    expect(assembled?.effect).toEqual({ heading: "second" });
    const { trace, sent } = await replay(assembled as JsonObject | undefined);
    expect(sent).toEqual([NEXT.selector, OPTION.selector]);
    expect(trace.status).toBe("succeeded");
  });

  it("a part the second attempt did sign is its own, and only the parts it did not are carried", async () => {
    const [kept] = await remembered([continueStep], await firstAttemptRouting());
    const second = await routing();
    const executeTool = second.recording(async () => reply("D0", "D0", "first again"));
    await executeTool({ callId: "initial.core.run_node", toolId: "core.run_node" });
    expect(second.signaturesOf(kept!)).toEqual({ before: { heading: "first again" }, after: { heading: "second" }, effect: { heading: "second" } });
  });

  it("a step its routing signed nothing for is remembered as it was, carrying nothing", async () => {
    const unsigned = { ...continueStep, stateBefore: "D7", stateAfter: "D8" };
    const [kept] = await remembered([unsigned], await firstAttemptRouting());
    expect(kept).toEqual(unsigned);
    expect(kept).not.toHaveProperty("routeSignatures");
  });

  it("memory kept before t1062, whose steps carry no route signatures, assembles and replays exactly as it did: no effect, the held Continue refused", async () => {
    const older = { ...continueStep };
    const second = await routing();
    expect(second.signaturesOf(older)).toBeUndefined();
    const { trace, sent } = await replay(undefined);
    expect(trace.attempts.find((attempt) => attempt.nodeId === "next")).toMatchObject({ outputs: { skipped: "already_done" } });
    expect(sent).toEqual([]);
  });
});
