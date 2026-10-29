// How a build puts its permission questions to a person, answer by answer.
//
// The build used to ask once and only once, whatever came back: `asked` was
// set at the first question, so after a person said no to one press every
// later gated action was refused with that first request and nobody was asked
// again. Live, a `move_money` declared on "Continue to checkout" was declined,
// and "Place order" -- the press the task needed -- could then never be asked
// about (t195-w18). These drive `automationStudioFlowBootstrapActionPermissions`
// with a stand-in domain and a parking port that answers as scripted.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioActionDeclaration, AutomationStudioActionPermissionVerdict, AutomationStudioInstructedConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioAsk, AutomationStudioAskAnswer, AutomationStudioParkingPort } from "../../parking/index.ts";
import { automationStudioFlowBootstrapActionPermissions, automationStudioFlowBootstrapUnansweredSaid } from "../action-permissions.ts";
import { automationStudioInstructedActs } from "../instructed-acts/index.ts";
import type { AutomationStudioSiteResetWitnessStamp } from "../reset-admission/index.ts";
import { AutomationStudioSiteResetLedger, automationStudioSiteResetPlacedCall, type AutomationStudioSiteResetCalls } from "../site-reset/index.ts";

const CHECKOUT: AutomationStudioActionDeclaration = { consequences: ["move_money"], control: { name: "Continue to checkout", kind: "button" }, verb: "press" };
const PLACE: AutomationStudioActionDeclaration = { consequences: ["move_money"], control: { name: "Place order", kind: "button" }, verb: "press" };

it.each(["core.run_node", "custom.press"])("runs a project control press at the exploration door with no original read yet, and still refuses an unidentified control, through %s", async (toolId) => {
  const ledger = new AutomationStudioSiteResetLedger({ owner: "builder" });
  let effects = 0;
  const control = { name: "Star", kind: "button", resource: "r:card", subject: "s:card", place: "pl:star", state: "st:off" };
  let target: AutomationStudioActionDeclaration["control"] = control;
  const permissions = automationStudioFlowBootstrapActionPermissions({
    authoringMode: "project", requireCreateBaseline: false, permittedConsequences: [], instructionIds: [], siteReset: ledger,
    executeTool: async (call) => {
      const answer = await call.permission!({ consequences: ["modify_existing"], control: target, effect: "mutate", verb: "press" });
      if (answer.permitted) effects += 1;
      return { kind: "llm_evidence_tool_execution", evidence: { ok: answer.permitted }, effectApplied: answer.permitted };
    }
  });
  const run = () => permissions.executeTool({ callId: "star", toolId, value: { node: "demo.star", consequences: ["modify_existing"] } });
  // t775: no original read is needed to press while exploring; the press runs and the ledger records the act.
  const noOriginalYet = await run();
  expect(noOriginalYet).toMatchObject({ effectApplied: true, evidence: { ok: true } });
  expect(JSON.stringify(noOriginalYet)).not.toContain("candidate.reset_witness_required");
  expect(effects).toBe(1);
  // A control that names no target is still refused before any effect.
  target = { name: "Unidentified", kind: "button" };
  expect(await run()).toMatchObject({ resultCode: "candidate.reset_target_unidentified", effectApplied: false });
  expect(effects).toBe(1);
  // Once the original counts are read, the same control runs again, with its place as the witness.
  ledger.observed({ state: {}, differs: [], resource: "r:card", scope: "p:card", controls: { "pl:star": { "st:off": 1 } } });
  target = control;
  expect(await run()).toMatchObject({ effectApplied: true });
  expect(effects).toBe(2);
});

it("keeps explicit standalone custom-tool legacy compatibility", async () => {
  const permissions = automationStudioFlowBootstrapActionPermissions({
    authoringMode: "legacy", permittedConsequences: [], instructionIds: [], siteReset: new AutomationStudioSiteResetLedger(),
    executeTool: async (call) => {
      const answer = await call.permission!({ consequences: ["modify_existing"], control: { name: "Legacy", kind: "button" }, verb: "press" });
      return { kind: "llm_evidence_tool_execution", evidence: { ok: answer.permitted }, effectApplied: answer.permitted };
    }
  });
  expect(await permissions.executeTool({ callId: "legacy", toolId: "custom.press", value: { consequences: ["modify_existing"] } })).toMatchObject({ effectApplied: true });
});

it("refuses a project lasting tool when its reset preflight is unavailable", async () => {
  let effects = 0;
  const permissions = automationStudioFlowBootstrapActionPermissions({
    authoringMode: "project", permittedConsequences: [], instructionIds: [],
    executeTool: async (call) => {
      const answer = await call.permission!({ consequences: ["modify_existing"], control: { name: "Star", kind: "button", subject: "s:card" }, verb: "press" });
      if (answer.permitted) effects += 1;
      return { kind: "llm_evidence_tool_execution", evidence: { ok: answer.permitted }, effectApplied: answer.permitted };
    }
  });
  expect(await permissions.executeTool({ callId: "star", toolId: "custom.press", value: {} })).toMatchObject({ resultCode: "candidate.create_baseline_unavailable", effectApplied: false });
  expect(effects).toBe(0);
});

it("captures, records and settles a project custom effect whose raw args omit consequences", async () => {
  const ledger = new AutomationStudioSiteResetLedger({ owner: "builder" });
  let state = "st:off", effects = 0;
  const raw: JsonObject[] = [];
  const permissions = automationStudioFlowBootstrapActionPermissions({
    authoringMode: "project", permittedConsequences: [], instructionIds: [], siteReset: ledger,
    executeTool: async (call) => {
      raw.push(call.value);
      const answer = await call.permission!({ consequences: ["modify_existing"], control: { name: "Star", kind: "button", subject: "s:card", resource: "r:card", place: "pl:star", state }, effect: "mutate", verb: "press" });
      if (answer.permitted) {
        state = state === "st:off" ? "st:on" : "st:off";
        effects += 1;
      }
      return { kind: "llm_evidence_tool_execution", evidence: { ok: answer.permitted }, effectApplied: answer.permitted };
    }
  });
  const run = (callId: string, value: JsonObject = {}) => {
    const call = { callId, toolId: "custom.star", value };
    return automationStudioSiteResetPlacedCall({
      call, ledger, allTools: true,
      reader: { read: async () => ({ state: {}, differs: [], resource: "r:card", scope: "p:card", location: "loc:card", controls: { "pl:star": { [state]: 1 } } }) },
      run: () => permissions.executeTool(call)
    });
  };
  expect(await run("star")).toMatchObject({ effectApplied: true });
  expect(effects).toBe(1);
  expect(ledger.inPlace()).toMatchObject([{ act: "act-1" }]);
  // t775: the act in place no longer refuses the trial; it is told to the judge as what the trial starts with.
  expect(await ledger.beforeTrial({ compare: async () => ({ moved: false }) })).toMatchObject({ kind: "admit", startedWith: { acts: [{ act: "act-1" }] } });
  expect(await run("undo", { undoes: "act-1" })).toMatchObject({ effectApplied: true });
  expect(effects).toBe(2);
  expect(state).toBe("st:off");
  expect(ledger.standing("act-1")).toBe("restored");
  expect(await ledger.beforeTrial({ compare: async () => ({ moved: false }) })).toMatchObject({ kind: "admit" });
  expect(raw.every((value) => !Object.hasOwn(value, "consequences") && !Object.hasOwn(value, "undoes"))).toBe(true);
});

