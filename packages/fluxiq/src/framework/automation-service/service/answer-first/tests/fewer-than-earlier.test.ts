// @fluxiq-test-group real-sql
// The result says when it got smaller (t869). Since lane t905 the attempt's one result says it on the answer of the read
// that made it smaller, as the change line (`../result/change-line.ts`): "result 3 → 2 rows". The card's
// `fewerThanEarlier`, the row sink's own note of a list that shrank, is no longer the result's: the ledger keeps no
// earlier count beside the result, so the result card carries none.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { complete, fakeLibrary, LOOK_TOOL, READ_LOANS, runNode, scriptedAttempt, toolCall } from "./fake-library.ts";

vi.setConfig({ testTimeout: 120_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

describe("a later read that got smaller", () => {
  it("is carried to the result, and a list that did not shrink carries nothing", async () => {
    const library = fakeLibrary();
    const shrunk = await scriptedAttempt({
      library,
      script: [
        runNode("first", READ_LOANS, { recordOutput: { datasetId: "loans" } }, [], { add: true }),
        (): JsonObject => {
          library.loans = library.loans.filter((each) => each.title !== "Birds of the Coast");
          library.shelf = "filtered";
          return toolCall("look", LOOK_TOOL, {});
        },
        runNode("second", READ_LOANS, { shape: "again", recordOutput: { datasetId: "loans" } }, [], { add: true }),
        complete("Listed.")
      ]
    }, cleanups);
    if (shrunk.answered.status !== "answered") throw new Error(`expected an answer, got ${shrunk.answered.status}`);
    expect(shrunk.answered.result?.rows).toMatchObject({ totalRows: 2 });
    const last = shrunk.requests.filter((request) => request.taskKind === "evidence_tool_decision").at(-1);
    const answer = last?.context.evidenceLoop?.evidence.find((entry) => entry.callId === "second")?.value as JsonObject | undefined;
    expect(answer?.resultNote).toMatch(/^result 3 → 2 rows/u);

    const same = await scriptedAttempt({ library: fakeLibrary(), script: [runNode("first", READ_LOANS, { recordOutput: { datasetId: "loans" } }, [], { add: true }), complete("Listed.")] }, cleanups);
    if (same.answered.status !== "answered") throw new Error(`expected an answer, got ${same.answered.status}`);
    expect(same.answered.result?.rows).not.toHaveProperty("fewerThanEarlier");
  });
});
