// The candidate authoring loop's own tools go through the observer it is given
// (t373): each test is a card that says the trial's verdict and what its steps
// did, and a test the gate will not run is a card that says why, in words.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { activityActionOf } from "../../../../../../ui/index.ts";
import { automationStudioActivityHub, observeAutomationStudioEvidenceLoop, runWithAutomationStudioActivity } from "../../../activity/index.ts";
import { runAutomationStudioFlowCandidateAuthoringLoop, type AutomationStudioCandidateTrialPort } from "../index.ts";

const definition: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: "domain.demo.inspect", version: "1.0.0", label: "Inspect", description: "Inspect one value", category: "action",
  source: { kind: "importer", domainId: "demo", implementationKey: "inspect" }, availability: { kind: "domain", domainId: "demo" }, capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
  parameters: [{ id: "text", label: "Text", valueType: "string", required: true }]
};
const registry = new AutomationStudioNodeRegistry([definition]);
const resolution = { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [], permissions: [] };
const submission = { projectId: "project.test", flowId: "flow.test", registry, resolution, baseDependencyDigest: "accepted.base" };
const flow: JsonObject = { summary: "Inspect", plan: { schemaVersion: "0.1", router: { name: "Inspect", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } }, subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: [
  { key: "first", definitionId: definition.id, definitionVersion: definition.version, parameters: { text: "one" } }
], edges: [] }] } };

/** A trial that stopped at its fourth step, after passing over an optional popup: the feedback `../../../service/candidate-trial/feedback.ts` writes. */
const STOPPED: JsonObject = { code: "candidate.trial_execution_failed", trialRunId: "run.trial-7f3a", start: "not_reset", steps: [
  { step: 1, definitionId: "web.output.browser-navigate", label: "Open the shop", status: "succeeded" },
  { step: 2, definitionId: "web.output.dom-click", label: "Close the popup", control: "No thanks", status: "failed", failureCode: "web.target.not_found", happened: "The step's control was not found on the page.", retryable: true },
  { step: 3, definitionId: "web.output.dom-click", label: "Dismiss cookies", status: "succeeded", skipped: "Its control was not on the page, so the step was skipped." },
  { step: 4, definitionId: "web.output.dom-click", label: "Add to cart t478", control: "Add to cart", status: "failed", attempts: 4, failureCode: "web.action.refused_by_page", happened: "The step ran and did not work.", retryable: false }
] };

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => { seen = []; unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event)); });
afterEach(() => unsubscribe());

/** Submit, then test `tests` times (the last with a stale revision when `stale`), then stop. */
async function build(port: AutomationStudioCandidateTrialPort, options: { stale?: boolean; tests?: number } = {}) {
  let receipt: JsonObject = {};
  const tests = options.tests ?? 1;
  await runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, () => runAutomationStudioFlowCandidateAuthoringLoop({
    submission, trial: { candidateId: "candidate.cards", port }, observe: observeAutomationStudioEvidenceLoop,
    loop: { tools: [], maxIterations: tests + 2, maxToolCalls: tests + 2, executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: false }),
      decide: async ({ iteration, evidence }) => {
        if (iteration === 1) return { kind: "tool_call", toolId: "core.submit_candidate", callId: "submit", input: flow };
        receipt = [...evidence].reverse().find((entry) => entry.toolId === "core.submit_candidate")!.value as JsonObject;
        if (iteration <= tests + 1) return { kind: "tool_call", toolId: "core.test_candidate", callId: `test-${iteration}`, input: { revision: options.stale && iteration === tests + 1 ? 99 : receipt.revision, digest: receipt.digest } };
        return { kind: "complete", result: { revision: receipt.revision, digest: receipt.digest } };
      } }
  }));
  const closing = seen.filter((event) => event.detail?.kind === "tool" && event.detail.ref === "core.test_candidate" && event.detail.status !== "started");
  return { closing, cards: closing.map((event) => activityActionOf(event)), digest: String(receipt.digest) };
}

const INTERNAL = /core\.|revision|digest|\bcandidate\b|trial_|run\.trial|t478|web\./iu;

describe("a candidate test's card", () => {
  it("a run that stopped says which step did not work and why, the step it passed over, and what was done", async () => {
    const { closing, cards, digest } = await build(async ({ revision, digest }) => ({ revision, digest, verdict: "execution_failed", feedback: STOPPED }));
    expect(closing).toHaveLength(1);
    expect(closing[0]!.detail?.text).toMatch(/^Result:\s*candidate\.trial_execution_failed\b/u);
    expect(cards[0]).toMatchObject({ kind: "test", outcome: "failed" });
    expect(cards[0]?.why).toBe("step 2, “No thanks”, didn't work and was passed over: the step's control was not found on the page; step 4, “Add to cart”, didn't work: the step ran and did not work; 1 step done, 1 skipped");
    expect(closing[0]!.label).toBe("Testing the whole Flow from the start — didn't pass");
    for (const said of [closing[0]!.label, cards[0]?.why ?? ""]) { expect(said).not.toMatch(INTERNAL); expect(said).not.toContain(digest); }
  });

  it.each([
    ["no", "the Flow ran, but it didn't do what you asked"],
    ["unsure", "the Flow ran, but whether it did what you asked couldn't be confirmed"],
    ["not_judged", "the Flow ran, but whether it did what you asked couldn't be confirmed"]
  ] as const)("a %s verdict is no pass, and says so with what the steps did", async (verdict, head) => {
    const { cards } = await build(async ({ revision, digest }) => ({ revision, digest, verdict, feedback: { code: `candidate.trial_${verdict}`, steps: [{ step: 1, definitionId: definition.id, status: "succeeded" }, { step: 2, definitionId: definition.id, status: "succeeded" }], judge: { observed: "Cart shows 1 item", advice: "Add three" } } }));
    expect(cards[0]).toMatchObject({ kind: "test", outcome: "failed", why: `${head}: 2 steps done` });
    // The judge's own words are the model's reading of the page and stay out of the card.
    expect(JSON.stringify(cards[0])).not.toMatch(/Cart shows|Add three/u);
  });

  it("a test the gate will not run is not done, with why, and the overlay reads it as a test that did not run", async () => {
    const { closing, cards } = await build(async ({ revision, digest }) => ({ revision, digest, verdict: "yes", feedback: {} }), { stale: true });
    expect(cards[0]).toMatchObject({ kind: "test", outcome: "failed", refused: { all: true, because: "only the latest saved steps can be tested" } });
    expect(closing[0]!.detail?.text).toMatch(/^Result:\s*candidate\.trial_stale_revision\b/u);
    expect(closing[0]!.label).toBe("Testing the whole Flow from the start — not done");
  });

  it("the same step failing in two tests says that step has to change", async () => {
    const lastOnly: JsonObject = { ...STOPPED, steps: [(STOPPED.steps as JsonObject[])[3]!] };
    const { cards } = await build(async ({ revision, digest }) => ({ revision, digest, verdict: "execution_failed", feedback: lastOnly }), { tests: 2 });
    expect(cards.map((card) => card?.why)).toEqual([
      "step 4, “Add to cart”, didn't work: the step ran and did not work",
      "step 4, “Add to cart”, didn't work: the step ran and did not work; it stopped there in two tests, so that step has to change"
    ]);
  });
});
