// @fluxiq-test-group real-sql
// Nothing is put back on this path (D1). A forward run sends no reset, but a model's rerun of a
// step on another page does (`runtime/llm/node-tools/step-place.ts`), which would take the page
// away from what the attempt did. Through a real rerun: the reset is refused before it reaches
// the target, the rerun runs nothing and says so, and the task goes on from the page as it stands.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../../core/index.ts";
import { complete, fakeLibrary, READ_LOANS, RENEW_CARD, runNode, scriptedAttempt } from "../../fake-library.ts";
import { expectPresses, expectReached } from "../support.ts";

vi.setConfig({ testTimeout: 120_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

describe("a rerun that would reset the target", () => {
  it("is refused and said, nothing reaches the target, no act is repeated, and the task reaches its result", async () => {
    const library = fakeLibrary();
    let told = "";
    const attempt = await scriptedAttempt({
      library,
      instruction: "Renew the card and list every loan on my library account.",
      permittedConsequences: ["modify_existing"],
      script: [
        runNode("card", RENEW_CARD, {}, ["modify_existing"], { add: true }),
        runNode("read", READ_LOANS, {}, [], { add: true }),
        // The page has moved since this step, so a rerun of it would put the target back first.
        () => {
          library.shelf = "moved";
          return { kind: "amend_draft", amendments: [{ step: 2, change: "rerun", input: { node: READ_LOANS, parameters: { sorted: true } } }] };
        },
        (request) => {
          told = JSON.stringify(request.context.evidenceLoop?.evidence);
          return runNode("read.here", READ_LOANS, { here: true }, [], {});
        },
        complete("Renewed, and listed.")
      ]
    }, cleanups);
    expect(told).toContain("rerun_place_unreachable");
    expect(told).toContain("answer_first.no_reset");
    expect(library.calls.filter((call: { value: JsonObject }) => call.value.replay === "reset")).toEqual([]);
    const answer = expectReached(attempt);
    expect(answer.result?.rows?.totalRows).toBe(3);
    expectPresses(attempt, { card: 1 });
  });
});