it("runs an identified exploratory creation when no original destination was observed, since the exploration door needs no witness", async () => {
  const ledger = new AutomationStudioSiteResetLedger();
  let executed = 0;
  const permissions = automationStudioFlowBootstrapActionPermissions({
    permittedConsequences: ["create_new"], instructionIds: [], siteReset: ledger, requireCreateBaseline: true,
    executeTool: async (call) => {
      const verdict = await call.permission!({ consequences: ["create_new"], control: { name: "Create", subject: "s:document", scope: "p:source" }, verb: "press" });
      if (verdict.permitted) executed++;
      return { kind: "llm_evidence_tool_execution", evidence: { ok: verdict.permitted }, effectApplied: verdict.permitted };
    }
  });
  const result = await permissions.executeTool({ callId: "create", toolId: "core.run_node", value: { node: "example.create", parameters: {}, consequences: ["create_new"] } });
  expect(executed).toBe(1);
  expect(result).toMatchObject({ evidence: { ok: true }, effectApplied: true });
  expect(JSON.stringify(result)).not.toContain("candidate.create_baseline_required");
  expect(permissions.signal.aborted).toBe(false);
  expect(permissions.request()).toBeUndefined();
});

it("recovers through observed original authority and an issued ref, strips it, and preserves strict own inverse proof", async () => {
  const own = new AutomationStudioSiteResetLedger();
  const calls = own;
  const read = (subjects: string[]) => ({ state: {}, differs: [], resource: "r:one", scope: "p:destination", collections: [{ scope: "p:destination", group: "g:destination", subjects, states: Object.fromEntries(subjects.map(subject => [subject, `v:${subject}`])) }] });
  const inputs: JsonObject[] = [];
  let creates = 0, removals = 0;
  const permissions = automationStudioFlowBootstrapActionPermissions({
    permittedConsequences: ["create_new"], instructionIds: [], siteReset: calls, requireCreateBaseline: true,
    executeTool: async (call) => {
      inputs.push(call.value);
      const undo = call.callId === "undo";
      const observe = call.callId === "observe";
      const verdict = await call.permission!({ consequences: observe ? [] : undo ? ["delete"] : ["create_new"], effect: observe ? "observe" : "mutate", control: { name: "Control", subject: "s:document", resource: "r:one", scope: undo ? "p:destination" : "p:source" }, verb: "press" });
      if (verdict.permitted && !observe) undo ? removals++ : creates++;
      if (verdict.permitted && observe) calls.observed(read(["s:original"]));
      return { kind: "llm_evidence_tool_execution", evidence: { ok: verdict.permitted }, effectApplied: verdict.permitted && !observe };
    }
  });
  const run = (callId: string, extra: JsonObject = {}) => permissions.executeTool({ callId, toolId: "core.run_node", value: { node: "example.create", parameters: {}, consequences: callId === "observe" ? [] : ["create_new"], ...extra } });
  // t775: with no original destination observed yet the exploration door still lets the creation run (witness unresolved).
  expect(await run("missing")).toMatchObject({ effectApplied: true, evidence: { ok: true } });
  expect(creates).toBe(1);
  await run("observe");
  const ref = calls.destinationReceipts!()[0]!.ref;
  expect(ref).toBe("destination-1");
  expect(await run("create", { resetDestination: ref })).toMatchObject({ evidence: { ok: true } });
  expect(creates).toBe(2);
  expect(inputs.every(input => !Object.hasOwn(input, "resetDestination"))).toBe(true);
  expect(permissions.signal.aborted).toBe(false);
  expect(permissions.request()).toBeUndefined();
  calls.observed(read(["s:original", "s:document"]));
  // The new document is still there: the trial is admitted and told what it starts with, never refused for it.
  expect(await own.beforeTrial(async () => ({ moved: false }))).toMatchObject({ kind: "admit", startedWith: { acts: expect.arrayContaining([expect.objectContaining({ call: "create" })]) } });
  expect(await run("undo", { undoes: "act-2", consequences: ["delete"] })).toMatchObject({ evidence: { ok: true } });
  expect(removals).toBe(1);
  calls.observed(read(["s:original"]));
  // Only the first creation, which no witness could settle, is still on the site, and the trial is told it; the undone one is not listed.
  const last = await own.beforeTrial(async () => ({ moved: false }));
  expect(last).toMatchObject({ kind: "admit", startedWith: { acts: [{ act: "act-1", call: "missing" }] } });
  expect(JSON.stringify(last)).not.toContain("act-2");
});

it("hands the ledger the destination a creation was admitted against, so an unchanged destination lets the trial run (F1)", async () => {
  const own = new AutomationStudioSiteResetLedger();
  const told: Array<string | undefined> = [];
  const read = { state: {}, differs: [], resource: "r:one", scope: "p:destination", collections: [{ scope: "p:destination", group: "g:destination", subjects: ["s:original"], states: { "s:original": "v:original" } }] };
  const permissions = automationStudioFlowBootstrapActionPermissions({
    permittedConsequences: ["create_new"], instructionIds: [], requireCreateBaseline: true,
    siteReset: { createBaseline: (declared, reference) => own.createBaseline(declared, reference), destinationReceipts: () => own.destinationReceipts(), claim: value => own.claim(value), target: (act, declared) => own.target(act, declared), explored: call => {
      told.push(call.resetDestination);
      own.explored(call);
    } },
    executeTool: async (call) => {
      const verdict = await call.permission!({ consequences: ["create_new"], control: { name: "Open", subject: "s:document", resource: "r:one", scope: "p:source" }, verb: "press" });
      return { kind: "llm_evidence_tool_execution", evidence: { ok: verdict.permitted }, effectApplied: verdict.permitted };
    }
  });
  own.observed(read);
  const ref = own.destinationReceipts()[0]!.ref;
  expect(await permissions.executeTool({ callId: "open", toolId: "core.run_node", value: { node: "example.open", parameters: {}, consequences: ["create_new"], resetDestination: ref } })).toMatchObject({ evidence: { ok: true } });
  expect(told).toEqual([ref]);
  // The site showed nothing of it where it would land: no undo is owed, and the trial says it is left.
  own.observed(read);
  expect(await own.beforeTrial(async () => ({ moved: false }))).toMatchObject({ kind: "admit", startedWith: { cannotUndo: [{ act: "act-1", call: "open" }] } });
});

