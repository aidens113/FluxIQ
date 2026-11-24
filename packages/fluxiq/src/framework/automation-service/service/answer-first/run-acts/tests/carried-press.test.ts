// F23 (run-mwov0vf8-41ab862a), provider-free: a saved Flow's replay in a later attempt loses the
// same click target every time. The click's control is not lost: the step before it, a plain
// press that only moves a stepper on (its heading reads otherwise and the first step's options
// go), was held by the first attempt's act record as "changed something that stays"
// (`runtime/answer-first/act-record/gate/read-answer.ts`, `changedState` from a line that
// `reads` otherwise), carried to every later attempt (`act-record/seed.ts`, `heldOnRepeat`), and
// refused on every replay by the attempt's run gate (`service/answer-first/run-acts/run-gate.ts`)
// with nothing sent. The stepper never reaches its next step, so the next press finds no control,
// its fresh look is complete and correctly says the control is not there, and the step ends gone.
// A permit application's stepper stands in, unrelated to any realistic scenario.
//
// The fix (t994): the run gate gives such a press, held only to a look, that look itself, from
// the step's own recorded effect and the host's sighting under the run's scope. Only `not_seen`
// lets it go; `seen`, `unknown`, no recorded effect, no scope and no observation refuse as before,
// and a declared act is never looked past.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../../../../flows/executable/graph/index.ts";
import { edge, graph } from "../../../../../../engine/automation/lifecycle-run/tests/lifecycle-fixtures.ts";
import { AutomationStudioAttemptActRecord, automationStudioAttemptActAnswerRead, automationStudioAttemptActSeed } from "../../../../../../runtime/answer-first/act-record/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../../../runtime/llm/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../../../../executor/index.ts";
import { automationStudioAnswerFirstRunActGate } from "../index.ts";
import { AUTOMATION_STUDIO_TARGET_GONE_CODE } from "../../../../../../engine/automation/target-reacquire/index.ts";

const PRESS = "domain.press";
const NEXT = { selector: ".stepper .next", element: { tagName: "button", text: "Continue" } };
const OPTION = { selector: ".stepper .permit-kind", element: { tagName: "button", text: "Parking permit" } };
const REFRESH = { container: "node" as const, definitionId: PRESS, definitionVersion: "1", parameterIds: ["selector", "element"], removableParameterIds: ["selector"] };

const press = (id: string, parameterValues: JsonObject): AutomationStudioFlowNode => ({ id, label: id, definitionId: PRESS, definitionVersion: "1", parameterValues });

/** Start, the stepper's Continue, then the option its second step shows, then end: the saved Flow as the first attempt wrote it. */
function savedFlow() {
  const nodes = [{ id: "start", definitionId: "builtin.control.start" }, press("next", NEXT), press("pick", OPTION), { id: "done", definitionId: "builtin.control.end" }];
  const ids = nodes.map((node) => node.id);
  return graph("graph.stepper", nodes, ids.slice(1).map((id, index) => edge(ids[index]!, id, index === 0 ? "next" : "success")));
}

/**
 * A stepper on its first step, as every fresh attempt finds it: Continue moves it to the second
 * step, whose options were not on the first. A press of a control not on the page sends nothing and
 * fails as not found. The host's fresh look is complete and finds the option only on the second step.
 */
