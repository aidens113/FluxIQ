// The act gate over what domains really answer: the shapes below are the web domain's
// (`domain/src/runtime/llm-evidence/node-run/run.ts`, `replay.ts`, `outcome.ts`) and
// Core's replay calls (`S/runtime/llm/node-tools/replay/replay.ts`). A site's words here
// are a stand-in shop's, unrelated to any realistic scenario.

import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../flow-authoring/draft/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../../llm/index.ts";
import { AUTOMATION_STUDIO_NODE_REPLAY_ITEM_KEY, AUTOMATION_STUDIO_NODE_REPLAY_KEY, AUTOMATION_STUDIO_NODE_REPLAY_REACH_KEY, AUTOMATION_STUDIO_NODE_WRITE_KEY, automationStudioNodeReplayStepCall, automationStudioNodeReplayVerifyCall } from "../../../../llm/node-tools/replay/index.ts";
import { AutomationStudioAttemptActRecord, automationStudioAttemptActForward, automationStudioAttemptActGate } from "../../index.ts";

const PRESS = "domain.output.press";
const TARGET = { selector: "#save", element: { tag: "button", text: "Save it" } };
type Call = { callId: string; toolId: string; value: JsonObject };
type Answer = AutomationStudioLlmEvidenceToolExecutionResult;

const pressed = (over: Partial<Answer> = {}, evidence: JsonObject = {}): Answer => ({
  kind: "llm_evidence_tool_execution", evidence: { ok: true, status: "succeeded", pageChanged: true, ...evidence }, effectApplied: true, resultCode: "web.action.succeeded",
  draft: { actionId: PRESS, effect: "mutate", input: { node: PRESS }, ranWith: { node: PRESS, parameters: TARGET, consequences: ["create_new"] }, proposes: true },
  ...over
});
const looked = (evidence: JsonObject = {}): Answer => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true, status: "succeeded", ...evidence }, effectApplied: false, resultCode: "web.inspect.ok", draft: { actionId: "domain.output.snapshot", effect: "observe", proposes: false } });
const pressCall = (callId = "c1", handle = "t7", consequences: string[] = ["create_new"]): Call => ({ callId, toolId: "core.run_node", value: { node: PRESS, parameters: { target: { handle } }, consequences } });
const lookCall = (callId = "look"): Call => ({ callId, toolId: "core.run_node", value: { node: "domain.output.snapshot", parameters: {}, consequences: [] } });

function gated(answers: Array<Answer | Error>) {
  const record = new AutomationStudioAttemptActRecord();
  const dispatched: Call[] = [];
  const execute = automationStudioAttemptActGate({
    record,
    executeTool: async (call: Call) => {
      dispatched.push(call);
      const next = answers.shift();
      if (next instanceof Error) throw next;
      return next ?? looked();
    }
  });
  return { record, dispatched, execute };
}

describe("a press the page says it did not make", () => {
  it("puts nothing on the record, whatever it declared, since its control already showed the state asked for", async () => {
    const { execute, record } = gated([pressed({}, { skipped: "already_in_state" }), pressed({}, { skipped: "already_in_state" })]);
    await execute(pressCall());
    await execute(pressCall("c2", "t8", []));
    expect(record.data().acts).toEqual([]);
  });
});