it("runs an unwitnessed press at the exploration door before and after the first lasting act, and no act seals the lists against it (t775, was t751)", async () => {
  const own = new AutomationStudioSiteResetLedger();
  const told: Array<string | undefined> = [];
  const read = { state: {}, differs: [], resource: "r:one", scope: "p:saved-page", collections: [{ scope: "p:saved", group: "g:saved", subjects: ["s:original"], states: { "s:original": "v:original" } }] };
  const permissions = automationStudioFlowBootstrapActionPermissions({
    permittedConsequences: ["modify_existing"], instructionIds: [], requireCreateBaseline: true,
    siteReset: { createBaseline: (declared, reference) => own.createBaseline(declared, reference), destinationReceipts: () => own.destinationReceipts(), claim: (value, reference) => own.claim(value, reference), target: (act, declared) => own.target(act, declared), explored: call => {
      told.push(call.resetDestination);
      own.explored(call);
    } },
    executeTool: async (call) => {
      const look = call.callId === "look";
      // `pin-other` presses another control, about another item, through another node: nothing explored repeats it.
      const other = call.callId === "pin-other";
      const verdict = await call.permission!(look ? { consequences: [], effect: "observe", control: { name: "Saved" }, verb: "read" } : { consequences: ["modify_existing"], control: { name: other ? "Pin" : "Save", subject: other ? "s:other" : "s:document", page: "s:results", resource: "r:one" }, verb: "press" });
      return { kind: "llm_evidence_tool_execution", evidence: { ok: verdict.permitted }, effectApplied: verdict.permitted && !look };
    }
  });
  own.observed(read);
  const ref = own.destinationReceipts()[0]!.ref;
  // A reversible press with no witness runs while exploring, and is recorded with none.
  const unwitnessed = await permissions.executeTool({ callId: "save-unwitnessed", toolId: "core.run_node", value: { node: "example.save", parameters: {}, consequences: ["modify_existing"] } });
  expect(unwitnessed).toMatchObject({ effectApplied: true, evidence: { ok: true } });
  expect(JSON.stringify(unwitnessed)).not.toContain("candidate.reset_witness_required");
  expect(told).toEqual([undefined]);
  // Named by its ref, the next press lands too.
  await permissions.executeTool({ callId: "save", toolId: "core.run_node", value: { node: "example.save", parameters: {}, consequences: ["modify_existing"], resetDestination: ref } });
  // After a lasting act has landed, a press naming no ref that repeats nothing witnessed still runs: a witnessless act seals no list.
  expect(await permissions.executeTool({ callId: "pin-other", toolId: "core.run_node", value: { node: "example.pin", parameters: {}, consequences: ["modify_existing"] } })).toMatchObject({ effectApplied: true, evidence: { ok: true } });
  expect(told).toEqual([undefined, ref, undefined]);
  own.observed(read);
  // The trial is admitted either way; the presses nothing could witness are told to it as on the site.
  const trial = await own.beforeTrial(async () => ({ moved: false }));
  expect(trial).toMatchObject({ kind: "admit", startedWith: { acts: expect.arrayContaining([expect.objectContaining({ call: "save-unwitnessed" }), expect.objectContaining({ call: "pin-other" })]) } });
  // The same press again, naming no ref, repeats the witnessed act and shares its witness, so it runs.
  expect(await permissions.executeTool({ callId: "save-again", toolId: "core.run_node", value: { node: "example.save", parameters: {}, consequences: ["modify_existing"] } })).toMatchObject({ evidence: { ok: true } });
  expect(told).toEqual([undefined, ref, undefined, undefined]);
});

it("refuses a look under undoes that names a ref no receipt printed, before it runs (rerun round 2)", async () => {
  const own = new AutomationStudioSiteResetLedger();
  const ran: string[] = [];
  const read = { state: {}, differs: [], resource: "r:one", scope: "p:saved-page", collections: [{ scope: "p:saved", group: "g:saved", subjects: ["s:original"], states: { "s:original": "v:original" } }] };
  const permissions = automationStudioFlowBootstrapActionPermissions({
    permittedConsequences: ["modify_existing"], instructionIds: [], requireCreateBaseline: true,
    siteReset: { createBaseline: (declared, reference) => own.createBaseline(declared, reference), destinationReceipts: () => own.destinationReceipts(), claim: (value, reference) => own.claim(value, reference), target: (act, declared) => own.target(act, declared), explored: call => own.explored(call) },
    executeTool: async (call) => {
      ran.push(call.callId);
      const look = call.callId === "look";
      const verdict = await call.permission!(look ? { consequences: [], effect: "observe", control: { name: "Saved" }, verb: "read" } : { consequences: ["modify_existing"], control: { name: "Save", subject: "s:document", page: "s:results", resource: "r:one" }, verb: "press" });
      return { kind: "llm_evidence_tool_execution", evidence: { ok: verdict.permitted }, effectApplied: verdict.permitted && !look };
    }
  });
  own.observed(read);
  const ref = own.destinationReceipts()[0]!.ref;
  await permissions.executeTool({ callId: "save", toolId: "core.run_node", value: { node: "example.save", parameters: {}, consequences: ["modify_existing"], resetDestination: ref } });
  expect(await permissions.executeTool({ callId: "look", toolId: "core.run_node", value: { node: "example.read", parameters: {}, consequences: [], undoes: "act-1", resetDestination: "destination-99" } })).toMatchObject({ evidence: { ok: false, code: "candidate.reset_destination_unissued" } });
  expect(ran).toEqual(["save"]);
});

