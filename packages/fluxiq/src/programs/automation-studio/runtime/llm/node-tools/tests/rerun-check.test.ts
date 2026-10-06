// A rerun of a step whose instructed act was already done is a check of the new
// argument, never the act done a second time (`../rerun-check.ts`), run through the loop.
//
// Live run `run-murwcaj0-40e56557` (R7, social-network-feed): step 6 confirmed
// Amara's friend request as act a1 in round 0. The repair round amended `rerun`
// of step 6 with `target: {handle: t744}`, which was Tom Becker's Confirm, and
// the rerun ran live: reset, the listing replayed, Confirm pressed -- "Request
// accepted" on Tom's card, a request the instruction said to leave alone. The
// fake site below is that page: two requests, a Confirm on each, and a check
// (`replay: "verify"`) that acts on nothing.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";
import { automationStudioFlowDraftEntry, type AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioNodeRerunAnswer } from "../rerun-check.ts";

const tools = [{ toolId: "press", description: "Press a control.", inputSchema: { type: "object" }, effect: "mutate" as const, perCallEffect: true }];
const PEOPLE = ["Amara", "Tom"];

/** The friend-requests page. `ranWith` says whether a check answers with the resolved form of what it checked. */
function requests(options: { ranWith?: boolean } = {}) {
  const accepted = new Set<string>();
  const state = () => `requests|${[...accepted].sort().join(",")}`;
  const executeTool = vi.fn(async ({ value }: { callId?: string; toolId: string; value: JsonObject }) => {
    if (value.replay === "reset") return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: "core.replay.replayed" };
    const who = String(value.target).replace(/^Confirm /u, "");
    if (value.replay === "verify") {
      const code = !PEOPLE.includes(who) ? "core.replay.unreproducible" : accepted.has(who) ? "core.replay.present" : "core.replay.verified";
      return {
        kind: "llm_evidence_tool_execution",
        evidence: { ok: code !== "core.replay.unreproducible", code, said: `checked Confirm ${who}; it was not run` },
        effectApplied: false,
        resultCode: code,
        ...(options.ranWith && code !== "core.replay.unreproducible" ? { draft: { actionId: "web.click", effect: "mutate", ranWith: { target: `#confirm-${who.toLowerCase()}` } } } : {})
      };
    }
    const before = state();
    if (PEOPLE.includes(who)) accepted.add(who);
    return {
      kind: "llm_evidence_tool_execution",
      stateDigests: { before, after: state() },
      evidence: { ok: true, pressed: `Confirm ${who}`, accepted: [...accepted] },
      effectApplied: true,
      resultCode: "web.action.succeeded",
      draft: { actionId: "web.click", effect: "mutate", proposes: true, ranWith: { target: `#confirm-${who.toLowerCase()}` }, replay: { from: { location: "requests" } } }
    };
  });
  return { accepted, executeTool };
}