describe("before dispatch", () => {
  it("answers an identical landed repeat as what happened, in generic words, known by its act and not as a refusal of the page, and sends nothing", async () => {
    const { execute, dispatched, record } = gated([pressed()]);
    await execute(pressCall());
    const again = await execute(pressCall("c2")) as Answer;
    expect(dispatched).toHaveLength(1);
    expect(again).toMatchObject({ kind: "llm_evidence_tool_execution", effectApplied: false, targetsUnchanged: true, resultCode: "attempt.act_already_done", evidence: { code: "attempt.act_already_done" }, draft: { effect: "mutate", proposes: false, ranWith: { act: record.acts()[0]!.id } } });
    expect((again.evidence as { ok?: boolean }).ok).toBeUndefined();
    expect(JSON.stringify(again.evidence)).toMatch(/already happened/u);
    expect(record.acts()).toHaveLength(1);
  });

  it("refuses the frozen form of the same act too, as a forward pass sends it", async () => {
    const { execute, dispatched } = gated([pressed()]);
    await execute(pressCall());
    const pass = await execute({ callId: "c2", toolId: "core.run_node", value: { node: PRESS, parameters: TARGET, consequences: ["create_new"], replay: "step" } }) as Answer;
    expect(pass.resultCode).toBe("attempt.act_already_done");
    expect(dispatched).toHaveLength(1);
  });

  it("refuses a may-have-landed repeat until a look, then dispatches it", async () => {
    const uncertain = pressed({ effectApplied: false, resultReason: "outcome_uncertain" }, { ok: false });
    const { execute, dispatched, record } = gated([uncertain, looked(), pressed()]);
    await execute(pressCall());
    expect(record.acts()).toEqual([expect.objectContaining({ state: "may_have_landed" })]);
    const refused = await execute(pressCall("c2")) as Answer;
    expect(refused).toMatchObject({ effectApplied: false, resultCode: "attempt.act_look_first", evidence: { ok: false, code: "attempt.act_look_first" } });
    expect(dispatched).toHaveLength(1);
    await execute(lookCall());
    const retried = await execute(pressCall("c3")) as Answer;
    expect(retried.effectApplied).toBe(true);
    expect(dispatched).toHaveLength(3);
    expect(record.acts()).toEqual([expect.objectContaining({ state: "landed" })]);
  });
});

describe("how an answer is read", () => {
  it("holds a press that drew no change through the wait as may have landed, though its command answered", async () => {
    const { execute, record } = gated([pressed({}, { effectUncertain: "The page drew no change." })]);
    await execute(pressCall());
    expect(record.acts()).toEqual([expect.objectContaining({ state: "may_have_landed" })]);
  });

  it("holds a failure the contract calls ambiguous as may have landed", async () => {
    const { execute, record } = gated([pressed({ effectApplied: false, failure: { category: "output_not_observed", code: "core.step.effect_not_seen", retryable: false, stage: "verification", effect: "ambiguous" } })]);
    await execute(pressCall());
    expect(record.acts()).toEqual([expect.objectContaining({ state: "may_have_landed" })]);
  });

  it("records nothing of a press the page refused or that changed nothing", async () => {
    const refused = gated([pressed({ effectApplied: false }, { ok: false, reason: "target_not_found" })]);
    await refused.execute(pressCall());
    expect(refused.record.acts()).toEqual([]);
    const noEffect = gated([pressed({}, { status: "no_effect" })]);
    await noEffect.execute(pressCall());
    expect(noEffect.record.acts()).toEqual([]);
    expect(noEffect.record.forModel().acts).toEqual([]);
  });

  it("never records a read, whatever it declared (a read that says it creates still only reads)", async () => {
    const { execute, record, dispatched } = gated([looked(), looked()]);
    const read: Call = { callId: "r", toolId: "core.run_node", value: { node: "domain.output.read", parameters: {}, consequences: ["create_new"] } };
    await execute(read);
    await execute({ ...read, callId: "r2" });
    expect(record.acts()).toEqual([]);
    expect(dispatched).toHaveLength(2);
  });

  it("holds a declared call that threw as may have landed, and throws on", async () => {
    const { execute, record } = gated([new Error("the answer was lost")]);
    await expect(execute(pressCall())).rejects.toThrow("the answer was lost");
    expect(record.acts()).toEqual([expect.objectContaining({ state: "may_have_landed" })]);
    await expect(execute(pressCall("c2"))).resolves.toMatchObject({ resultCode: "attempt.act_look_first" });
  });

  it("reads the declaration inside parameters, as the domain forgives it", async () => {
    const { execute, record } = gated([pressed()]);
    await execute({ callId: "c", toolId: "core.run_node", value: { node: PRESS, parameters: { target: { handle: "t7" }, consequences: ["delete"] } } });
    expect(record.acts()).toEqual([expect.objectContaining({ classes: ["delete"], state: "landed" })]);
  });

  it("reads a domain's own press tool at its top level", async () => {
    const { execute, record } = gated([pressed({ draft: { effect: "mutate" } })]);
    await execute({ callId: "c", toolId: "domain.press_control", value: { target: "t7", consequences: ["create_new"] } });
    expect(record.acts()).toEqual([expect.objectContaining({ state: "landed" })]);
    await expect(execute({ callId: "d", toolId: "domain.press_control", value: { target: "t7", consequences: ["create_new"] } })).resolves.toMatchObject({ resultCode: "attempt.act_already_done" });
  });

  it("takes words only from wordsOf, screened, and otherwise says the class generically", async () => {
    const record = new AutomationStudioAttemptActRecord();
    const words = vi.fn(() => ({ what: "<b>Saved</b>", where: "On the shop's page" }));
    const execute = automationStudioAttemptActGate({ record, executeTool: async (_call: Call) => pressed(), wordsOf: words });
    await execute(pressCall());
    expect(words).toHaveBeenCalledOnce();
    expect(record.acts()).toEqual([expect.objectContaining({ what: "Save it", where: "On the shop's page" })]);
  });
});

