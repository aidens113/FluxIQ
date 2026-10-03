import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../llm/index.ts";
import { automationStudioActivityDecisionReason } from "../decision-reason.ts";
import { automationStudioActivityHub } from "../default-hub.ts";
import { observeAutomationStudioEvidenceLoop } from "../observer.ts";
import { AutomationStudioLlmUnusableDecisionError } from "../../llm/index.ts";
import { runWithAutomationStudioActivity } from "../scope.ts";

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
      [{ kind: "amend_draft", amendments: [] }, "building", "Updating the draft Flow"],
      [{ kind: "complete", result: {} }, "verifying", "Checking the Flow is finished"]
    ] as const) {
      seen = [];
      const decision = automationStudioActivityDecisionReason.attach({ ...value }, "Because the draft now covers the request.");
      const observed = observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => decision }));
      // A draft edit is said once the loop has gone on without refusing it ("an edit to the draft", below).
      await inScope(async () => { await observed.decide(decideRequest); if (value.kind === "amend_draft") await observed.decide({ ...decideRequest, iteration: 2 }); });
      expect(seen[1]).toMatchObject({ phase, label: title, detail: { kind: "thought", title, text: "Because the draft now covers the request.", status: "succeeded" } });
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
    for (const [thrown, said] of [
      [new AutomationStudioLlmUnusableDecisionError(["llm.provider_timeout"]), true],
      [new AutomationStudioLlmUnusableDecisionError(["llm.provider_malformed_response"]), false],
      [new Error("anything else"), false]
    ] as const) {
      seen = [];
      const observed = observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => { throw thrown; } }));
      await expect(inScope(() => observed.decide(decideRequest))).rejects.toBe(thrown);
      const rows = seen.filter((event) => event.detail?.title === "Deciding the next step");
      expect(rows.map((event) => event.detail?.status)).toEqual(["started", "failed"]);
      expect(rows[1]!.label).toBe(said ? "The AI model provider did not answer" : "Deciding the next step — didn't work");
      expect(rows[1]!.detail?.text !== undefined).toBe(said);
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

  it("says the verb alone when the domain describes nothing, or answers in another shape", async () => {
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ describeCall: () => ({ target: 7 }) as never }));
    await inScope(() => observed.executeTool({ callId: "c1", toolId: "core.run_node", value: typing.input }));
    expect(seen[0]!.detail?.title).toBe("Typing into the page");
  });
});


// Live run `run-murdouox-c5294247` (t195, `S/0033`-`S/0036`): edits Core refused (`already_so`,
// `changes_nothing`) read in the chat as work done, "Updating the draft Flow -- Adding the repeat ...".
// An edit's card now waits for the loop's answer and says plainly when it changed nothing.
describe("an edit to the draft", () => {
  const ADDING = "Adding the repeat over the qualifying requests so the Flow confirms each of them.";
  const amend = (amendments: unknown[] = [{ step: 14, change: "repeat", over: 12 }]) => automationStudioActivityDecisionReason.attach({ kind: "amend_draft", amendments }, ADDING);
  const request = (iteration: number, evidence: Array<{ callId: string; toolId: string; value: never }> = []) => ({ ...decideRequest, iteration, evidence });
  const thoughts = () => seen.filter((event) => event.detail?.kind === "thought" && event.detail.status !== "started").map((event) => [event.detail?.title, event.detail?.text, event.detail?.status]);
  const refused = (iteration: number, reasons: string[], applied = 0) => ({ callId: `core.amendment_check.${iteration}`, toolId: "core.amendment_check", value: { ok: false, refused: reasons.map((reason) => ({ step: 14, reason })), applied } as never });

  it("says an edit Core refused as one that changed nothing, and why, never as work done", async () => {
    let next = amend();
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => next }));
    await inScope(async () => {
      await observed.decide(request(17));
      next = { kind: "complete", result: {} } as never;
      await observed.decide(request(18, [refused(17, ["already_so"])]));
    });
    expect(thoughts()).toEqual([
      ["Didn't change the Flow", "The Flow already does that, so this was not done: adding the repeat over the qualifying requests so the Flow confirms each of them.", "failed"]
    ]);
    expect(JSON.stringify(seen)).not.toContain("Updating the draft Flow");
    expect(JSON.stringify(seen)).not.toContain("already_so");
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
      expect(thoughts()).toHaveLength(1);
      expect(thoughts()[0]![0]).toBe("Didn't run the step again");
      expect(thoughts()[0]![1]).toMatch(/^(That step|It) already ran exactly this way.*, so this was not done: rerunning the request listing/u);
    }
  });

  it("says an edit that landed as before, once the loop has gone on, and before a step it runs again", async () => {
    let next = amend();
    const observed = observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => next }));
    await inScope(async () => {
      await observed.decide(request(3));
      // Held until the loop answers: nothing is said of the edit yet.
      expect(thoughts()).toEqual([]);
      next = { kind: "complete", result: {} } as never;
      // A refusal of another decision is not this one's.
      await observed.decide(request(4, [refused(2, ["already_so"])]));
    });
    expect(thoughts()).toEqual([["Updating the draft Flow", ADDING, "succeeded"]]);
    // It comes before the next decision's own row.
    expect(seen.findIndex((event) => event.detail?.title === "Updating the draft Flow")).toBeLessThan(seen.map((event) => event.detail?.title).lastIndexOf("Deciding the next step"));

    seen = [];
    const rerun = observeAutomationStudioEvidenceLoop(loopInput({ decide: async () => amend([{ step: 12, change: "rerun", input: {} }]) }));
    await inScope(async () => {
      await rerun.decide(request(5));
      await rerun.executeTool({ callId: "rerun.12", toolId: "core.run_node", value: { node: "web.output.dom-extract" } });
    });
    expect(seen.map((event) => event.detail?.kind)).toEqual(["thought", "thought", "tool", "tool"]);
    expect(seen[1]!.detail?.title).toBe("Updating the draft Flow");
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
    expect(thoughts()).toEqual([["Didn't change the Flow", expect.stringMatching(/^The Flow already does that, so this was not done: adding the repeat/u), "failed"]]);
  });
});
