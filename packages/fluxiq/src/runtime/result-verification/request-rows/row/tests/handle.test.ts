// t1087: a stored row's handle is its label and its rank among the rows sharing it.
import { describe, expect, it } from "vitest";
import { AutomationStudioRequestRowHandle } from "../handle.ts";

describe("a stored row's handle", () => {
  it("is given only to a row whose label another row has, ranked in the order the rows are held", () => {
    expect(AutomationStudioRequestRowHandle.of(["Alpha", "Beta", "Alpha", "Gamma", "Alpha"])).toEqual(["Alpha #1", undefined, "Alpha #2", undefined, "Alpha #3"]);
  });

  it("compares labels as a citation does: case, spacing and a closing stop do not tell them apart", () => {
    expect(AutomationStudioRequestRowHandle.of(["Alpha  one.", "alpha one"])).toEqual(["Alpha  one. #1", "alpha one #2"]);
  });

  it("gives no handle to blank labels, and none where every label is its own", () => {
    expect(AutomationStudioRequestRowHandle.of(["", ""])).toEqual([undefined, undefined]);
    expect(AutomationStudioRequestRowHandle.of(["a", "b"])).toEqual([undefined, undefined]);
  });

  it("reads a handle back as its label and rank, and nothing that ends in no rank", () => {
    expect(AutomationStudioRequestRowHandle.read("Alpha one #2")).toEqual({ label: "Alpha one", rank: 2 });
    expect(AutomationStudioRequestRowHandle.read("Alpha one")).toBeUndefined();
    expect(AutomationStudioRequestRowHandle.read("Alpha #0")).toBeUndefined();
    expect(AutomationStudioRequestRowHandle.read("#3")).toBeUndefined();
  });
});
