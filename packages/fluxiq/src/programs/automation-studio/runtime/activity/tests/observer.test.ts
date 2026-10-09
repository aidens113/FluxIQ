import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../llm/index.ts";
import { automationStudioActivityDecisionReason } from "../decision-reason.ts";
import { automationStudioActivityHub } from "../default-hub.ts";
import { observeAutomationStudioEvidenceLoop } from "../observer.ts";
import { AutomationStudioLlmUnusableDecisionError, runAutomationStudioLlmEvidenceLoop } from "../../llm/index.ts";
import { runWithAutomationStudioActivity } from "../scope.ts";
import { activityActionOf } from "../../../../../ui/index.ts";
import { automationStudioLlmEvidenceCompletionAttempt } from "../../llm/evidence-loop/index.ts";
import { automationStudioReauthorEndingWatch } from "../../recovery/refuted-result/index.ts";

let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;
beforeEach(() => {
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});
afterEach(() => unsubscribe());

const inScope = <T>(fn: () => Promise<T>) => runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, fn);
const decideRequest = { iteration: 1, tools: [], evidence: [], decisionSchema: {}, canComplete: true };
const call = (toolId: string) => ({ callId: "c1", toolId, value: {} });

function loopInput(overrides: Partial<AutomationStudioLlmEvidenceLoopInput> = {}): AutomationStudioLlmEvidenceLoopInput {
  return {
    tools: [],
    decide: async () => ({ kind: "secret model output" }),
    executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { observed: "target content" }, effectApplied: false, resultCode: "tool.ok" }),
    ...overrides
  };
}

