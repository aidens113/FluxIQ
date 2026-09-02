import { describe, expect, it } from "vitest";
import { reconcileVisibleSelection } from "./program-selection";

describe("global program visible selection", () => {
  const idOf = (item: { id: string }) => item.id;

  it("keeps a visible selection and moves filtered, deleted, or off-page selections", () => {
    expect(reconcileVisibleSelection([{ id: "a" }, { id: "b" }], "b", idOf)).toBe("b");
    expect(reconcileVisibleSelection([{ id: "a" }], "b", idOf)).toBe("a");
    expect(reconcileVisibleSelection([], "b", idOf)).toBe("");
  });
});
