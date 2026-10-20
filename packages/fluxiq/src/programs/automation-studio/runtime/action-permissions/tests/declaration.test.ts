// How Core reads a declaration's place tokens: the item and dialog a control
// sits in (t475), and what it and its page are about (t719), which the build's
// site reset ties an undo to its act by. Opaque, short and optional; anything
// else is a declaration Core could not read, and the action does not proceed.

import { describe, expect, it } from "vitest";
import { AutomationStudioActionDeclarationError, readAutomationStudioActionDeclaration } from "../index.ts";

const PRESS = { consequences: ["delete"], control: { name: "Delete", kind: "button" }, verb: "press" };

describe("a declaration's place tokens", () => {
  it("accepts only a bounded opaque optional resource, without changing consequence semantics", () => {
    expect(readAutomationStudioActionDeclaration({ ...PRESS, control: { ...PRESS.control, resource: "r:trusted" } })).toMatchObject({ controlResource: "r:trusted", consequences: ["delete"] });
    expect(readAutomationStudioActionDeclaration(PRESS).controlResource).toBeNull();
    for (const resource of ["", "raw session and tab", "x".repeat(129), 7, null]) expect(() => readAutomationStudioActionDeclaration({ ...PRESS, control: { ...PRESS.control, resource } })).toThrow(AutomationStudioActionDeclarationError);
  });
  it("reads the subject and page tokens beside the item and dialog, and none where the domain gave none", () => {
    expect(readAutomationStudioActionDeclaration({ ...PRESS, control: { ...PRESS.control, item: "i:line", dialog: "d:drawer", subject: "s:kettle", page: "s:basket" } })).toMatchObject({
      controlItem: "i:line",
      controlDialog: "d:drawer",
      controlSubject: "s:kettle",
      controlPage: "s:basket"
    });
    expect(readAutomationStudioActionDeclaration(PRESS)).toMatchObject({ controlItem: null, controlDialog: null, controlSubject: null, controlPage: null });
  });

  it("refuses a subject or page that is not a short opaque token, and any other control field", () => {
    for (const control of [{ subject: "a kettle, in words" }, { page: "x".repeat(129) }, { subject: 7 }, { heading: "s:kettle" }]) {
      expect(() => readAutomationStudioActionDeclaration({ ...PRESS, control: { ...PRESS.control, ...control } })).toThrow(AutomationStudioActionDeclarationError);
    }
  });

  // L1 reset settlement: the control's own slot on its page and its state there before the action.
  it("reads the control's place and state tokens, and none where the domain gave none", () => {
    expect(readAutomationStudioActionDeclaration({ ...PRESS, control: { ...PRESS.control, place: "p:slot", state: "v:off" } })).toMatchObject({ controlPlace: "p:slot", controlState: "v:off" });
    expect(readAutomationStudioActionDeclaration(PRESS)).toMatchObject({ controlPlace: null, controlState: null });
  });

  it("refuses a place or state that is not a short opaque token as control_place_invalid", () => {
    for (const control of [{ place: "a slot, in words" }, { place: "" }, { state: "x".repeat(129) }, { state: 7 }, { place: null }]) {
      let code: string | undefined;
      try {
        readAutomationStudioActionDeclaration({ ...PRESS, control: { ...PRESS.control, ...control } });
      } catch (error) {
        code = error instanceof AutomationStudioActionDeclarationError ? error.code : undefined;
      }
      expect(code).toBe("control_place_invalid");
    }
  });
});
