// A refuted no's re-ask says Core's record covers only the rows it names, and
// names the kept rows Core flagged (t663, A8 towels `run-mvahlxuu-760d9e28`,
// fix 2). Words only: the hold on a yes is `../../verdict.ts`'s.
import { describe, expect, it, vi } from "vitest";
import { automationStudioResultVerificationAgreement, automationStudioResultVerificationReaskContradicted } from "../../agreement/index.ts";
import { automationStudioResultRefutedNoRecheckWords } from "../../refuted-no/index.ts";
import { LAMPS_INSTRUCTION, LAMPS_REQUEST_TEXT, SAME_LAMP_NO, lampsRunSummary } from "../../refuted-no/tests/lamps-fixture.ts";
import { automationStudioResultVerdict } from "../../verdict.ts";
import { automationStudioResultKeptNotNamingTheItem } from "../kept-not-naming-the-item.ts";
import { automationStudioResultKeptWithoutAskedColumn } from "../kept-without-asked-column.ts";
import { automationStudioRequestPhrases } from "../request-phrases.ts";
import { automationStudioRequestWording } from "../request-wording.ts";
import { BOOKMARK, ORGANIZER, SCREW_PACKS, SCREW_REQUEST, atlasWithBookmarkSummary, screwRunSummary } from "./kept-rows-fixture.ts";

const FINDINGS = ["Condition 2 (pickup) alone left out 3 rows, each read by Core as failing it."];
const SCOPE = "That record speaks only of the rows it names: it says nothing of whether each row the result keeps is one the request asks for.";

describe("the re-ask of a refuted no", () => {
  it("names a kept row Core flagged for a missing answer column, with the column", () => {
    const words = automationStudioResultRefutedNoRecheckWords(FINDINGS, automationStudioResultKeptWithoutAskedColumn(atlasWithBookmarkSummary()));
    expect(words).toContain(SCOPE);
    expect(words).toContain(`${BOOKMARK} has no value in the column "pages"`);
    expect(words).toContain(FINDINGS[0]);
  });

  it("names a kept row Core flagged for not writing the item phrase, with the phrase", () => {
    const flags = automationStudioResultKeptNotNamingTheItem(screwRunSummary([...SCREW_PACKS, ORGANIZER]), automationStudioRequestPhrases(SCREW_REQUEST));
    expect(automationStudioResultRefutedNoRecheckWords(FINDINGS, flags)).toContain(`${ORGANIZER} has a name that does not write "wood screws"`);
  });

  it("still says what the record covers where nothing is flagged, and names no row", () => {
    const words = automationStudioResultRefutedNoRecheckWords(FINDINGS);
    expect(words).toContain(SCOPE);
    expect(words).not.toContain("Of the rows the result keeps");
    expect(words).not.toContain(BOOKMARK);
    expect(words).not.toMatch(/answer yes/iu);
  });
});

// The wiring (round 2): the agreement hands the flagged kept rows to the re-ask
// of a refuted no (`../../agreement/`, `../../refuted-no/reask.ts`). The
// lamps run of t607 -- a double no calling two distinct stored listings one,
// which Core refutes -- with four more lamps stored, and a desk lamp bulb pack
// kept without a rating.
describe("the agreement's re-ask of a refuted no", () => {
  const BULBS = "Halden Desk Lamp Bulb Pack, 2 Bulbs";
  const base = lampsRunSummary();
  const more = ["Arden Swing Arm Desk Lamp, Black", "Brisk Folding Desk Lamp, White", "Copse Wooden Desk Lamp, Oak"]
    .map((name, index) => ({ name, price: `$3${index}.00`, rating: "4.4", url: `/shop/lamp-${index}/p/LMP9Q${index}W7E5` }));
  const rows = [...base.recordSets[0]!.sampleRows!, ...more, { name: BULBS, price: "$9.00", url: "/shop/halden-bulbs/p/LMP5H3J8K2" }];
  const summary = { ...base, totalRecordCount: rows.length, recordSets: [{ ...base.recordSets[0]!, recordCount: rows.length, rowsChecked: rows.length, sampleRows: rows }] };
  const wording = automationStudioRequestWording([LAMPS_INSTRUCTION], summary)!;
  const no = () => automationStudioResultVerdict({ summary, wording, diagnosis: { answersRequest: "no", ...SAME_LAMP_NO }, basis: "model" });
  const input = { first: no(), second: no(), confirmAnswer: true, reads: summary.reads, recordSets: summary.recordSets, wording, summary, requestText: LAMPS_REQUEST_TEXT };

  it("names the flagged kept row in the recheck it asks each call with", async () => {
    const settled = automationStudioResultVerificationAgreement(input);
    expect(settled.refutedNo).toMatchObject({ calls: [1, 2] });
    const ask = vi.fn(async () => no());
    await automationStudioResultVerificationReaskContradicted({ ...input, settled, ask });
    expect(ask).toHaveBeenCalled();
    const recheck = String((ask.mock.calls[0] as unknown[])[0]);
    expect(recheck).toContain(SCOPE);
    expect(recheck).toContain(`${BULBS} has no value in the column "rating"`);
  });
});
