import { describe, expect, it } from "vitest";
import { automationStudioTrialNotRun, type AutomationStudioTrialActLedgerEntry } from "../../../index.ts";

// The steps a trial never ran on some passes (t796): from the act ledger, one entry per step and reason.

const guard = { nodeId: "banner", label: "close the library banner" };
const hold: AutomationStudioTrialActLedgerEntry = {
  nodeId: "hold", definitionId: "library.press", label: "place a hold", key: "n3", lasting: true, guard, repeat: { nodeId: "each", passes: 3 },
  passes: [
    { pass: 1, status: "not_run", why: "guarded", after: guard.label },
    { pass: 2, step: 9, status: "ran", act: "changed" },
    { pass: 3, status: "not_run", why: "unreached" }
  ]
};

describe("the steps not run, from the act ledger", () => {
  it("lists a lasting step once per reason, with the passes it was not run on and of how many", () => {
    expect(automationStudioTrialNotRun([hold])).toEqual([
      { nodeId: "hold", definitionId: "library.press", label: "place a hold", key: "n3", reason: "guarded", after: guard.label, passes: [1], of: 3, lasting: true },
      { nodeId: "hold", definitionId: "library.press", label: "place a hold", key: "n3", reason: "unreached", passes: [3], of: 3, lasting: true }
    ]);
  });

  it("lists a step that does no lasting act only where a guard went past it", () => {
    const wait: AutomationStudioTrialActLedgerEntry = { ...hold, nodeId: "settle", definitionId: "builtin.timing.wait", label: "wait", lasting: false };
    delete wait.key;
    expect(automationStudioTrialNotRun([wait])).toEqual([{ nodeId: "settle", definitionId: "builtin.timing.wait", label: "wait", reason: "guarded", after: guard.label, passes: [1], of: 3, lasting: false }]);
  });

  it("numbers the run outside a repeat as pass 1, with no of, and lists nothing for a step that ran", () => {
    const outside: AutomationStudioTrialActLedgerEntry = { nodeId: "renew", definitionId: "library.press", label: "renew the card", lasting: true, passes: [{ status: "not_run", why: "unreached" }] };
    const ran: AutomationStudioTrialActLedgerEntry = { ...outside, nodeId: "pay", passes: [{ step: 2, status: "ran", act: "changed" }] };
    expect(automationStudioTrialNotRun([outside, ran])).toEqual([{ nodeId: "renew", definitionId: "library.press", label: "renew the card", reason: "unreached", passes: [1], lasting: true }]);
  });
});
