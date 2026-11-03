import { describe, expect, it } from "vitest";
import type { AutomationStudioActivityControlReader } from "../../../../framework/automation-service/nodes/index.ts";
import { automationStudioActivityAction } from "../action.ts";
import { automationStudioActivityControlOf, runWithAutomationStudioActivityControlReader } from "../control-reader.ts";

const reader: AutomationStudioActivityControlReader = (parameters) => {
  const control = (parameters as { control?: { names?: unknown[]; kinds?: unknown[] } } | undefined)?.control;
  return control ? { names: control.names ?? [], kinds: control.kinds ?? [] } : undefined;
};
const CLICK = "acme.output.press-click";

describe("the domain's reading of the control a step carries", () => {
  it("names no control with no domain in scope, and says the verb alone", () => {
    const parameters = { control: { names: ["Save"] }, element: { label: "Save", accessibleName: "Save", visibleText: "Save" } };
    expect(automationStudioActivityControlOf(parameters)).toBeUndefined();
    expect(automationStudioActivityAction({ id: CLICK, parameters })).toBe("Clicking on the page");
    expect(automationStudioActivityAction({ parameters, notShown: true })).toBe("Skipped a step: what it acts on was not shown");
  });

  it("says the first name a person can read, in the domain's order", () => {
    const said = (names: unknown[]) => runWithAutomationStudioActivityControlReader(reader, () => automationStudioActivityAction({ id: CLICK, parameters: { control: { names } } }));
    expect(said(["Save", "Other"])).toBe("Clicking “Save”");
    expect(said([undefined, 7, "  ", "Other"])).toBe("Clicking “Other”");
    expect(said([])).toBe("Clicking on the page");
  });

  it("tells a box from an option by the domain's plain widget words", () => {
    const said = (kinds: unknown[], checked = true) => runWithAutomationStudioActivityControlReader(reader, () => automationStudioActivityAction({ id: "acme.output.check", parameters: { checked, control: { names: ["Gift"], kinds } } }));
    expect(said(["checkbox"])).toBe("Ticking “Gift”");
    expect(said([undefined, " Switch "])).toBe("Ticking “Gift”");
    expect(said(["radio"])).toBe("Choosing “Gift”");
    expect(said(["", "option"])).toBe("Choosing “Gift”");
    expect(said([undefined, undefined])).toBe("Choosing “Gift”");
    expect(said(["button"])).toBe("Ticking “Gift”");
    expect(said(["radio"], false)).toBe("Unticking “Gift”");
  });

  it("is a box when neither the domain nor the call's words say anything", () => {
    expect(automationStudioActivityAction({ id: "acme.output.check", parameters: { checked: true } })).toBe("Ticking a box");
  });

  it("stays with the work it was entered for, so concurrent work never shares one", async () => {
    const other: AutomationStudioActivityControlReader = () => ({ names: ["Other"], kinds: [] });
    const ask = async (): Promise<unknown> => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return automationStudioActivityControlOf({ control: { names: ["Mine"] } })?.names[0];
    };
    const [mine, theirs, none] = await Promise.all([runWithAutomationStudioActivityControlReader(reader, ask), runWithAutomationStudioActivityControlReader(other, ask), ask()]);
    expect([mine, theirs, none]).toEqual(["Mine", "Other", undefined]);
  });

  it("leaves whatever a piece of work is already under when it is entered with none", () => {
    expect(runWithAutomationStudioActivityControlReader(reader, () => runWithAutomationStudioActivityControlReader(undefined, () => automationStudioActivityControlOf({ control: { names: ["Kept"] } })?.names[0]))).toBe("Kept");
  });
});
