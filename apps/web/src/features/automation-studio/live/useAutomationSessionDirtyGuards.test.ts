import { describe, expect, it, vi } from "vitest";
import { completeTreeSelection } from "./useAutomationSessionDirtyGuards";

describe("Automation Studio guarded hierarchy selection", () => {
  it("closes responsive UI only after committing the selected object", () => {
    const order: string[] = [];
    const select = vi.fn(() => order.push("select"));
    const after = vi.fn(() => order.push("after"));

    completeTreeSelection(select, after, { kind: "flow", id: "flow.checkout" });

    expect(order).toEqual(["select", "after"]);
    expect(select).toHaveBeenCalledWith({ kind: "flow", id: "flow.checkout" });
    expect(after).toHaveBeenCalledOnce();
  });
});
