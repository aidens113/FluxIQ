// The four records as one list (plan D6, discovery section 5).

import { parseAutomationStudioAttemptAct } from "@fluxiq/contracts/automation";
import { describe, expect, it } from "vitest";
import type { AutomationStudioSiteResetProjectSnapshot } from "../../../../flow-authoring/bootstrap/site-reset/index.ts";
import { AutomationStudioAttemptActRecord, automationStudioAttemptActMergedData, automationStudioAttemptActsFromBuildRecord, automationStudioAttemptActsFromProjectLedger, automationStudioAttemptActsFromRunActs, automationStudioAttemptActsFromTrialLedger, parseAutomationStudioAttemptActRecordData } from "../../index.ts";

const LEDGER: AutomationStudioSiteResetProjectSnapshot = {
  nextAct: 4,
  acts: [
    { act: "act-1", did: "Added a line to the basket", owner: "b1", ref: "r1", undoable: true, inPlace: true, left: "yes" },
    { act: "act-2", did: "Removed a line", owner: "b1", ref: "r2", undoable: true, inPlace: false, left: "no" },
    { act: "act-3", did: "<button>press</button>", owner: "b2", ref: "r3", undoable: false, possible: true, inPlace: false, left: "possibly" }
  ]
};
const BUILD = [
  { recordedAt: 1, act: "act-1", owner: { role: "supervisor" as const }, consequences: ["create_new" as const, "move_money" as const], description: "Added a line", undoable: true },
  { recordedAt: 1, act: "act-9", owner: { role: "supervisor" as const }, consequences: ["delete" as const], description: "Deleted a line", undoable: false }
];

describe("each source", () => {
  it("reads a ledger's settlement as a state", () => {
    expect(automationStudioAttemptActsFromProjectLedger(LEDGER).map((act) => [act.sourceId, act.state, act.undeclared])).toEqual([
      ["act-1", "landed", undefined], ["act-2", "undone", undefined], ["act-3", "may_have_landed", true]
    ]);
  });

  it("reads a trial's lasting passes only", () => {
    const merged = automationStudioAttemptActsFromTrialLedger([
      { nodeId: "n1", definitionId: "d.press", label: "Press", key: "s1", lasting: true, passes: [{ status: "ran", act: "changed", step: 1 }] },
      { nodeId: "n2", definitionId: "d.press", label: "Press again", lasting: true, passes: [{ status: "ran", act: "no_change_seen", step: 2 }] },
      { nodeId: "n3", definitionId: "d.press", label: "In state", lasting: true, passes: [{ status: "ran", act: "already_in_state" }, { status: "skipped", why: "already_done" }, { status: "not_run", why: "unreached" }, { status: "refused", why: "covered" }] },
      { nodeId: "n4", definitionId: "d.press", label: "Lost", lasting: true, passes: [{ status: "failed", code: "run.outcome_uncertain" }, { status: "failed", code: "web.other" }] },
      { nodeId: "n5", definitionId: "d.look", label: "Guard", lasting: false, passes: [{ status: "ran" }] },
      { nodeId: "n6", definitionId: "d.press", label: "Each", key: "s6", lasting: true, repeat: { nodeId: "loop", passes: 2 }, passes: [{ pass: 1, status: "ran", act: "changed" }, { pass: 2, status: "ran", act: "changed" }] }
    ]);
    expect(merged.map((act) => [act.sourceId, act.state, act.steps])).toEqual([
      ["trial/n1/1", "landed", ["step:s1"]],
      ["trial/n2/1", "may_have_landed", ["node:n2"]],
      ["trial/n4/1", "may_have_landed", ["node:n4"]],
      ["trial/n6/1", "landed", undefined],
      ["trial/n6/2", "landed", undefined]
    ]);
  });

  it("reads a run's completed acts as landed, knowing a row-less one by its node", () => {
    expect(automationStudioAttemptActsFromRunActs([
      { key: "flow/n1/abc", nodeId: "n1", attemptId: "n1.attempt.1", outputs: {} },
      { key: "flow/n2/def", nodeId: "n2", attemptId: "n2.attempt.1", outputs: {}, row: "Oak Desk" }
    ]).map((act) => [act.sourceId, act.state, act.steps, act.what])).toEqual([
      ["flow/n1/abc", "landed", ["node:n1"], "Did a step of the Flow"],
      ["flow/n2/def", "landed", undefined, "Did a step of the Flow"]
    ]);
  });
});

describe("merged", () => {
  const data = () => automationStudioAttemptActMergedData([
    automationStudioAttemptActsFromProjectLedger(LEDGER),
    automationStudioAttemptActsFromBuildRecord(BUILD),
    automationStudioAttemptActsFromTrialLedger([{ nodeId: "n1", definitionId: "d.press", label: "Press", key: "s1", lasting: true, passes: [{ status: "ran", act: "changed", step: 1 }] }]),
    automationStudioAttemptActsFromRunActs([{ key: "flow/n1/abc", nodeId: "n1", attemptId: "n1.attempt.1", outputs: {} }])
  ], () => 5);

  it("is one entry per act: the ledger's state, the record's classes and undo", () => {
    const acts = new AutomationStudioAttemptActRecord({ seed: data() }).acts();
    const first = acts.find((act) => act.what === "Added a line to the basket");
    expect(first).toMatchObject({ state: "landed", classes: ["move_money", "create_new"], undo: { how: "Through the site's own controls" } });
    expect(acts.filter((act) => act.what.startsWith("Added"))).toHaveLength(1);
    expect(acts.find((act) => act.what === "Deleted a line")).toMatchObject({ classes: ["delete"], state: "landed" });
    expect(acts.find((act) => act.what === "Removed a line")).toMatchObject({ state: "undone" });
  });

  it("is data a record reads strictly, and acts the contract's parser accepts, with a possibly lasting press left out", () => {
    expect(parseAutomationStudioAttemptActRecordData(data()).ok).toBe(true);
    const record = new AutomationStudioAttemptActRecord({ seed: data() });
    for (const act of record.acts()) expect(parseAutomationStudioAttemptAct(act)).toEqual({ ok: true, act });
    expect(record.acts().some((act) => act.what.includes("button"))).toBe(false);
    expect(record.forModel().acts).toContainEqual(expect.objectContaining({ undeclared: true, what: "Pressed a control that changed the page" }));
  });

  it("knows a trial's or a run's step by its name, so the same step of the Flow is carried, and an act named only in words never is", () => {
    const record = new AutomationStudioAttemptActRecord({ seed: data() });
    expect(record.carried({ actionId: "any", parameters: {}, steps: ["node:other", "step:s1"] })).toMatchObject({ what: "Press", state: "landed" });
    expect(record.carried({ actionId: "any", parameters: {}, steps: ["node:n1"] })).toMatchObject({ what: "Did a step of the Flow" });
    expect(record.carried({ actionId: "any", parameters: {}, steps: ["node:other"] })).toBeUndefined();
    expect(record.admit({ actionId: "any", parameters: {}, consequences: ["delete"], stage: "exploration" })).toEqual({ kind: "run" });
  });
});
