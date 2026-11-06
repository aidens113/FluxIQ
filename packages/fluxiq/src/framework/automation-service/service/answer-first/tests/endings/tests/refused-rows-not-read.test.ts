// @fluxiq-test-group real-sql
// A request that asks for rows back, completed with its act done and the rows typed as words and
// no read (lane B, run-mw45itmx-c4d6f5cb): the completion is refused, the attempt is not ended, and
// it goes on to read and reaches its result. A request that asks for nothing back completes with
// no read, as before. Through the real service, provider-free (`../../fake-library.ts`).
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../../core/index.ts";
import type { AutomationStudioLlmTaskRequest } from "../../../../../../../runtime/llm/index.ts";
import { complete, READ_LOANS, RENEW_CARD, runNode, scriptedAttempt } from "../../fake-library.ts";

vi.setConfig({ testTimeout: 120_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const TABLE = "Renew the card on my library account, then give me my loans as a table with columns title and due.";
const WORDS = "| title | due |\n|---|---|\n| Atlas of Rivers | 2030-01-01 |";

describe("rows asked for, completed with no read", () => {
  it("is refused without a judge, and the attempt goes on to read and reach its result", async () => {
    const told: string[] = [];
    const attempt = await scriptedAttempt({
      instruction: TABLE,
      permittedConsequences: ["modify_existing"],
      script: [
        runNode("card", RENEW_CARD, {}, ["modify_existing"], { add: true }),
        complete("Renewed the card and listed the loans.", WORDS),
        (request) => {
          told.push(JSON.stringify(request.context.evidenceLoop?.evidence));
          return complete("Renewed the card and listed the loans, again.", WORDS);
        },
        (request) => {
          told.push(JSON.stringify(request.context.evidenceLoop?.evidence));
          return runNode("read", READ_LOANS, {}, [], { add: true });
        },
        complete("Renewed the card and listed the loans.")
      ]
    }, cleanups);
    expect(attempt.scriptRanOut).toBe(false);
    if (attempt.answered.status !== "answered") throw new Error(`expected an answer, got ${attempt.answered.status}`);
    const { attempt: ended, result } = attempt.answered;
    expect(told[0]).toContain("answer_first.rows_not_read");
    expect(told[1]).toContain("answer_first.rows_not_read");
    expect(ended.status).toBe("achieved");
    expect(result).toMatchObject({ kind: "rows", label: "confirmed", timesChecked: 1 });
    expect(result?.rows?.totalRows).toBe(3);
    expect(result?.acts).toHaveLength(1);
    // Two refusals and one judge: neither refused completion reached it.
    expect(attempt.requests.filter((request) => request.taskKind === "loop_verification")).toHaveLength(1);
    expect(attempt.library.renewals).toEqual({ card: 1 });
  });

  // The round stalls after four refused completions in a row (the loop's no-progress guard); the fifth
  // decision is the fresh round's first, and here it reads.
  it("refused until its round stalls, its next round reads and reaches the result: the refusal never ends the attempt", async () => {
    const told: string[] = [];
    const tell = (then: JsonObject) => (request: AutomationStudioLlmTaskRequest): JsonObject => {
      told.push(JSON.stringify(request.context.evidenceLoop?.evidence));
      return then;
    };
    const attempt = await scriptedAttempt({
      instruction: TABLE,
      permittedConsequences: ["modify_existing"],
      script: [
        runNode("card", RENEW_CARD, {}, ["modify_existing"], { add: true }),
        complete("Renewed the card and listed the loans.", WORDS),
        ...Array.from({ length: 3 }, (_unused, index) => tell(complete(`Listed the loans (${index + 2}).`, WORDS))),
        tell(runNode("read", READ_LOANS, {}, [], { add: true })),
        complete("Renewed the card and listed the loans.")
      ]
    }, cleanups);
    expect(attempt.scriptRanOut).toBe(false);
    if (attempt.answered.status !== "answered") throw new Error(`expected an answer, got ${attempt.answered.status}`);
    // Refused each time, without a judge, until the guard stepped in.
    expect(told.slice(0, 3).every((evidence) => evidence.includes("answer_first.rows_not_read"))).toBe(true);
    expect(told[2]).toContain("llm_evidence_loop.no_progress");
    // The read was the first decision of a fresh round: nothing refused is in front of it.
    expect(told[3]).not.toContain("answer_first.rows_not_read");
    const lines = attempt.said.map((line) => line.split(" | ")[0]);
    expect(lines.filter((line) => line === "Carrying on")).toHaveLength(1);
    expect(lines.indexOf("Carrying on")).toBeLessThan(lines.indexOf("Reading from the page"));
    expect(attempt.answered.attempt.status).toBe("achieved");
    expect(attempt.answered.result).toMatchObject({ kind: "rows", label: "confirmed", timesChecked: 1 });
    expect(attempt.answered.result?.rows?.totalRows).toBe(3);
    expect(attempt.requests.filter((request) => request.taskKind === "loop_verification")).toHaveLength(1);
  });
});

describe("nothing asked back", () => {
  it("completes on its act with no read, as before", async () => {
    const attempt = await scriptedAttempt({
      instruction: "Renew the card on my library account.",
      permittedConsequences: ["modify_existing"],
      script: [runNode("card", RENEW_CARD, {}, ["modify_existing"], { add: true }), complete("Renewed the card.")]
    }, cleanups);
    if (attempt.answered.status !== "answered") throw new Error(`expected an answer, got ${attempt.answered.status}`);
    expect(attempt.answered.attempt.status).toBe("achieved");
    expect(attempt.answered.result).toMatchObject({ kind: "done_on_site", label: "confirmed", timesChecked: 1 });
    expect(attempt.library.calls.filter((call) => call.value.node === READ_LOANS)).toEqual([]);
  });
});
