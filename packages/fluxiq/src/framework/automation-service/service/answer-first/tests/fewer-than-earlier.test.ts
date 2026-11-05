// @fluxiq-test-group real-sql
// The result says when the latest read of its list got smaller (t869): the card carries what an earlier read held.
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
        runNode("first", READ_LOANS, { recordOutput: { datasetId: "loans" } }),
        (): JsonObject => {
          library.loans = library.loans.filter((each) => each.title !== "Birds of the Coast");
          library.shelf = "filtered";
          return toolCall("look", LOOK_TOOL, {});
        },
        runNode("second", READ_LOANS, { shape: "again", recordOutput: { datasetId: "loans" } }),
        complete("Listed.")
      ]
    }, cleanups);
    if (shrunk.answered.status !== "answered") throw new Error(`expected an answer, got ${shrunk.answered.status}`);
    expect(shrunk.answered.result?.rows).toMatchObject({ totalRows: 2, fewerThanEarlier: { earlierRows: 3 } });

    const same = await scriptedAttempt({ library: fakeLibrary(), script: [runNode("first", READ_LOANS, { recordOutput: { datasetId: "loans" } }), complete("Listed.")] }, cleanups);
    if (same.answered.status !== "answered") throw new Error(`expected an answer, got ${same.answered.status}`);
    expect(same.answered.result?.rows).not.toHaveProperty("fewerThanEarlier");
  });
});