it("fails closed if an opted-in project adapter omits preflight, while preserving other paths", async () => {
  for (const [optIn, consequences, expected] of [
    [true, ["create_new"], false], [false, ["create_new"], true],
    [true, ["send_or_publish"], true], [true, ["move_money"], true],
    [true, ["create_new", "send_or_publish"], true], [true, [], true]
  ] as const) {
    const own = new AutomationStudioSiteResetLedger();
    let executed = 0;
    const permissions = automationStudioFlowBootstrapActionPermissions({
      requireCreateBaseline: optIn, permittedConsequences: ["create_new", "send_or_publish", "move_money"], instructionIds: [],
      siteReset: { claim: value => own.claim(value), target: (act, declared) => own.target(act, declared), explored: call => own.explored(call) },
      executeTool: async call => {
        const verdict = await call.permission!({ effect: "mutate", consequences: [...consequences], control: { name: "Control", subject: "s:document", resource: "r:one" }, verb: "press" });
        if (verdict.permitted) executed++;
        return { kind: "llm_evidence_tool_execution", evidence: { ok: verdict.permitted }, effectApplied: verdict.permitted };
      }
    });
    const result = await permissions.executeTool({ callId: "create", toolId: "core.run_node", value: { node: "example.create", parameters: {}, consequences: [...consequences] } });
    expect(executed).toBe(expected ? 1 : 0);
    if (!expected) expect(result).toMatchObject({ resultCode: "candidate.create_baseline_unavailable", effectApplied: false, targetsUnchanged: true });
    expect(permissions.signal.aborted).toBe(false);
    expect(permissions.request()).toBeUndefined();
  }
});

it("does not treat an item's page as its subject when the project adapter omits preflight", async () => {
  const own = new AutomationStudioSiteResetLedger();
  let executed = 0;
  const permissions = automationStudioFlowBootstrapActionPermissions({
    requireCreateBaseline: true, permittedConsequences: ["create_new"], instructionIds: [],
    siteReset: { claim: value => own.claim(value), target: (act, declared) => own.target(act, declared), explored: call => own.explored(call) },
    executeTool: async call => {
      const verdict = await call.permission!({ effect: "mutate", consequences: ["create_new"], control: { name: "Control", item: "i:row", page: "s:page", resource: "r:one" }, verb: "press" });
      if (verdict.permitted) executed++;
      return { kind: "llm_evidence_tool_execution", evidence: { ok: verdict.permitted }, effectApplied: verdict.permitted };
    }
  });
  expect(await permissions.executeTool({ callId: "create", toolId: "core.run_node", value: { node: "example.create", parameters: {}, consequences: ["create_new"] } })).toMatchObject({ evidence: { ok: true } });
  expect(executed).toBe(1);
});

// L1 reset settlement: a toggle the build pressed is tied to its press back by the control's own place and state.
it("tells the ledger the control's place and state on declared.control, and none where the domain gave none", async () => {
  const own = new AutomationStudioSiteResetLedger();
  const told: Array<Record<string, unknown> | undefined> = [];
  const permissions = automationStudioFlowBootstrapActionPermissions({
    permittedConsequences: ["create_new"], instructionIds: [],
    siteReset: { claim: value => own.claim(value), target: (act, declared) => own.target(act, declared), explored: call => {
      told.push(call.declared?.control);
      own.explored(call);
    } },
    executeTool: async call => {
      const verdict = await call.permission!(call.value.declaration as unknown as AutomationStudioActionDeclaration);
      return { kind: "llm_evidence_tool_execution", evidence: { ok: verdict.permitted }, effectApplied: verdict.permitted };
    }
  });
  const press = (callId: string, control: JsonObject) => permissions.executeTool({ callId, toolId: "core.run_node", value: { node: "example.toggle", parameters: {}, consequences: ["create_new"], declaration: { consequences: ["create_new"], control: { name: "Toggle", kind: "button", ...control }, verb: "press" } } });
  await press("with", { place: "p:slot", state: "v:off" });
  await press("without", {});
  expect(told[0]).toMatchObject({ kind: "button", place: "p:slot", state: "v:off" });
  expect(told[1]).not.toHaveProperty("place");
  expect(told[1]).not.toHaveProperty("state");
});

type Answer = "grant" | "deny" | undefined;

/** A thread that answers each question it is asked with the next scripted answer, and remembers what it was asked. */
function thread(answers: Answer[]) {
  const opened: AutomationStudioAsk[] = [];
  const waited: string[] = [];
  const port: AutomationStudioParkingPort = {
    open: (ask) => { opened.push(ask); },
    awaitAnswer: async (ask) => {
      waited.push(ask.askId);
      const kind = answers.shift();
      return kind === undefined ? undefined : ({ askId: ask.askId, answeredAt: 1, kind, value: null, actorId: "person" } satisfies AutomationStudioAskAnswer);
    }
  };
  return { port, opened, waited };
}

/** One build's gate, with every press the stand-in domain is asked to make declaring what the call says. */
function build(answers: Answer[]) {
  const asks = thread(answers);
  const verdicts: AutomationStudioActionPermissionVerdict[] = [];
  let next = 0;
  const permissions = automationStudioFlowBootstrapActionPermissions({
    permittedConsequences: [],
    instructionIds: ["instruction.order"],
    newRequestId: () => `permission-request:${++next}`,
    ask: { port: asks.port, timeoutMs: 1_000 },
    executeTool: async (call) => {
      const verdict = await call.permission!(call.value.declaration as unknown as AutomationStudioActionDeclaration);
      verdicts.push(verdict);
      return { kind: "llm_evidence_tool_execution", evidence: { pressed: verdict.permitted }, effectApplied: verdict.permitted };
    }
  });
  const press = (callId: string, declaration: AutomationStudioActionDeclaration) =>
    permissions.executeTool({ callId, toolId: "example.press", value: { declaration } as unknown as JsonObject });
  return { permissions, asks, verdicts, press };
}

