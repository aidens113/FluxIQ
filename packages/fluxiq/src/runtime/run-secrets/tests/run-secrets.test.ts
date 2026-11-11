// A run's secrets (`../`): set around a run and read anywhere in its async chain only, kept by a
// child run, and withheld from any value and from what a dispatch's saved attempt withholds.
import { describe, expect, it } from "vitest";
import { automationStudioRunSecrets, automationStudioWithoutRunSecrets, automationStudioWithRunSecretTexts, runWithAutomationStudioRunSecrets } from "../index.ts";

describe("a run's secrets", () => {
  it("are read only inside the run that set them, through awaits, and a child run keeps its parent's", async () => {
    expect(automationStudioRunSecrets()).toBeUndefined();
    const seen = await runWithAutomationStudioRunSecrets({ password: "hunter2", empty: "" }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      const inner = runWithAutomationStudioRunSecrets({ pin: "4321" }, () => automationStudioRunSecrets());
      return { outer: automationStudioRunSecrets(), inner };
    });
    expect(seen).toEqual({ outer: { password: "hunter2" }, inner: { password: "hunter2", pin: "4321" } });
    expect(automationStudioRunSecrets()).toBeUndefined();
    expect(runWithAutomationStudioRunSecrets({}, () => automationStudioRunSecrets())).toBeUndefined();
  });

  it("are withheld from every string of a value, keys too, keeping its shape and what holds none", () => {
    const untouched = { catalog: ["Find loans"] };
    const value = { said: "Typed hunter2 into the form", list: ["hunter2", 3, null], untouched, hunter2: true };
    const withheld = runWithAutomationStudioRunSecrets({ password: "hunter2" }, () => automationStudioWithoutRunSecrets(value));
    expect(withheld).toEqual({ said: "Typed [withheld] into the form", list: ["[withheld]", 3, null], untouched, "[withheld]": true });
    expect(withheld.untouched).toBe(untouched);
    expect(automationStudioWithoutRunSecrets(value)).toBe(value);
  });

  it("join what a dispatch withholds", () => {
    runWithAutomationStudioRunSecrets({ password: "hunter2" }, () => {
      expect(automationStudioWithRunSecretTexts({ texts: ["a"], numbers: [1] })).toEqual({ texts: ["a", "hunter2"], numbers: [1] });
      expect(automationStudioWithRunSecretTexts(undefined)).toEqual({ texts: ["hunter2"], numbers: [] });
    });
    expect(automationStudioWithRunSecretTexts(undefined)).toBeUndefined();
  });
});