describe("an undeclared press", () => {
  it("is recorded when it took effect, never refused, and left out of a result's acts", async () => {
    const { execute, dispatched, record } = gated([pressed({}, {}), pressed({}, {})]);
    await execute(pressCall("c1", "t7", []));
    await execute(pressCall("c2", "t7", []));
    expect(dispatched).toHaveLength(2);
    expect(record.acts()).toEqual([]);
    expect(record.forModel().acts).toEqual([expect.objectContaining({ undeclared: true, state: "may_have_landed" })]);
  });

  it("is not recorded when it moved to an address, or its answer says the page did not change", async () => {
    const { execute, record } = gated([pressed(), pressed({}, { pageChanged: false })]);
    await execute({ callId: "go", toolId: "core.run_node", value: { node: "domain.output.navigate", parameters: { url: "https://shop.test/" }, consequences: [] } });
    await execute(pressCall("c2", "t7", []));
    expect(record.forModel().acts).toEqual([]);
  });
});

describe("replay calls", () => {
  const step: AutomationStudioFlowDraftStep = {
    position: 1, iteration: 1, actionId: PRESS, toolId: "core.run_node",
    input: { node: PRESS, parameters: { target: { handle: "t7" } }, consequences: ["create_new"] },
    ranWith: { node: PRESS, parameters: TARGET, consequences: ["create_new"] },
    effect: "mutate", effectApplied: true, disposition: "kept", proposes: true, replay: { from: { location: "https://shop.test/" } }
  };
  const replayed = pressed({ resultCode: "core.replay.replayed" });

  it("a forward run counts as left out what this gate refused as done or maybe done, and nothing else", () => {
    const { answeredDone } = automationStudioAttemptActForward(new AutomationStudioAttemptActRecord());
    for (const code of ["attempt.act_already_done", "attempt.act_row_unclear", "attempt.act_look_first"]) expect(answeredDone(code)).toBe(true);
    for (const code of ["attempt.act_not_recorded", "core.replay.failed", "core.replay.replayed", undefined]) expect(answeredDone(code)).toBe(false);
  });

  it("reads the reserved keys the replay names: the gate restates them, so this fails if the two part", () => {
    expect([AUTOMATION_STUDIO_NODE_REPLAY_KEY, AUTOMATION_STUDIO_NODE_REPLAY_ITEM_KEY, AUTOMATION_STUDIO_NODE_WRITE_KEY, AUTOMATION_STUDIO_NODE_REPLAY_REACH_KEY]).toEqual(["replay", "item", "write", "reach"]);
  });

  it("reads a forward pass as an act on its row, by the call Core really sends", async () => {
    const { execute, record, dispatched } = gated([replayed]);
    const row = { name: "Oak", $handle: "read-1" };
    const value = automationStudioNodeReplayStepCall(step, { item: row, parameters: TARGET })!;
    await execute({ callId: "p1", toolId: "core.run_node", value });
    expect(record.rowDone({ name: "Oak", $handle: "read-2" })).toBe(true);
    expect(record.acts()).toEqual([expect.objectContaining({ state: "landed", rowIdentity: expect.stringMatching(/^sha256:/u) })]);
    await expect(execute({ callId: "p2", toolId: "core.run_node", value })).resolves.toMatchObject({ resultCode: "attempt.act_already_done" });
    expect(dispatched).toHaveLength(1);
  });

  it("holds a replayed step Core left uncertain to a look", async () => {
    const { execute, record } = gated([pressed({ effectApplied: false, resultCode: "core.replay.failed", resultReason: "outcome_uncertain" }, { ok: false, code: "core.replay.failed", reason: "outcome_uncertain" })]);
    await execute({ callId: "p1", toolId: "core.run_node", value: automationStudioNodeReplayStepCall(step)! });
    expect(record.acts()).toEqual([expect.objectContaining({ state: "may_have_landed" })]);
  });

  it("reads a verify as an observation and never an act", async () => {
    const { execute, record, dispatched } = gated([pressed({ effectApplied: false, resultReason: "outcome_uncertain" }, { ok: false }), pressed({ effectApplied: false, resultCode: "core.replay.present", draft: {} }, { ok: true })]);
    await execute(pressCall());
    expect(record.admit({ actionId: PRESS, parameters: { target: { handle: "t7" } }, consequences: ["create_new"], stage: "forward" }).kind).toBe("look_first");
    await execute({ callId: "v", toolId: "core.run_node", value: automationStudioNodeReplayVerifyCall(step)! });
    expect(dispatched).toHaveLength(2);
    expect(record.acts()).toHaveLength(1);
    expect(record.admit({ actionId: PRESS, parameters: { target: { handle: "t7" } }, consequences: ["create_new"], stage: "forward" })).toEqual({ kind: "run" });
  });

  it("lets a reset and a written step through without reading them", async () => {
    const { execute, record, dispatched } = gated([pressed(), pressed()]);
    await execute({ callId: "r", toolId: "core.run_node", value: { replay: "reset", from: { location: "x" } } });
    await execute({ callId: "w", toolId: "core.run_node", value: { node: PRESS, parameters: { target: { handle: "t7" } }, consequences: ["create_new"], write: true } });
    expect(dispatched).toHaveLength(2);
    expect(record.acts()).toEqual([]);
  });
});