describe("a build's permission questions after a person says no", () => {
  it("asks about a different control once the first was declined, and a grant there lets it go ahead", async () => {
    const run = build(["deny", "grant"]);
    await run.press("call.checkout", CHECKOUT);
    await run.press("call.place", PLACE);

    expect(run.asks.waited).toEqual(["permission-request:1", "permission-request:2"]);
    expect(run.verdicts).toEqual([
      { permitted: false, missing: ["move_money"], requestId: "permission-request:1", declined: true },
      { permitted: true }
    ]);
    // Granted, nothing is left for the proposal to carry.
    expect(run.permissions.request()).toBeUndefined();
  });

  it("refuses the declined control again without asking, naming the request the person declined", async () => {
    const run = build(["deny", "grant"]);
    await run.press("call.checkout", CHECKOUT);
    await run.press("call.place", PLACE);
    await run.press("call.checkout.again", CHECKOUT);

    expect(run.asks.opened.map((ask) => ask.askId)).toEqual(["permission-request:1", "permission-request:2"]);
    expect(run.verdicts.at(-1)).toEqual({ permitted: false, missing: ["move_money"], requestId: "permission-request:1", declined: true });
    // Answered, so the build does not stand on it while exploring: a stalled
    // round is not ended as that question, and a Flow without the control
    // stays approvable. A plan step that needs it puts it back.
    expect(run.permissions.request()).toBeUndefined();
    const step = await run.permissions.planStep({ definitionId: "example.press", ref: "main.checkout" })(CHECKOUT);
    expect(step).toEqual({ permitted: false, missing: ["move_money"], requestId: "permission-request:1", declined: true });
    expect(run.asks.opened).toHaveLength(2);
    expect(run.permissions.request()?.requestId).toBe("permission-request:1");
    expect(run.permissions.signal.aborted).toBe(true);
  });

  it("waits once when nobody answers, and refuses everything after it with that request", async () => {
    const run = build([undefined, "grant"]);
    await run.press("call.checkout", CHECKOUT);
    await run.press("call.place", PLACE);

    expect(run.asks.waited).toEqual(["permission-request:1"]);
    expect(run.verdicts).toEqual([
      { permitted: false, missing: ["move_money"], requestId: "permission-request:1" },
      { permitted: false, missing: ["move_money"], requestId: "permission-request:1" }
    ]);
  });

  it("ends the build on the request that refused its plan step", async () => {
    // Declined on one control, then a plan step on another, asked and declined too.
    const declinedTwice = build(["deny", "deny"]);
    await declinedTwice.press("call.checkout", CHECKOUT);
    const place = await declinedTwice.permissions.planStep({ definitionId: "example.press", ref: "main.place" })(PLACE);
    expect(place).toEqual({ permitted: false, missing: ["move_money"], requestId: "permission-request:2", declined: true });
    expect(declinedTwice.permissions.signal.aborted).toBe(true);
    expect(declinedTwice.permissions.endedOnRequest()?.diagnostic.permissionRequest).toMatchObject({ requestId: "permission-request:2", action: { kind: "flow_step", ref: "main.place" } });

    // A plan step that repeats the declined question ends on the declined request, unasked.
    const repeated = build(["deny", "grant"]);
    await repeated.press("call.checkout", CHECKOUT);
    await repeated.press("call.place", PLACE);
    const checkout = await repeated.permissions.planStep({ definitionId: "example.press", ref: "main.checkout" })(CHECKOUT);
    expect(checkout).toMatchObject({ permitted: false, requestId: "permission-request:1", declined: true });
    expect(repeated.asks.waited).toHaveLength(2);
    expect(repeated.permissions.endedOnRequest()?.diagnostic.permissionRequest).toMatchObject({ requestId: "permission-request:1", action: { kind: "exploration_step", ref: "call.checkout" } });
  });
});

/**
 * What the build says in the thread when the instruction asks for something no
 * action declared (F42). Only money, delete and send/publish are put to the
 * person as a question (`../../action-permissions/destructive.ts`); a creation
 * or an edit is said without a question where the thread takes plain words, and
 * not at all where it only takes questions. Never a pause: nothing parks.
 */
describe("the cross-check, said in the person's words", () => {
  const NOTHING: AutomationStudioActionDeclaration = { consequences: [], control: { name: "Add to cart", kind: "button" }, verb: "press" };
  const DIGEST = `sha256:${"0".repeat(64)}`;
  const CART: AutomationStudioInstructedConsequence[] = [
    { consequence: "create_new", instructionId: "instruction.cart", instructionDigest: DIGEST, quote: "add it to the cart" },
    { consequence: "modify_existing", instructionId: "instruction.cart", instructionDigest: DIGEST, quote: "choose Space Grey" }
  ];
  const ORDER: AutomationStudioInstructedConsequence[] = [
    ...CART,
    { consequence: "move_money", instructionId: "instruction.cart", instructionDigest: DIGEST, quote: "place the order" }
  ];

  function crossChecked(instructed: AutomationStudioInstructedConsequence[], withSay: boolean) {
    const asks = thread([]);
    const said: string[] = [];
    const permissions = automationStudioFlowBootstrapActionPermissions({
      permittedConsequences: [],
      instructionIds: ["instruction.cart"],
      deriveInstructed: async () => instructed,
      ask: { port: asks.port, timeoutMs: 1_000 },
      ...(withSay ? { say: async (text: string) => { said.push(text); } } : {}),
      executeTool: async (call) => {
        const verdict = await call.permission!(call.value.declaration as unknown as AutomationStudioActionDeclaration);
        return { kind: "llm_evidence_tool_execution", evidence: { pressed: verdict.permitted }, effectApplied: verdict.permitted };
      }
    });
    return { permissions, asks, said };
  }

  async function pressThreeTimes(run: ReturnType<typeof crossChecked>) {
    for (const callId of ["call.1", "call.2", "call.3"]) await run.permissions.executeTool({ callId, toolId: "example.press", value: { declaration: NOTHING } as unknown as JsonObject });
    return await run.permissions.crossCheck();
  }

  it("says a creation or an edit nobody declared without asking anything", async () => {
    const run = crossChecked(CART, true);
    const check = await pressThreeTimes(run);

    expect(check?.verdict).toBe("undeclared");
    expect(run.asks.opened).toEqual([]);
    expect(run.said).toEqual(["Your instruction asks to change something that exists (\"choose Space Grey\") and create something new (\"add it to the cart\"), but nothing FluxIQ did while building this Flow said it would."]);
  });

  it("says nothing at all where the thread only takes questions, and still records the finding", async () => {
    const run = crossChecked(CART, false);
    const check = await pressThreeTimes(run);

    expect(check?.undeclared).toEqual(["modify_existing", "create_new"]);
    expect(check?.quotes.map((quote) => quote.quote)).toEqual(["choose Space Grey", "add it to the cart"]);
    expect(run.asks.opened).toEqual([]);
    expect(run.said).toEqual([]);
  });

  it("asks yes or no, without pausing, when money, a delete or a send went undeclared", async () => {
    const run = crossChecked(ORDER, true);
    await pressThreeTimes(run);

    expect(run.said).toEqual([]);
    expect(run.asks.opened).toHaveLength(1);
    expect(run.asks.waited).toEqual([]);
    expect(run.asks.opened[0]).toMatchObject({ kind: "confirm", parks: false, consequences: ["move_money", "modify_existing", "create_new"] });
    expect(run.asks.opened[0]!.text).toBe("Your instruction asks to move money (\"place the order\"), change something that exists (\"choose Space Grey\") and create something new (\"add it to the cart\"), but nothing FluxIQ did while building this Flow said it would. Apply it as it stands?");
    expect(run.asks.opened[0]!.text).not.toMatch(/move_money|modify_existing|create_new|\d+ action/u);
  });
});

