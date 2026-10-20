// The one rule for a part's input and output names (`../part-port-name.ts`,
// t741 B1): letters and digits, a lower-case letter first, at most 32, and
// never `item`, the name a loop's row takes. The plan's ports
// (`../../../project-agents/supervisor/plan-input.ts`) and a script's part
// interface (`../called-parts.ts`) both ask it.
import { describe, expect, it } from "vitest";
import { automationStudioFlowScriptPartPortName } from "../index.ts";

describe("a part's port name", () => {
  it.each(["items", "itemName", "row", "total", "a", `a${"b".repeat(31)}`])("takes %s", (name) => {
    expect(automationStudioFlowScriptPartPortName(name)).toBe(true);
  });

  it.each(["item", "Item", "the titles", "Total", "1st", "", `a${"b".repeat(32)}`, "row_count"])("refuses %j", (name) => {
    expect(automationStudioFlowScriptPartPortName(name)).toBe(false);
  });
});