// The instruction's read names a1 ("confirm everyone ...") lasting, as the service asks it (t174-w83); `lasting: null` is a build with no reading of the instruction.
const loop = (decide: ReturnType<typeof vi.fn>, executeTool: ReturnType<typeof requests>["executeTool"], lasting: ReadonlySet<string> | null = new Set(["a1"])) => runAutomationStudioLlmEvidenceLoop({
  tools, decide, executeTool, maxIterations: 12, maxToolCalls: 12, dryRun: false, propagateDecisionErrors: true, unusableDecisions: { maxConsecutive: 8, stalled: () => new Error("stalled") },
  ...(lasting ? { lastingActs: async () => lasting } : {})
});
const confirmAmara = { kind: "tool_call", callId: "confirm-amara-1", toolId: "press", input: { target: "Confirm Amara" }, add: true, act: "a1" };
const rerun = (target: string, more: JsonObject[] = []) => ({ kind: "amend_draft", amendments: [{ step: 1, change: "rerun", input: { target } }, ...more] });
type Shown = ReadonlyArray<{ callId: string; toolId: string; value: JsonObject }>;
const shownAt = (decide: { mock: { calls: unknown[][] } }, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;
type Steps = Array<{ input: JsonObject; ranWith?: JsonObject; acts?: string[]; disposition: string }>;
const stepsOf = (result: unknown): Steps => (result as { steps: Steps }).steps;

describe("a rerun of a step whose act was already done while building", () => {
  it("checks the new argument and does not press Confirm on Tom's request", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(confirmAmara)
      .mockResolvedValueOnce(rerun("Confirm Tom"))
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const site = requests({ ranWith: true });

    const result = await loop(decide, site.executeTool).catch((error: unknown) => ({ thrown: error }));

    expect(site.executeTool.mock.calls.map(([call]) => [call.callId, call.value.replay ?? null, call.value.target ?? null])).toEqual([
      ["confirm-amara-1", null, "Confirm Amara"],
      ["rerun.1.place", "reset", null],
      ["rerun.1", "verify", "Confirm Tom"]
    ]);
    // The check is sent where the step found the page, like the dry run's.
    expect(site.executeTool.mock.calls[2]![0].value).toMatchObject({ replay: "verify", from: { location: "requests" } });
    expect([...site.accepted]).toEqual(["Amara"]);
    // Verified: the step that does a1 now runs with the new argument, in the form the host resolved it to.
    const actStep = stepsOf(result).find((step) => step.acts?.includes("a1"));
    expect(actStep).toMatchObject({ input: { target: "Confirm Tom" }, ranWith: { target: "#confirm-tom" }, disposition: "kept" });
    // And the model is told plainly why it was checked and not done.
    const answered = shownAt(decide, 2).find((entry) => entry.callId === "rerun.1")?.value;
    expect(answered).toMatchObject({ code: "core.replay.verified", rerunCheck: { checked: true, doneAgain: false, took: true, acts: ["a1"] } });
    const detail = String((answered?.rerunCheck as JsonObject).detail);
    expect(detail).toContain("not done again");
    expect(detail).toContain("already did it once while this Flow was being built");
    expect(detail).toContain("on each row its listing keeps");
  });

  it("takes the new argument on present as well, and applies the amendments held for it to that step", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(confirmAmara)
      .mockResolvedValueOnce(rerun("Confirm Amara", [{ step: 1, change: "optional" }]))
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const site = requests({ ranWith: true });

    const result = await loop(decide, site.executeTool).catch((error: unknown) => ({ thrown: error }));

    expect(site.executeTool.mock.calls.filter(([call]) => call.value.replay === undefined)).toHaveLength(1);
    const answered = shownAt(decide, 2).find((entry) => entry.callId === "rerun.1")?.value;
    expect(answered).toMatchObject({ code: "core.replay.present", rerunCheck: { took: true } });
    const actStep = stepsOf(result).find((step) => step.acts?.includes("a1")) as (Steps[number] & { routing?: JsonObject }) | undefined;
    expect(actStep?.routing).toMatchObject({ kind: "optional" });
  });

  it("refuses the rerun like a failed one when the check cannot reproduce the target, and keeps the step as it ran", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(confirmAmara)
      .mockResolvedValueOnce(rerun("Confirm Nobody"))
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const site = requests();

    const result = await loop(decide, site.executeTool).catch((error: unknown) => ({ thrown: error }));

    expect(site.executeTool.mock.calls.map(([call]) => call.value.replay ?? null)).toEqual([null, "reset", "verify"]);
    const actStep = stepsOf(result).find((step) => step.acts?.includes("a1"));
    expect(actStep).toMatchObject({ input: { target: "Confirm Amara" }, ranWith: { target: "#confirm-amara" } });
    const answered = shownAt(decide, 2).find((entry) => entry.callId === "rerun.1")?.value;
    expect(answered).toMatchObject({ code: "core.replay.unreproducible", rerunCheck: { checked: true, doneAgain: false, took: false } });
    expect(String((answered?.rerunCheck as JsonObject).detail)).toContain("keeps the argument it ran with");
  });

  it("drops the resolved form of the old target when the check names no resolved form for the new one", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(confirmAmara)
      .mockResolvedValueOnce(rerun("Confirm Tom"))
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const site = requests();

    const result = await loop(decide, site.executeTool).catch((error: unknown) => ({ thrown: error }));

    const actStep = stepsOf(result).find((step) => step.acts?.includes("a1"));
    expect(actStep?.input).toEqual({ target: "Confirm Tom" });
    // Amara's selector under Tom's name would confirm Amara's request in every run of the Flow.
    expect(actStep?.ranWith).toBeUndefined();
  });

  it("still runs a plain call as asked: no restriction beyond permissions", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(confirmAmara)
      .mockResolvedValueOnce({ kind: "tool_call", callId: "confirm-tom-1", toolId: "press", input: { target: "Confirm Tom" } })
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const site = requests();

    await loop(decide, site.executeTool).catch(() => undefined);

    expect([...site.accepted].sort()).toEqual(["Amara", "Tom"]);
  });

  it("still runs again a rerun of a changing step that does no act", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ ...confirmAmara, act: undefined })
      .mockResolvedValueOnce(rerun("Confirm Tom"))
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const site = requests();

    await loop(decide, site.executeTool).catch(() => undefined);

    expect(site.executeTool.mock.calls.map(([call]) => call.value.replay ?? null)).toEqual([null, "reset", null]);
    expect([...site.accepted].sort()).toEqual(["Amara", "Tom"]);
  });

  // Merged with t174-w83 (2026-10-03): a rerun is a check exactly when the dry run would check the step. A build whose
  // instruction read named no lasting act, and whose step declared nothing lasting, runs the rerun as asked, as its
  // dry run would replay the step.
  it("runs the rerun as asked when neither the step's declaration nor the instruction's read says its act lasts", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce(confirmAmara)
      .mockResolvedValueOnce(rerun("Confirm Tom"))
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const site = requests();

    await loop(decide, site.executeTool, null).catch(() => undefined);

    expect(site.executeTool.mock.calls.map(([call]) => call.value.replay ?? null)).toEqual([null, "reset", null]);
  });
});

