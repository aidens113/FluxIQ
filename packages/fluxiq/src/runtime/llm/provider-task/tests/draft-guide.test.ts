// The draft's guidance on the wire: once in the head, its words unchanged, and the
// entry keeping every step and whatever is said only sometimes (`../draft-guide.ts`).
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioFlowDraftEntry, type AutomationStudioFlowDraftStep } from "../../../flow-authoring/draft/index.ts";
import { decisionRequest } from "../../anthropic/tests/fixtures.ts";
import type { AutomationStudioLlmTaskRequest } from "../../harness/index.ts";
import { automationStudioLlmLiftDraftGuide } from "../draft-guide.ts";
import { automationStudioLlmTaskMessages } from "../request-messages.ts";

type Value = { steps: unknown[]; instruction?: string };
const step = (position: number, extra: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep => ({ position, iteration: position, callId: `call.${position}`, actionId: "press", input: { target: `t${position}` }, effect: "mutate", effectApplied: true, disposition: "kept", ...extra } as AutomationStudioFlowDraftStep);
const draft = (steps: AutomationStudioFlowDraftStep[], authored = true) => automationStudioFlowDraftEntry({ steps, authored })!;
type Entries = NonNullable<AutomationStudioLlmTaskRequest["context"]["evidenceLoop"]>["evidence"];
const request = (entries: Entries) => {
  const task = decisionRequest();
  task.context.evidenceLoop!.evidence = entries;
  return task;
};
const payload = (entries: Entries) => JSON.parse(automationStudioLlmTaskMessages(request(entries))[1]!.content) as { context: { evidenceLoop: { flowDraftGuide?: string; evidence: Array<{ toolId: string; value: Value }> } } };

describe("the draft's guidance", () => {
  it("is in front of the window in the same words, and the entry still lists every step", () => {
    const entry = draft([step(1), step(2)]);
    const said = (entry.value as Value).instruction!;
    const { flowDraftGuide, evidence } = payload([entry]).context.evidenceLoop;
    expect(flowDraftGuide).toContain(said);
    expect(flowDraftGuide).toContain("core.flow_draft");
    const shown = evidence.find((each) => each.toolId === "core.flow_draft")!.value;
    expect(shown.steps).toEqual((entry.value as Value).steps);
    expect(shown).not.toHaveProperty("instruction");
  });

  it("leaves the head the same as the draft grows, so nothing behind it is sent again", () => {
    const head = (entries: Entries) => {
      const text = automationStudioLlmTaskMessages(request(entries))[1]!.content;
      return text.slice(0, text.indexOf('"evidence":['));
    };
    expect(head([draft([step(1), step(2), step(3)])])).toBe(head([draft([step(1)])]));
    expect(head([draft([step(1)], false)])).toContain("The Flow you are building");
  });

  it("keeps on the entry what is said only sometimes, and all of it is still sent", () => {
    const entry = draft([step(1), step(2)]);
    const whole = (entry.value as Value).instruction!;
    const withMore = { ...entry, value: { ...(entry.value as JsonObject), instruction: `${whole} Something said only sometimes.` } };
    const { flowDraftGuide, evidence } = payload([withMore]).context.evidenceLoop;
    expect(flowDraftGuide).toContain(whole);
    expect(evidence[0]!.value.instruction).toBe("Something said only sometimes.");
  });

  it("leaves anything else as it was: another tool's instruction, or no draft at all", () => {
    const other = [{ callId: "call.1", toolId: "core.run_node", value: { instruction: "Not the draft's." } }];
    expect(automationStudioLlmLiftDraftGuide(other)).toEqual({ evidence: other });
    const strange = [{ callId: "core.flow_draft", toolId: "core.flow_draft", value: { instruction: "Words Core does not know." } }];
    expect(automationStudioLlmLiftDraftGuide(strange)).toEqual({ evidence: strange });
  });

});