describe("observeAutomationStudioEvidenceLoop", () => {
  it("passes every other field through", () => {
    const input = loopInput({ maxIterations: 7 });
    const observed = observeAutomationStudioEvidenceLoop(input);
    expect(observed.maxIterations).toBe(7);
    expect(observed.tools).toBe(input.tools);
    expect(observed.checkCompletion).toBeUndefined();
  });

  it("says thinking on decide and returns the decision unchanged, without its content", async () => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput());
    const decision = await inScope(() => observed.decide(decideRequest));
    expect(decision).toEqual({ kind: "secret model output" });
    expect(seen.map((event) => event.phase)).toEqual(["thinking"]);
    expect(JSON.stringify(seen)).not.toContain("secret");
  });

  it("says exploring for a domain tool, with its id and result code, and never the evidence", async () => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput());
    const result = await inScope(() => observed.executeTool(call("domain.inspect")));
    expect(result).toMatchObject({ resultCode: "tool.ok" });
    expect(seen.map((event) => [event.phase, event.detail?.status, event.detail?.ref])).toEqual([
      ["exploring", "started", "domain.inspect"], ["exploring", "succeeded", "domain.inspect"]
    ]);
    expect(seen[1]!.detail?.text).toBe("Result: tool.ok");
    expect(JSON.stringify(seen)).not.toContain("target content");
  });

  it("says a check that cleared by itself as a waited-out wait, before the call's own end", async () => {
    const cleared = { kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: true, resultCode: "tool.ok", clearedWait: { waitedMs: 12_300 } };
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ executeTool: async () => cleared }));
    const result = await inScope(() => observed.executeTool(call("domain.act")));
    expect(result).toBe(cleared);
    expect(seen.map((event) => [event.phase, event.detail?.kind, event.detail?.status, event.detail?.ref, event.detail?.resolution])).toEqual([
      ["exploring", "tool", "started", "domain.act", undefined],
      ["waiting_permission", "ask", "started", "waited-out.c1", undefined],
      ["exploring", "ask", "succeeded", "waited-out.c1", "waited_out"],
      ["exploring", "tool", "succeeded", "domain.act", undefined]
    ]);
    expect(seen[2]!.detail?.text).toBe("The check cleared on its own after 12 s.");
  });

  it("says no wait for a malformed cleared wait", async () => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: false, clearedWait: { waitedMs: "12300" } }) }));
    await inScope(() => observed.executeTool(call("domain.act")));
    expect(seen.map((event) => event.detail?.kind)).toEqual(["tool", "tool"]);
  });

  // R2-U-6 (`run-muwansvz-a2b4a987`, steps 0034, 0039 and 0046): a list read
  // refused for its list (`malformed_handle`), then refused the same way again,
  // which the domain says as `answered_the_same_again`: the repeats read "it
  // wasn't on the page". A repeat carries the cause the first refusal gave.
  it("carries the cause of a refusal onto the same refusal given again", async () => {
    const LIST = "web.output.dom-extract_list";
    const reasons = ["malformed_handle", "answered_the_same_again", "answered_the_same_again"];
    const observed = observeAutomationStudioEvidenceLoop(loopInput({
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: false, resultCode: "web.action.rejected.target_unobserved", resultReason: reasons.shift() ?? "" })
    }));
    for (const callId of ["rerun.5", "rerun.8", "rerun.8.2"]) await inScope(() => observed.executeTool({ callId, toolId: "core.run_node", value: { node: LIST, parameters: {} } }));
    const ends = seen.filter((event) => event.detail?.status === "succeeded");
    expect(ends.map((event) => event.detail?.text)).toEqual(Array(3).fill(`Result: web.action.rejected.target_unobserved · Reason: malformed_handle · Node: ${LIST}`));
    for (const end of ends) expect(activityActionOf(end)?.why).toBe("FluxIQ didn't read it, as the step didn't say which list on the page to read");
  });

  it("leaves a repeat whose first refusal it never saw as a repeat", async () => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput({
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: false, resultCode: "web.action.rejected.target_unobserved", resultReason: "answered_the_same_again" })
    }));
    await inScope(() => observed.executeTool({ callId: "rerun.8", toolId: "core.run_node", value: { node: "web.output.dom-extract_list", parameters: {} } }));
    expect(seen[1]!.detail?.text).toContain("Reason: answered_the_same_again");
    expect(activityActionOf(seen[1]!)?.why).toBe("FluxIQ didn't read it, for the same reason as the time before");
  });

  it("says building for the draft tool", async () => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ executeTool: async () => ({ ok: true }) }));
    await inScope(() => observed.executeTool(call(AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID)));
    expect(seen.map((event) => event.phase)).toEqual(["building", "building"]);
  });

  it("rethrows a tool's error and says it failed", async () => {
    const error = new Error("tool broke");
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ executeTool: async () => { throw error; } }));
    await expect(inScope(() => observed.executeTool(call("domain.act")))).rejects.toBe(error);
    expect(seen.map((event) => event.detail?.status)).toEqual(["started", "failed"]);
  });

  it("rethrows a decide error unchanged", async () => {
    const error = new Error("provider down");
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => { throw error; } }));
    await expect(inScope(() => observed.decide(decideRequest))).rejects.toBe(error);
  });

  it("says verifying around the completion check and returns its verdict", async () => {
    const refusal = { ok: false as const, issueCodes: ["core.plan.empty"], feedback: {} };
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ checkCompletion: async () => refusal }));
    const check = await inScope(async () => await observed.checkCompletion!({}, { steps: [] }));
    expect(check).toBe(refusal);
    expect(seen.map((event) => [event.phase, event.detail?.status])).toEqual([["verifying", "started"], ["verifying", "failed"]]);
    expect(seen[1]!.detail?.text).toBe("It needs changes before it can be used, and it goes back to be fixed. One thing needs fixing.");
    expect(seen[1]!.detail?.text).not.toContain("core.plan.empty");
  });

  it("says the model's stated reason once decide returns, as a thought naming the action", async () => {
    const decision = automationStudioActivityDecisionReason.attach(
      { kind: "tool_call", callId: "c1", toolId: "core.run_node", input: { node: "web.output.dom-click", parameters: { element: { accessibleName: "Get a free quote" } } } },
      "Clicking   the quote button to open the form the request asks about."
    );
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => decision }));
    const returned = await inScope(() => observed.decide(decideRequest));
    expect(returned).toBe(decision);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({ phase: "thinking", label: "Deciding the next step", detail: { kind: "thought", status: "started" } });
    expect(seen[1]).toMatchObject({
      phase: "exploring",
      label: "Clicking “Get a free quote”",
      detail: { kind: "thought", title: "Clicking “Get a free quote”", text: "Clicking the quote button to open the form the request asks about.", status: "succeeded" }
    });
  });

  it("says building for a draft edit and verifying for a completion, with their reasons", async () => {
    for (const [value, phase, title] of [
      [{ kind: "amend_draft", amendments: [] }, "building", "Changing the Flow"],
      [{ kind: "complete", result: {} }, "verifying", "Checking whether the Flow is finished"]
    ] as const) {
      seen = [];
      const decision = automationStudioActivityDecisionReason.attach({ ...value }, "Because the Flow now covers the request.");
      const observed = observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => decision }));
      // A draft edit is said once the loop has gone on without refusing it ("an edit to the draft", below).
      await inScope(async () => { await observed.decide(decideRequest); if (value.kind === "amend_draft") await observed.decide({ ...decideRequest, iteration: 2 }); });
      expect(seen[1]).toMatchObject({ phase, label: title, detail: { kind: "thought", title, text: "Because the Flow now covers the request.", status: "succeeded" } });
    }
  });

  it("says no reason row when the decision carries none", async () => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => ({ kind: "complete", result: {} }) }));
    await inScope(() => observed.decide(decideRequest));
    expect(seen.map((event) => event.phase)).toEqual(["thinking"]);
  });

  it("is silent outside a scope", async () => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput());
    await observed.decide(decideRequest);
    await observed.executeTool(call("domain.inspect"));
    expect(seen).toEqual([]);
  });

  // Live run `run-muq05kas-058193f0`: a provider outage left "Deciding the next
  // step" open for six minutes. A decision that never came now closes its row,
  // and a provider that gave no answer is said in words.
  it("closes the decision row when no decision came, and says a provider that did not answer in words", async () => {
    // R3-U-7 of live-C-r3-ui-review (run-mux6naez-6c20f26e, step 0041): a reply that came back
    // unreadable read "Deciding the next step — didn't work", a failed step; it is said as a reply
    // that could not be used and is asked again, and nothing else reads "didn't work" either.
    // Lane C (run-mv0fuotv-805294d7, t378) read "Decided the next step — The AI model's reply couldn't be
    // read or used": a reply asked for again says what FluxIQ does about it, in plain words. The row keeps
    // the decision row's own title, which is what closes that row (provider-unavailable.test.ts).
    for (const [thrown, label, title, said] of [
      [new AutomationStudioLlmUnusableDecisionError(["llm.provider_timeout"]), "The AI model provider did not answer", "Deciding the next step", "The AI model provider didn't answer, so FluxIQ is asking it again. If it keeps not answering, the build stops."],
      [new AutomationStudioLlmUnusableDecisionError(["llm.provider_malformed_response"]), "The AI model's answer couldn't be used", "Deciding the next step", "The AI model's answer didn't make sense, so FluxIQ is asking it again. If that keeps happening, the build stops."],
      [new Error("anything else"), "Deciding the next step — stopped", "Deciding the next step", undefined]
    ] as const) {
      seen = [];
      const observed = observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => { throw thrown; } }));
      await expect(inScope(() => observed.decide(decideRequest))).rejects.toBe(thrown);
      expect(seen.map((event) => [event.detail?.title, event.detail?.status])).toEqual([["Deciding the next step", "started"], [title, "failed"]]);
      expect(seen[1]!.label).toBe(label);
      expect(seen[1]!.detail?.text).toBe(said);
    }
  });
});

