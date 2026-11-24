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
// Changed by t984 (05d61fea4, `../../../completion/check.ts`): a declared data task's completion is refused by its data stage
// before any other check, so rows asked for and never read come back as the stage's missing source schema, not as
// `answer_first.rows_not_read`, which now speaks only for a legacy task with no declaration. Still refused without a judge.
const NOT_READ = "answer_first.processing_schema_missing";

describe("rows asked for, completed with no read", () => {
  it("is refused without a judge, and the attempt goes on to read and reach its result", async () => {
    const told: string[] = [];
    const attempt = await scriptedAttempt({
      taskProcessing: { process: {} },
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
    expect(told[0]).toContain(NOT_READ);
    expect(told[1]).toContain(NOT_READ);
    expect(ended.status).toBe("achieved");
    expect(result).toMatchObject({ kind: "rows", label: "confirmed", timesChecked: 1 });
    expect(result?.rows?.totalRows).toBe(3);
    expect(result?.acts).toHaveLength(1);
    // Two refusals and one judge: neither refused completion reached it.
    expect(attempt.requests.filter((request) => request.taskKind === "loop_verification")).toHaveLength(1);
    expect(attempt.library.renewals).toEqual({ card: 1 });
  });

  // Four refused completions in a row once stalled the round on a count, and the fifth decision was a fresh round's
  // first. No count ends a round now (t1014): the repeat is caught by loop detection and steered, and the read comes in
  // the same round, with everything it held.
  it("refused again and again, is caught as a repeat rather than ending its round, reads in the same round and reaches the result", async () => {
    const told: string[] = [];
    const tell = (then: JsonObject) => (request: AutomationStudioLlmTaskRequest): JsonObject => {
      told.push(JSON.stringify(request.context.evidenceLoop?.evidence));
      return then;
    };
    const attempt = await scriptedAttempt({
      taskProcessing: { process: {} },
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
    expect(told.slice(0, 3).every((evidence) => evidence.includes(NOT_READ))).toBe(true);
    expect(told[2]).toContain("llm_evidence_loop.no_progress");
    // The read came in the same round, after the repeat was caught and steered: the refusals are still in front of it.
    expect(told[3]).toContain(NOT_READ);
    expect(told[3]).toContain("\"toolIds\":[\"core.completion_check\"]");
    const lines = attempt.said.map((line) => line.split(" | ")[0]);
    expect(lines.filter((line) => line === "Carrying on")).toHaveLength(0);
    expect(lines).toContain("Noticed it was repeating itself");
    expect(attempt.answered.attempt.status).toBe("achieved");
    expect(attempt.answered.result).toMatchObject({ kind: "rows", label: "confirmed", timesChecked: 1 });
    expect(attempt.answered.result?.rows?.totalRows).toBe(3);
    expect(attempt.requests.filter((request) => request.taskKind === "loop_verification")).toHaveLength(1);
  });
});

describe("nothing asked back", () => {
  it("completes on its act with no read, as before", async () => {
    const attempt = await scriptedAttempt({
      taskProcessing: null,
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
