import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { personFacingTextFaults } from "../../../../../../ui/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../../llm/index.ts";
import { automationStudioActivityDecisionReason } from "../../decision-reason.ts";
import { automationStudioActivityHub } from "../../default-hub.ts";
import { automationStudioActivityFoldedReason } from "../../folded-reason.ts";
import { observeAutomationStudioEvidenceLoop } from "../../observer.ts";
import { runWithAutomationStudioActivity } from "../../scope.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const request = { iteration: 1, tools: [], evidence: [], decisionSchema: {}, canComplete: true };
const submit = { kind: "tool_call", callId: "s1", toolId: "core.submit_subflow", input: { steps: [] } };
const tested = { ok: true, verdict: "yes", fromStep: undefined, feedback: { steps: [{ step: 1, status: "succeeded" }, { step: 2, status: "succeeded" }] } };
const answer = (evidence: Record<string, unknown>) => ({ kind: "llm_evidence_tool_execution", evidence, effectApplied: false });

const observe = (result: unknown, decision: unknown = automationStudioActivityDecisionReason.attach({ ...submit }, "Saving the part so it can be tried.")) =>
  observeAutomationStudioEvidenceLoop({
    tools: [],
    decide: (async () => decision) as AutomationStudioLlmEvidenceLoopInput["decide"],
    executeTool: (async () => result) as AutomationStudioLlmEvidenceLoopInput["executeTool"]
  });
const drive = async (observed: AutomationStudioLlmEvidenceLoopInput) => {
  await runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, async () => {
    const decision = await observed.decide(request) as { callId: string; toolId: string; input: never };
    await observed.executeTool({ callId: decision.callId, toolId: decision.toolId, value: decision.input });
  });
};
/** What a person reads of each non-started row, in order: its title and text. */
const rows = () => seen.filter((event) => event.detail?.status !== "started").map((event) => `${event.detail?.kind} | ${event.detail?.title} | ${event.detail?.status} | ${event.label} | ${event.detail?.text ?? ""}`);

describe("a test the submission carried", () => {
  it("is its own row after the submit's, with Core's line", async () => {
    await drive(observe(answer({ ok: true, revision: 2, digest: "a".repeat(64), tested, testedWith: { revision: 2, digest: "a".repeat(64) } })));
    const said = rows();
    const line = "Core tested the saved version from its start because the submission asked for it.";
    const at = said.findIndex((row) => row.endsWith(line));
    expect(at).toBeGreaterThan(0);
    expect(said.filter((row) => row.includes("Saving the part so it can be tried."))).toHaveLength(1);
    expect(said.findIndex((row) => row.includes("Saving the part so it can be tried."))).toBeLessThan(at);
    const cards = seen.filter((event) => event.detail?.ref === "core.test_subflow");
    expect(cards.map((event) => event.detail?.status)).toEqual(["started", "succeeded"]);
    expect(cards[1]?.detail?.text).toContain("Said: the test passed and the Flow did what you asked");
    expect(seen.filter((event) => event.detail?.ref === "core.submit_subflow").map((event) => event.detail?.status)).toEqual(["started", "succeeded"]);
    for (const row of said) for (const part of row.split(" | ").slice(1)) expect(personFacingTextFaults(part)).toEqual([]);
  });

  it("says a run from a step in its own words, and a failed test as failed", async () => {
    await drive(observe(answer({ ok: true, tested: { ok: true, verdict: "no", fromStep: 2, feedback: { steps: [] } }, testedWith: { revision: 2, digest: "a".repeat(64), from: "s2" } })));
    expect(rows().some((row) => row.endsWith("Core ran the saved version from the named step because the submission asked for it."))).toBe(true);
    expect(seen.filter((event) => event.detail?.ref === "core.test_subflow").map((event) => event.detail?.status)).toEqual(["started", "failed"]);
  });

  it("leaves a submit without a test as it was", async () => {
    await drive(observe(answer({ ok: true, revision: 2, digest: "a".repeat(64) })));
    expect(seen.some((event) => event.detail?.ref === "core.test_subflow")).toBe(false);
    expect(rows().filter((row) => row.startsWith("thought"))).toHaveLength(1);
  });
});

describe("a Core-made complete decision", () => {
  it("shows its line, then the completion check's note", async () => {
    const line = automationStudioActivityFoldedReason({ did: "Finished the part", because: "the saved version passed its test" });
    const decision = automationStudioActivityDecisionReason.core({ kind: "complete", result: { subflowKey: "k", revision: 2, digest: "a".repeat(64) } }, line);
    const observed = {
      ...observe({}, decision),
      checkCompletion: async () => ({ ok: true })
    } as AutomationStudioLlmEvidenceLoopInput;
    const wrapped = observeAutomationStudioEvidenceLoop({ ...observed, decide: (async () => decision) as AutomationStudioLlmEvidenceLoopInput["decide"] });
    await runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, async () => {
      await wrapped.decide(request);
      await wrapped.checkCompletion!({}, { steps: [] });
    });
    const said = rows();
    expect(said[0]).toContain("Core finished the part because the saved version passed its test.");
    expect(said.some((row) => row.startsWith("note | Completion check"))).toBe(true);
  });
});