// Live run `run-musq0b1m-0472cfa0`, Cause 4: the rerun of step 7 was put back
// (the item page loaded again) and its handle refused `handle_not_in_packet`.
// The answer the loop shows carries the put-back account and the control the
// argument meant, in the words the domain gave for it before the reset.
describe("a rerun refused on the page its step was put back to", () => {
  it("is answered with the page put back and the control the argument named", async () => {
    const { automationStudioNodeRerunAnswer } = await import("../rerun-check.ts");
    const executeTool = vi.fn(async () => ({ kind: "llm_evidence_tool_execution" as const, evidence: { ok: false, code: "target_unobserved", detail: { reason: "handle_not_in_packet", target: "t985" } }, effectApplied: false }));
    const replaces = { position: 7, id: "d7", iteration: 3, actionId: "web.output.dom-click", toolId: "core.run_node", input: { parameters: { target: { handle: "t974" } } }, effect: "mutate" as const, disposition: "kept" as const, replay: { from: { location: "item" } } };
    const { ran, took } = await automationStudioNodeRerunAnswer({
      place: { kind: "put_back", callId: "rerun.7.place", startPage: "step", doneAgain: [] },
      replaces,
      call: { callId: "rerun.7", toolId: "core.run_node", value: { node: "web.output.dom-click", parameters: { target: { handle: "t985" } } } },
      words: { target: "7-in-1" },
      executeTool
    });
    expect(took).toBe(false);
    const note = ((ran as { evidence: JsonObject }).evidence.rerunPlace) as JsonObject;
    expect(note).toMatchObject({ place: "put_back", named: "7-in-1" });
    expect(String(note.detail)).toMatch(/put back where step 7 started before this rerun ran/u);
  });
});

