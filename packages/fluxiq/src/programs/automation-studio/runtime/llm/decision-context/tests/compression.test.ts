import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { automationStudioLlmDecisionContextHistoryValue } from "../compression.ts";
import {
  automationStudioLlmDecisionContextEntry,
  type AutomationStudioLlmDecisionContextDecision,
  type AutomationStudioLlmDecisionContextRecord
} from "../index.ts";
import { answered, bytes, call, recorded, refusedCompletion } from "./history-fixtures.ts";

const FEEDBACK = {
  code: "flow_bootstrap.completion_refused",
  refusal: "flow_bootstrap.instructed_act_missing",
  missingActs: [{ id: "pick-store", reason: "not_in_draft" }, { id: "set-quantity", reason: "not_in_draft" }]
};

const refusedAmendment = (step: number): AutomationStudioLlmDecisionContextDecision => ({
  kind: "amendment", signature: `amend-${step}`, applied: 0, refusals: [{ step, reason: "no_such_step", repeated: false }], withdrewChanged: []
});

function mixedRecords(): readonly AutomationStudioLlmDecisionContextRecord[] {
  return recorded([
    [0, { kind: "look", callId: "look-0", toolId: "core.observe", resultCode: "web.observe.succeeded" }],
    [1, call("c1", "open-store-picker")],
    [2, call("c2", "search-products")],
    [3, refusedCompletion({ script: "a" }, ["flow_bootstrap.missing_act"], 1, FEEDBACK)],
    [4, call("c4", "type-query")],
    [5, refusedAmendment(9)],
    [6, call("c6", "press-search")],
    [7, refusedCompletion({ script: "a" }, ["flow_bootstrap.missing_act"], 1, FEEDBACK)],
    [8, answered("press-search", "c6")],
    [9, refusedAmendment(9)],
    [10, { kind: "call_failed", signature: "failed-10", callId: "c10", toolId: "core.run_node", actionId: "open-cart", code: "web.action.timed_out" }],
    [11, { kind: "unusable", signature: "unusable-11", issueCodes: ["llm_evidence_loop.decision_invalid"] }]
  ]).records();
}

/** Every iteration a row is shown for. */
function iterationsShown(value: JsonValue): number[] {
  return ((value as JsonObject).rows as JsonValue[][]).flatMap((row) => {
    const at = row[0]!;
    return Array.isArray(at) ? at as number[] : [at as number];
  });
}

describe("decision history, always told in full", () => {
  it("shows every decision as its own row with its full closed detail, and nothing folded or omitted", () => {
    const records = mixedRecords();
    const value = automationStudioLlmDecisionContextHistoryValue(records);
    expect(value.format).toBe("decision_rows_v1");
    expect(value).not.toHaveProperty("omitted");
    expect(value).not.toHaveProperty("folded");
    expect(value).not.toHaveProperty("unlisted");
    expect(iterationsShown(value)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const completion = (value.rows as JsonValue[][]).find((row) => row[1] === "completion")!;
    expect(completion[7]).toEqual({ feedback: { code: "flow_bootstrap.completion_refused", refusal: "flow_bootstrap.instructed_act_missing", missingActs: [{ id: "pick-store", reason: "not_in_draft" }, { id: "set-quantity", reason: "not_in_draft" }] } });
    expect(automationStudioLlmDecisionContextEntry({ records })!.value).toEqual(value);
  });

  it("never tells the model that anything was folded, joined or left out", () => {
    const value = automationStudioLlmDecisionContextHistoryValue(mixedRecords());
    expect(String(value.instruction)).not.toMatch(/fold|omit|calls row|least/iu);
  });

  it("shows a 64-decision build whole, whatever it costs", () => {
    const decisions: Array<[number, AutomationStudioLlmDecisionContextDecision]> = [[0, { kind: "look", callId: "look-0", toolId: "core.observe", resultCode: "web.observe.succeeded" }]];
    for (let iteration = 1; iteration <= 64; iteration += 1) {
      const slot = iteration % 8;
      if (slot === 0) decisions.push([iteration, refusedCompletion({ script: `v${Math.floor(iteration / 16)}` }, ["flow_bootstrap.missing_act", "flow_bootstrap.unbound_parameter"], Math.floor(iteration / 16), FEEDBACK)]);
      else if (slot === 3) decisions.push([iteration, answered(`node-${iteration - 1}`, `call-${iteration - 1}`)]);
      else if (slot === 5) decisions.push([iteration, refusedAmendment(iteration % 3)]);
      else if (slot === 6) decisions.push([iteration, call(`call-${iteration}`, `press-control-number-${iteration}`, { refused: true })]);
      else decisions.push([iteration, call(`call-${iteration}`, `node-${iteration}`, { changed: slot % 2 ? "yes" : "no" })]);
    }
    const value = automationStudioLlmDecisionContextEntry({ records: recorded(decisions).records() })!.value as JsonObject;
    expect(value.format).toBe("decision_rows_v1");
    expect(iterationsShown(value)).toEqual(Array.from({ length: 65 }, (_, index) => index));
    // Well past the 4,000 bytes the history used to be held to.
    expect(bytes(value)).toBeGreaterThan(4_000);
  });

  it("lists 64 distinct refusals each in its own row", () => {
    const long = (label: string, iteration: number) => `${label}.${"x".repeat(80)}.${iteration}`;
    const decisions: Array<[number, AutomationStudioLlmDecisionContextDecision]> = [];
    for (let iteration = 1; iteration <= 64; iteration += 1) {
      decisions.push([iteration, { kind: "unusable", signature: `u${iteration}`, issueCodes: [long("issue", iteration)] }]);
    }
    const value = automationStudioLlmDecisionContextEntry({ records: recorded(decisions).records() })!.value as JsonObject;
    expect(value.format).toBe("decision_rows_v1");
    expect((value.rows as JsonValue[]).length).toBe(64);
  });
});
