// A press nothing gave words for says what it pressed in the control's own word ("Save"), not the class's line (t869).
// The word is in memory only, as an item's is, and it is screened as any words are.

import { parseAutomationStudioAttemptAct } from "@fluxiq/contracts/automation";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { AutomationStudioAttemptActRecord, automationStudioAttemptActControlName, type AutomationStudioAttemptActCall } from "../index.ts";

const press = (element: JsonObject): AutomationStudioAttemptActCall => ({ actionId: "press", parameters: { target: { handle: "t7" } }, consequences: ["modify_existing"], stage: "exploration", foreseen: { parameters: { element } } });

describe("the control's own word", () => {
  it("is its shortest words, not a structural field, an address or the words of a row it sits in", () => {
    expect(automationStudioAttemptActControlName({ element: { tag: "button", role: "button", accessibleName: "Save", visibleText: "Save this job", context: { row: "Senior Rust Engineer, Quillmark, Remote (UK)" } } })).toBe("Save");
    expect(automationStudioAttemptActControlName({ target: { element: { visibleText: "Save job" } } })).toBe("Save job");
    expect(automationStudioAttemptActControlName({ element: { href: "https://x.test/save", id: "save-1" } })).toBeUndefined();
    expect(automationStudioAttemptActControlName({ element: { visibleText: "Save the job and tell everybody on the board about it" } })).toBeUndefined();
    expect(automationStudioAttemptActControlName({})).toBeUndefined();
  });

  it("says a Save as Save where nothing gave the words, and keeps it out of what is persisted", () => {
    const record = new AutomationStudioAttemptActRecord();
    record.settled(press({ accessibleName: "Save", role: "button" }), { effectApplied: true, words: { what: "", where: "" } });
    const [act] = record.acts();
    expect(act!.what).toBe("Save");
    expect(act!.what).not.toContain("Changed something");
    expect(parseAutomationStudioAttemptAct(act)).toEqual({ ok: true, act });
    expect(JSON.stringify(record.data())).not.toContain("Save\"");
  });

  it("gives words the caller gave first, and the class's line where the control's word is refused", () => {
    const given = new AutomationStudioAttemptActRecord();
    given.settled(press({ accessibleName: "Save" }), { effectApplied: true, words: { what: "Bookmark", where: "" } });
    expect(given.acts()[0]!.what).toBe("Bookmark");
    const refused = new AutomationStudioAttemptActRecord();
    refused.settled(press({ accessibleName: "[data-x=save]" }), { effectApplied: true, words: { what: "", where: "" } });
    expect(refused.acts()[0]!.what).toBe("Changed something that was already there");
  });
});
