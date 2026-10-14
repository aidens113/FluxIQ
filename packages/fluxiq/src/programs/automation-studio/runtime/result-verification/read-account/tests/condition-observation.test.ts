import { expect, it } from "vitest";
import type { AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../../model/index.ts";
import { automationStudioResultReadAccounts } from "../accounts.ts";
import type { JsonObject } from "../../../../../../core/index.ts";

it("carries passive observed text and distinct absent/empty states beside saved-result rejection labels", () => {
  const observations = [
    { conditionIndex: 0, state: "present", value: "14 plus 2", source: "read", readKind: "attribute", page: 1, item: 1 },
    { conditionIndex: 0, state: "absent", source: "read", readKind: "attribute", page: 1, item: 2 },
    { conditionIndex: 0, state: "present", value: "", source: "read", readKind: "attribute", page: 1, item: 3 }
  ];
  const attempt: AutomationStudioFlowRunActionAttemptRecord = {
    attemptId: "attempt.unit", nodeId: "node.unit", definitionId: "unit.list", order: 0, status: "succeeded", startedAt: 1,
    metadata: { extraction: { recordCount: 0, pagesRead: 1, truncated: false, fieldNames: ["label"], missingFields: [], conditions: {
      applied: 3, kept: 0, rejected: [3], alone: [3], unfiltered: false,
      aloneRows: [[{ label: "Unit alpha" }, { label: "Unit beta" }, { label: "Unit gamma" }]], aloneObservations: [observations]
    } } }
  };
  const node: AutomationStudioFlowNode = { id: "node.unit", definitionId: "unit.list", parameterValues: {
    fields: { label: { kind: "text" } }, where: [{ read: { kind: "attribute", attribute: "unit_flag" }, is: "present" }]
  } };
  const condition = automationStudioResultReadAccounts({ actionAttempts: [attempt], flowNodes: [node], deniedEvidenceKeys: [] }).reads[0]?.conditions?.[0];
  expect(condition?.leftOutOnlyByThis).toEqual(["Unit alpha", "Unit beta", "Unit gamma"]);
  // Placed under its condition, a witness drops its own 0-based index: the condition's number is the one index (t574).
  expect(condition).toMatchObject({ number: 1, leftOutObservations: observations.map(underItsCondition) });
  expect(JSON.stringify(condition)).not.toContain("conditionIndex");
});

/** A witness as the account carries it under its condition (t574). */
function underItsCondition({ conditionIndex: _index, ...witness }: JsonObject): JsonObject {
  return witness;
}

function recorded(observations?: JsonObject[], route = "success"): AutomationStudioFlowRunActionAttemptRecord {
  return { attemptId: "unit.read", nodeId: "unit.read", definitionId: "unit.list", order: 1, status: "succeeded", route, startedAt: 1,
    metadata: { extraction: { recordCount: 0, pagesRead: 1, truncated: false, conditions: {
      rejected: [2], alone: [2], aloneRows: [[{ label: "Unit alpha" }, { label: "Unit beta" }]],
      ...(observations ? { aloneObservations: [observations] } : {})
    } } } };
}
const authored: AutomationStudioFlowNode = { id: "unit.read", definitionId: "unit.list", parameterValues: {
  fields: { label: { kind: "text" } }, where: [{ read: { kind: "attribute", attribute: "unit_flag" }, is: "present" }]
} };
const witness = (value: string, page = 1): JsonObject => ({ conditionIndex: 0, state: "present", value, source: "read", readKind: "attribute", page, item: 1 });

it("screens denied authored helper keys and locator text before model-facing observation publication", () => {
  const read = recorded([witness("short private value"), witness("#unit-card > input.value")]);
  const denied = automationStudioResultReadAccounts({ actionAttempts: [read], flowNodes: [authored], deniedEvidenceKeys: ["unit_flag"] }).reads[0]?.conditions?.[0];
  expect(denied?.leftOutOnlyByThis).toEqual(["Unit alpha", "Unit beta"]);
  expect(denied?.leftOutObservations?.map(entry => entry?.state)).toEqual(["withheld", "withheld"]);
  expect(JSON.stringify(denied)).not.toContain("short private value");
  const allowed = automationStudioResultReadAccounts({ actionAttempts: [read], flowNodes: [authored], deniedEvidenceKeys: [] }).reads[0]?.conditions?.[0];
  expect(allowed?.leftOutObservations?.map(entry => entry?.state)).toEqual(["present", "withheld"]);
  expect(JSON.stringify(allowed)).not.toContain("#unit-card");
  const counts = automationStudioResultReadAccounts({ actionAttempts: [read], flowNodes: [authored] }).reads[0]?.conditions?.[0];
  expect(counts).toEqual({ number: 1, rejected: 2, alone: 2 });
});

it("aggregates actual repeated read passes without deduplicating labels or inventing legacy observations", () => {
  const repeat = (order: number): AutomationStudioFlowRunActionAttemptRecord => ({ attemptId: `repeat.${order}`, nodeId: "repeat", definitionId: "builtin.control.repeat", order, status: "succeeded", startedAt: order, route: "body" });
  const first = recorded([witness("first pass"), witness("(withheld)")]);
  const second = recorded();
  // Each pass is its own node run and numbers its one page 1; the account says the page of the whole read.
  const third = recorded([witness("last pass"), witness("new reading")]);
  const result = automationStudioResultReadAccounts({ actionAttempts: [repeat(0), first, repeat(2), second, repeat(4), third], flowNodes: [authored], deniedEvidenceKeys: [] }).reads[0];
  expect(result?.pagesRead).toBe(3);
  // The pass whose read sent no witness says its presence test's rows as found empty (t574); the others' witnesses say they found a value.
  expect(result?.conditions?.[0]?.leftOutOnlyByThis).toEqual(["Unit alpha", "Unit beta", "Unit alpha — unit_flag: (no value)", "Unit beta — unit_flag: (no value)", "Unit alpha", "Unit beta"]);
  expect(result?.conditions?.[0]?.leftOutObservations).toEqual([
    underItsCondition(witness("first pass")), { state: "withheld", source: "read", readKind: "attribute", page: 1, item: 1 },
    null, null, underItsCondition(witness("last pass", 3)), underItsCondition(witness("new reading", 3))
  ]);
  // Not every pass said its rows empty, so no presence sentence is said for the whole read.
  expect(result?.conditions?.[0]).not.toHaveProperty("presence");
});
