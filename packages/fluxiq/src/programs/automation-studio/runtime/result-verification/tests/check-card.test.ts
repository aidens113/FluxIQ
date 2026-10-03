// The result check as the chat shows it, and the reason two agreeing noes
// settle on (t193 1002-M, live run `run-murzln6g-11debe1d`).
//
// C11: the check's start row was titled "Result check started" and its end
// "Result check", and a card is keyed by its title, so an empty "Check result"
// card stood above the real one. C6: two noes settled on "... although every
// step of the run succeeded", a fixed clause, while the same card went on to
// say "Step 15 (×) failed". No model is called: the provider is scripted.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { activityActionKey } from "../../../../../ui/index.ts";
import type { AutomationStudioFlowInstruction } from "../../../model/index.ts";
import { automationStudioActivityHub, runWithAutomationStudioActivity } from "../../activity/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmProvider } from "../../llm/index.ts";
import { automationStudioBuildTestResultSummary } from "../build-test/index.ts";
import { verifyAutomationStudioRunResult } from "../verify.ts";

const SITE = "http://127.0.0.1:61777/scenarios/bigbox-retail/";
const DENIED = ["html", "cookies", "headers", "selector"];

const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };

const instruction: AutomationStudioFlowInstruction = {
  schemaVersion: "0.1", instructionId: "instruction.flow.goal", title: "Goal", body: "Add two packs of the paper towels to my cart.",
  scope: { kind: "flow", projectId: "project-1", flowId: "flow-1" }, priority: 1, status: "active", requirement: "required", createdAt: 1, updatedAt: 1
};

function scripted(answers: readonly string[]): AutomationStudioLlmProvider {
  let asked = 0;
  return {
    metadata: { provider: "mock", model: "debug-model" },
    runTask: async () => {
      const answer = answers[asked];
      asked += 1;
      return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: { answersRequest: answer, observed: "One pack is added.", changed: "Set the quantity before the add." } }, usage: USAGE };
    }
  };
}

function summary() {
  const step = (position: number, node: string, parameters: Record<string, string>): AutomationStudioFlowDraftStep => ({
    position, id: `d${position}`, iteration: position, actionId: node, input: { node, parameters }, ranWith: { node, parameters },
    effect: "mutate", effectApplied: true, disposition: "kept", replay: { from: { location: SITE } }
  });
  const steps = [step(1, "web.output.browser-navigate", { url: SITE }), step(2, "web.output.dom-click", { name: "Add to cart" })];
  const outcomes = steps.map((each) => ({ step: each.position, stepId: each.id!, actionId: each.actionId, status: "replayed" as const }));
  return automationStudioBuildTestResultSummary({
    steps, report: { verdict: { outcomes }, observations: [], reused: false }, nodes: [], instructionText: instruction.body, startLocation: SITE, deniedEvidenceKeys: DENIED
  });
}

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

async function check(answers: readonly string[]) {
  return await runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "project-1" }, () => verifyAutomationStudioRunResult({
    projectId: "project-1", flowId: "flow-1", runId: "build-test.1", summary: summary(), instructions: [instruction], deniedEvidenceKeys: DENIED, provider: scripted(answers)
  }));
}

describe("the result check in the chat (C11)", () => {
  it("is one card: its start and its end carry the same key", async () => {
    await check(["yes"]);
    const rows = seen.filter((event) => event.detail?.kind === "check");
    expect(rows.map((event) => event.detail?.status)).toEqual(["started", "succeeded"]);
    const keys = rows.map((event) => activityActionKey(event));
    expect(keys[0]).not.toBeNull();
    expect(new Set(keys).size).toBe(1);
  });
});

describe("the reason two agreeing noes settle on (C6)", () => {
  it("says only what is true: judged twice with the same evidence, and nothing about every step succeeding", async () => {
    const report = await check(["no", "no"]);
    expect(report.outcome).toMatchObject({ performed: true, verdict: "does_not_answer", calls: 2 });
    const reason = report.outcome.performed ? report.outcome.reason : "";
    expect(reason).toContain("twice and with the same evidence");
    expect(reason).not.toMatch(/every step/u);
    // What the card shows is that reason.
    expect(seen.at(-1)?.detail?.text).not.toMatch(/every step/u);
  });
});
