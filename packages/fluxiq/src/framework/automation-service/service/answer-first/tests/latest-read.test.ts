// @fluxiq-test-group real-sql
// The result is what the model's latest read of a list says, in that order, and rows from different
// pages of one list still merge (t869, `run-mw37vz9n-a77a02c2`: the model sorted a list and read it in
// the right order, the judge still saw the first read's order, and so did the person). Through the
// real service, a scripted model and real SQL for the rows. A lending library is none of the Lab's
// realistic scenarios. What a test asserts is what the judge was shown and what the person got, and
// that they are the same rows in the same order.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmTaskRequest } from "../../../../../runtime/llm/index.ts";
import type { AutomationStudioRunDatasets } from "../../datasets/index.ts";
import { judgeReply } from "../../../tests/service-bootstrap/tests/fixtures.ts";
import { complete, fakeLibrary, LOOK_TOOL, READ_LOANS, RENEW_LOAN, runNode, scriptedAttempt, toolCall, type FakeLibrary } from "./fake-library.ts";

vi.setConfig({ testTimeout: 120_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

type Step = JsonObject | ((request: AutomationStudioLlmTaskRequest) => JsonObject);
type Loan = FakeLibrary["loans"][number];
const loan = (title: string, due = "2030-01-01"): Loan => ({ title, due });
const NAMES = ["Atlas of Rivers", "Birds of the Coast", "Clockmaking"];
/** A read, under a call id of its own. */
const read = (id: string, parameters: JsonObject = {}) => runNode(id, READ_LOANS, parameters);
let moves = 0;
/**
 * The site changes, a look sees the page moved, and then the model reads. As on a real page the
 * model did something between the reads (a press on a sort or a next link), and the loop refuses a
 * call repeated on a page it knows has not moved, so the look, asked in its own words, tells it.
 */
const after = (library: FakeLibrary, change: () => void, id: string, parameters: JsonObject = {}): Step[] => [
  () => {
    change();
    library.shelf = `${library.shelf} moved`;
    moves += 1;
    return toolCall(`look.${moves}`, LOOK_TOOL, { at: moves });
  },
  read(id, parameters)
];
/** A record output, as a read the model means to keep says it. */
const output = (datasetId: string, writeMode?: "append" | "replace", purpose?: string): JsonObject => ({ recordOutput: { datasetId, ...(writeMode ? { writeMode } : {}), ...(purpose ? { purpose } : {}) } });
/** One named list, asked in other words each time: a loop refuses the third read asked word for word with no act between, where a real model has pressed something. */
const worded = (id: string): JsonObject => ({ ...output("pages"), shape: id });

async function attemptOf(library: FakeLibrary, script: (Step | Step[])[], over: Partial<Parameters<typeof scriptedAttempt>[0]> = {}) {
  const steps = script.flat();
  const attempt = await scriptedAttempt({ library, script: [...steps, complete("Listed.")], ...over }, cleanups);
  if (attempt.answered.status !== "answered") throw new Error(`expected an answer, got ${attempt.answered.status}`);
  // A read the loop refused never reached the target, and a test on it would pass for nothing.
  const scripted = steps.filter((step) => typeof step === "object" && (step.input as JsonObject | undefined)?.node === READ_LOANS);
  expect(library.calls.filter((call) => call.value.node === READ_LOANS).length).toBeGreaterThanOrEqual(scripted.length);
  return attempt;
}

/** What the last judge was shown, as the rows of its summary. */
function judgedRows(attempt: Awaited<ReturnType<typeof attemptOf>>): JsonObject[] {
  const judges = attempt.requests.filter((request) => request.taskKind === "loop_verification");
  expect(judges.length).toBeGreaterThan(0);
  const shown = JSON.stringify(judges.at(-1)!.context);
  const sets = shown.match(/"sampleRows":(\[.*?\])/u);
  return sets ? JSON.parse(sets[1]!) as JsonObject[] : [];
}

/** The rows the person got, after the judge saw exactly those, in that order. */
function resultRows(attempt: Awaited<ReturnType<typeof attemptOf>>): JsonObject[] {
  if (attempt.answered.status !== "answered") throw new Error("no answer");
  const rows = attempt.answered.result?.rows?.previewRows ?? [];
  expect(judgedRows(attempt)).toEqual(rows);
  return rows;
}

const titles = (rows: readonly JsonObject[]) => rows.map((row) => row.title);

describe("the latest read of a list is the result", () => {
  it("a list read again after a sort: the new order, and no row doubled", async () => {
    const library = fakeLibrary();
    const attempt = await attemptOf(library, [read("first"), after(library, () => library.loans.reverse(), "sorted")]);
    expect(titles(resultRows(attempt))).toEqual([...NAMES].reverse());
    expect(attempt.answered.status === "answered" && attempt.answered.result?.rows?.totalRows).toBe(3);
  });

  it("a saved step run forward, then read by hand sorted: one list under one dataset, the latest order", async () => {
    const library = fakeLibrary();
    library.address = "library://account";
    const attempt = await attemptOf(library, [
      read("first"),
      () => {
        library.loans.reverse();
        library.shelf = "sorted";
        return toolCall("replayed", "core.run_node", { node: READ_LOANS, parameters: {}, consequences: [], replay: "step", from: { location: "library://account" }, produced: { records: 3 } });
      },
      after(library, () => library.loans.sort((one, other) => one.title.localeCompare(other.title)), "by-hand")
    ]);
    expect(titles(resultRows(attempt))).toEqual(NAMES);
    if (attempt.answered.status !== "answered") throw new Error("no answer");
    const datasets = await (attempt.service as unknown as { runDatasets: AutomationStudioRunDatasets }).runDatasets.listRunDatasets({ projectId: attempt.projectId, runId: attempt.answered.attempt.runId! });
    expect(datasets.map((dataset) => dataset.datasetId)).toEqual([attempt.answered.result!.rows!.datasetId]);
  });

  it("a list read again after a filter: a row gone from the list is gone from the result", async () => {
    const library = fakeLibrary();
    const attempt = await attemptOf(library, [read("first"), after(library, () => { library.loans = library.loans.filter((each) => each.title !== "Birds of the Coast"); }, "filtered")]);
    expect(titles(resultRows(attempt))).toEqual(["Atlas of Rivers", "Clockmaking"]);
  });

  it("a list read again after a lasting act changed a row: the new value, and one row", async () => {
    const library = fakeLibrary();
    library.renewedUntil = "2031-06-30";
    const attempt = await attemptOf(library, [read("first"), runNode("renew", RENEW_LOAN, { title: "Clockmaking" }, ["modify_existing"]), read("again")], { permittedConsequences: ["modify_existing"] });
    const rows = resultRows(attempt);
    expect(titles(rows)).toEqual(NAMES);
    expect(rows[2]!.due).toBe("2031-06-30");
    expect(library.renewals).toEqual({ Clockmaking: 1 });
  });

  it("page 2 of a list merges after page 1 in order, by rows alone", async () => {
    const library = fakeLibrary(["Atlas of Rivers", "Birds of the Coast"]);
    const attempt = await attemptOf(library, [read("first"), after(library, () => { library.loans = [loan("Clockmaking"), loan("Dunes of the South")]; }, "page-two")]);
    expect(titles(resultRows(attempt))).toEqual(["Atlas of Rivers", "Birds of the Coast", "Clockmaking", "Dunes of the South"]);
  });

  it("page 2 by its address merges, and a row the feed repeats counts once", async () => {
    const library = fakeLibrary(["Atlas of Rivers", "Birds of the Coast"]);
    library.address = "library://account/loans?page=1";
    const attempt = await attemptOf(library, [read("first"), after(library, () => {
      library.address = "library://account/loans?page=2";
      library.loans = [loan("Birds of the Coast", "2030-01-02"), loan("Clockmaking")];
    }, "page-two")]);
    expect(titles(resultRows(attempt))).toEqual(["Atlas of Rivers", "Birds of the Coast", "Clockmaking"]);
  });

  it("a feed repeating a pinned row on every page: merged, the row once", async () => {
    const library = fakeLibrary(["Atlas of Rivers", "Birds of the Coast", "Clockmaking"]);
    const attempt = await attemptOf(library, [read("first"), after(library, () => { library.loans = [library.loans[0]!, loan("Dunes of the South"), loan("Ephemera of the Harbour")]; }, "page-two")]);
    expect(titles(resultRows(attempt))).toEqual([...NAMES, "Dunes of the South", "Ephemera of the Harbour"]);
  });

  it("two pages, then page 1 read again sorted differently: the list starts over, and the next page merges after it", async () => {
    const library = fakeLibrary(["Atlas of Rivers", "Birds of the Coast"]);
    const pageTwo = [loan("Clockmaking"), loan("Dunes of the South")];
    const attempt = await attemptOf(library, [
      read("first", worded("first")),
      after(library, () => { library.loans = pageTwo; }, "page-two", worded("two")),
      after(library, () => { library.loans = [loan("Birds of the Coast", "2030-01-02"), loan("Atlas of Rivers")]; }, "resorted", worded("resorted")),
      after(library, () => { library.loans = [...pageTwo].reverse(); }, "page-two-again", worded("again"))
    ]);
    expect(titles(resultRows(attempt))).toEqual(["Birds of the Coast", "Atlas of Rivers", "Dunes of the South", "Clockmaking"]);
  });

  it("two pages, then page 1 read again unchanged: both pages stand, and the person's result does not shrink", async () => {
    const library = fakeLibrary(["Atlas of Rivers", "Birds of the Coast"]);
    const pageOne = library.loans;
    const attempt = await attemptOf(library, [read("first", worded("first")), after(library, () => { library.loans = [loan("Clockmaking")]; }, "page-two", worded("two")), after(library, () => { library.loans = pageOne; }, "page-one-again", worded("again"))]);
    expect(titles(resultRows(attempt))).toEqual(["Atlas of Rivers", "Birds of the Coast", "Clockmaking"]);
  });

  it("a list of another view of the site: the latest read's alone, never mixed, even under one read's words", async () => {
    const library = fakeLibrary(["Atlas of Rivers", "Birds of the Coast"]);
    library.address = "library://account/loans";
    const attempt = await attemptOf(library, [read("loans"), after(library, () => {
      library.address = "library://account/reservations";
      library.loans = [loan("Clockmaking"), loan("Dunes of the South")];
    }, "reservations")]);
    expect(titles(resultRows(attempt))).toEqual(["Clockmaking", "Dunes of the South"]);
  });

  it("the model's own name tells two lists apart on one address, and going back to the first is the first", async () => {
    const library = fakeLibrary(["Atlas of Rivers", "Birds of the Coast"]);
    const reserved = [loan("Clockmaking"), loan("Dunes of the South")];
    const asked = library.loans;
    const attempt = await attemptOf(library, [
      read("loans", output("loans")),
      after(library, () => { library.loans = reserved; }, "reservations", output("reservations")),
      after(library, () => { library.loans = [...asked].reverse(); }, "loans-again", output("loans"))
    ]);
    expect(titles(resultRows(attempt))).toEqual(["Birds of the Coast", "Atlas of Rivers"]);
  });

  it("the model says `append` across two views under one name: it asked for both, in order", async () => {
    const library = fakeLibrary(["Atlas of Rivers"]);
    library.address = "library://account/branch-one";
    const attempt = await attemptOf(library, [read("one", output("everything", "append")), after(library, () => {
      library.address = "library://account/branch-two";
      library.loans = [loan("Birds of the Coast")];
    }, "two", output("everything", "append"))]);
    expect(titles(resultRows(attempt))).toEqual(["Atlas of Rivers", "Birds of the Coast"]);
  });

  it("the model says `replace` on rows the list has never held: a filter no row of it survived", async () => {
    const library = fakeLibrary(["Atlas of Rivers", "Birds of the Coast"]);
    const attempt = await attemptOf(library, [read("first", output("loans", "replace")), after(library, () => { library.loans = [loan("Clockmaking")]; }, "filtered", output("loans", "replace"))]);
    expect(titles(resultRows(attempt))).toEqual(["Clockmaking"]);
  });

  it("a working read after the answer does not become the result", async () => {
    const library = fakeLibrary(["Atlas of Rivers", "Birds of the Coast"]);
    const asked = library.loans;
    const attempt = await attemptOf(library, [read("loans", output("loans")), after(library, () => { library.loans = [loan("Clockmaking"), loan("Dunes of the South"), loan("Ephemera of the Harbour")]; }, "look-up", output("branches", undefined, "intermediate"))]);
    expect(titles(resultRows(attempt))).toEqual(asked.map((each) => each.title));
  });

  it("a read that came back empty does not wipe a good one", async () => {
    const library = fakeLibrary();
    const attempt = await attemptOf(library, [read("first"), after(library, () => { library.loans = []; }, "empty")]);
    expect(titles(resultRows(attempt))).toEqual(NAMES);
  });

  it("a read that was refused does not wipe a good one", async () => {
    const library = fakeLibrary();
    let refused = 0;
    const attempt = await attemptOf(library, [read("first"), after(library, () => undefined, "refused")], {
      fault: (call) => {
        if (call.value.node !== READ_LOANS || refused > 0 || library.calls.filter((each) => each.value.node === READ_LOANS).length < 2) return undefined;
        refused += 1;
        return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "web.action.rejected.output_not_observed", read: { extracted: [{ title: "A row it did not keep", due: "2030-01-09" }] } }, effectApplied: false };
      }
    });
    expect(refused).toBe(1);
    expect(titles(resultRows(attempt))).toEqual(NAMES);
  });

  it("the judge refuses the first order, the model sorts and reads, and the second check sees the new order", async () => {
    const library = fakeLibrary();
    const attempt = await attemptOf(library, [read("first"), complete("Listed."), after(library, () => library.loans.reverse(), "sorted")], { judge: [judgeReply("no")] });
    expect(titles(resultRows(attempt))).toEqual([...NAMES].reverse());
    expect(attempt.requests.filter((request) => request.taskKind === "loop_verification")).toHaveLength(2);
  });

  it("an act on a row stays one act, and the row its new value, when its list is read again in another order", async () => {
    const library = fakeLibrary();
    library.renewedUntil = "2031-06-30";
    const attempt = await attemptOf(library, [
      read("first"),
      runNode("renew", RENEW_LOAN, { title: "Atlas of Rivers" }, ["modify_existing"]),
      after(library, () => library.loans.reverse(), "sorted")
    ], { permittedConsequences: ["modify_existing"] });
    const rows = resultRows(attempt);
    expect(titles(rows)).toEqual([...NAMES].reverse());
    expect(rows[2]!.due).toBe("2031-06-30");
    expect(library.renewals).toEqual({ "Atlas of Rivers": 1 });
    expect(attempt.answered.status === "answered" && attempt.answered.result?.acts).toHaveLength(1);
  });
});
