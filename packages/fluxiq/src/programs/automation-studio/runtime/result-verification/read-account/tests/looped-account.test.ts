import { expect, it } from "vitest";
import { automationStudioResultReadLoopedAccount } from "../looped-account.ts";
import type { AutomationStudioResultReadAccount } from "../../contracts.ts";

it("keeps conflicting repeated-label witnesses in pass order and legacy unknowns aligned", () => {
  const witness = (page: number) => ({ conditionIndex: 0, state: "present" as const, value: `read ${page}`, source: "read" as const, page, item: 1 });
  const passes: AutomationStudioResultReadAccount[] = [1, 2, 3].map(page => ({
    nodeId: "unit", definitionId: "unit.list", pagesRead: 1, kept: 0, truncated: false,
    conditions: [{ rejected: 1, alone: 1, leftOutOnlyByThis: ["Unit alpha"], ...(page === 2 ? {} : { leftOutObservations: [witness(page)] }) }]
  }));
  expect(automationStudioResultReadLoopedAccount({ passes, attempts: 3 }).conditions?.[0]).toEqual({
    rejected: 3, alone: 3, leftOutOnlyByThis: ["Unit alpha", "Unit alpha", "Unit alpha"],
    leftOutObservations: [witness(1), null, witness(3)]
  });
  expect(automationStudioResultReadLoopedAccount({ passes: [passes[1]!], attempts: 1 }).conditions?.[0]).not.toHaveProperty("leftOutObservations");
});