// Every chat step says what it does (user rule): the decision's heading and the call's card name the
// control and the words the call types, as the bound domain describes them (crossborder run-muqc07fh-eeffbc86).
describe("a call the bound domain describes", () => {
  const typing = { kind: "tool_call", callId: "c1", toolId: "core.run_node", input: { node: "web.output.dom-type", parameters: { target: { handle: "t11" }, text: "USB-C hub", submit: true }, consequences: [] } };
  const describeCall = (call: { toolId: string; value: Record<string, unknown> }) => {
    const parameters = call.value.parameters as { target?: { handle?: string }; text?: string } | undefined;
    return parameters?.target?.handle === "t11" ? { target: "Search", text: parameters.text } : undefined;
  };

  it("heads the decision and titles the call with the control and the words typed", async () => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ describeCall, decide: async () => automationStudioActivityDecisionReason.attach({ ...typing }, "Search for the hub.") as never }));
    await inScope(async () => {
      await observed.decide(decideRequest);
      await observed.executeTool({ callId: "c1", toolId: "core.run_node", value: typing.input });
    });
    const titles = seen.map((event) => event.detail?.title);
    expect(titles).toContain('Typing "USB-C hub" into “Search”');
    expect(seen.filter((event) => event.detail?.kind === "tool").map((event) => event.detail?.title)).toEqual(['Typing "USB-C hub" into “Search”', 'Typing "USB-C hub" into “Search”']);
  });

  // Live run `run-muqiojz4-04a7a8fc`: asked again after the click, the handle was gone with the
  // popup it closed, and the row that ended the press of "No thanks" read "Clicking on the page".
  it("asks the domain once, before the call runs, and keeps its words for the call's end", async () => {
    let asked = 0;
    const once = (call: { toolId: string; value: Record<string, unknown> }) => (asked++ === 0 ? describeCall(call) : undefined);
    for (const executeTool of [async () => ({ kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: true, resultCode: "web.action.succeeded" }), async () => { throw new Error("gone"); }]) {
      seen = [];
      asked = 0;
      const observed = observeAutomationStudioEvidenceLoop(loopInput({ describeCall: once, executeTool: executeTool as never }));
      await inScope(() => observed.executeTool({ callId: "c1", toolId: "core.run_node", value: typing.input })).catch(() => undefined);
      expect(asked).toBe(1);
      expect(seen.map((event) => event.detail?.title)).toEqual(['Typing "USB-C hub" into “Search”', 'Typing "USB-C hub" into “Search”']);
    }
  });

  // D4 of the t342 round 2 UI review (run-muylu4pp-f9cb2121, step 0139, moment 12): a rerun's
  // press named the quantity field by a handle the replays' reload had renumbered, so the domain
  // could name nothing before the call, and the card read "Click · Working on it" to its end; the
  // node run's own look showed the same handle as "Quantity". A name the start lacked is asked for
  // again at the end, and the end's row names it.
  it("asks again at the call's end when the domain named nothing before it, and names the end's row", async () => {
    const press = { node: "web.output.dom-click", parameters: { target: { handle: "t964" } }, consequences: [] };
    let shown = false;
    const describeAfterLook = () => (shown ? { target: "Quantity" } : undefined);
    const observed = observeAutomationStudioEvidenceLoop(loopInput({
      describeCall: describeAfterLook,
      executeTool: async () => { shown = true; return { kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: true, resultCode: "web.action.succeeded" }; }
    }));
    await inScope(() => observed.executeTool({ callId: "rerun.10.2", toolId: "core.run_node", value: press }));
    expect(seen.map((event) => event.detail?.title)).toEqual(["Clicking on the page", "Clicking “Quantity”"]);
    expect(seen[1]!.label).toBe("Trying again: clicking “Quantity” — done");
    expect(activityActionOf(seen[1]!)?.target).toBe("Quantity");
  });

  it("says the verb alone when the domain describes nothing, or answers in another shape", async () => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ describeCall: () => ({ target: 7 }) as never }));
    await inScope(() => observed.executeTool({ callId: "c1", toolId: "core.run_node", value: typing.input }));
    expect(seen[0]!.detail?.title).toBe("Typing into the page");
  });

  // R2-U-9 (`run-muwansvz-a2b4a987`, moment 04): the detection's card read "Look · the repeating
  // list on the page". The domain's answer names the list when the page does (`list`), and the row
  // ends named by it; the card reads that name.
  it("ends a detection named by the list its answer found, when the page names it", async () => {
    const detect = { callId: "c1", toolId: "web.detect_repeating_structure", value: { target: "t12" } };
    const answer = (list?: string) => async () => ({ kind: "llm_evidence_tool_execution", evidence: { extraction: "extraction.1", itemCount: 3, ...(list === undefined ? {} : { list }) }, effectApplied: false, resultCode: "web.structure.detected" });
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ describeCall: () => ({ target: "Pulse Buds" }), executeTool: answer("Search results") as never }));
    await inScope(() => observed.executeTool(detect));
    expect(seen.map((event) => event.detail?.title)).toEqual(["Looking for the repeating list around “Pulse Buds”", "Looking for the list “Search results”"]);
    expect(activityActionOf(seen[1]!)?.target).toBe('the "Search results" list');

    seen = [];
    const unnamed = observeAutomationStudioEvidenceLoop(loopInput({ executeTool: answer() as never }));
    await inScope(() => unnamed.executeTool(detect));
    expect(seen.map((event) => event.detail?.title)).toEqual(["Looking for the repeating list on the page", "Looking for the repeating list on the page"]);
  });
});