describe("a by-hand first row, then a forward run on the rest (plan D2)", () => {
  const rows = [{ name: "Oak Desk", link: "https://shop.test/p/oak" }, { name: "Elm Desk", link: "https://shop.test/p/elm" }];
  const shown = rows.map((row) => ({ ...row, link: row.link.replace("https://shop.test", "") }));

  it("takes the row the press named as done, from the rows the read showed, so a pass with its carried row is left out", async () => {
    const read = looked({ read: { extracted: shown } });
    const { execute, record } = gated([read, pressed({}, { actedOn: "This acted on item 1/2 (Oak Desk) only, through its \"Add\"; no other item was acted on." })]);
    await execute(lookCall());
    await execute(pressCall());
    const forward = automationStudioAttemptActForward(record);
    expect(forward.rowDone(rows[0]!)).toBe(true);
    expect(forward.rowDone(rows[1]!)).toBe(false);
  });

  it("takes an act on a row's own page as that row's, with no list on the page to name it", async () => {
    const read = looked({ read: { extracted: shown } });
    const opened = pressed({ draft: { effect: "mutate" } }, { location: "https://shop.test/p/elm" });
    const { execute, record } = gated([read, opened, pressed({}, { location: "https://shop.test/cart" })]);
    await execute(lookCall());
    await execute({ callId: "go", toolId: "core.run_node", value: { node: "domain.output.navigate", parameters: { url: "https://shop.test/p/elm" }, consequences: [] } });
    await execute(pressCall("c3", "t31"));
    expect(record.rowDone(rows[1]!)).toBe(true);
    expect(record.rowDone(rows[0]!)).toBe(false);
  });

  it("notes rows carried under an output port as it does those it showed", async () => {
    const { execute, record } = gated([{ ...looked(), outputs: { records: rows } }, pressed({}, { actedOn: "This acted on item 2/2 (Elm Desk) only." })]);
    await execute(lookCall());
    await execute(pressCall());
    expect(record.rowDone(shown[1]!)).toBe(true);
  });

  it("answers stepDone for a draft step by what it ran with", async () => {
    const { execute, record } = gated([pressed()]);
    const forward = automationStudioAttemptActForward(record);
    const step = { actionId: PRESS, input: {}, ranWith: { node: PRESS, parameters: TARGET } } as unknown as AutomationStudioFlowDraftStep;
    expect(forward.stepDone(step)).toBe(false);
    await execute(pressCall());
    expect(forward.stepDone(step)).toBe(true);
  });
});
