// The model's stated reason for a call, said only as far as what happened bears
// it out (t378, `../decision-answer/narration.ts`), with the card of a whole Flow
// sent again unchanged (`../decision-answer/refused-call.ts`). Lane C
// (`run-mv0fuotv-805294d7`) showed "Resubmitting the corrected Flow: ..." three
// times over an unchanged script, each with a card saying a step was "already
// tried exactly this way"; lane D (`run-mv0fuual-f9e6f089`) said a test "now
// confirms only requests with 5+ mutual friends" over a Flow that confirmed all
// eight.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../llm/index.ts";
import { automationStudioActivityDecisionReason } from "../decision-reason.ts";
import { automationStudioActivityHub } from "../default-hub.ts";
import { observeAutomationStudioEvidenceLoop } from "../observer.ts";
import { runWithAutomationStudioActivity } from "../scope.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

type Decide = AutomationStudioLlmEvidenceLoopInput["decide"];
type Decision = Awaited<ReturnType<Decide>>;
type Evidence = Parameters<Decide>[0]["evidence"];
type ToolResult = Awaited<ReturnType<AutomationStudioLlmEvidenceLoopInput["executeTool"]>>;

const inScope = <T>(fn: () => Promise<T>) => runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, fn);
const request = (iteration: number, evidence: Evidence = []) => ({ iteration, tools: [], evidence, decisionSchema: {}, canComplete: true });
const ran = (evidence: Record<string, unknown>) => ({ kind: "llm_evidence_tool_execution", evidence, effectApplied: false });
const repeatCheck = (iteration: number): Evidence[number] => ({ callId: `core.repeat_check.${iteration}`, toolId: "core.repeat_check", value: { ok: false, code: "llm_evidence_loop.repeat_refused", then: { outcome: "failed" } } } as Evidence[number]);
/** Each thought said after a decision, as [title, text]. */
const thoughts = () => seen.filter((event) => event.detail?.kind === "thought" && event.detail.status !== "started").map((event) => [event.detail?.title, event.detail?.text]);

const SCRIPT = "flow: Earbuds\nstep: open\n  node: web.browser-navigate\n  url: https://shop.test";
const submit = (callId: string, reason: string) => automationStudioActivityDecisionReason.attach({ kind: "tool_call", callId, toolId: "core.submit_candidate", input: { flow: SCRIPT } }, reason);
const refusedSubmission = ran({ ok: false, revision: 1, diagnostics: { refusal: "flow_bootstrap.evidence_completion_plan_invalid", issues: [{ code: "flow_script.repeat_invalid", path: "flow.line.27" }] }, issueCodes: ["flow_script.repeat_invalid"] });

function loopInput(decisions: unknown[], results: unknown[]): AutomationStudioLlmEvidenceLoopInput {
  return {
    tools: [],
    decide: async () => decisions.shift() as Decision,
    executeTool: async () => results.shift() as ToolResult
  };
}

describe("a whole Flow sent again unchanged (lane C)", () => {
  it("never repeats the model's claim: the refused Flow and each unchanged resend are said in Core's words", async () => {
    const claim = "Resubmitting the corrected Flow: the repeat now sits on the read step with repeat while: next.";
    const observed = observeAutomationStudioEvidenceLoop(loopInput([submit("submit-1", "Submitting the Flow that reads every page."), submit("submit-2", claim), submit("submit-3", claim), { kind: "complete", result: {} }], [refusedSubmission]));
    await inScope(async () => {
      const first = await observed.decide(request(1));
      await observed.executeTool({ callId: "submit-1", toolId: "core.submit_candidate", value: (first as { input: JsonObject }).input });
      await observed.decide(request(2));
      await observed.decide(request(3, [repeatCheck(2)]));
      await observed.decide(request(4, [repeatCheck(3)]));
    });
    const said = thoughts();
    expect(said.map(([, text]) => text)).toEqual([
      "The AI model sent a version of the Flow's steps, but it was refused, so it is not what the Flow does.",
      "This is the same Flow it had already sent, unchanged, so it was not checked again.",
      "This is the same Flow it had already sent, unchanged, so it was not checked again."
    ]);
    expect(JSON.stringify(seen)).not.toContain("Resubmitting the corrected Flow");
    // Each resend's card says a Flow was sent again unchanged, never that a step was "already tried exactly this way".
    const cards = seen.filter((event) => event.detail?.kind !== "thought" && event.detail?.status === "failed" && event.detail.text?.includes("repeat_refused"));
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.label).toMatch(/^Not done: .* — the same Flow was sent again unchanged, so it was not checked again$/u);
      expect(card.detail?.text).toMatch(/ · Declined: the same Flow was sent again unchanged, so it was not checked again$/u);
      expect(card.label).not.toContain("already tried");
    }
    // The thought comes before its card, as a decision's heading does.
    const order = seen.filter((event) => event.detail?.status !== "started").map((event) => event.detail?.kind === "thought" ? "thought" : "card");
    expect(order.slice(-4)).toEqual(["thought", "card", "thought", "card"]);
  });

  it("says an accepted Flow as the model said it", async () => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput([submit("submit-1", "Submitting the Flow that reads every page.")], [ran({ ok: true, status: "draft", revision: 2, digest: "a".repeat(64) })]));
    await inScope(async () => {
      const first = await observed.decide(request(1));
      await observed.executeTool({ callId: "submit-1", toolId: "core.submit_candidate", value: (first as { input: JsonObject }).input });
    });
    expect(thoughts().map(([, text]) => text)).toEqual(["Submitting the Flow that reads every page."]);
  });
});

