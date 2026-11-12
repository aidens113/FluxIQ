// @fluxiq-test-group real-sql
// Nothing is put back on this path (D1). A forward run sends no reset, and neither does a model's
// rerun of a step that started on another page: the round tells the loop it reruns in place
// (`rerunsInPlace`), so the rerun runs from the page as it stands (`runtime/llm/node-tools/step-place.ts`,
// `forward_run`) and says where its step started. Run `run-mwc60eal-4c9fdf6f`: before this, the rerun
// sent a reset, the attempt refused it, and the rerun ran nothing. Through a real rerun: no reset
// reaches the target, the rerun's read runs on the moved shelf and says so, no act is repeated, and
// the task reaches its result.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../../core/index.ts";
import { complete, fakeLibrary, READ_LOANS, RENEW_CARD, runNode, scriptedAttempt } from "../../fake-library.ts";
import { expectPresses, expectReached } from "../support.ts";

vi.setConfig({ testTimeout: 120_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

describe("a rerun of a step that started on another page", () => {
  it("sends no reset, runs where the page stands and says so, repeats no act, and the task reaches its result", async () => {
    const library = fakeLibrary();
    let told = "";
    const attempt = await scriptedAttempt({
      library,
      instruction: "Renew the card and list every loan on my library account.",
      permittedConsequences: ["modify_existing"],
      script: [
        runNode("card", RENEW_CARD, {}, ["modify_existing"], { add: true }),
        runNode("read", READ_LOANS, {}, [], { add: true }),
        // The page has moved since this step started, so a rerun of it runs on the moved page.
        () => {
          library.shelf = "moved";
          return { kind: "amend_draft", amendments: [{ step: 2, change: "rerun", input: { node: READ_LOANS, parameters: { sorted: true } } }] };
        },
        (request) => {
          told = JSON.stringify(request.context.evidenceLoop?.evidence);
          return complete("Renewed, and listed.");
        }
      ]
    }, cleanups);
    const calls = library.calls as { value: JsonObject }[];
    expect(calls.filter((call) => call.value.replay === "reset")).toEqual([]);
    // The rerun's read reached the target once, on the moved shelf, with nothing put back first. The read's act is done,
    // so it goes as the dry run's check (`runtime/llm/node-tools/rerun-check.ts`), never as a reset or a step done again.
    const reruns = calls.filter((call) => call.value.node === READ_LOANS && (call.value.parameters as JsonObject | undefined)?.sorted === true);
    expect(reruns).toHaveLength(1);
    expect(reruns[0]!.value.replay).toBe("verify");
    expect(told).toContain("forward_run");
    expect(told).toContain("stepStartedOn");
    expect(told).not.toContain("rerun_place_unreachable");
    expect(told).not.toContain("answer_first.no_reset");
    const answer = expectReached(attempt);
    expect(answer.result?.rows?.totalRows).toBe(3);
    expectPresses(attempt, { card: 1 });
  });
});
