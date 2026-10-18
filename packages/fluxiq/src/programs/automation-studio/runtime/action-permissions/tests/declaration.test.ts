// How Core reads a declaration's place tokens: the item and dialog a control
// sits in (t475), and what it and its page are about (t719), which the build's
// site reset ties an undo to its act by. Opaque, short and optional; anything
// else is a declaration Core could not read, and the action does not proceed.

import { describe, expect, it } from "vitest";
import { AutomationStudioActionDeclarationError, readAutomationStudioActionDeclaration } from "../index.ts";

const PRESS = { consequences: ["delete"], control: { name: "Delete", kind: "button" }, verb: "press" };

describe("a declaration's place tokens", () => {
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
});
