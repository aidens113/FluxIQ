// The build's permission wrapper and a candidate build's site-reset ledger
// (t462): the `undoes` key is read by the ledger and never reaches the domain,
// a refused claim is answered without running anything, an accepted one lets
// the gate allow what undoing that act may do, and every call that ran is
// reported back with whether it landed and what it declared. Since t475 each
// action an undo puts to the gate is put to the ledger first: a control the
// ledger refuses is never acted on and nobody is asked.

import { describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioActionDeclaration } from "../../action-permissions/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../llm/index.ts";
import { automationStudioFlowBootstrapActionPermissions } from "../action-permissions.ts";
import type { AutomationStudioSiteResetCalls, AutomationStudioSiteResetClaim, AutomationStudioSiteResetExplored, AutomationStudioSiteResetSpot, AutomationStudioSiteResetTarget } from "../site-reset/index.ts";

const REMOVE: AutomationStudioActionDeclaration = { consequences: ["delete"], control: { name: "Remove", kind: "button" }, verb: "press" };

const CREATED: AutomationStudioSiteResetTarget = { kind: "admit", on: "created", allowed: ["delete"] };

/** A ledger that answers claims and targets as scripted and remembers what it was told. */
function ledger(answer: (undoes: unknown) => AutomationStudioSiteResetClaim, aimed: (act: string, control: AutomationStudioSiteResetSpot) => AutomationStudioSiteResetTarget = () => CREATED) {
  const claims: unknown[] = [];
  const targets: Array<[string, AutomationStudioSiteResetSpot]> = [];
  const explored: AutomationStudioSiteResetExplored[] = [];
  const calls: AutomationStudioSiteResetCalls = {
    claim: (undoes) => {
      claims.push(undoes);
      return answer(undoes);
    },
    target: (act, declared) => {
      targets.push([act, declared.control]);
      return aimed(act, declared.control);
    },
    explored: (call) => { explored.push(call); }
  };
  return { calls, claims, targets, explored };
}

/** A build whose stand-in domain declares what the call carries, and answers with what the test scripts. */
function build(options: { siteReset?: AutomationStudioSiteResetCalls; answer?: (pressed: boolean) => JsonValue | AutomationStudioLlmEvidenceToolExecutionResult } = {}) {
  const seen: JsonObject[] = [];
  let next = 0;
  const permissions = automationStudioFlowBootstrapActionPermissions({
    permittedConsequences: [],
    instructionIds: ["instruction.one"],
    newRequestId: () => `permission-request:${++next}`,
    ...(options.siteReset ? { siteReset: options.siteReset } : {}),
    executeTool: async (call) => {
      seen.push(call.value);
      const declaration = call.value.declaration as unknown as AutomationStudioActionDeclaration | undefined;
      const verdict = declaration ? await call.permission!(declaration) : { permitted: true };
      return options.answer
        ? options.answer(verdict.permitted)
        : { kind: "llm_evidence_tool_execution", evidence: verdict.permitted ? { ok: true } : { ok: false, code: "permission_required" }, effectApplied: verdict.permitted };
    }
  });
  const call = (callId: string, value: JsonObject) => permissions.executeTool({ callId, toolId: "core.run_node", value });
  return { permissions, seen, call };
}

const DELETE_OK: AutomationStudioSiteResetClaim = { kind: "undo", undo: { act: "act-1", allowed: [] } };

