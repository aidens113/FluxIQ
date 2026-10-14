// A presence test shows the judge both sides of itself (t574): what its read
// found on the rows it kept, and that it found nothing on each row it alone
// left out. Live run `run-mv7vor5f-ea4d08b4`'s judges refuted an exact answer
// twice as "a broken read" of a marker the condition tested correctly. A
// generic catalogue of another kind of site.
import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowNode, AutomationStudioFlowRunActionAttemptRecord } from "../../../../model/index.ts";
import { automationStudioResultReadAccounts } from "../accounts.ts";
import { automationStudioResultReadPresence } from "../presence.ts";

const node = (condition: JsonObject): AutomationStudioFlowNode => ({
  id: "node.read", definitionId: "unit.list",
  parameterValues: { fields: { name: { kind: "text" }, price: { kind: "text" } }, where: [condition] }
});

const attempt = (seen: JsonValue, observations?: JsonObject[]): AutomationStudioFlowRunActionAttemptRecord => ({
  attemptId: "a.read", nodeId: "node.read", definitionId: "unit.list", order: 1, status: "succeeded", startedAt: 1,
  metadata: { extraction: { recordCount: 4, pagesRead: 1, truncated: false, conditions: {
    applied: 6, kept: 4, rejected: [2], alone: [2], seen: [seen],
    aloneRows: [[{ name: "Brass Hose Nozzle" }, { name: "Cedar Planter Box" }]],
    ...(observations ? { aloneObservations: [observations] } : {})
  } } }
});

const accountOf = (condition: JsonObject, seen: JsonValue = "Ships today", observations?: JsonObject[]) =>
  automationStudioResultReadAccounts({ actionAttempts: [attempt(seen, observations)], flowNodes: [node(condition)], deniedEvidenceKeys: [] }).reads[0]?.conditions?.[0];

describe("a presence test's account", () => {
  it("says the value its read found on the rows it kept, and none on each row it alone left out", () => {
    const condition = accountOf({ field: "dispatch", is: "present" });
    expect(condition?.presence).toBe("A row is kept only when this condition's read finds a value on it: the read found one on every row it kept (on one of them, \"Ships today\"), and found none on each row it alone left out, each said with (no value).");
    expect(condition?.leftOutOnlyByThis).toEqual(["Brass Hose Nozzle — dispatch: (no value)", "Cedar Planter Box — dispatch: (no value)"]);
  });

  it("names the attribute its own read tests where no column makes that read", () => {
    const condition = accountOf({ read: { kind: "attribute", selector: ".card .badge", attribute: "data-dispatch" }, is: "present" });
    expect(condition?.leftOutOnlyByThis).toEqual(["Brass Hose Nozzle — data-dispatch: (no value)", "Cedar Planter Box — data-dispatch: (no value)"]);
    expect(JSON.stringify(condition)).not.toContain(".badge");
  });

  it("says no kept value it may not say, and still says the left-out side", () => {
    for (const seen of [".card .badge > i", "sk-abcdefghij0123456789abcdef", null]) {
      const condition = accountOf({ field: "dispatch", is: "present" }, seen);
      expect(condition?.presence, String(seen)).toContain("the read found one on every row it kept, and found none");
      if (typeof seen === "string") expect(JSON.stringify(condition)).not.toContain(seen);
    }
  });

  it("is said of no condition that also compares, is negated, or keeps rows lacking a value", () => {
    for (const condition of [{ field: "dispatch", is: "present", contains: "today" }, { field: "dispatch", is: "present", not: true }, { field: "dispatch", is: "absent" }, { field: "price", lessThan: 50 }]) {
      expect(automationStudioResultReadPresence(condition, [], "Ships today"), JSON.stringify(condition)).toBeUndefined();
    }
    expect(accountOf({ field: "dispatch", is: "absent" })?.leftOutOnlyByThis).toEqual(["Brass Hose Nozzle", "Cedar Planter Box"]);
  });

  it("claims nothing where the read's own witness says it found a value on a row it left out", () => {
    const witness = (state: "present" | "absent"): JsonObject => ({ conditionIndex: 0, state, ...(state === "present" ? { value: "Ships later" } : {}), source: "field", readKind: "text", page: 1, item: 1 });
    const contradicted = accountOf({ field: "dispatch", is: "present" }, "Ships today", [witness("present"), witness("absent")]);
    expect(contradicted).not.toHaveProperty("presence");
    expect(contradicted?.leftOutOnlyByThis).toEqual(["Brass Hose Nozzle", "Cedar Planter Box"]);
    expect(accountOf({ field: "dispatch", is: "present" }, "Ships today", [witness("absent"), witness("absent")])?.presence).toBeDefined();
  });

  it("is withheld with the wording where the domain declared no keys", () => {
    const counts = automationStudioResultReadAccounts({ actionAttempts: [attempt("Ships today")], flowNodes: [node({ field: "dispatch", is: "present" })] }).reads[0]?.conditions?.[0];
    expect(counts).toEqual({ number: 1, rejected: 2, alone: 2 });
  });
});
