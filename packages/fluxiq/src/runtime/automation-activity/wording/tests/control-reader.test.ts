import { describe, expect, it } from "vitest";
import type { AutomationStudioActivityControlReader } from "../../../../framework/automation-service/nodes/index.ts";
import { runWithAutomationStudioDomainReadings } from "../../../domain-readings/index.ts";
import { automationStudioActivityAction } from "../action.ts";
import { automationStudioActivityControlOf } from "../control-reader.ts";

const reader: AutomationStudioActivityControlReader = (parameters) => {
  const control = (parameters as { control?: { names?: unknown[]; kinds?: unknown[] } } | undefined)?.control;
  return control ? { names: control.names ?? [], kinds: control.kinds ?? [] } : undefined;
};
const CLICK = "acme.output.press-click";
const withReader = <T>(fn: () => T): T => runWithAutomationStudioDomainReadings({ activityControlReader: reader }, fn);

describe("the domain's reading of the control a step carries", () => {
  it("names no control with no domain in scope, and says the verb alone", () => {
    const parameters = { control: { names: ["Save"] }, element: { label: "Save", accessibleName: "Save", visibleText: "Save" } };
    expect(automationStudioActivityControlOf(parameters)).toBeUndefined();
    expect(automationStudioActivityAction({ id: CLICK, parameters })).toBe("Clicking on the page");
    expect(automationStudioActivityAction({ parameters, notShown: true })).toBe("Skipped a step: what it acts on was not shown");
  });

  it("says the first name a person can read, in the domain's order", () => {
    const said = (names: unknown[]) => withReader(() => automationStudioActivityAction({ id: CLICK, parameters: { control: { names } } }));
    expect(said(["Save", "Other"])).toBe("Clicking “Save”");
    expect(said([undefined, 7, "  ", "Other"])).toBe("Clicking “Other”");
    expect(said([])).toBe("Clicking on the page");
  });

  it("tells a box from an option by the domain's plain widget words", () => {
    const said = (kinds: unknown[], checked = true) => withReader(() => automationStudioActivityAction({ id: "acme.output.check", parameters: { checked, control: { names: ["Gift"], kinds } } }));
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
});