// Live run `run-murdouox-c5294247` (t195, `S/0033`-`S/0036`): edits Core refused (`already_so`,
// `changes_nothing`) read in the chat as work done, "Updating the draft Flow -- Adding the repeat ...".
// An edit is said once the loop has answered it. Live run `run-musp4h2f-72e8ed99` (t193 1003, C13/C14):
// a refused edit was then a header and prose with no card, ending "so this was not done: <the model's
// summary>". The decision is now said as what was tried, and Core's answer is a card under it.
describe("an edit to the draft", () => {
  const ADDING = "Adding the repeat over the qualifying requests so the Flow confirms each of them.";
  const amend = (amendments: unknown[] = [{ step: 14, change: "repeat", over: 12 }]) => automationStudioActivityDecisionReason.attach({ kind: "amend_draft", amendments }, ADDING);
  const request = (iteration: number, evidence: Array<{ callId: string; toolId: string; value: never }> = []) => ({ ...decideRequest, iteration, evidence });
  const thoughts = () => seen.filter((event) => event.detail?.kind === "thought" && event.detail.status !== "started").map((event) => [event.detail?.title, event.detail?.text, event.detail?.status]);
  const cards = () => seen.filter((event) => event.detail?.kind === "tool" && event.detail.ref === AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID);
  const refused = (iteration: number, reasons: string[], applied = 0) => ({ callId: `core.amendment_check.${iteration}`, toolId: "core.amendment_check", value: { ok: false, refused: reasons.map((reason) => ({ step: 14, reason })), applied } as never });

  it("says an edit Core refused as what was tried, with a card saying it was not done and why", async () => {
    let next = amend();
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => next }));
    await inScope(async () => {
      await observed.decide(request(17));
      next = { kind: "complete", result: {} } as never;
      await observed.decide(request(18, [refused(17, ["already_so"])]));
    });
    expect(thoughts()).toEqual([["Changing the Flow", ADDING, "succeeded"]]);
    expect(cards()).toHaveLength(1);
    expect(cards()[0]).toMatchObject({ phase: "building", label: "Not done: changing the Flow — the Flow already does that", detail: { title: "Changing the Flow", status: "failed", text: "Result: llm_evidence_loop.draft_amendments_refused · Reason: already_so" } });
    expect(activityActionOf(cards()[0]!)).toMatchObject({ kind: "draft", outcome: "failed", refused: { all: true, because: "the Flow already does that" } });
    expect(activityActionOf(cards()[0]!)).not.toHaveProperty("result");
    // The card comes right after the decision it answers, before the next decision's own row.
    // The decision's heading and its card say the act in one word (D12 of the t342 round 2 UI review); the card is the tool row.
    const order = seen.map((event) => `${event.detail?.kind}:${event.detail?.title}`);
    expect(order.indexOf("tool:Changing the Flow")).toBe(order.indexOf("thought:Changing the Flow") + 1);
    // Never the model's summary as the thing not done, and never a header with no card.
    expect(JSON.stringify(seen)).not.toContain("so this was not done");
    expect(JSON.stringify(seen)).not.toContain("Didn't change the Flow");
  });

  it("says an edit done only in part as done in part, never as all it set out to do", async () => {
    let next = amend();
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => next }));
    await inScope(async () => {
      await observed.decide(request(10));
      next = { kind: "complete", result: {} } as never;
      await observed.decide(request(11, [refused(10, ["act_already_named", "bind_new_key", "made_up_reason"], 1)]));
    });
    expect(cards()[0]).toMatchObject({ label: "Changing the Flow — partly done", detail: { status: "succeeded", text: "Result: llm_evidence_loop.draft_amendments_refused · Reason: act_already_named,bind_new_key · Applied: 1" } });
    expect(activityActionOf(cards()[0]!)).toMatchObject({ outcome: "done", refused: { all: false, because: "that step already does that; and that step has no such value to make vary" } });
  });

  it("says a step asked to run again unchanged as not run again, whichever check refused it", async () => {
    for (const evidence of [
      refused(18, ["changes_nothing"]),
      { callId: "core.repeat_check.18", toolId: "core.repeat_check", value: { ok: false, code: "llm_evidence_loop.repeat_refused", then: { outcome: "changed_nothing" } } as never }
    ]) {
      seen = [];
      let next = automationStudioActivityDecisionReason.attach({ kind: "amend_draft", amendments: [{ step: 12, change: "rerun", input: {} }] }, "Rerunning the request listing with a where that keeps five or more mutual friends.");
      const observed = observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => next }));
      await inScope(async () => {
        await observed.decide(request(18));
        next = { kind: "complete", result: {} } as never;
        await observed.decide(request(19, [evidence]));
      });
      // The model's "Rerunning ..." is the draft's mechanics, screened from a decision's reason
      // (t174-w116 D3), so the decision says nothing of its own and the card alone answers it.
      expect(thoughts()).toEqual([]);
      expect(cards()).toHaveLength(1);
      expect(cards()[0]).toMatchObject({ detail: { title: "Running the step again", status: "failed" } });
      // U-8: said as not done, with Core's reason, never as the work under way.
      expect(cards()[0]!.label).toMatch(/^Not done: running the step again — .*already tried exactly this way/u);
      expect(activityActionOf(cards()[0]!)).toMatchObject({ kind: "draft", target: "run the step again", outcome: "failed", refused: { all: true } });
      expect(activityActionOf(cards()[0]!)?.refused?.because).toMatch(/already tried exactly this way/u);
    }
  });

  // U8, live run `run-musp39u8-9ac026ab` (moment 33; steps 0265-0267, 0179-0183):
  // edits the loop could not use (`decision_shape_invalid`) read "Updating the
  // draft Flow -- Rerunning the search step ..." as if done. Nothing was done, so
  // neither the decision's reason nor a "Change the Flow" card is said.
  it("says an edit the loop could not use as a decision that didn't work, never as the edit", async () => {
    let next = amend();
    const unusable = (iteration: number) => ({ callId: `core.decision_check.${iteration}`, toolId: "core.decision_check", value: { ok: false, code: "llm_evidence_loop.decision_shape_invalid" } as never });
    const stalledError = new Error("stalled");
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => next, unusableDecisions: { stalled: () => stalledError } }));
    await inScope(async () => {
      await observed.decide(request(265));
      await observed.decide(request(266, [unusable(265)]));
      // The round stalling on one says it the same way.
      next = amend();
      observed.unusableDecisions!.stalled({ issueCodes: ["llm_evidence_loop.decision_shape_invalid"], trace: [{ iteration: 266, decision: "unusable", resultCode: "llm_evidence_loop.decision_shape_invalid" }] as never, accounting: {} as never, steps: [] });
    });
    expect(JSON.stringify(seen)).not.toContain("Changing the Flow");
    expect(JSON.stringify(seen)).not.toContain(ADDING);
    expect(cards()).toEqual([]);
    expect(seen.filter((event) => event.detail?.status === "failed").map((event) => [event.label, event.detail?.title])).toEqual([
      ["Deciding the next step — didn't work", "Deciding the next step"],
      ["Deciding the next step — didn't work", "Deciding the next step"]
    ]);
  });

  it("says an edit that put the Flow back as it stood as not done", async () => {
    let next = amend();
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => next }));
    await inScope(async () => {
      await observed.decide(request(6));
      next = { kind: "complete", result: {} } as never;
      await observed.decide(request(7, [{ callId: "core.amendment_check.6", toolId: "core.amendment_check", value: { ok: false, refused: [], applied: 2, sameDraftAsIteration: 3 } as never }]));
    });
    expect(cards()[0]).toMatchObject({ detail: { status: "failed", text: "Result: llm_evidence_loop.draft_amendment_undone" } });
    expect(activityActionOf(cards()[0]!)).toMatchObject({ outcome: "failed", refused: { all: true } });
  });

  it("says an edit that landed as before, with a card saying it was done and what it changed", async () => {
    let next = amend();
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => next }));
    await inScope(async () => {
      await observed.decide(request(3));
      // Held until the loop answers: nothing is said of the edit yet.
      expect(thoughts()).toEqual([]);
      expect(cards()).toEqual([]);
      next = { kind: "complete", result: {} } as never;
      // A refusal of another decision is not this one's.
      await observed.decide(request(4, [refused(2, ["already_so"])]));
    });
    expect(thoughts()).toEqual([["Changing the Flow", ADDING, "succeeded"]]);
    expect(cards()).toHaveLength(1);
    expect(cards()[0]).toMatchObject({ label: "Changing the Flow — done: made step 14 repeat over step 12", detail: { title: "Changing the Flow", status: "succeeded", text: "Changed: made step 14 repeat over step 12" } });
    expect(activityActionOf(cards()[0]!)).toMatchObject({ kind: "draft", outcome: "done", why: null, result: "made step 14 repeat over step 12" });
    // It comes before the next decision's own row.
    expect(seen.findIndex((event) => event.detail?.kind === "tool" && event.detail.title === "Changing the Flow")).toBeLessThan(seen.map((event) => event.detail?.title).lastIndexOf("Deciding the next step"));
  });

  // U-8 (`run-muw60j7c-bb7c9a62`, moments 11-15): an edit that only asked for a
  // step to run again read "Edit the Flow · Done" before the rerun ran, and the
  // rerun was then not sent. The step's own rows are its card.
  it("says no card for an edit that landed and only asks a step to run again", async () => {
    const rerun = observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => amend([{ step: 12, change: "rerun", input: {} }]) }));
    await inScope(async () => {
      await rerun.decide(request(5));
      await rerun.executeTool({ callId: "rerun.12", toolId: "core.run_node", value: { node: "web.output.dom-extract" } });
    });
    expect(seen.map((event) => event.detail?.kind)).toEqual(["thought", "thought", "tool", "tool"]);
    expect(seen[1]!.detail?.title).toBe("Changing the Flow");
    expect(cards()).toEqual([]);
    expect(seen.filter((event) => event.detail?.kind === "tool").map((event) => event.detail?.ref)).toEqual(["core.run_node", "core.run_node"]);
    expect(JSON.stringify(seen)).not.toContain("Changing the Flow — done");
  });

  // U2, live run `run-muw60unq-591e23bd` (steps 0059-0060): the build dropped
  // step 9, Add to cart, and the card read only "Edit the Flow · Done".
  it("names each change Core applied, by the step the model was shown, never the model's summary", async () => {
    const draft = {
      callId: "core.flow_draft",
      toolId: "core.flow_draft",
      value: {
        steps: [
          { step: 8, actionId: "web.output.dom-type", does: { target: "Quantity", text: "3" }, inResult: true },
          { step: 9, actionId: "web.output.dom-click", does: { target: "Add to cart" }, inResult: true },
          { step: 10, actionId: "web.output.dom-click", does: { target: "Get coupon" }, inResult: false },
          { step: 11, actionId: "web.output.dom-click", does: { target: "Spain" }, inResult: true }
        ]
      } as never
    };
    const summary = "Dropping the now-empty step 9 (Add to cart) since the Spain selection moved to step 11, then re-adding the cart press after it.";
    let next = automationStudioActivityDecisionReason.attach({ kind: "amend_draft", amendments: [{ step: 9, change: "drop" }] }, summary);
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => next }));
    await inScope(async () => {
      await observed.decide(request(2, [draft]));
      next = automationStudioActivityDecisionReason.attach({ kind: "amend_draft", amendments: [{ step: 10, change: "add" }, { step: 11, change: "reorder", to: 8 }, { step: 8, change: "keep" }] }, "Adding the coupon step.");
      await observed.decide(request(3, [draft]));
      next = { kind: "complete", result: {} } as never;
      // Of the second edit, the move was refused: only the add landed.
      await observed.decide(request(4, [draft, { callId: "core.amendment_check.3", toolId: "core.amendment_check", value: { ok: false, refused: [{ step: 11, reason: "no_such_position" }], applied: 1 } as never }]));
    });
    expect(cards().map((card) => activityActionOf(card)?.result)).toEqual(["removed \"Add to cart\"", "added \"Get coupon\""]);
    expect(cards()[0]!.label).toBe("Changing the Flow — done: removed \"Add to cart\"");
    // A step is named, never numbered: the draft's numbers are not what the person sees (U-3).
    expect(JSON.stringify(cards())).not.toMatch(/step \d/u);
    // The keep of a step already in the Flow changed nothing, and is not said.
    expect(JSON.stringify(cards())).not.toContain("Quantity");
    expect(JSON.stringify(cards())).not.toContain("re-adding");
  });

  it("says the edit the round stalled on from the stalled round's record, and passes the stall through", async () => {
    const stalledError = new Error("stalled");
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => amend(), unusableDecisions: { stalled: () => stalledError } }));
    let returned: unknown;
    await inScope(async () => {
      await observed.decide(request(20));
      returned = observed.unusableDecisions!.stalled({
        issueCodes: ["llm_evidence_loop.draft_amendments_refused"],
        trace: [{ iteration: 20, decision: "amend_draft", resultCode: "llm_evidence_loop.draft_unchanged", amended: 0, amendmentsRefused: [{ step: 14, reason: "already_so" }] }] as never,
        accounting: {} as never,
        steps: []
      });
    });
    expect(returned).toBe(stalledError);
    expect(thoughts()).toEqual([["Changing the Flow", ADDING, "succeeded"]]);
    expect(activityActionOf(cards()[0]!)).toMatchObject({ outcome: "failed", refused: { all: true, because: "the Flow already does that" } });
  });
});