/**
 * Which of the instruction's acts it asks to last, read before the build's
 * first test so the test does not repeat them (t174-w83). Run
 * `run-murwd8le-79e735a8` (Cause 3) read the instruction only after the build,
 * from the cross-check (0070), so its Add to cart -- declared `[]` -- was
 * pressed again by both tests (0045, 0068). The quotes are that run's.
 */
describe("the instruction's lasting acts, read once before the first test", () => {
  const DIGEST = `sha256:${"0".repeat(64)}`;
  const READ: AutomationStudioInstructedConsequence[] = [
    { consequence: "create_new", instructionId: "instruction.goal", instructionDigest: DIGEST, quote: "put three of the Voltbay USB-C hub sold by Voltbay Official Store in my cart" },
    { consequence: "modify_existing", instructionId: "instruction.goal", instructionDigest: DIGEST, quote: "Collect that store's coupon while you are on the item" }
  ];
  const ACTS = [
    { id: "a1", quote: "put three of the Voltbay USB-C hub sold by Voltbay Official Store in my cart: Space Grey, the 7-in-1 version, shipped from Spain" },
    { id: "a2", quote: "Collect that store's coupon while you are on the item" }
  ];
  const NOTHING: AutomationStudioActionDeclaration = { consequences: [], control: { name: "Add to cart", kind: "button" }, verb: "press" };

  function reading(instructed: readonly AutomationStudioInstructedConsequence[] | Error) {
    let derived = 0;
    const permissions = automationStudioFlowBootstrapActionPermissions({
      permittedConsequences: [],
      instructionIds: ["instruction.goal"],
      deriveInstructed: async () => {
        derived += 1;
        if (instructed instanceof Error) throw instructed;
        return instructed;
      },
      executeTool: async (call) => {
        const verdict = await call.permission!(call.value.declaration as unknown as AutomationStudioActionDeclaration);
        return { kind: "llm_evidence_tool_execution", evidence: { pressed: verdict.permitted }, effectApplied: verdict.permitted };
      }
    });
    return { permissions, derived: () => derived };
  }

  it("names every act whose words one of the read's quotes contains, or is contained in", async () => {
    const run = reading(READ);
    expect([...await run.permissions.instructedLastingActs(ACTS)].sort()).toEqual(["a1", "a2"]);
  });

  it("names both acts Core reads from that run's own instruction", async () => {
    const instruction = "On Farbazaar, put three of the Voltbay USB-C hub sold by Voltbay Official Store in my cart: Space Grey, the 7-in-1 version, shipped from Spain. Collect that store's coupon while you are on the item. Do not buy anything.";
    const acts = automationStudioInstructedActs(instruction);
    expect(acts.map((act) => act.id)).toEqual(["a1", "a2"]);
    const run = reading(READ);
    expect([...await run.permissions.instructedLastingActs(acts)].sort()).toEqual(["a1", "a2"]);
  });

  it("matches across case and spacing, and leaves out an act no quote overlaps", async () => {
    const run = reading(READ);
    const acts = [
      { id: "a1", quote: "PUT three of the  Voltbay USB-C hub\nsold by Voltbay Official Store in my cart" },
      { id: "a2", quote: "open my saved items" }
    ];
    expect([...await run.permissions.instructedLastingActs(acts)]).toEqual(["a1"]);
  });

  it("never names a choice of an act, which the steps after it stand on", async () => {
    const run = reading(READ);
    expect([...await run.permissions.instructedLastingActs([{ id: "a1.colour", quote: ACTS[0]!.quote }])]).toEqual([]);
  });

  it("reads the instruction once: the cross-check after the build reuses it, and no second call is made", async () => {
    const run = reading(READ);
    await run.permissions.instructedLastingActs(ACTS);
    expect(run.derived()).toBe(1);
    // The order `permission-outcome.ts` keeps: what the instruction asks for is known before the build ends, and stays the same after the cross-check.
    expect(run.permissions.instructed()).toEqual(READ);
    await run.permissions.executeTool({ callId: "call.add", toolId: "example.press", value: { declaration: NOTHING } as unknown as JsonObject });
    const check = await run.permissions.crossCheck();
    expect(check?.verdict).toBe("undeclared");
    expect(check?.undeclared).toEqual(["modify_existing", "create_new"]);
    expect(run.derived()).toBe(1);
    expect(run.permissions.instructed()).toEqual(READ);
  });

  it("makes no call for an instruction with no acts", async () => {
    const run = reading(READ);
    expect([...await run.permissions.instructedLastingActs([])]).toEqual([]);
    expect(run.derived()).toBe(0);
  });

  it("grounds split objects in the original combined clause without classifying an unquoted sibling", async () => {
    const instruction = "Switch my pickup store to Example Store, then add two packs of Towels in Large and one pack of Napkins in Small to my cart, both for pickup. Do not buy anything.";
    const kinded = automationStudioInstructedActs(instruction);
    // Both adds last by their kind whatever the read quoted (lane B, F1), so grounding alone is shown on kind-less copies.
    expect([...await reading([{ ...READ[0]!, quote: "add" }]).permissions.instructedLastingActs(kinded)].sort()).toEqual(["a2", "a3"]);
    const acts = kinded.map((act) => ({ id: act.id, quote: act.quote, ...(act.source ? { source: act.source } : {}) }));
    const combined = reading([{ ...READ[0]!, quote: "add two packs of Towels in Large and one pack of Napkins in Small to my cart" }]);
    expect([...await combined.permissions.instructedLastingActs(acts)]).toEqual(["a2", "a3"]);
    await combined.permissions.instructedLastingActs(acts);
    expect(combined.derived()).toBe(1);
    const narrow = reading([{ ...READ[0]!, quote: "one pack of Napkins in Small to my cart" }]);
    expect([...await narrow.permissions.instructedLastingActs(acts)]).toEqual(["a3"]);
    const sharedVerb = reading([{ ...READ[0]!, quote: "add" }]);
    expect([...await sharedVerb.permissions.instructedLastingActs(acts)]).toEqual([]);
    const unrelated = reading([{ ...READ[0]!, quote: "add two packs of Unrelated to my cart" }]);
    expect([...await unrelated.permissions.instructedLastingActs(acts)]).toEqual([]);
  });

  it("names nothing by quote when the read fails, and does not try again at the cross-check", async () => {
    const run = reading(new Error("provider down"));
    expect([...await run.permissions.instructedLastingActs(ACTS)]).toEqual([]);
    await run.permissions.executeTool({ callId: "call.add", toolId: "example.press", value: { declaration: NOTHING } as unknown as JsonObject });
    await run.permissions.crossCheck();
    expect(run.derived()).toBe(1);
  });

  /**
   * Run `run-musp4h2f-72e8ed99` (lane B): Core split the coordinated objects
   * into a2 and a3, each quote composed from the verb and its own object, and
   * the read quoted the whole coordinated sentence. Neither quote contained the
   * other, so neither add was lasting, the Add to cart steps -- declared `[]` --
   * were pressed again by all four tests, and the cart grew from 1 to 12 items.
   * An add is lasting by its kind, whatever the read quoted.
   */
  describe("an act whose kind lasts, whatever the read quoted", () => {
    const RUN_B = "Switch my pickup store to Millbrook Crossing Supercenter, then add two packs of the ValueRidge Essentials Select-A-Size Paper Towels in the 12 Double Rolls size and one pack of the ValueRidge Everyday Dinner Napkins in the 250 Count size to my cart, both for pickup. Keep what is already in my cart as it is, and do not check out.";
    const RUN_B_READ: AutomationStudioInstructedConsequence[] = [
      { consequence: "modify_existing", instructionId: "instruction.goal", instructionDigest: DIGEST, quote: "Switch my pickup store to Millbrook Crossing Supercenter" },
      { consequence: "create_new", instructionId: "instruction.goal", instructionDigest: DIGEST, quote: "add two packs of the ValueRidge Essentials Select-A-Size Paper Towels in the 12 Double Rolls size and one pack of the ValueRidge Everyday Dinner Napkins in the 250 Count size to my cart" }
    ];

    it("names both split adds of that run's instruction, and the store switch the read quoted", async () => {
      const acts = automationStudioInstructedActs(RUN_B);
      expect(acts.map((act) => [act.id, act.kind])).toEqual([["a1", "set"], ["a2", "add_to"], ["a3", "add_to"]]);
      const run = reading(RUN_B_READ);
      expect([...await run.permissions.instructedLastingActs(acts)].sort()).toEqual(["a1", "a2", "a3"]);
    });

    it("leaves out an open the read does not quote, and never names a choice", async () => {
      const acts = [...automationStudioInstructedActs(RUN_B), { id: "a4", kind: "open" as const, quote: "open my saved items" }, { id: "a2.quantity", kind: "add_to" as const, quote: "two packs" }];
      const run = reading(RUN_B_READ);
      const lasting = await run.permissions.instructedLastingActs(acts);
      expect(lasting.has("a4")).toBe(false);
      expect(lasting.has("a2.quantity")).toBe(false);
    });

    it("still names the lasting kinds when the read fails, and only those", async () => {
      const run = reading(new Error("provider down"));
      expect([...await run.permissions.instructedLastingActs(automationStudioInstructedActs(RUN_B))].sort()).toEqual(["a2", "a3"]);
    });
  });
});

