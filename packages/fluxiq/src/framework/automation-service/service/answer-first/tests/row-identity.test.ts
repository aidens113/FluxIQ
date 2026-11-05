// @fluxiq-test-group real-sql
// Row identity between a real read and a forward run's For Each item, through the real service (t869).
//
// The model reads the rows, presses the first by hand, writes the repeat with its body bound to the
// row, and runs forward. The first row was noted under what the read returned. The pass carries what
// the Flow's own read returned. Each case asserts on the presses the target counted, because a second
// press leaves no other trace.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { complete, fakeLibrary, READ_LOANS, RENEW_LOAN, runNode, scriptedAttempt, toolCall, type FakeLibrary } from "./fake-library.ts";

vi.setConfig({ testTimeout: 120_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const SHAPE = "flow";
const CONSEQUENCES = ["modify_existing"];

/** Read everything, renew the first by hand, write a read of the Flow's own shape and a repeat bound to its `field`, and run forward. */
async function renewAll(input: { library: FakeLibrary; shape?: (loan: { title: string; due: string }) => JsonObject; field?: string; first?: string }) {
  const { library } = input;
  if (input.shape) library.shapes = { [SHAPE]: input.shape };
  const flowRead: JsonObject = input.shape ? { shape: SHAPE } : {};
  return await scriptedAttempt({
    library,
    instruction: "Renew every loan on my library account.",
    permittedConsequences: ["modify_existing"],
    script: [
      runNode("read", READ_LOANS),
      runNode("first", RENEW_LOAN, { title: input.first ?? library.loans[0]!.title }, CONSEQUENCES),
      toolCall("flow-read", "core.run_node", { node: READ_LOANS, parameters: flowRead, consequences: [], write: true }),
      toolCall("loop", "core.run_node", { node: RENEW_LOAN, parameters: { title: { $row: input.field ?? "title" } }, consequences: CONSEQUENCES, write: true }),
      { kind: "amend_draft", amendments: [{ step: 5, change: "repeat", over: 4 }] },
      toolCall("forward", "core.run_flow", { from: 4 }),
      complete("Renewed every loan.")
    ]
  }, cleanups);
}

/** What each loan was pressed, and what the forward run said of the rows. */
function presses(attempt: Awaited<ReturnType<typeof renewAll>>) {
  const passes = attempt.library.calls.filter((call) => call.value.replay === "step" && call.value.node === RENEW_LOAN);
  return { renewals: attempt.library.renewals, passes: passes.length, status: attempt.answered.status, ranOut: attempt.scriptRanOut };
}

/** What the model's next decision was told the forward run did with the rows: a row left out is never silent. */
function toldRows(attempt: Awaited<ReturnType<typeof renewAll>>): JsonObject | undefined {
  const asked = attempt.requests.filter((request) => request.taskKind === "evidence_tool_decision").at(-1);
  const forward = asked?.context.evidenceLoop?.evidence.find((entry) => entry.callId === "forward");
  return (forward?.value as { rows?: JsonObject } | undefined)?.rows;
}

const ONCE_EACH = { "Atlas of Rivers": 1, "Birds of the Coast": 1, Clockmaking: 1 };

describe("a row a Flow reshaped is still the row a read showed", () => {
  it.each<[string, (loan: { title: string; due: string }) => JsonObject, string]>([
    ["renamed columns", (loan) => ({ name: loan.title, until: loan.due }), "name"],
    ["fewer columns", (loan) => ({ title: loan.title }), "title"],
    ["a trimmed field", (loan) => ({ title: `${loan.title.slice(0, 10)}…`, due: loan.due }), "title"],
    ["a derived field", (loan) => ({ title: loan.title, label: `${loan.title} until ${loan.due}` }), "title"],
    ["a different column order", (loan) => ({ due: loan.due, title: loan.title }), "title"],
    ["a field the read had not", (loan) => ({ title: loan.title, due: loan.due, branch: "Main library" }), "title"]
  ])("%s: the first row is not pressed again", async (_name, shape, field) => {
    const attempt = await renewAll({ library: fakeLibrary(), shape, field });
    expect(presses(attempt)).toMatchObject({ renewals: ONCE_EACH, passes: 2, status: "answered", ranOut: false });
  });

  it("a plain row-bound repeat, the shape the read showed", async () => {
    const attempt = await renewAll({ library: fakeLibrary() });
    expect(presses(attempt)).toMatchObject({ renewals: ONCE_EACH, passes: 2, status: "answered", ranOut: false });
  });

  it("a row the act itself changed is still that row", async () => {
    const library = fakeLibrary();
    library.renewedUntil = "2031-06-30";
    const attempt = await renewAll({ library });
    expect(presses(attempt)).toMatchObject({ renewals: ONCE_EACH, passes: 2, status: "answered", ranOut: false });
  });

  it("no read before the press: the Flow's own read is what ties it", async () => {
    const library = fakeLibrary();
    library.shapes = { [SHAPE]: (loan) => ({ name: loan.title }) };
    const attempt = await scriptedAttempt({
      library,
      instruction: "Renew every loan on my library account.",
      permittedConsequences: ["modify_existing"],
      script: [
        runNode("first", RENEW_LOAN, { title: "Atlas of Rivers" }, CONSEQUENCES),
        toolCall("flow-read", "core.run_node", { node: READ_LOANS, parameters: { shape: SHAPE }, consequences: [], write: true }),
        toolCall("loop", "core.run_node", { node: RENEW_LOAN, parameters: { title: { $row: "name" } }, consequences: CONSEQUENCES, write: true }),
        { kind: "amend_draft", amendments: [{ step: 4, change: "repeat", over: 3 }] },
        toolCall("forward", "core.run_flow", { from: 3 }),
        complete("Renewed every loan.")
      ]
    }, cleanups);
    expect(presses(attempt)).toMatchObject({ renewals: ONCE_EACH, passes: 2, status: "answered", ranOut: false });
  });
});

describe("rows a loose match must tell apart", () => {
  it("two different rows that share words keep their own presses, under a read that dropped a column", async () => {
    const titles = ["Birds of the Coast", "Birds of the Marsh", "Birds of the Moor"];
    const attempt = await renewAll({ library: fakeLibrary(titles), shape: (loan) => ({ title: loan.title }) });
    expect(presses(attempt)).toMatchObject({ renewals: { "Birds of the Coast": 1, "Birds of the Marsh": 1, "Birds of the Moor": 1 }, passes: 2, status: "answered" });
  });

  it("two rows the Flow's read cannot tell apart are both held done, by the bias, and the model is told so", async () => {
    const library = fakeLibrary(["Atlas of Rivers", "Atlas of Rivers", "Clockmaking"]);
    const attempt = await renewAll({ library, shape: (loan) => ({ title: loan.title }) });
    // The second copy is left out: a row wrongly held done, which a judge's no brings back. Never pressed twice.
    expect(presses(attempt)).toMatchObject({ renewals: { "Atlas of Rivers": 1, Clockmaking: 1 }, passes: 1, status: "answered" });
    expect(toldRows(attempt)).toEqual({ done: 1, skipped: 2, failed: 0 });
  });

  it("a Flow's read that keeps only what every row shares, and one of its words the first row's: all held done, and told", async () => {
    const attempt = await renewAll({ library: fakeLibrary(), shape: () => ({ title: "Atlas of Rivers" }) });
    expect(presses(attempt)).toMatchObject({ renewals: { "Atlas of Rivers": 1 }, passes: 0, status: "answered" });
    expect(toldRows(attempt)).toEqual({ done: 0, skipped: 3, failed: 0 });
  });

  it("the limit: a Flow's read sharing no word with the read or the press's sentence is a new row, and is acted on once", async () => {
    const attempt = await renewAll({ library: fakeLibrary(), shape: () => ({ status: "Out on loan" }), field: "status" });
    expect(presses(attempt)).toMatchObject({ renewals: { "Atlas of Rivers": 1, "Out on loan": 1 }, passes: 1, status: "answered" });
    expect(toldRows(attempt)).toEqual({ done: 1, skipped: 2, failed: 0 });
  });
});