// R3c, live run `run-musp39u8-9ac026ab` (moments 34, 35): three completions the
// check passed and the test then refused `full_run_required` read in the chat
// as "Checking the Flow is finished -- Completing now", and nothing after.
describe("a completion the test refused after the check passed", () => {
  it("is said as sent back, and why, after the check's own row", async () => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ checkCompletion: async () => ({ ok: true }) }));
    const attempt = await inScope(() => automationStudioLlmEvidenceCompletionAttempt({
      result: {}, steps: [], checkCompletion: observed.checkCompletion as never,
      dryRun: async () => Object.defineProperty({ issueCodes: ["llm_evidence_loop.full_run_required"] }, "steps", { value: [3, 5], enumerable: false })
    }));
    expect(attempt).toMatchObject({ kind: "refused" });
    expect(seen.map((event) => [event.label, event.detail?.status])).toEqual([
      ["Checking the proposed Flow", "started"],
      ["The proposed Flow’s plan checks out; it still has to run cleanly", "succeeded"],
      ["The proposed Flow was sent back to be fixed", "failed"]
    ]);
    expect(seen[2]!.detail).toMatchObject({ kind: "note", title: "Completion check", text: "Sent back because some of its steps haven't run in this build, so the whole Flow can't be tested from its start yet. 2 steps need fixing." });
    expect(JSON.stringify(seen)).not.toContain("full_run_required");
  });

  it("passes the refusal on to a check that listens itself", async () => {
    const heard: unknown[] = [];
    const inner = Object.assign(async () => ({ ok: true as const }), { testRefused: (refused: unknown) => { heard.push(refused); } });
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ checkCompletion: inner }));
    await inScope(() => automationStudioLlmEvidenceCompletionAttempt({ result: {}, steps: [], checkCompletion: observed.checkCompletion as never, dryRun: async () => ({ issueCodes: ["llm_evidence_loop.dry_run_refused"] }) }));
    expect(heard).toEqual([{ issueCodes: ["llm_evidence_loop.dry_run_refused"] }]);
  });

  // End to end, as a Lab build runs: the loop's own test (`../../llm/node-tools/dry-run-gate.ts`)
  // refuses a Flow holding two carried steps that never ran in this build, and
  // with `FLUXIQ_BUILD_PROGRESS_TRACE=1` the trace wraps the chat's check
  // (`../../llm/evidence-progress/progress-trace.ts`). The refusal must pass
  // through the trace to the chat, with the steps the gate named.
  it("reaches the chat as sent back, with how many steps, through a traced build's own test", async () => {
    vi.stubEnv("FLUXIQ_BUILD_PROGRESS_TRACE", "1");
    const printed = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const carried = (position: number): AutomationStudioFlowDraftStep => ({
        position, id: `f${position}`, iteration: position, actionId: "web.click", input: { node: "web.click", parameters: {} },
        effect: "mutate", effectApplied: true, disposition: "kept", proposes: true
      });
      const observed = observeAutomationStudioEvidenceLoop(loopInput({
        tools: [{ toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate", perCallEffect: true }],
        decide: async () => ({ kind: "complete", result: { done: true } }),
        checkCompletion: async () => ({ ok: true }),
        draft: { seed: [carried(1), carried(2)] }, fullRunRequired: true, maxIterations: 1
      }));
      await inScope(() => runAutomationStudioLlmEvidenceLoop(observed)).catch(() => undefined);
      const sentBack = seen.filter((event) => event.label === "The proposed Flow was sent back to be fixed");
      expect(sentBack).toHaveLength(1);
      expect(sentBack[0]!.detail).toMatchObject({ kind: "note", title: "Completion check", status: "failed", text: "Sent back because some of its steps haven't run in this build, so the whole Flow can't be tested from its start yet. 2 steps need fixing." });
      const lines = printed.mock.calls.map(([line]) => String(line).replace(/^\[FluxIQ build-trace\] \S+ /u, ""));
      expect(lines).toContain("completion refused by=test issues=llm_evidence_loop.full_run_required steps=1,2");
    } finally {
      printed.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});

// fix-judges group 2: a re-author that ends "nothing to change" does so by its
// completion check throwing (`../../recovery/refuted-result/nothing-to-change.ts`),
// and the "Checking the proposed Flow" note it had opened was never closed.
describe("a completion check that throws", () => {
  const seed: AutomationStudioFlowDraftStep[] = [{
    position: 1, id: "f1", iteration: 1, actionId: "web.click", input: { node: "web.click", parameters: {} },
    effect: "mutate", effectApplied: true, disposition: "kept", proposes: true
  }];

  it("closes the note saying the repair found nothing to change, and rethrows the ending", async () => {
    const watch = automationStudioReauthorEndingWatch();
    const ending = watch.completed({ seed, steps: seed, result: { nothingToChange: true, summary: "The Flow already does it." } });
    expect(ending).toBeInstanceOf(Error);
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ checkCompletion: async () => { throw ending!; } }));
    await expect(inScope(async () => await observed.checkCompletion!({}, { steps: seed }))).rejects.toBe(ending);
    expect(seen.map((event) => [event.label, event.detail?.kind, event.detail?.title, event.detail?.status])).toEqual([
      ["Checking the proposed Flow", "note", "Completion check", "started"],
      ["The repair found nothing in the Flow to change", "note", "Completion check", "succeeded"]
    ]);
  });

  it("closes the note as stopped for any other throw, and rethrows it unchanged", async () => {
    const error = new Error("check broke");
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ checkCompletion: async () => { throw error; } }));
    await expect(inScope(async () => await observed.checkCompletion!({}, { steps: [] }))).rejects.toBe(error);
    expect(seen.map((event) => [event.label, event.detail?.status])).toEqual([
      ["Checking the proposed Flow", "started"],
      ["Checking the proposed Flow — stopped", "failed"]
    ]);
    expect(JSON.stringify(seen)).not.toContain("check broke");
  });
});
