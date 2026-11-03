// A settled condition is deliberately stricter than an unsettled row. Once Core
// has measured that its rows fail it, what is left to show is that the condition
// is the request's, so naming those rows beside a request quote is not enough: a
// sentence must name the condition and itself quote the request (t790). Taking the
// row-by-row account as well was tried and reverted (t841). Each case runs on a
// native read and on a saved answer's processing, which share the rule.
import { describe, expect, it } from "vitest";
import { automationStudioRequestWording } from "../../../request-wording.ts";
import { automationStudioResultLeftOutRowsUnquoted } from "../../../unquoted-rows.ts";
import type { AutomationStudioRunResultSummary } from "../../../../contracts/index.ts";
import { AUDIOBOOKS_INSTRUCTION, AUDIOBOOKS_NOT_ON_SHELF, audiobooksRunSummary } from "../../../../value-readings/tests/audiobooks-fixture.ts";
import { CATALOGUE_REQUEST, processingCatalogue } from "../../../../value-readings/tests/processing-catalogue.ts";
import { SETTLED_TOGETHER_NAMES, SETTLED_TOGETHER_ROW, settledTogetherRunSummary, settledTogetherWording } from "./settled-together-fixture.ts";

const SHELF_ROWS = AUDIOBOOKS_NOT_ON_SHELF.map(([title]) => title);
// Not the words "on the shelf": `shelf` is a column the answer does not store, so a quote holding it names the condition by itself.
const SHELF_QUOTE = "my branch has";
const CATALOGUE_ROWS = ["The Clockmaker's Almanac", "Songs of the Tides"];
const CATALOGUE_QUOTE = "shelf status Available today";

/** What the rule still holds of one condition, on a summary. */
function heldFor(summary: AutomationStudioRunResultSummary, instructions: ReadonlyArray<{ title: string; body: string }>, number: number, reply: string) {
  const wording = automationStudioRequestWording(instructions as Parameters<typeof automationStudioRequestWording>[0], summary)!;
  return automationStudioResultLeftOutRowsUnquoted(summary, reply, wording).filter((entry) => entry.condition.includes(`condition ${number}`));
}

const CASES = [
  {
    kind: "a native read's text test",
    number: 2,
    rows: SHELF_ROWS,
    quote: SHELF_QUOTE,
    settled: () => audiobooksRunSummary(),
    unsettled: () => audiobooksRunSummary(false),
    instructions: [AUDIOBOOKS_INSTRUCTION]
  },
  {
    kind: "a processing condition",
    number: 1,
    rows: CATALOGUE_ROWS,
    quote: CATALOGUE_QUOTE,
    settled: () => processingCatalogue(),
    unsettled: () => processingCatalogue({ changeAccount: (account) => {
      delete account.conditions![0]!.evaluation;
      for (const row of account.conditions![0]!.leftOutOnlyByThis) delete row.tested;
    } }),
    instructions: [{ title: "Goal", body: CATALOGUE_REQUEST }]
  }
];

describe.each(CASES)("$kind, once Core settles its rows", ({ number, rows, quote, settled, unsettled, instructions }) => {
  const held = (summary: AutomationStudioRunResultSummary, reply: string) => heldFor(summary, instructions, number, reply);
  const everyRow = `${rows.join(", and ")} are left out, as the request says "${quote}".`;
  const heldWhole = (reply: string) => {
    const [entry] = held(settled(), reply);
    expect(entry, reply).toMatchObject({ bound: true, boundKind: "text" });
    expect(entry!.rows).toHaveLength(rows.length);
  };

  it("holds every row named beside a request quote, which unsettled rows would take", () => {
    expect(held(unsettled(), everyRow)).toEqual([]);
    heldWhole(everyRow);
  });

  it("holds each row named in a sentence of its own beside a request quote", () => {
    const each = rows.map((row) => `${row} is left out, as the request says "${quote}".`).join(" ");
    expect(held(unsettled(), each)).toEqual([]);
    heldWhole(each);
  });

  it("holds every row named with the quote lent by the sentence beside them", () => {
    heldWhole(`${rows.join(", and ")} are left out. The request says "${quote}".`);
  });

  it("takes the one sentence that names the condition and itself quotes the request", () => {
    expect(held(settled(), `Condition ${number} carries out "${quote}".`)).toEqual([]);
  });

  it("holds that sentence with its quotation marks stripped", () => {
    heldWhole(`Condition ${number} carries out ${quote}.`);
  });

  it("holds the condition named beside a sentence that quotes the request: no quote is lent to it", () => {
    heldWhole(`Condition ${number} is what the Flow applied. The request says "${quote}".`);
  });
});

describe("a group of conditions Core settles, left out together", () => {
  const held = (reply: string) => {
    const summary = settledTogetherRunSummary();
    return automationStudioResultLeftOutRowsUnquoted(summary, reply, settledTogetherWording(summary)).filter((entry) => entry.rows.some((row) => row.includes(SETTLED_TOGETHER_ROW)));
  };

  // Not the words "reference" or "format": each is a column the answer does not store, and a quote holding one names its member by itself.
  it("holds the group's row named beside a request quote, under each member", () => {
    const reply = `The ${SETTLED_TOGETHER_ROW} row is left out, as the request says "a printed book".`;
    expect(held(reply).map((entry) => entry.condition)).toEqual(SETTLED_TOGETHER_NAMES.slice(0, 2));
    expect(held(reply).every((entry) => entry.bound === true)).toBe(true);
  });

  it("takes a sentence that names one member and itself quotes the request", () => {
    expect(held('Condition 2 carries out "a printed book".')).toEqual([]);
  });
});
