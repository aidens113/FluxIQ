// A from-step run (t804, `../from-step.ts`): the proposal run from one of its
// steps on the page as it stands -- no start hook, arrival, predecessors or
// judge -- answering which of its steps passed and where it stopped.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowBootstrapSubflow } from "../../../flow-bootstrap/plan/index.ts";
import type { AutomationStudioSubflowFromStepRequest } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { automationStudioSubflowTrialPort, runAutomationStudioSubflowFromStep, runAutomationStudioSubflowTrial } from "../index.ts";
import { PRESS, part, subflowTrialFixture } from "./fixtures.ts";

/** A subflow the router runs (no interface): start, then three presses. */
function chain(key: string): AutomationStudioFlowBootstrapSubflow {
  const steps = ["a", "b", "c"];
  return {
    key, name: key, role: "utility",
    nodes: [{ key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" }, ...steps.map((step) => ({ key: step, definitionId: PRESS.id, definitionVersion: PRESS.version, consequences: ["create_new"] }))],
    edges: ["start", ...steps].slice(0, -1).map((from, index) => ({ key: `next${index}`, source: { nodeKey: from, portId: "success" }, target: { nodeKey: steps[index]!, portId: "in" } }))
  };
}

/** The trial fixture, its target swapped for `subflow`, recording every step it ran by plan key and failing the ones named. */
function fixture(subflow: AutomationStudioFlowBootstrapSubflow = chain("add")) {
  const base = subflowTrialFixture();
  const ran: string[] = [];
  const failing = new Set<string>();
  let predecessorsAsked = 0;
  const predecessors = base.ports.predecessorProposals;
  base.ports.predecessorProposals = async (scope) => {
    predecessorsAsked += 1;
    return await predecessors(scope);
  };
  // The start page would load first in a trial (`ports.arrival`); a from-step run never goes there.
  base.ports.arrival = { node: PRESS.id, parameter: "location" };
  base.ports.startLocation = "https://start.example/";
  base.ports.graphOptions = ({ signal }) => ({ signal, now: () => 100, nativeNodeExecutor: async ({ node }) => {
    const key = String(node.metadata?.bootstrapSymbolicKey ?? node.id);
    ran.push(node.id.includes(".add.") ? key : `other:${key}`);
    if (failing.has(key) && node.id.includes(".add.")) return { result: { status: "failed", route: "failed", outputs: {}, failure: { category: "action_failed", code: "press.target_missing", retryable: false, stage: "execution" } } };
    return { result: { status: "success", route: "success", outputs: {} } };
  } });
  const request = (fromKey: string): AutomationStudioSubflowFromStepRequest => {
    const trial = base.request();
    return { scope: trial.scope, proposal: { ...trial.proposal, subflows: [structuredClone(subflow)] }, fromKey, signal: trial.signal };
  };
  return { ...base, ran, request, fail: (key: string) => failing.add(key), predecessorsAsked: () => predecessorsAsked };
}

describe("a from-step run", () => {
  it("starts at the named step on a subflow the router runs, with no reset, arrival, predecessor or judge", async () => {
    const run = fixture();
    const answer = await runAutomationStudioSubflowFromStep(run.request("b"), run.ports);

    expect(run.ran).toEqual(["b", "c"]);
    expect(answer).toMatchObject({ fromStep: true, fromKey: "b", status: "ended", passedKeys: ["b", "c"], revision: 3, digest: "add.3", trialRunId: "subflow-trial.1" });
    expect(answer.stoppedAtKey).toBeUndefined();
    expect(answer.code).toBeUndefined();
    expect(answer.feedback).toMatchObject({ fromStep: true, from: "b", status: "ended", passed: true, start: "from_step" });
    expect(answer.feedback.graphEnding).toBeUndefined();
    expect(String(answer.feedback.said)).toContain("Not the part's test");
    expect(run.judged).toEqual([]);
    expect(run.predecessorsAsked()).toBe(0);
    // Its session is marked as the brief's partial trial, naming the step it ran from.
    expect(run.sessions[0]!.metadata?.subflowTrial).toMatchObject({ briefId: "brief.add", subflowKey: "add", revision: 3, digest: "add.3", fromStep: "b" });
    expect(run.sessions.at(-1)).toMatchObject({ status: "succeeded", metadata: { subflowTrial: { start: "from_step", execution: "succeeded" } } });
    // Its lasting acts are answered, for the gate to add to the build's ledger.
    expect(answer.acts?.length).toBe(2);
  });

  it("names the step it stopped at and the steps that passed before it", async () => {
    const run = fixture();
    run.fail("c");
    const answer = await runAutomationStudioSubflowFromStep(run.request("b"), run.ports);

    expect(answer).toMatchObject({ status: "stopped", stoppedAtKey: "c", passedKeys: ["b"], code: "candidate.execution_incomplete" });
    expect(answer.feedback).toMatchObject({ passed: false, stoppedAt: "c" });
    expect(run.ran.filter((key) => key === "a")).toEqual([]);
  });

  it("runs a callable part from a step as the root frame", async () => {
    const run = fixture(part("add", "utility"));
    const answer = await runAutomationStudioSubflowFromStep(run.request("press"), run.ports);

    expect(answer).toMatchObject({ status: "ended", passedKeys: ["press"] });
    expect(run.ran).toEqual(["press"]);
  });

  it("refuses, with nothing run, a step that is not the subflow's and a proposal of another scope", async () => {
    const run = fixture();
    expect(await runAutomationStudioSubflowFromStep(run.request("missing"), run.ports)).toMatchObject({ status: "not_run", code: "subflow.from_step_unknown", passedKeys: [] });
    const other = run.request("b");
    other.proposal = { ...other.proposal, scope: { ...other.proposal.scope, briefId: "brief.other" } };
    expect(await runAutomationStudioSubflowFromStep(other, run.ports)).toMatchObject({ status: "not_run", code: "subflow.trial_identity_mismatch" });
    expect(run.ran).toEqual([]);
    expect(run.sessions).toEqual([]);
  });

  it("refuses, with nothing run, a step whose run would read a value made before it", async () => {
    const subflow = chain("add");
    subflow.nodes[3] = { ...subflow.nodes[3]!, parameters: { location: { $state: { path: "$node.a.value" } } } };
    const run = fixture(subflow);
    const answer = await runAutomationStudioSubflowFromStep(run.request("b"), run.ports);

    expect(answer).toMatchObject({ status: "not_run", code: "subflow.from_step_unbound", feedback: { reader: "c", producer: "a" } });
    expect(run.ran).toEqual([]);
    expect(run.sessions).toEqual([]);
  });

  it("throws a cancelled build's abort before anything runs", async () => {
    const run = fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(runAutomationStudioSubflowFromStep({ ...run.request("b"), signal: controller.signal }, run.ports)).rejects.toThrow();
    expect(run.ran).toEqual([]);
  });
});

describe("the trial port's from-step run", () => {
  it("is offered by a live port, never recorded as a trial", async () => {
    const run = fixture();
    const made = automationStudioSubflowTrialPort("build.1", run.ports);
    expect(made.port.fromStep).toBeDefined();
    expect(await made.port.fromStep!(run.request("b"))).toMatchObject({ status: "ended" });
    expect(made.records()).toEqual([]);
    expect(made.spent().calls).toBe(0);
  });

  it("refuses another build's request unrun", async () => {
    const run = fixture();
    const request = run.request("b");
    request.scope = { ...request.scope, buildId: "build.2" };
    expect(await automationStudioSubflowTrialPort("build.1", run.ports).port.fromStep!(request)).toMatchObject({ status: "not_run", code: "subflow.trial_other_build" });
    expect(run.ran).toEqual([]);
  });
});

describe("a partial trial's stop, by plan key", () => {
  it("names the proposal's own step it stopped at, after its predecessor ran", async () => {
    const run = fixture();
    run.ports.arrival = undefined;
    run.fail("b");
    const { fromKey: _fromKey, ...trial } = run.request("a");
    const { result } = await runAutomationStudioSubflowTrial(trial, run.ports);
    expect(run.ran.slice(0, 3)).toEqual(["other:press", "a", "b"]);
    expect(run.ran).not.toContain("c");
    expect(result).toMatchObject({ verdict: "execution_failed", stoppedAtKey: "b" });
  });

  it("names none when a predecessor stopped the trial", async () => {
    const run = subflowTrialFixture();
    run.failIn("find");
    const { result } = await runAutomationStudioSubflowTrial(run.request(), run.ports);
    expect(result.verdict).toBe("execution_failed");
    expect(result.stoppedAtKey).toBeUndefined();
  });

  it("names the callable target's step that failed", async () => {
    const run = subflowTrialFixture();
    run.failIn("add");
    const { result } = await runAutomationStudioSubflowTrial(run.request(), run.ports);
    expect(result).toMatchObject({ verdict: "execution_failed", stoppedAtKey: "press" });
  });
});