describe("a test whose result contradicts the model (lane D)", () => {
  const test = (reason: string) => automationStudioActivityDecisionReason.attach({ kind: "tool_call", callId: "test-1", toolId: "core.test_candidate", input: { revision: 2, digest: "a".repeat(64) } }, reason);
  const run = async (result: unknown) => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput([test("Testing, which now confirms only requests with 5+ mutual friends.")], [result]));
    await inScope(async () => {
      const decided = await observed.decide(request(1));
      await observed.executeTool({ callId: "test-1", toolId: "core.test_candidate", value: (decided as { input: JsonObject }).input });
    });
  };

  it("is not shown as fact when the test did not pass", async () => {
    await run(ran({ ok: false, verdict: "no", feedback: { steps: [] } }));
    expect(thoughts().map(([, text]) => text)).toEqual(["The AI model expected this version to do what was asked, but the test showed it doesn't yet."]);
    expect(JSON.stringify(seen)).not.toContain("5+ mutual friends");
  });

  it("is said as the model said it when the test passed", async () => {
    await run(ran({ ok: true, verdict: "yes", revision: 2, digest: "b".repeat(64), trialRunId: "run.trial-1", feedback: { steps: [] } }));
    expect(thoughts().map(([, text]) => text)).toEqual(["Testing, which now confirms only requests with 5+ mutual friends."]);
  });
});

describe("any other call", () => {
  const press = (callId: string) => automationStudioActivityDecisionReason.attach({ kind: "tool_call", callId, toolId: "core.run_node", input: { node: "web.output.dom-click", parameters: { element: { accessibleName: "Next" } } } }, "Pressing Next for the next page.");

  it("is said at once the first time, and when made again is said only once it runs", async () => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput([press("c1"), press("c2")], [ran({ ok: true }), ran({ ok: true })]));
    await inScope(async () => {
      await observed.decide(request(1));
      expect(thoughts()).toHaveLength(1);
      await observed.executeTool({ callId: "c1", toolId: "core.run_node", value: {} });
      await observed.decide(request(2));
      // The same call again: held until Core answers it.
      expect(thoughts()).toHaveLength(1);
      await observed.executeTool({ callId: "c2", toolId: "core.run_node", value: {} });
    });
    expect(thoughts().map(([, text]) => text)).toEqual(["Pressing Next for the next page.", "Pressing Next for the next page."]);
  });

  it("is said as not done again when Core refused it as a repeat", async () => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput([press("c1"), press("c2"), { kind: "complete", result: {} }], [ran({ ok: true })]));
    await inScope(async () => {
      await observed.decide(request(1));
      await observed.executeTool({ callId: "c1", toolId: "core.run_node", value: {} });
      await observed.decide(request(2));
      await observed.decide(request(3, [repeatCheck(2)]));
    });
    expect(thoughts().map(([, text]) => text)).toEqual(["Pressing Next for the next page.", "This is exactly the step it had already tried, so it was not done again."]);
  });
});