describe("a candidate build's undo through the permission wrapper", () => {
  it("strips `undoes`, lets the undo delete unasked, and reports it landed with its declaration", async () => {
    const reset = ledger(() => DELETE_OK);
    const run = build({ siteReset: reset.calls });
    const execution = await run.call("call.1", { declaration: REMOVE as unknown as JsonObject, undoes: "act-1" });

    expect(reset.claims).toEqual(["act-1"]);
    expect(run.seen).toEqual([{ declaration: REMOVE }]);
    expect(execution).toEqual({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true });
    expect(run.permissions.request()).toBeUndefined();
    expect(run.permissions.declarations()[0]).toMatchObject({ permitted: true, undoes: "act-1" });
    expect(reset.explored).toEqual([{
      callId: "call.1",
      toolId: "core.run_node",
      undoes: "act-1",
      // Never shown to the model in this stand-in, so the name is withheld as the gate would withhold it.
      declared: { permitted: true, effect: "mutate", consequences: ["delete"], control: { name: null, kind: "button" }, verb: "press" },
      on: "created",
      landed: true
    }]);
  });

  it("passes the control's item and dialog tokens to the ledger before the gate, and never to a person (t475)", async () => {
    const reset = ledger(() => DELETE_OK);
    const run = build({ siteReset: reset.calls });
    const placed = { ...REMOVE, control: { ...REMOVE.control, item: "item:abc", dialog: "dialog:def" } };
    await run.call("call.1", { declaration: placed as unknown as JsonObject, undoes: "act-1" });

    expect(reset.targets).toEqual([["act-1", { item: "item:abc", dialog: "dialog:def" }]]);
    expect(reset.explored[0]?.declared?.control).toEqual({ name: null, kind: "button", item: "item:abc", dialog: "dialog:def" });
  });

  it("passes what the control and its page are about to the ledger, on an undo and on the act it records (t719)", async () => {
    const reset = ledger(() => DELETE_OK);
    const run = build({ siteReset: reset.calls });
    const placed = { ...REMOVE, control: { ...REMOVE.control, item: "i:line", subject: "s:kettle", page: "s:basket" } };
    await run.call("call.1", { declaration: placed as unknown as JsonObject, undoes: "act-1" });
    await run.call("call.2", { declaration: { ...placed, consequences: ["create_new"] } as unknown as JsonObject });

    expect(reset.targets).toEqual([["act-1", { item: "i:line", subject: "s:kettle", page: "s:basket" }]]);
    expect(reset.explored.map((call) => call.declared?.control)).toEqual([
      { name: null, kind: "button", item: "i:line", subject: "s:kettle", page: "s:basket" },
      { name: null, kind: "button", item: "i:line", subject: "s:kettle", page: "s:basket" }
    ]);
  });

  it("refuses an undo on a control the ledger refuses, unrun: the domain is told no, nobody is asked, and the model gets the ledger's words (t475)", async () => {
    const evidence = { ok: false, code: "candidate.undo_wrong_target", act: "act-1" };
    const reset = ledger(() => DELETE_OK, () => ({ kind: "refused", evidence }));
    let pressed = 0;
    const run = build({ siteReset: reset.calls, answer: (permitted) => {
      if (permitted) pressed += 1;
      return { kind: "llm_evidence_tool_execution", evidence: permitted ? { ok: true } : { ok: false, code: "permission_required" }, effectApplied: permitted };
    } });
    const execution = await run.call("call.1", { declaration: REMOVE as unknown as JsonObject, undoes: "act-1" });

    expect(pressed).toBe(0);
    expect(execution).toEqual({ kind: "llm_evidence_tool_execution", evidence, effectApplied: false, targetsUnchanged: true, resultCode: "candidate.undo_wrong_target" });
    expect(run.permissions.request()).toBeUndefined();
    expect(run.permissions.declarations()).toEqual([]);
    expect(reset.explored).toEqual([{ callId: "call.1", toolId: "core.run_node", undoes: "act-1", landed: false }]);
  });

  it("asks about a removal the ledger admits on the act's own item with nothing unasked, and tells the model plainly when it is refused (t475)", async () => {
    const reset = ledger(() => DELETE_OK, () => ({ kind: "admit", on: "own", allowed: [] }));
    const run = build({ siteReset: reset.calls });
    const execution = await run.call("call.1", { declaration: REMOVE as unknown as JsonObject, undoes: "act-1" });

    expect(run.permissions.request()?.missing).toEqual(["delete"]);
    expect(execution).toMatchObject({ kind: "llm_evidence_tool_execution", effectApplied: false, resultCode: "candidate.undo_refused",
      evidence: { ok: false, code: "candidate.undo_refused", act: "act-1", refusal: { ok: false, code: "permission_required" } } });
    expect(String((execution as { evidence: { instruction: string } }).evidence.instruction)).toContain("this act stays as it is");
    expect(reset.explored[0]).toMatchObject({ undoes: "act-1", on: "own", declared: { permitted: false }, landed: false });
  });

  it("answers a refused claim without running the call", async () => {
    const evidence = { ok: false, code: "candidate.undo_unknown_act", acts: ["act-1"] };
    const reset = ledger(() => ({ kind: "refused", evidence }));
    const run = build({ siteReset: reset.calls });
    const execution = await run.call("call.1", { declaration: REMOVE as unknown as JsonObject, undoes: "act-9" });

    expect(execution).toEqual({ kind: "llm_evidence_tool_execution", evidence, effectApplied: false, targetsUnchanged: true, resultCode: "candidate.undo_unknown_act" });
    expect(run.seen).toEqual([]);
    expect(reset.explored).toEqual([]);
    expect(run.permissions.declarations()).toEqual([]);
  });

  it("asks as before about a delete on a call that names no act, and reports it did not land", async () => {
    const reset = ledger(() => ({ kind: "none" }));
    const run = build({ siteReset: reset.calls });
    await run.call("call.2", { declaration: REMOVE as unknown as JsonObject });

    expect(reset.claims).toEqual([]);
    expect(run.permissions.request()?.missing).toEqual(["delete"]);
    expect(reset.explored).toEqual([{
      callId: "call.2",
      toolId: "core.run_node",
      declared: { permitted: false, effect: "mutate", consequences: ["delete"], control: { name: null, kind: "button" }, verb: "press" },
      landed: false
    }]);
  });

  it("strips a key the ledger read as no claim, and reports a call that declared nothing without a declaration", async () => {
    const reset = ledger(() => ({ kind: "none" }));
    const run = build({ siteReset: reset.calls });
    await run.call("call.3", { undoes: null });

    expect(reset.claims).toEqual([null]);
    expect(run.seen).toEqual([{}]);
    expect(reset.explored).toEqual([{ callId: "call.3", toolId: "core.run_node", landed: true }]);
  });

  it("does not count a call that answered `ok: false`, or a plain answer, as landed", async () => {
    const refused = ledger(() => DELETE_OK);
    await build({ siteReset: refused.calls, answer: () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: false }, effectApplied: true }) })
      .call("call.4", { declaration: REMOVE as unknown as JsonObject, undoes: "act-1" });
    const plain = ledger(() => DELETE_OK);
    await build({ siteReset: plain.calls, answer: () => ({ ok: true }) }).call("call.5", { undoes: "act-1" });

    expect(refused.explored[0]?.landed).toBe(false);
    expect(plain.explored[0]).toEqual({ callId: "call.5", toolId: "core.run_node", undoes: "act-1", landed: false });
  });

  it("leaves a build without a ledger exactly as it was: the key goes through and a delete is asked about", async () => {
    const run = build();
    await run.call("call.6", { declaration: REMOVE as unknown as JsonObject, undoes: "act-1" });

    expect(run.seen).toEqual([{ declaration: REMOVE, undoes: "act-1" }]);
    expect(run.permissions.request()?.missing).toEqual(["delete"]);
    expect(run.permissions.declarations()[0]?.undoes).toBeUndefined();
  });

  it("raises no cross-check for a build whose every action was an undo", async () => {
    const run = build({ siteReset: ledger(() => DELETE_OK).calls });
    await run.call("call.7", { declaration: REMOVE as unknown as JsonObject, undoes: "act-1" });

    expect(run.permissions.declarations()).toHaveLength(1);
    expect(await run.permissions.crossCheck()).toBeUndefined();
  });
});
