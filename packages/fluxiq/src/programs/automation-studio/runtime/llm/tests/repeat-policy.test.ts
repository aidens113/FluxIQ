// What counts as asking the same thing twice.
//
// The case that produced this file: a model presses a control, the domain
// refuses, and the model does the sensible thing and looks again. That look was
// being withheld as "already observed" because no mutation had applied, asking
// for it counted as a step without progress, and three of them ended the build
// `repeat_without_progress` -- one of the live campaign's largest single
// failure causes, and the thing that defeated a separate improvement to the
// detail carried in rejection messages.
//
// The guard the fix must not weaken is in the last test: an action repeated
// with nothing whatever having happened is still a repeat.
import { describe, expect, it, vi } from "vitest";
import { runAutomationStudioLlmEvidenceLoop } from "../evidence-loop.ts";

const tools = [
  { toolId: "inspect", description: "Look at the page.", inputSchema: { type: "object" }, effect: "observe" as const, repeatPolicy: "after_mutation" as const },
  { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const }
];
const stalled = () => new Error("stalled");

const look = (index: number) => ({ kind: "tool_call", callId: `call.look.${index}`, toolId: "inspect", input: {} });
const pressed = (index: number) => ({ kind: "tool_call", callId: `call.press.${index}`, toolId: "press", input: { target: `target.${index}` } });

/** A tool table whose press refuses, the way a domain refuses a stale handle. */
const refusing = async ({ toolId }: { toolId: string }) => toolId === "press"
  ? { kind: "llm_evidence_tool_execution" as const, evidence: { ok: false, code: "target_unobserved" }, effectApplied: false, resultCode: "web.action.rejected.target_unobserved" }
  : { page: "as it is" };

/** A tool table whose *look* refuses, the way a domain answers a page it could not capture. */
const refusingLook = async ({ toolId }: { toolId: string }) => toolId === "inspect"
  ? { kind: "llm_evidence_tool_execution" as const, evidence: { ok: false, code: "page_unreadable" }, effectApplied: false, resultCode: "web.action.rejected.page_unreadable" }
  : { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true }, effectApplied: true };

