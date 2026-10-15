import { expect, it } from "vitest";
import { automationStudioResultReadLoopedAccount } from "../looped-account.ts";
import type { AutomationStudioResultReadAccount } from "../../contracts/index.ts";

it("keeps conflicting repeated-label witnesses in pass order and legacy unknowns aligned", () => {
  const witness = (page: number, pass = page) => ({ conditionIndex: 0, state: "present" as const, value: `read ${pass}`, source: "read" as const, page, item: 1 });
  // Each pass is a node run that reads one page, so each says page 1 of its own.
  const passes: AutomationStudioResultReadAccount[] = [1, 2, 3].map(page => ({
    nodeId: "unit", definitionId: "unit.list", pagesRead: 1, kept: 0, truncated: false,
    conditions: [{ rejected: 1, alone: 1, leftOutOnlyByThis: ["Unit alpha"], ...(page === 2 ? {} : { leftOutObservations: [witness(1, page)] }) }]
  }));
  expect(automationStudioResultReadLoopedAccount({ passes, attempts: 3 }).conditions?.[0]).toEqual({
    number: 1, rejected: 3, alone: 3, leftOutOnlyByThis: ["Unit alpha", "Unit alpha", "Unit alpha"],
    leftOutObservations: [witness(1), null, witness(3)]
  });
  expect(automationStudioResultReadLoopedAccount({ passes: [passes[1]!], attempts: 1 }).conditions?.[0]).not.toHaveProperty("leftOutObservations");
});

// Run `run-mv5jnc51-9eac63f2`: every witness of a five-page looped read said page 1.
it("numbers each pass's witnesses by the pages the passes before it read", () => {
  const witness = (page: number, item: number) => ({ conditionIndex: 0, state: "absent" as const, source: "field" as const, readKind: "attribute" as const, page, item });
  const pass = (pagesRead: number, pages: number[]): AutomationStudioResultReadAccount => ({
    nodeId: "unit", definitionId: "unit.list", pagesRead, kept: 1, truncated: false,
    conditions: [{ rejected: pages.length, alone: pages.length, leftOutOnlyByThis: pages.map((_, row) => `Row ${row}`), leftOutObservations: pages.map((page, row) => witness(page, row + 1)) }]
  });
  const merged = automationStudioResultReadLoopedAccount({ passes: [pass(1, [1]), pass(1, [1, 1]), pass(2, [1, 2]), pass(1, [1])], attempts: 4 });
  expect(merged.conditions?.[0]?.leftOutObservations?.map((entry) => entry?.page)).toEqual([1, 2, 2, 3, 4, 5]);
  expect(merged.conditions?.[0]?.leftOutObservations?.[1]).toEqual(witness(2, 1));
});

it("words each condition from a pass that kept rows, where the wording says what the read found on one", () => {
  const pass = (kept: number, condition: string): AutomationStudioResultReadAccount => ({
    nodeId: "unit", definitionId: "unit.list", pagesRead: 1, kept, truncated: false, conditions: [{ condition, rejected: 1 }]
  });
  const said = "badge (read \"Verified\" on a row it kept) is present";
  expect(automationStudioResultReadLoopedAccount({ passes: [pass(0, "badge is present"), pass(2, said)], attempts: 2 }).conditions?.[0]?.condition).toBe(said);
  expect(automationStudioResultReadLoopedAccount({ passes: [pass(0, "badge is present"), pass(0, said)], attempts: 2 }).conditions?.[0]?.condition).toBe("badge is present");
});
