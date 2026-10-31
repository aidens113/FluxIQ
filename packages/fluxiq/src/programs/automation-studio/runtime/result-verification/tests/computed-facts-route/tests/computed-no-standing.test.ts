// A computed fact that fails reaches a build test's judge as a no carrying
// Core's own record of it, marked Core's (framework plan P5b), so the trial gate
// that reads `standingNo` keeps it. The facts are stubbed in; no model is called.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { automationStudioBuildTestJudge } from "../../../build-test/index.ts";
import { automationStudioResultComputedFacts } from "../../../computed-facts/index.ts";
import type { AutomationStudioResultComputedFact } from "../../../contracts/index.ts";
import { catalogInstruction, catalogRunSummary, GLOVE_HOOK, SEARCH_WORDS } from "../../../located-defects/tests/garden-catalog-fixture.ts";

vi.mock("../../../computed-facts/index.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../computed-facts/index.ts")>()),
  automationStudioResultComputedFacts: vi.fn(() => [])
}));
const computed = vi.mocked(automationStudioResultComputedFacts);

const FAILS: AutomationStudioResultComputedFact = {
  kind: "count", status: "fails", said: "Core counted 3 stored rows where the build declared 2.",
  defects: [{ kind: "kept_not_asked", row: GLOVE_HOOK, requestWords: SEARCH_WORDS }]
};

beforeEach(() => { computed.mockReset(); });

describe("a build test judged no by Core's computed facts", () => {
  it("carries Core's record of the no, marked Core's, with the defect it located", async () => {
    computed.mockReturnValue([FAILS]);
    const judge = automationStudioBuildTestJudge({ instructions: [catalogInstruction()], projectId: "project-1", flowId: "flow-1" });
    const verdict = await judge({ summary: catalogRunSummary() });
    expect(verdict).toMatchObject({ verdict: "no", spent: { calls: 0 } });
    expect(verdict.verdict === "no" ? verdict.standingNo : undefined).toMatchObject({ source: "core", located: [{ kind: "kept_not_asked", row: GLOVE_HOOK }] });
  });
});
