// Which left-out rows name the asked item, from live run `run-muw60j7c-bb7c9a62`
// (debug C-2): both build-test judges said yes though the name condition alone
// left out three pairs of earbuds sold with a charging case, beside two real
// accessories. The pairs are flagged; the accessories, which name their excluded
// phrase first, are not.
import { describe, expect, it } from "vitest";
import { automationStudioResultLeftOutNamingTheItem, automationStudioResultSummaryWithLeftOutNamingTheItem } from "../index.ts";
import {
  RUN_MUW60J7C_FILTERED_READ, RUN_MUW60J7C_PAIRS_LEFT_OUT, RUN_MUW60J7C_REQUEST,
  runMuw60j7cRunSummary, runMuw60j7cTestSummary
} from "./run-muw60j7c.ts";

describe("rows a condition alone left out that name the asked item", () => {
  it("flags the build test's three pairs and not its two accessories (step 0031)", () => {
    expect(automationStudioResultLeftOutNamingTheItem(runMuw60j7cTestSummary(), RUN_MUW60J7C_REQUEST)).toEqual([
      { step: 10, condition: "name", item: "wireless earbuds", also: ["charging cases"], rows: RUN_MUW60J7C_PAIRS_LEFT_OUT }
    ]);
  });

  it("flags the same pairs on the finished run's read, by its node (step 0039)", () => {
    expect(automationStudioResultLeftOutNamingTheItem(runMuw60j7cRunSummary(), RUN_MUW60J7C_REQUEST)).toEqual([
      { nodeId: RUN_MUW60J7C_FILTERED_READ, condition: "name not contains [\"ear tips\", \"charging case\", \"eartips\"]", item: "wireless earbuds", also: ["charging cases"], rows: RUN_MUW60J7C_PAIRS_LEFT_OUT }
    ]);
  });

  it("never flags a condition that tested another column, though its rows name the item first", () => {
    const flagged = automationStudioResultLeftOutNamingTheItem(runMuw60j7cTestSummary(), RUN_MUW60J7C_REQUEST);
    expect(flagged.map((entry) => entry.condition)).toEqual(["name"]);
  });

  it("flags nothing where the kept rows do not all name one request phrase first", () => {
    const summary = runMuw60j7cTestSummary();
    const step = summary.buildTest!.steps.find((candidate) => candidate.step === 10)!;
    const readRows = (step.observed as { readRows: { rows: string[] } }).readRows;
    readRows.rows = [...readRows.rows, "Replacement Ear Tips for Wireless Earbuds, Memory Foam Eartips, 3 Pairs (S/M/L), Black"];
    expect(automationStudioResultLeftOutNamingTheItem(summary, RUN_MUW60J7C_REQUEST)).toEqual([]);
  });

  it("sets the summary member only when there are rows to flag", () => {
    const instruction = { title: "Evidence-guided generation goal", body: RUN_MUW60J7C_REQUEST };
    expect(automationStudioResultSummaryWithLeftOutNamingTheItem(runMuw60j7cTestSummary(), [instruction]).leftOutNamingTheItem).toHaveLength(1);
    const { buildTest: _test, ...plain } = runMuw60j7cTestSummary();
    expect("leftOutNamingTheItem" in automationStudioResultSummaryWithLeftOutNamingTheItem(plain, [instruction])).toBe(false);
  });
});