function stepper() {
  let step = 1;
  const sent: string[] = [];
  const looks: number[] = [];
  const options: AutomationStudioGraphExecutionOptions = {
    inputs: {},
    // The web domain's floor says every press commits.
    resolveActionEffect: () => ({ effectClass: "commit", permissionConsequences: [] }),
    resolveTargetRefresh: () => ({ kind: "declared", refresh: REFRESH }),
    delay: async () => undefined,
    nativeNodeExecutor: async ({ node }) => {
      const selector = String((node.parameterValues as JsonObject | undefined)?.selector ?? node.id);
      const present = step === 1 ? selector === NEXT.selector : selector === OPTION.selector;
      if (!present) return { result: { status: "failed", route: "failed", outputs: {}, effects: [], message: "Not on the page.", failure: { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution", effect: "unacted" } } };
      sent.push(selector);
      if (selector === NEXT.selector) step = 2;
      return { result: { status: "success", route: "success", outputs: { success: true } } };
    },
    hostRuntime: {
      capabilities: ["state-snapshot"],
      captureStateSnapshot: ({ attemptId, point }) => ({ stateSnapshotId: `${attemptId}.${point}`, stateRef: `${attemptId}.${point}`, capturedAt: 1 }),
      reacquireUnboundTarget: () => {
        looks.push(step);
        return step === 2
          ? { outcome: "found", patches: [{ operation: "set", parameterId: "selector", value: OPTION.selector }, { operation: "set", parameterId: "element", value: OPTION.element }] }
          : { outcome: "gone", coverage: "complete" };
      }
    }
  };
  return { options, sent, looks, step: () => step };
}

type Sighting = "seen" | "not_seen" | "unknown" | "by_page";

/**
 * A later attempt's replay of the saved Flow over the stepper, its Continue carried from the first attempt: held only
 * to a look, or (`declared`) declared lasting. The Continue's node records its effect unless `effect` is false; the host
 * observes the page unless `observes` is false and answers `sighting` (`by_page`: seen only once the stepper moved on);
 * the gate gets the run's scope unless `scope` is false.
 */
function heldReplay(given: { sighting: Sighting; effect?: boolean; scope?: boolean; observes?: boolean; declared?: boolean }) {
  const page = stepper();
  let observed = 0;
  const flow = savedFlow();
  flow.metadata = { projectId: "project.permits" };
  if (given.effect !== false) flow.nodes.find((node) => node.id === "next")!.metadata = { routeSignatures: { effect: { heading: "second" } } };
  const observe = () => {
    observed += 1;
    return { heading: page.step() === 2 ? "second" : "first" };
  };
  page.options.hostRuntime = {
    ...page.options.hostRuntime!,
    ...(given.observes === false ? {} : { observeRouteState: observe }),
    routeEffectSeen: (_effect, state) => given.sighting === "by_page" ? (state.heading === "second" ? "seen" : "not_seen") : given.sighting,
    routeEffectHolds: (_effect, state) => state.heading === "second"
  };
  const first = given.declared ? declaredFirstAttempt() : firstAttempt();
  const record = new AutomationStudioAttemptActRecord({ seed: automationStudioAttemptActSeed({ data: first.data() })! });
  const gate = automationStudioAnswerFirstRunActGate(page.options, { record, settle: true, ...(given.scope === false ? {} : { scope: { projectId: "project.permits", flowId: "graph.stepper" } }) });
  return { page: { ...page, observed: () => observed }, flow, record, gate };
}

/** A first attempt whose Continue declared a lasting act: carried as it always was, never held only to a look. */
function declaredFirstAttempt(): AutomationStudioAttemptActRecord {
  const record = new AutomationStudioAttemptActRecord();
  record.settled({ actionId: PRESS, parameters: NEXT, consequences: ["create_new"], stage: "exploration" }, { effectApplied: true, words: { what: "Continue", where: "On the site" } });
  return record;
}

/** The domain's answer to the first attempt's by-hand Continue: the stepper's heading reads otherwise and the first step's options went. */
const continueAnswer = {
  kind: "llm_evidence_tool_execution",
  effectApplied: true,
  evidence: { ok: true, status: "succeeded", pageChanged: true },
  draft: { effect: "mutate", changed: [{ words: "\"Step 2 of 3\" (was \"Step 1 of 3\")", how: "reads" }, { words: "\"Resident permit\" gone", how: "went" }] }
} as unknown as AutomationStudioLlmEvidenceToolExecutionResult;

/** The first attempt's record: its by-hand Continue, settled from that answer as the act gate settles it (`act-gate.ts`). */
function firstAttempt(): AutomationStudioAttemptActRecord {
  const said = automationStudioAttemptActAnswerRead(continueAnswer);
  const record = new AutomationStudioAttemptActRecord();
  record.settled({ actionId: PRESS, parameters: NEXT, consequences: [], stage: "exploration" }, { effectApplied: said.applied, uncertain: said.uncertain, words: { what: "Continue", where: "On the site" }, ...(said.changedState ? { changedState: true } : {}) });
  return record;
}

describe("F23: a later attempt's replay of a saved stepper Flow", () => {
  it("reads a stepper's Continue as a press that changed something that stays, and carries it held to a look", () => {
    expect(automationStudioAttemptActAnswerRead(continueAnswer).changedState).toBe(true);
    const seed = automationStudioAttemptActSeed({ data: firstAttempt().data() })!;
    expect(seed.acts).toHaveLength(1);
    expect(seed.acts[0]).toMatchObject({ undeclared: true, changedState: true, heldOnRepeat: true, carried: true });
  });

  it("today: refuses the saved Continue with nothing sent, so the option never arises and its step ends gone", async () => {
    const page = stepper();
    const record = new AutomationStudioAttemptActRecord({ seed: automationStudioAttemptActSeed({ data: firstAttempt().data() })! });
    const trace = await runAutomationStudioGraph(savedFlow(), automationStudioAnswerFirstRunActGate(page.options, { record, settle: true }));
    // The run gate answered Continue as already done: nothing was pressed and the stepper stayed on its first step.
    const next = trace.attempts.filter((attempt) => attempt.nodeId === "next");
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ status: "succeeded", outputs: { skipped: "already_done" } });
    expect(page.sent).toEqual([]);
    expect(page.step()).toBe(1);
    // The option's press: first attempt and two retries not found, then the fresh look (complete, same place) says gone.
    const pick = trace.attempts.filter((attempt) => attempt.nodeId === "pick");
    expect(pick.slice(0, 3).map((attempt) => attempt.failure?.code)).toEqual(["web.target.not_found", "web.target.not_found", "web.target.not_found"]);
    expect(page.looks).toEqual([1]);
    expect(pick.at(-1)?.failure?.code).toBe(AUTOMATION_STUDIO_TARGET_GONE_CODE);
    expect(trace.status).toBe("failed");
  });

  // The fix (t995's proposal, t994): a carried act held only to a look (undeclared, `heldOnRepeat`)
  // gets that look mechanically on a replay, from the step's own recorded effect: the host says none of
  // it is on the page (`not_seen`), so the act does not stand here and the Continue is pressed.
  it("after the fix: a held Continue whose recorded effect is not on the page is pressed, and the replay reaches its end", async () => {
    const { page, flow, record, gate } = heldReplay({ sighting: "by_page" });
    const trace = await runAutomationStudioGraph(flow, gate);
    expect(page.sent).toEqual([NEXT.selector, OPTION.selector]);
    expect(trace.status).toBe("succeeded");
    expect(page.observed()).toBeGreaterThanOrEqual(1);
    // Let go for this attempt only: the Continue is this attempt's own press now, and the next attempt holds it to a look again.
    expect(record.carriedHold({ actionId: PRESS, parameters: NEXT })).toBeUndefined();
    expect(automationStudioAttemptActSeed({ data: record.data() })!.acts[0]).toMatchObject({ undeclared: true, heldOnRepeat: true, carried: true });
  });

  it.each([
    ["the host sees the effect", { sighting: "seen" as const }],
    ["the host cannot say", { sighting: "unknown" as const }],
    ["the step recorded no effect", { sighting: "not_seen" as const, effect: false }],
    ["the run names no host scope", { sighting: "not_seen" as const, scope: false }],
    ["the look cannot observe the page", { sighting: "not_seen" as const, observes: false }]
  ])("still refuses the held Continue, with nothing sent, where %s", async (_said, given) => {
    const { page, flow, gate } = heldReplay(given);
    const trace = await runAutomationStudioGraph(flow, gate);
    expect(trace.attempts.filter((attempt) => attempt.nodeId === "next")[0]).toMatchObject({ status: "succeeded", outputs: { skipped: "already_done" } });
    expect(page.sent).toEqual([]);
    expect(page.step()).toBe(1);
  });

  it("never looks past a declared act, whatever the page shows", async () => {
    const { page, flow, gate } = heldReplay({ sighting: "not_seen", declared: true });
    const trace = await runAutomationStudioGraph(flow, gate);
    expect(trace.attempts.filter((attempt) => attempt.nodeId === "next")[0]).toMatchObject({ status: "succeeded", outputs: { skipped: "already_done" } });
    expect(page.sent).toEqual([]);
  });

  it("the same option re-rendered under a new address on the step it lives on is found again, not gone", async () => {
    const page = stepper();
    // No carried act: Continue is pressed, the stepper moves on, and only the option's saved address is stale.
    const stale = savedFlow();
    stale.nodes.find((node) => node.id === "pick")!.parameterValues = { ...OPTION, selector: ".stepper .permit-kind-old" };
    const trace = await runAutomationStudioGraph(stale, automationStudioAnswerFirstRunActGate(page.options, { record: new AutomationStudioAttemptActRecord(), settle: true }));
    expect(trace.status).toBe("succeeded");
    expect(page.sent).toEqual([NEXT.selector, OPTION.selector]);
    expect(page.looks).toEqual([2]);
    expect(trace.attempts.filter((attempt) => attempt.nodeId === "pick").at(-1)?.reacquire).toMatchObject({ kind: "identity", outcome: "found" });
  });
});