// W25 of the week review (run-mux6n7m4-8273e7a0, moment 4): the thread quoted "...in my cart: Space
// Grey, the 7-in-1 version, shipped f...", an act's words cut inside a word. A long quote is cut
// where a word ends, never inside one.
describe("the line that names the acts the read gave no answer for", () => {
  const LONG = "put three of the Voltbay USB-C hub sold by Voltbay Official Store in my cart: Space Grey, the 7-in-1 version, shipped from Spain";

  it("cuts a long quote where a word ends, and leaves a short one whole", () => {
    const said = automationStudioFlowBootstrapUnansweredSaid([LONG, "Collect that store's coupon while you are on the item"]);
    const quoted = /^I could not tell from your instruction whether "([^"]+)…", "Collect that store's coupon while you are on the item" change something that stays changed, so when the build tests its steps it checks the steps that do them rather than doing them again\.$/u.exec(said);
    expect(quoted, said).not.toBeNull();
    const kept = quoted![1]!;
    expect(LONG.startsWith(kept)).toBe(true);
    expect(LONG.charAt(kept.length)).toBe(" ");
    expect(kept.length).toBeLessThanOrEqual(120);
    expect(automationStudioFlowBootstrapUnansweredSaid(["add the towels"])).toBe("I could not tell from your instruction whether \"add the towels\" changes something that stays changed, so when the build tests its steps it checks the step that does it rather than doing it again.");
    // t370 (lane A rounds 6 and 7 UI): the old words, "Reading your instruction gave no answer for ...", are gone.
    expect(automationStudioFlowBootstrapUnansweredSaid(["add the towels"])).not.toContain("gave no answer");
  });
});

// A plan step's reset witness (t751, R3 door 2): where the build has a site
// reset, each reversible lasting declaration the domain puts to a plan step's
// check is admitted by the reset's step admission, and the stamp it answers is
// told to the resolver. Submission never refuses for a missing witness.
describe("a plan step's reset witness", () => {
  const SAVE: AutomationStudioActionDeclaration = { consequences: ["modify_existing"], control: { name: "Save", kind: "button", place: "c:save", state: "s:off", scope: "p:results" }, verb: "press" };
  function build(admitStep?: (declared: unknown, definitionId: string) => unknown) {
    const asked: Array<{ declared: unknown; definitionId: string }> = [];
    const ledger = new AutomationStudioSiteResetLedger();
    // A variable, not a literal: the fake compiles whether or not the ledger's own type declares a step admission yet.
    const siteReset = {
      claim: (value: unknown) => ledger.claim(value), target: (act: string, declared: Parameters<AutomationStudioSiteResetLedger["target"]>[1]) => ledger.target(act, declared), explored: (call: Parameters<AutomationStudioSiteResetLedger["explored"]>[0]) => ledger.explored(call),
      // Answers of any shape, as the gate reads whichever form a ledger gives (`stepWitness`).
      ...(admitStep ? { admitStep: ((declared: unknown, definitionId: string) => {
        asked.push({ declared, definitionId });
        return admitStep(declared, definitionId);
      }) as (declared: unknown, definitionId?: string) => AutomationStudioSiteResetWitnessStamp | undefined } : {})
    };
    const permissions = automationStudioFlowBootstrapActionPermissions({ permittedConsequences: ["modify_existing", "send_or_publish"], instructionIds: [], siteReset, executeTool: async () => ({}) });
    return { permissions, asked };
  }
  async function stampOf(permissions: ReturnType<typeof build>["permissions"], declaration: AutomationStudioActionDeclaration) {
    const told: unknown[] = [];
    const verdict = await permissions.planStep({ definitionId: "example.save", ref: "main.s2", witnessed: (stamp) => told.push(stamp) })(declaration);
    return { verdict, told };
  }

  it("tells the resolver the stamp the admission answers, as a verdict or a stamp, with the step's declaration and definition", async () => {
    const run = build(() => ({ kind: "admit", witness: { via: "control", place: "c:save" } }));
    expect(await stampOf(run.permissions, SAVE)).toMatchObject({ verdict: { permitted: true }, told: [{ via: "control" }] });
    expect(run.asked).toEqual([{ declared: { effect: "mutate", consequences: ["modify_existing"], control: { name: null, kind: null, place: "c:save", state: "s:off", scope: "p:results" } }, definitionId: "example.save" }]);
    const stamped = build(() => ({ via: "destination", ref: "destination-1" }));
    expect((await stampOf(stamped.permissions, SAVE)).told).toEqual([{ via: "destination", ref: "destination-1" }]);
    const repeats = build(() => ({ kind: "admit", witness: { via: "repeats", act: "act-2" } }));
    expect((await stampOf(repeats.permissions, SAVE)).told).toEqual([{ via: "repeats", act: "act-2" }]);
  });

  it("tells none, and still permits the step, where the admission refuses, answers nothing usable, or there is no step admission", async () => {
    for (const answer of [{ kind: "refused", evidence: { ok: false, code: "candidate.reset_witness_required" } }, { kind: "admit" }, { via: "control", place: "c:save" }, undefined]) {
      const run = build(() => answer);
      expect(await stampOf(run.permissions, SAVE), JSON.stringify(answer)).toMatchObject({ verdict: { permitted: true }, told: [undefined] });
      expect(run.permissions.signal.aborted).toBe(false);
    }
    expect(await stampOf(build().permissions, SAVE)).toMatchObject({ verdict: { permitted: true }, told: [undefined] });
  });

  it("asks nothing for a step that is not a reversible lasting act, or that the gate refused", async () => {
    const run = build(() => ({ via: "control" }));
    expect((await stampOf(run.permissions, { consequences: ["send_or_publish"], control: { name: "Post", kind: "button" }, verb: "press" })).told).toEqual([]);
    expect((await stampOf(run.permissions, { consequences: [], effect: "observe", control: { name: "Results" }, verb: "read" })).told).toEqual([]);
    expect((await stampOf(run.permissions, { consequences: ["modify_existing", "send_or_publish"], control: { name: "Save and post", kind: "button" }, verb: "press" })).told).toEqual([]);
    const refused = await stampOf(run.permissions, { consequences: ["move_money"], control: { name: "Pay", kind: "button" }, verb: "press" });
    expect(refused.verdict.permitted).toBe(false);
    expect(refused.told).toEqual([]);
    expect(run.asked).toEqual([]);
  });
});

