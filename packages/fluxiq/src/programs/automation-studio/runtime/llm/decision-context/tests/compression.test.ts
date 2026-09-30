import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { automationStudioLlmDecisionContextTellings } from "../compression.ts";
import {
  automationStudioLlmDecisionContextEntry,
  type AutomationStudioLlmDecisionContextDecision,
  type AutomationStudioLlmDecisionContextRecord
} from "../index.ts";
import { answered, bytes, call, recorded, refusedCompletion } from "./history-fixtures.ts";

/** The production cap: min(4000, floor(24000 / 6)). */
const CAP = Math.min(4000, Math.floor(24_000 / 6));

const FEEDBACK = {
  code: "flow_bootstrap.completion_refused",
  refusal: "flow_bootstrap.instructed_act_missing",
  missingActs: [{ id: "pick-store", reason: "not_in_draft" }, { id: "set-quantity", reason: "not_in_draft" }]
};

const refusedAmendment = (step: number): AutomationStudioLlmDecisionContextDecision => ({
  kind: "amendment", signature: `amend-${step}`, applied: 0, refusals: [{ step, reason: "no_such_step", repeated: false }], withdrewChanged: []
});

/** A build where every rung of the ladder is smaller than the one before it. */
function ladderRecords(): readonly AutomationStudioLlmDecisionContextRecord[] {
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

/** Every `kind@iteration` a telling shows a row for; folded ranges are not rows of a decision. */
function refusalsShown(value: JsonValue): Set<string> {
  const shown = new Set<string>();
  for (const row of (value as JsonObject).rows as JsonValue[][]) {
    const [at, kind] = row as [JsonValue, string];
    if (typeof at === "string") continue;
    for (const iteration of Array.isArray(at) ? at : [at]) shown.add(`${kind}@${iteration}`);
  }
  return shown;
}

const REFUSAL_KINDS = new Set(["call_refused", "call_failed", "answered", "unusable"]);

function refusalsRecorded(records: readonly AutomationStudioLlmDecisionContextRecord[]): Set<string> {
  const kept = new Set<string>();
  for (const record of records) {
    const decision = record.decision;
    const kind = decision.kind === "call" && decision.refused ? "call_refused" : decision.kind;
    const refused = REFUSAL_KINDS.has(kind)
      || (decision.kind === "amendment" && decision.refusals.length > 0)
      || (decision.kind === "completion" && (!decision.accepted || Array.isArray(decision.dryRun)));
    if (refused) kept.add(`${kind}@${record.iteration}`);
  }
  return kept;
}

describe("decision history compression", () => {
  const records = ladderRecords();
  const tellings = [...automationStudioLlmDecisionContextTellings(records)];
  const values = tellings.map((telling) => telling.value);

  it("offers every rung in order, each smaller than the one before", () => {
    // Full, codes, one fold per plain call (the look and four calls), joined, least.
    expect(values[0]!.omitted).toBeUndefined();
    expect(values[1]!.omitted).toEqual(["detail beyond codes"]);
    const folds = values.filter((value) => (value.omitted as string[] | undefined)?.length === 2);
    expect(folds.map((value) => value.folded)).toEqual([1, 2, 3, 4, 5]);
    expect(values.at(-2)!.omitted).toEqual(["detail beyond codes", "plain calls folded", "identical refusals joined"]);
    expect(tellings.at(-1)!.least).toBe(true);
    expect(values.at(-1)!.format).toBe("decision_rows_least_v1");
    const sizes = values.map(bytes);
    for (let index = 1; index < sizes.length; index += 1) expect(sizes[index]!).toBeLessThan(sizes[index - 1]!);
  });

  it("chooses, for each rung's own size, that rung", () => {
    for (const value of values) {
      expect(automationStudioLlmDecisionContextEntry({ records, maxBytes: bytes(value) })!.value).toEqual(value);
    }
  });

  it("trims detail to codes and positions on the second rung", () => {
    const completion = (values[1]!.rows as JsonValue[][]).find((row) => row[1] === "completion")!;
    expect(completion[7]).toEqual({ refusal: ["flow_bootstrap.completion_refused", "flow_bootstrap.instructed_act_missing"] });
    const amendment = (values[1]!.rows as JsonValue[][]).find((row) => row[1] === "amendment")!;
    expect(amendment[7]).toEqual({ applied: 0, refused: [9] });
  });

  it("folds plain calls oldest first into counted ranges, and never a refused, answered or repeated one", () => {
    const firstFold = values[2]!.rows as JsonValue[][];
    expect(firstFold[0]).toEqual(["0", "calls", 1, 0]);
    expect(firstFold[1]).toEqual([1, "call", "core.run_node", "open-store-picker", "c1", "web.action.succeeded", "yes"]);
    const allFolded = values[6]!.rows as JsonValue[][];
    expect(allFolded[0]).toEqual(["0-2", "calls", 3, 2]);
    expect(allFolded.filter((row) => row[1] === "calls").map((row) => row[0])).toEqual(["0-2", "4", "6"]);
    expect(allFolded.some((row) => row[1] === "answered")).toBe(true);
  });

  it("joins identical refusals that were not consecutive into one row with every iteration", () => {
    const rows = values.at(-2)!.rows as JsonValue[][];
    expect(rows.filter((row) => row[1] === "completion").map((row) => row[0])).toEqual([[3, 7]]);
    expect(rows.filter((row) => row[1] === "amendment").map((row) => row[0])).toEqual([[5, 9]]);
    // A joined row sits where the decision was last made, so the plain calls
    // it stood between become one range.
    expect(rows.map((row) => row[1])).toEqual(["calls", "completion", "answered", "amendment", "call_failed", "unusable"]);
    expect(rows[0]).toEqual(["0-6", "calls", 5, 4]);
  });

  it("tells the least form as iterations, kind and code, and counts the rest", () => {
    const least = values.at(-1)!;
    expect(least.fields).toEqual(["at", "kind", "code"]);
    expect(least.rows).toEqual([
      [[3, 7], "completion", "flow_bootstrap.missing_act"],
      [8, "answered", "llm_evidence_loop.already_answered"],
      [[5, 9], "amendment", "no_such_step"],
      [10, "call_failed", "web.action.timed_out"],
      [11, "unusable", "llm_evidence_loop.decision_invalid"]
    ]);
    expect(least.unlisted).toBe(5);
    expect(automationStudioLlmDecisionContextEntry({ records, maxBytes: 10 })!.value).toEqual(least);
  });

  it("never loses a distinct refusal on any rung", () => {
    const expected = refusalsRecorded(records);
    expect([...expected].sort()).toEqual(["amendment@5", "amendment@9", "answered@8", "call_failed@10", "completion@3", "completion@7", "unusable@11"]);
    for (const value of values) expect([...expected].filter((item) => !refusalsShown(value).has(item))).toEqual([]);
  });

  it("holds a 64-decision build of mixed decisions within the production cap", () => {
    const decisions: Array<[number, AutomationStudioLlmDecisionContextDecision]> = [[0, { kind: "look", callId: "look-0", toolId: "core.observe", resultCode: "web.observe.succeeded" }]];
    for (let iteration = 1; iteration <= 64; iteration += 1) {
      const slot = iteration % 8;
      if (slot === 0) decisions.push([iteration, refusedCompletion({ script: `v${Math.floor(iteration / 16)}` }, ["flow_bootstrap.missing_act", "flow_bootstrap.unbound_parameter"], Math.floor(iteration / 16), FEEDBACK)]);
      else if (slot === 3) decisions.push([iteration, answered(`node-${iteration - 1}`, `call-${iteration - 1}`)]);
      else if (slot === 5) decisions.push([iteration, refusedAmendment(iteration % 3)]);
      else if (slot === 6) decisions.push([iteration, call(`call-${iteration}`, `press-control-number-${iteration}`, { refused: true })]);
      else decisions.push([iteration, call(`call-${iteration}`, `node-${iteration}`, { changed: slot % 2 ? "yes" : "no" })]);
    }
    const all = recorded(decisions).records();
    const entry = automationStudioLlmDecisionContextEntry({ records: all, maxBytes: CAP })!;
    expect(bytes(entry.value)).toBeLessThanOrEqual(CAP);
    expect((entry.value as JsonObject).format).toBe("decision_rows_v1");
    expect([...refusalsRecorded(all)].filter((item) => !refusalsShown(entry.value).has(item))).toEqual([]);
  });

  it("gives the least form for 64 distinct refusals too large for the cap, with every refusal in it", () => {
    const long = (label: string, iteration: number) => `${label}.${"x".repeat(80)}.${iteration}`;
    const decisions: Array<[number, AutomationStudioLlmDecisionContextDecision]> = [];
    for (let iteration = 1; iteration <= 64; iteration += 1) {
      decisions.push([iteration, { kind: "unusable", signature: `u${iteration}`, issueCodes: [long("issue", iteration)] }]);
    }
    const all = recorded(decisions).records();
    const entry = automationStudioLlmDecisionContextEntry({ records: all, maxBytes: CAP })!;
    const value = entry.value as JsonObject;
    expect(bytes(value) <= CAP || value.format === "decision_rows_least_v1").toBe(true);
    expect(value.format).toBe("decision_rows_least_v1");
    expect(bytes(value)).toBeGreaterThan(CAP);
    expect((value.rows as JsonValue[]).length).toBe(64);
    expect([...refusalsRecorded(all)].filter((item) => !refusalsShown(value).has(item))).toEqual([]);
  });
});
