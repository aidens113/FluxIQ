// Rows two or more conditions left out together, where one or more of those
// conditions is one Core settles (t795 w1b): every row of the group fails every
// member, so it is accounted for when any one settled member is, by the
// settled rule -- named, in a sentence that itself quotes the request's own
// words, and not by a quote that names only another condition (F1 d) -- with no
// row named row by row. Social runs `run-mvskodlp-9966d618` and
// `run-mvswewhy-e4e469d4` gave correct yeses that quoted the request for a
// settled condition and were held for such a group. A yes that accounts for no
// settled member is held: under each member where all are settled, row by row
// where one is not. A library catalog (`./settled-together-fixture.ts`).
import { describe, expect, it } from "vitest";
import { automationStudioRequestRowsReads } from "../../../summary-reads.ts";
import { automationStudioResultLeftOutRowsUnquoted } from "../../../unquoted-rows.ts";
import {
  SETTLED_TOGETHER_CONDITIONS, SETTLED_TOGETHER_FORMAT_ROW, SETTLED_TOGETHER_NAMES, SETTLED_TOGETHER_ROW, settledTogetherRunSummary, settledTogetherWording
} from "./settled-together-fixture.ts";

/** Condition 1 named beside the request's own words in its own sentence. */
const CONDITION_1 = "Condition 1 (reference is absent) carries out \"leaving out reference copies\".";
/** Condition 1 named, with a reason of the judge's own. */
const CONDITION_1_UNQUOTED = "Condition 1 (reference is absent) leaves out the library's own desk editions.";
/** Condition 2 named beside the request's own words in its own sentence. */
const CONDITION_2 = "Condition 2 (format equals Book) carries out \"anything whose format is not a printed book\".";
/** Condition 2 named, with a reason of the judge's own. */
const CONDITION_2_UNQUOTED = "Condition 2 (format equals Book) leaves out what is not a printed book.";
/** Condition 2 named beside a quote of the request whose own words are only condition 1's. */
const CONDITION_2_LENT = "Condition 2 (format equals Book) goes with \"leaving out reference copies\".";
/** The group's row, named with no quote of its own. */
const GROUP_NAMED = `The ${SETTLED_TOGETHER_ROW} row was left out by conditions 1 and 2.`;

const held = (reply: string, summary = settledTogetherRunSummary()) => automationStudioResultLeftOutRowsUnquoted(summary, reply, settledTogetherWording(summary));

describe("a group of settled conditions, as a summary's reads hold it", () => {
  it("carries each member's name, the words it is named by, its kind and its wording", () => {
    const [read] = automationStudioRequestRowsReads(settledTogetherRunSummary(), false, { together: true }).reads;
    const group = read?.conditions.find((condition) => condition.together);
    expect(group?.settled).toBeUndefined();
    expect(group?.settledMembers).toEqual([
      { condition: SETTLED_TOGETHER_NAMES[0], names: [["condition", "1"], ["reference"]], kind: "presence", test: { number: 1, wording: SETTLED_TOGETHER_CONDITIONS[0] } },
      { condition: SETTLED_TOGETHER_NAMES[1], names: [["condition", "2"], ["format"]], kind: "text", test: { number: 2, wording: SETTLED_TOGETHER_CONDITIONS[1] } }
    ]);
  });

  it("carries only the settled members where one is not settled", () => {
    const [read] = automationStudioRequestRowsReads(settledTogetherRunSummary([1, 3]), false, { together: true }).reads;
    expect(read?.conditions.find((condition) => condition.together)?.settledMembers?.map((member) => member.condition)).toEqual([SETTLED_TOGETHER_NAMES[0]]);
  });
});

describe("rows settled conditions left out together, accounted for by any one of them (t795 w1b)", () => {
  it("takes a yes that quotes the request's own exclusion for each condition, with the group's row named or not", () => {
    expect(held([CONDITION_1, CONDITION_2, GROUP_NAMED].join("\n"))).toEqual([]);
    expect(held([CONDITION_1, CONDITION_2].join("\n"))).toEqual([]);
  });

  it("takes the group's row where one condition's own sentence quotes the request, and judges the other's own rows as before", () => {
    expect(held([CONDITION_1, CONDITION_2_UNQUOTED, GROUP_NAMED].join("\n"))).toEqual([
      // Condition 2's own row, as before (t790); the group's row fails condition 1 too, whose exclusion is quoted.
      { nodeId: "read", condition: SETTLED_TOGETHER_NAMES[1], rows: [SETTLED_TOGETHER_FORMAT_ROW], bound: true, boundKind: "text" }
    ]);
  });

  it("holds the group's row under each condition where no condition's sentence quotes the request", () => {
    const unheld = held([CONDITION_1_UNQUOTED, CONDITION_2_UNQUOTED, GROUP_NAMED].join("\n"));
    expect(unheld).toContainEqual({ nodeId: "read", condition: SETTLED_TOGETHER_NAMES[0], rows: [SETTLED_TOGETHER_ROW], bound: true, boundKind: "presence" });
    expect(unheld).toContainEqual({ nodeId: "read", condition: SETTLED_TOGETHER_NAMES[1], rows: [SETTLED_TOGETHER_ROW], bound: true, boundKind: "text" });
  });

  it("takes a quote of the other condition's own exclusion as that condition's, which the group's row also fails (F1 d)", () => {
    // Condition 2's sentence quotes only condition 1's words: no reason for condition 2 (F1 d), but condition 1's stated
    // exclusion, quoted beside a word naming it, and the group's row fails condition 1 too.
    expect(held([CONDITION_1_UNQUOTED, CONDITION_2_LENT].join("\n")).filter((entry) => entry.rows.includes(SETTLED_TOGETHER_ROW))).toEqual([]);
  });

  it("takes no quote lent from the sentence beside the condition's own", () => {
    // The lending sentence names neither condition 2 nor its column: a quote that wrote "format" would name it itself (t790).
    const reply = [CONDITION_1_UNQUOTED, `${CONDITION_2_UNQUOTED} The rows keep "not a printed book".`].join("\n");
    expect(held(reply)).toContainEqual({ nodeId: "read", condition: SETTLED_TOGETHER_NAMES[1], rows: [SETTLED_TOGETHER_ROW], bound: true, boundKind: "text" });
  });
});

describe("rows left out together by a group with a condition Core does not settle", () => {
  const summary = settledTogetherRunSummary([1, 3]);
  const GROUP = `conditions 1 and 3 (${SETTLED_TOGETHER_CONDITIONS[0]}; ${SETTLED_TOGETHER_CONDITIONS[2]})`;

  it("are taken where its settled condition's own sentence quotes the request", () => {
    expect(held([CONDITION_1, CONDITION_2].join("\n"), summary)).toEqual([]);
  });

  it("are held row by row where no settled condition is quoted", () => {
    const reply = [CONDITION_1_UNQUOTED, CONDITION_2, `The ${SETTLED_TOGETHER_ROW} row was left out by conditions 1 and 3.`].join("\n");
    expect(held(reply, summary)).toContainEqual({ nodeId: "read", condition: GROUP, rows: [SETTLED_TOGETHER_ROW] });
  });

  it("are taken when the row is named beside a quote of the request's own words that names one of its conditions", () => {
    const reply = [CONDITION_1_UNQUOTED, CONDITION_2, `The ${SETTLED_TOGETHER_ROW} row is a reference copy, as the request says "leaving out reference copies".`].join("\n");
    expect(held(reply, summary).filter((entry) => entry.condition === GROUP)).toEqual([]);
  });
});