// t792: an exploration press on a control this build already flipped is held to the earliest such press.
describe("an exploration press on a control this build flipped", () => {
  const PINNED = { via: "name", gains: ["unpin"], loses: ["pin"] };
  const UNPINNED = { via: "name", gains: ["pin"], loses: ["unpin"] };
  /** A stand-in domain: a notes board's "Pin"/"Unpin" control, pressed only where the page is not already in a call's `ensureState`. */
  function board(siteReset?: AutomationStudioSiteResetCalls) {
    let pinned = false;
    const ran: JsonObject[] = [];
    const permissions = automationStudioFlowBootstrapActionPermissions({
      permittedConsequences: ["modify_existing"], instructionIds: [], ...(siteReset ? { siteReset } : {}),
      executeTool: async (call) => {
        ran.push(structuredClone(call.value));
        const ensure = (call.value.parameters as JsonObject).ensureState;
        if (ensure !== undefined && JSON.stringify(ensure) === JSON.stringify(pinned ? PINNED : UNPINNED)) return { kind: "llm_evidence_tool_execution", evidence: { ok: true, skipped: "already_in_state" }, effectApplied: false };
        const verdict = await call.permission!({ consequences: ["modify_existing"], control: { name: pinned ? "Unpin" : "Pin", kind: "button" }, verb: "press" });
        if (!verdict.permitted) return { kind: "llm_evidence_tool_execution", evidence: { ok: false }, effectApplied: false };
        pinned = !pinned;
        return { kind: "llm_evidence_tool_execution", evidence: { ok: true, toggle: { signature: pinned ? PINNED : UNPINNED } }, effectApplied: true, draft: { ranWith: { node: "domain.demo.press", parameters: { target: { selector: "#note-3 .pin" } } } } };
      }
    });
    const press = (callId: string, target: JsonObject, extra: JsonObject = {}) => permissions.executeTool({ callId, toolId: "core.run_node", value: { node: "domain.demo.press", parameters: { target }, consequences: ["modify_existing"], ...extra } });
    return { permissions, ran, press, pinned: () => pinned };
  }

  it("a second exploration press on a control this build flipped is run with its ensureState", async () => {
    const run = board();
    expect(await run.press("pin", { handle: "t7" })).toMatchObject({ effectApplied: true });
    // Pressed again by handle, and by the target as the domain resolved it: the board stays pinned and nothing new is recorded.
    expect(await run.press("again", { handle: "t7" })).toMatchObject({ evidence: { skipped: "already_in_state" } });
    expect(await run.press("by-target", { selector: "#note-3 .pin" })).toMatchObject({ evidence: { skipped: "already_in_state" } });
    expect(run.pinned()).toBe(true);
    expect(run.ran.map((value) => (value.parameters as JsonObject).ensureState)).toEqual([undefined, PINNED, PINNED]);
    expect(run.permissions.exploredToggles.list()).toMatchObject([{ callId: "pin", signature: PINNED }]);
    // Another control, or another node, is not held to it.
    await run.press("other", { handle: "t9" });
    await run.permissions.executeTool({ callId: "look", toolId: "core.run_node", value: { node: "domain.demo.look", parameters: { target: { handle: "t7" } }, consequences: [] } });
    expect(run.ran.slice(3).map((value) => (value.parameters as JsonObject).ensureState)).toEqual([undefined, undefined]);
  });

  it("holds a candidate build's press the same way, and leaves an undo of its act unchanged", async () => {
    const undoes: unknown[] = [];
    const run = board({
      claim: (value) => value === "act-1" ? { kind: "undo", undo: { act: "act-1", allowed: ["modify_existing"] } } : { kind: "none" },
      target: () => ({ kind: "admit", on: "own", allowed: ["modify_existing"] }),
      explored: (call) => undoes.push(call.undoes)
    });
    await run.press("pin", { handle: "t7" });
    expect(await run.press("again", { handle: "t7" })).toMatchObject({ evidence: { skipped: "already_in_state" } });
    expect(run.pinned()).toBe(true);
    expect(await run.press("undo", { handle: "t7" }, { undoes: "act-1" })).toMatchObject({ effectApplied: true });
    expect(run.ran.map((value) => (value.parameters as JsonObject).ensureState)).toEqual([undefined, PINNED, undefined]);
    expect(run.pinned()).toBe(false);
    expect(undoes).toEqual([undefined, undefined, "act-1"]);
  });
});