describe("looking again after being refused", () => {
  it("is offered, runs, and is not counted against the no-progress guard", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(look(1))
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce(look(2))
      .mockResolvedValueOnce(pressed(2))
      .mockResolvedValueOnce(look(3))
      .mockResolvedValueOnce({ kind: "complete", result: { ready: true } });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8, unusableDecisions: { stalled }, executeTool: refusing
    });
    expect(result).toMatchObject({ ok: true, accounting: { iterations: 6, toolCalls: 5 } });
    // Every look after a refusal ran, and the observation was offered each time.
    expect(result.trace.filter((entry) => entry.toolId === "inspect").every((entry) => entry.callId !== undefined)).toBe(true);
    expect(decide.mock.calls[2]?.[0].tools.map((tool: { toolId: string }) => tool.toolId)).toEqual(["inspect", "press"]);
    expect(decide.mock.calls[4]?.[0].tools.map((tool: { toolId: string }) => tool.toolId)).toEqual(["inspect", "press"]);
  });

  it("does not let the same refused action be asked for again", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce(pressed(1))
      .mockResolvedValueOnce({ kind: "complete", result: { ready: true } });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8, unusableDecisions: { stalled }, executeTool: refusing
    });
    // The second press is the same request over an unchanged world, so it is
    // answered from the first rather than run: a refusal moves what the model
    // knows, never what the action would do.
    expect(result).toMatchObject({ ok: true, accounting: { toolCalls: 1 } });
    expect(result.trace[1]).toMatchObject({ toolId: "press", resultCode: "llm_evidence_loop.already_answered" });
  });

  it("still ends a run that only repeats itself", async () => {
    const decide = vi.fn().mockResolvedValue(look(1));
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8, maxStepsWithoutProgress: 3, executeTool: refusing
    });
    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_without_progress" });
  });

  it("lets a look that was itself refused be asked again, and runs it", async () => {
    // The pair this fixes. A look that came back `{ok:false}` looked at
    // nothing, so the loop must not file it as having answered the request and
    // then refuse the retry out of its own records. A live build spent two of
    // its fourteen calls on exactly that (`run-mudwci8d-de88aa32`).
    const decide = vi.fn()
      .mockResolvedValueOnce(look(1))
      .mockResolvedValueOnce(look(1))
      .mockResolvedValueOnce({ kind: "complete", result: { ready: true } });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 8, maxToolCalls: 8, unusableDecisions: { stalled }, executeTool: refusingLook
    });

    expect(result).toMatchObject({ ok: true, accounting: { toolCalls: 2 } });
    expect(result.trace.map((entry) => entry.resultCode)).toEqual([
      "web.action.rejected.page_unreadable",
      "web.action.rejected.page_unreadable",
      undefined
    ]);
    // Both doors: neither the request's signature nor the tool's latest
    // observation may answer the retry from a refusal carrying nothing.
    expect(result.trace.some((entry) => entry.resultCode?.startsWith("llm_evidence_loop.already_"))).toBe(false);
    expect(decide.mock.calls[1]?.[0].tools.map((tool: { toolId: string }) => tool.toolId)).toEqual(["inspect", "press"]);
  });

  it("counts a refused look against the no-progress guard, so asking for it forever still stops", async () => {
    // The deliberate other half. Deleting the request's signature takes away
    // the bound that used to stop a refused look being asked again and again,
    // so the guard has to be that bound instead.
    const decide = vi.fn().mockResolvedValue(look(1));
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 16, maxToolCalls: 16, maxStepsWithoutProgress: 3, executeTool: refusingLook
    });

    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_without_progress" });
    expect(result.accounting.toolCalls).toBe(3);
  });

  // The hole the signature bound never covered. A refused *action* used to
  // clear the no-progress count, on the grounds that an identical retry is
  // caught by its own signature -- but a model that names a different target
  // each time writes a new signature every call, so nothing caught it and
  // nothing counted it. `company-directory-register-page` spent 31 of its 45
  // build steps on `target_unobserved` and ended in
  // `bootstrap.evidence_unusable_decision` after 44 provider calls
  // (`run-muf2bs04-f6fea9fe`, 2026-09-24); eight other runs that day show the
  // same shape. The mutation this is written against: scoring progress on
  // `lookRefused` again, which answers `false` for every mutating tool.
  it("counts a refused action against the guard, even when each one names a new target", async () => {
    let index = 0;
    const decide = vi.fn().mockImplementation(async () => pressed((index += 1)));
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 16, maxToolCalls: 16, maxStepsWithoutProgress: 3, executeTool: refusing
    });

    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_without_progress" });
    expect(result.accounting.toolCalls).toBe(3);
  });

  // And a call that did something still clears it, so a model working around a
  // refusal keeps its room: the press applies, and the count starts again.
  it("lets an action that applied something clear the count", async () => {
    let index = 0;
    const decide = vi.fn().mockImplementation(async () => pressed((index += 1)));
    const applying = async () => ({ kind: "llm_evidence_tool_execution" as const, evidence: { ok: true }, effectApplied: true });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools, decide, maxIterations: 5, maxToolCalls: 5, maxStepsWithoutProgress: 3, executeTool: applying
    });

    expect(result).not.toMatchObject({ code: "llm_evidence_loop.repeat_without_progress" });
    expect(result.accounting.toolCalls).toBe(5);
  });
});

// A refused action asked again after a look runs again (`../refused-action-retest.ts`).
//
// An action refused until something was looked at must be able to run once the
// look has been made: a look moves neither epoch, so before this the identical
// retry kept the refused call's signature and was answered from memory for good
// (live run office r2, `run-mvfq94ff-c8c21493`). With nothing between, the
// identical request is still answered from memory (above), and a refuse, look,
// refuse loop is still bounded by the no-progress guard.
const gatedTools = [
  { toolId: "inspect", description: "Look at the page.", inputSchema: { type: "object" }, effect: "observe" as const },
  { toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const }
];