// Cause 6 for a rerun: a checked rerun that takes the new argument changes what
// the step runs with, so how the old argument answered the last test is no
// longer about it.
describe("a checked rerun that takes the new argument", () => {
  function performedLibraryStep(): AutomationStudioFlowDraftStep {
    return {
      position: 1, id: "d1", iteration: 0, callId: "performed", actionId: "library.press", toolId: "press",
      input: { node: "library.press", parameters: { target: "original" } },
      ranWith: { parameters: { target: "resolved-original" } },
      effect: "mutate", effectApplied: true, proposes: true, disposition: "kept", acts: ["a1"]
    };
  }

  it.each(["core.replay.verified", "core.replay.present"])("takes authoritative changed action and argument without performing it (%s)", async (code) => {
    const step = performedLibraryStep();
    const original = structuredClone(step);
    const declared = { node: "library.enter", parameters: { target: "candidate", text: "3" } };
    const resolved = { parameters: { target: "resolved-candidate", text: "3" } };
    const executeTool = vi.fn(async (_request: { callId: string; toolId: string; value: JsonObject }) => ({
      kind: "llm_evidence_tool_execution" as const, evidence: { ok: true }, resultCode: code, effectApplied: false,
      draft: { actionId: "library.enter", input: declared, ranWith: resolved, effect: "mutate" as const, proposes: true }
    }));
    const result = await automationStudioNodeRerunAnswer({
      place: undefined, replaces: step, call: { callId: "candidate", toolId: "press", value: { node: "arbitrary.claim", parameters: { target: "candidate", text: "3" } } },
      executeTool, lastingActs: new Set(["a1"])
    });
    expect(result.took).toBe(true);
    expect(step).toMatchObject({ actionId: "library.enter", toolId: "press", input: declared, ranWith: resolved, effectApplied: false, checkedCandidate: { callId: "candidate", code } });
    expect(step.priorExecution).toMatchObject({ ...original, lasting: true });
    expect(step.callId).toBeUndefined();
    expect(executeTool.mock.calls).toHaveLength(1);
    expect(executeTool.mock.calls[0]![0].value.replay).toBe("verify");
  });

  // Live run `run-mux74k5q-1c3c2127` (lane A round 3, C2): reruns of the Spain press (a done lasting act) to type 3
  // into the quantity field came back `core.replay.present` with no declaration and "took": step 8 ended as
  // `actionId: web.output.dom-click` holding `input.node: web.output.dom-type`, `text: 3`, `submit: false`, and
  // completion compiled it as a click and refused `text`/`submit` twice. A check whose value names another node,
  // with no declared action, does not take: the identity is never inferred from value.node, and the check ran nothing.
  it.each(["core.replay.verified", "core.replay.present"])("does not take a value naming another node when the check declares no action (%s)", async (code) => {
    const step: AutomationStudioFlowDraftStep = {
      position: 8, id: "d8", iteration: 2, callId: "pick.spain", actionId: "web.output.dom-click", toolId: "core.run_node",
      input: { node: "web.output.dom-click", parameters: { target: { handle: "t930" } } }, ranWith: { parameters: { target: { selector: "#spain" } } },
      effect: "mutate", effectApplied: true, proposes: true, disposition: "kept", acts: ["a1"]
    };
    const original = structuredClone(step);
    const executeTool = vi.fn(async (_request: { callId: string; toolId: string; value: JsonObject }) => ({ kind: "llm_evidence_tool_execution" as const, evidence: { ok: true, found: "missing" }, resultCode: code, effectApplied: false }));
    const { ran, took } = await automationStudioNodeRerunAnswer({
      place: undefined, replaces: step,
      call: { callId: "rerun.12.6", toolId: "core.run_node", value: { node: "web.output.dom-type", parameters: { target: { handle: "t964" }, text: "3", submit: false } } },
      executeTool, lastingActs: new Set(["a1"])
    });
    expect(took).toBe(false);
    expect(step).toEqual(original);
    expect(executeTool.mock.calls[0]![0].value.replay).toBe("verify");
    const note = (ran as { evidence: JsonObject }).evidence.rerunCheck as JsonObject;
    expect(note).toMatchObject({ checked: true, doneAgain: false, took: false, answer: code });
    const detail = String(note.detail);
    expect(detail).toContain("ran nothing");
    expect(detail).toContain("web.output.dom-type");
    expect(detail).toContain("keeps web.output.dom-click");
    expect(detail).toContain("add true");
  });

  it("still takes a value naming the step's own node, or none, when the check declares no action", async () => {
    for (const value of [{ node: "library.press", parameters: { target: "candidate" } }, { parameters: { target: "candidate" } }]) {
      const step = performedLibraryStep();
      const { took } = await automationStudioNodeRerunAnswer({
        place: undefined, replaces: step, call: { callId: "same-node", toolId: "press", value },
        executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, resultCode: "core.replay.verified", effectApplied: false }),
        lastingActs: new Set(["a1"])
      });
      expect(took).toBe(true);
      expect(step).toMatchObject({ actionId: "library.press", toolId: "press", input: value, effectApplied: false });
      expect(step.priorExecution?.actionId).toBe("library.press");
    }
  });

  it("keeps same-action metadata and removes a redundant tool identity when the declared action is the tool", async () => {
    const step = performedLibraryStep();
    step.actionId = "press";
    await automationStudioNodeRerunAnswer({
      place: undefined, replaces: step, call: { callId: "same-action", toolId: "press", value: { target: "candidate" } },
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, resultCode: "core.replay.present", effectApplied: false, draft: { actionId: "press", input: { target: "normalized" } } }),
      lastingActs: new Set(["a1"])
    });
    expect(step.actionId).toBe("press");
    expect(step.toolId).toBeUndefined();
    expect(step.input).toEqual({ target: "normalized" });
    expect(step.ranWith).toBeUndefined();
    expect(step.priorExecution).toMatchObject({ actionId: "press", toolId: "press" });
  });

  it("does not change identity or arguments when authoritative replacement metadata accompanies a refused check", async () => {
    const step = performedLibraryStep();
    const original = structuredClone(step);
    const result = await automationStudioNodeRerunAnswer({
      place: undefined, replaces: step, call: { callId: "refused-change", toolId: "press", value: { node: "library.enter" } },
      executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: false }, resultCode: "core.replay.unreproducible", effectApplied: false, draft: { actionId: "library.enter", input: { node: "library.enter" } } }),
      lastingActs: new Set(["a1"])
    });
    expect(result.took).toBe(false);
    expect(step).toEqual(original);
  });

  it("keeps the accepted action identity through the real loop while retaining original lasting execution", async () => {
    const seed = performedLibraryStep();
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 1, change: "rerun", input: { node: "library.enter", parameters: { target: "candidate", text: "3" } } }] })
      .mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    const executeTool = vi.fn(async ({ value }: { value: JsonObject }) => ({
      kind: "llm_evidence_tool_execution" as const, evidence: { ok: true }, resultCode: "core.replay.verified", effectApplied: false,
      draft: { actionId: "library.enter", input: value, ranWith: { parameters: { target: "resolved", text: "3" } }, effect: "mutate" as const, proposes: true }
    }));
    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool, draft: { seed: [seed] }, dryRun: false, lastingActs: async () => new Set(["a1"]), maxIterations: 3, maxToolCalls: 4 });
    const kept = result.steps?.find((step) => step.id === "d1");
    expect(kept).toMatchObject({ actionId: "library.enter", toolId: "press", input: { node: "library.enter" }, effectApplied: false, priorExecution: { actionId: "library.press", lasting: true } });
    expect(executeTool.mock.calls).toHaveLength(1);
    expect(executeTool.mock.calls[0]![0].value.replay).toBe("verify");
  });

  it("invalidates following test marks while retaining earlier evidence", async () => {
    const seed: AutomationStudioFlowDraftStep[] = [1, 2, 3].map((position) => ({
      position, id: `d${position}`, iteration: 1, actionId: "web.click", toolId: "press", input: { target: "Confirm Amara" },
      effect: "mutate", effectApplied: true, disposition: "kept", acts: ["a1"], replay: { from: { location: "requests" } },
      replayed: { step: position, actionId: "web.click", status: "replayed" }
    }));
    const decide = vi.fn().mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 2, change: "rerun", input: { target: "Confirm Tom" } }] }).mockResolvedValueOnce({ kind: "complete", result: { done: true } });
    // No put-back is needed for this fixture: it isolates dependent test marks.
    delete seed[1]!.replay;
    const executeTool = async ({ value }: { value: JsonObject }) => ({ kind: "llm_evidence_tool_execution" as const, evidence: { ok: true }, resultCode: value.replay === "verify" ? "core.replay.verified" : "core.replay.replayed", effectApplied: value.replay !== "verify" });
    const result = await runAutomationStudioLlmEvidenceLoop({ tools, decide, executeTool, draft: { seed }, dryRun: false, lastingActs: async () => new Set(["a1"]), maxIterations: 4, maxToolCalls: 8 });
    const steps = (result as { steps: AutomationStudioFlowDraftStep[] }).steps;
    expect(steps[0]!.replayed).toBeDefined();
    expect(steps[1]!.checkedCandidate).toBeDefined();
    expect(steps[1]!.replayed).toBeUndefined();
    expect(steps[2]!.replayed).toBeUndefined();
  });

  it.each(["core.replay.verified", "core.replay.present"])("separates checked bound configuration from original execution and protects the next rerun (%s)", async (code) => {
    const original = { target: "Confirm Amara", value: { $input: "person", test: "Amara" }, row: { $row: "person" } };
    const replaces: AutomationStudioFlowDraftStep = {
      position: 1, id: "d1", iteration: 1, callId: "original", actionId: "web.click", toolId: "press",
      input: original, ranWith: { target: "#amara" }, effect: "mutate", effectApplied: true, proposes: true, disposition: "kept", acts: ["a1"],
      stateBefore: "before", stateAfter: "after", resultCode: "acted", control: "Amara", instance: original,
      replay: { from: { location: "requests" }, produced: { accepted: "Amara" } }, replayed: { step: 1, actionId: "web.click", status: "replayed" }
    };
    const executeTool = vi.fn(async (_request: { callId: string; toolId: string; value: JsonObject }) => ({ kind: "llm_evidence_tool_execution" as const, evidence: { ok: true }, resultCode: code, effectApplied: false }));
    const candidate = { target: "Confirm Tom", value: { $input: "person", test: "Tom" }, row: { $row: "person" } };
    await automationStudioNodeRerunAnswer({ place: undefined, replaces, call: { callId: "check.1", toolId: "press", value: candidate }, executeTool, lastingActs: new Set(["a1"]) });
    expect(replaces).toMatchObject({ input: candidate, effectApplied: false, checkedCandidate: { callId: "check.1", code }, priorExecution: { lasting: true, input: original, callId: "original", stateBefore: "before", stateAfter: "after", replay: { produced: { accepted: "Amara" } } } });
    for (const key of ["stateBefore", "stateAfter", "callId", "control", "instance", "written", "replayed"]) expect(replaces).not.toHaveProperty(key);
    expect(replaces.replay).toEqual({ from: { location: "requests" } });
    const shown = automationStudioFlowDraftEntry({ steps: [replaces], authored: true })!.value as JsonObject;
    expect((shown.steps as JsonObject[])[0]).toMatchObject({ disposition: "kept", inResult: true, changed: "no", checkedCandidate: { performed: false }, act: "a1", actEvidence: "intended" });
    expect((shown.steps as JsonObject[])[0]).not.toHaveProperty("written");
    // The old lasting effect survives a changed claim and changed binding test value.
    replaces.acts = ["a2"];
    await automationStudioNodeRerunAnswer({ place: undefined, replaces, call: { callId: "check.2", toolId: "press", value: { ...candidate, value: { $input: "person", test: "Other" } } }, executeTool, lastingActs: new Set() });
    expect(executeTool.mock.calls.map(([call]) => (call as { value: JsonObject }).value.replay)).toEqual(["verify", "verify"]);
    expect(replaces.priorExecution?.input).toEqual(original);
    expect(replaces.checkedCandidate?.callId).toBe("check.2");
    const beforeRefusal = structuredClone(replaces);
    await automationStudioNodeRerunAnswer({ place: undefined, replaces, call: { callId: "refused", toolId: "press", value: { target: "Nobody" } }, executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { ok: false }, effectApplied: false, resultCode: "core.replay.unreproducible" }) });
    expect(replaces).toEqual(beforeRefusal);
  });

  it("leaves the step untested with it", async () => {
    const { automationStudioNodeRerunAnswer } = await import("../rerun-check.ts");
    const executeTool = vi.fn(async () => ({ kind: "llm_evidence_tool_execution" as const, evidence: { ok: true, code: "core.replay.verified" }, effectApplied: false, resultCode: "core.replay.verified" }));
    const replaces = {
      position: 6, id: "d6", iteration: 2, actionId: "web.click", toolId: "press", input: { target: "Confirm Amara" }, effect: "mutate" as const, effectApplied: true, disposition: "kept" as const, acts: ["a1"],
      replay: { from: { location: "requests" } }, replayed: { step: 6, actionId: "web.click", status: "unreproducible" as const }
    };
    const { took } = await automationStudioNodeRerunAnswer({ place: undefined, replaces, call: { callId: "rerun.6", toolId: "press", value: { target: "Confirm Tom" } }, executeTool, lastingActs: new Set(["a1"]) });
    expect(took).toBe(true);
    expect(replaces.input).toEqual({ target: "Confirm Tom" });
    expect((replaces as { replayed?: unknown }).replayed).toBeUndefined();
  });
});
