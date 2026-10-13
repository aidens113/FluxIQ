// The exclusions a no's advice adds that the request never states (t515, live
// run `run-mv6v2hx5-f448e662`, fix 4): one judge advised leaving out a row by
// words the request never says, the builder followed it, and the next revision
// lost a row the request asks for.
import { describe, expect, it } from "vitest";
import { automationStudioRequestUnstatedExclusions } from "../unstated-exclusions.ts";
import { requestWordsWording } from "./request-words-fixture.ts";

const unstated = (advice: string | undefined) => automationStudioRequestUnstatedExclusions(advice, requestWordsWording());

describe("an advice's exclusions, held to the request's words", () => {
  it("marks an exclusion by words the request never says", () => {
    expect(unstated("Add a condition to the read that excludes replacement parts such as the Replacement Handle row.")).toEqual([
      "excludes replacement parts such as the Replacement Handle row"
    ]);
  });

  it("marks a negated test and a passive exclusion by words the request never says", () => {
    expect(unstated("Add name does not contain \"Handle\" to the read.")).toEqual(["not contain \"Handle\" to the read"]);
    const passive = unstated("Keep only rows whose name says what was searched, so the handle row is excluded.");
    expect(passive).toHaveLength(1);
    expect(passive[0]).toContain("handle row is excluded");
  });

  it("marks an exclusion of everything that is not what the request searched by", () => {
    expect(unstated("Filter out accessories that are not garden tools.")).toEqual(["Filter out accessories that are not garden tools"]);
  });

  it("leaves an exclusion the request states", () => {
    expect(unstated("Add a condition excluding out-of-stock items.")).toEqual([]);
    expect(unstated("The out-of-stock row should be left out by a stock condition.")).toEqual([]);
  });

  it("leaves advice that removes a condition, or says not to exclude", () => {
    expect(unstated("Remove the unrequested name-contains condition so every in-stock result is kept.")).toEqual([]);
    expect(unstated("Keep the read as it is; do not exclude the handle row, and it should not be left out.")).toEqual([]);
  });

  it("leaves an exclusion of only the words any list request uses, or no advice", () => {
    expect(unstated("Exclude the extra rows.")).toEqual([]);
    expect(unstated(undefined)).toEqual([]);
  });
});