const readList = (index: number) => ({ kind: "tool_call", callId: `call.look.${index}`, toolId: "inspect", input: { part: "list" } });
const pressOne = (index: number) => ({ kind: "tool_call", callId: `call.press.${index}`, toolId: "press", input: { target: "target.1" } });
const done = { kind: "complete", result: { ready: true } };

/** A press refused, applying nothing, until a look has run once; `looked` says whether it has. */
function gatedPress(opensAfterLook: boolean) {
  const calls: string[] = [];
  let looked = false;
  const executeTool = async ({ toolId }: { toolId: string }) => {
    calls.push(toolId);
    if (toolId === "inspect") {
      looked = true;
      return { page: "the list, read" };
    }
    if (opensAfterLook && looked) return { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true, pressed: "target.1" }, effectApplied: true };
    return { kind: "llm_evidence_tool_execution" as const, evidence: { ok: false, code: "list_unread" }, effectApplied: false, resultCode: "domain.action.rejected.list_unread" };
  };
  return { calls, executeTool };
}

describe("an action refused until a look ran", () => {
  it("runs the identical request again after the look, and its success is used", async () => {
    const gate = gatedPress(true);
    const decide = vi.fn()
      .mockResolvedValueOnce(pressOne(1))
      .mockResolvedValueOnce(readList(1))
      .mockResolvedValueOnce(pressOne(2))
      .mockResolvedValueOnce(done);
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: gatedTools, decide, maxIterations: 8, maxToolCalls: 8, unusableDecisions: { stalled }, executeTool: gate.executeTool
    });

    expect(result).toMatchObject({ ok: true, accounting: { toolCalls: 3 } });
    expect(gate.calls).toEqual(["press", "inspect", "press"]);
    expect(result.trace.some((entry) => entry.resultCode === "llm_evidence_loop.already_answered")).toBe(false);
    const pressRows = result.trace.filter((entry) => entry.toolId === "press");
    expect(pressRows.map((entry) => entry.effectApplied)).toEqual([false, true]);
    // The model's next decision is shown the retry's success, not the refusal.
    const shown = JSON.stringify(decide.mock.calls[3]?.[0]);
    expect(shown).toContain("\"pressed\":\"target.1\"");
  });

  it("answers the identical request from memory when nothing ran between", async () => {
    const gate = gatedPress(true);
    const decide = vi.fn()
      .mockResolvedValueOnce(pressOne(1))
      .mockResolvedValueOnce(pressOne(2))
      .mockResolvedValueOnce(done);
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: gatedTools, decide, maxIterations: 8, maxToolCalls: 8, unusableDecisions: { stalled }, executeTool: gate.executeTool
    });

    expect(result).toMatchObject({ ok: true, accounting: { toolCalls: 1 } });
    expect(gate.calls).toEqual(["press"]);
    expect(result.trace[1]).toMatchObject({ toolId: "press", resultCode: "llm_evidence_loop.already_answered" });
  });

  it("still ends a refuse, look, refuse loop as a run without progress", async () => {
    const gate = gatedPress(false);
    let index = 0;
    const decide = vi.fn().mockImplementation(async () => {
      index += 1;
      return index % 2 === 1 ? pressOne(index) : readList(index);
    });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: gatedTools, decide, maxIterations: 40, maxToolCalls: 40, maxStepsWithoutProgress: 3, unusableDecisions: { stalled }, executeTool: gate.executeTool
    });

    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_without_progress" });
    expect(result.accounting.toolCalls).toBeLessThan(10);
    // The retries after each look reached the tool rather than memory.
    expect(gate.calls.filter((toolId) => toolId === "press").length).toBeGreaterThan(1);
  });
});

// A trial refused until the site is put back runs again after a look on the same page (`../repeat-guard/outcomes.ts`,
// office r2, `run-mvfq94ff-c8c21493`, rows 0096-0110 and 0151-0161). Every call here reports the same page digest, so the
// repeat guard keys the refused trial and the look that settles it on one page. The gates' own `retry_allowed` reason is
// left out of the refusal, as a gate that dropped it would answer: the guard's precondition, not that reason, must lift it.
const trialTools = [
  { toolId: "inspect", description: "Read a list.", inputSchema: { type: "object" }, effect: "observe" as const },
  { toolId: "core.test_subflow", description: "Test the subflow.", inputSchema: { type: "object" }, effect: "mutate" as const }
];
const sameCart = { before: "cart", after: "cart" };
const readCart = (index: number) => ({ kind: "tool_call", callId: `call.read.${index}`, toolId: "inspect", input: { part: "cart", undoes: "act-12" } });
const testRevision = (index: number) => ({ kind: "tool_call", callId: `call.trial.${index}`, toolId: "core.test_subflow", input: { revision: 2, digest: "sha256:rev2" } });

/** A trial refused `candidate.trial_reset_required` until a read has run, when `settles`; refused for good otherwise. */
function resetGatedTrial(settles: boolean) {
  const calls: string[] = [];
  let read = false;
  const executeTool = async ({ toolId }: { toolId: string }) => {
    calls.push(toolId);
    if (toolId === "inspect") {
      read = true;
      return { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true, rows: 2 }, effectApplied: false, stateDigests: sameCart };
    }
    if (settles && read) return { kind: "llm_evidence_tool_execution" as const, evidence: { ok: true, verdict: "yes" }, effectApplied: true, stateDigests: sameCart, resultCode: "subflow.trial_yes" };
    return { kind: "llm_evidence_tool_execution" as const, evidence: { ok: false, code: "candidate.trial_reset_required", actsToRestore: [{ act: "act-12" }] }, effectApplied: false, targetsUnchanged: true, stateDigests: sameCart, resultCode: "candidate.trial_reset_required" };
  };
  return { calls, executeTool };
}

describe("a trial refused until the site is put back", () => {
  it("reaches the trial again after a look on the same page", async () => {
    const gate = resetGatedTrial(true);
    const decide = vi.fn()
      .mockResolvedValueOnce(testRevision(1))
      .mockResolvedValueOnce(readCart(1))
      .mockResolvedValueOnce(testRevision(2))
      .mockResolvedValueOnce(done);
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: trialTools, decide, maxIterations: 8, maxToolCalls: 8, unusableDecisions: { stalled }, executeTool: gate.executeTool
    });

    expect(result).toMatchObject({ ok: true, accounting: { toolCalls: 3 } });
    expect(gate.calls).toEqual(["core.test_subflow", "inspect", "core.test_subflow"]);
    expect(result.trace.some((entry) => entry.resultCode === "llm_evidence_loop.already_answered" || entry.resultCode === "llm_evidence_loop.repeat_refused")).toBe(false);
    expect(result.trace.filter((entry) => entry.toolId === "core.test_subflow").map((entry) => entry.resultCode)).toEqual(["candidate.trial_reset_required", "subflow.trial_yes"]);
  });

  it("still ends refuse, look, refuse forever as a run without progress", async () => {
    const gate = resetGatedTrial(false);
    let index = 0;
    const decide = vi.fn().mockImplementation(async () => {
      index += 1;
      return index % 2 === 1 ? testRevision(index) : readCart(index);
    });
    const result = await runAutomationStudioLlmEvidenceLoop({
      tools: trialTools, decide, maxIterations: 40, maxToolCalls: 40, maxStepsWithoutProgress: 3, unusableDecisions: { stalled }, executeTool: gate.executeTool
    });

    expect(result).toMatchObject({ ok: false, code: "llm_evidence_loop.repeat_without_progress" });
    expect(result.accounting.toolCalls).toBeLessThan(10);
    expect(gate.calls.filter((toolId) => toolId === "core.test_subflow").length).toBeGreaterThan(1);
  });
});
