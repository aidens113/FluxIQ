// What Core told the model of an amendment reaches that amendment's answer step
// (t174-w116, R3 of debug `run-musq0b1m-0472cfa0`): `0061-answer-amend_draft/`
// held the refusal codes but not the words the model was given, which could be
// read only from the next request.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";
import type { AutomationStudioFlowDraftAmendment, AutomationStudioFlowDraftStep } from "../../../flow-authoring/draft/index.ts";
import { automationStudioLlmEvidenceHandleAmendment } from "../amendment.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "../types.ts";

const press = { toolId: "press", description: "Press.", inputSchema: { type: "object" }, effect: "mutate" as const };
const worked = { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, draft: { actionId: "web.dom.click" } };

let directory: string;
let saved: string | undefined;
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "fluxiq-amendment-told-"));
  saved = process.env.FLUXIQ_LLM_STEP_LOG_DIR;
  process.env.FLUXIQ_LLM_STEP_LOG_DIR = directory;
});
afterEach(() => {
  if (saved === undefined) delete process.env.FLUXIQ_LLM_STEP_LOG_DIR;
  else process.env.FLUXIQ_LLM_STEP_LOG_DIR = saved;
  rmSync(directory, { recursive: true, force: true });
});

describe("an amendment's answer step", () => {
  it("carries, as `told`, the amendment check the next decision is shown", async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ kind: "tool_call", callId: "c1", toolId: "press", input: { target: "#a" }, add: true })
      .mockResolvedValueOnce({ kind: "amend_draft", amendments: [{ step: 9, change: "drop" }] })
      .mockResolvedValueOnce({ kind: "complete", result: { flow: "ready" } });
    await runAutomationStudioLlmEvidenceLoop({ tools: [press], decide, executeTool: vi.fn().mockResolvedValue(worked), maxIterations: 5, maxToolCalls: 5, dryRun: false, unusableDecisions: { stalled: () => new Error("stalled") } });

    const shown = (decide.mock.calls[2]![0] as { evidence: Array<{ toolId: string; value: unknown }> }).evidence.find((entry) => entry.toolId === "core.amendment_check")?.value;
    expect(shown).toMatchObject({ code: "llm_evidence_loop.draft_amendments_refused", refused: [{ step: 9, reason: "no_such_step" }] });
    const answers = readdirSync(directory).filter((name) => name.endsWith("-answer-amend_draft"));
    expect(answers).toHaveLength(1);
    const result = JSON.parse(readFileSync(path.join(directory, answers[0]!, "result.json"), "utf8")) as { told?: unknown; applied?: number };
    expect(result.told).toEqual(shown);
    expect(result.applied).toBe(0);
  });
});

// The handler under the framework's draft grammar (`../amendment.ts`, `draftEdits: "framework"`): the
// six edits apply, a rerun is refused as no edit and never carried out, and the keep-adds-nothing
// words stop telling the model to add. Unset, nothing changes. The loop builds this context
// (`../../evidence-loop.ts`); it is stood in for here with the parts the handler reads.
describe("the handler where the framework drafts the Flow", () => {
  type Step = AutomationStudioFlowDraftStep;
  type Told = { evidence: { toolId: string; value: Record<string, unknown> }[] };

  const stepOf = (n: number, over: Partial<Step> = {}): Step => ({ position: n, id: `d${n}`, iteration: n, callId: `c${n}`, actionId: "web.dom.click", toolId: "core.run_node", input: { node: "web.dom.click", parameters: { target: { handle: `t${n}` } } }, effect: "mutate", effectApplied: true, stateBefore: `s${n}`, stateAfter: `s${n + 1}`, disposition: "kept", ...over });
  const readOf = (n: number, over: Partial<Step> = {}): Step => ({ ...stepOf(n), actionId: "web.read", input: { node: "web.read", parameters: { list: `l${n}` } }, effect: "observe", proposes: true, ...over });

  /** Anything the handler asks for that is not stood in here is a no-op that answers nothing. */
  function handling(draftSteps: Step[], draftEdits?: "framework"): AutomationStudioLlmEvidenceDecisionHandlerContext & Told {
    const base: Record<string, unknown> = {
      input: {}, limits: { maxStepsWithoutProgress: 4 }, trace: [], accounting: {}, draftSteps, evidence: [],
      amendmentMemory: { before: vi.fn(), after: () => undefined, refusals: (refused: unknown[]) => refused },
      noProgress: { steps: 0, stepped: vi.fn(), reached: () => false, redirect: vi.fn(), cleared: vi.fn() },
      counters: { draftAmendments: 0, unusableInARow: 0 }, refusalRun: { refused: () => 1 },
      repeats: { acted: vi.fn(), amendmentBlocks: () => undefined, blocks: () => undefined, refusedAgain: vi.fn() },
      loops: { checkAmendment: () => undefined, amended: () => undefined },
      toolIds: new Set<string>(), recordRow: vi.fn(), accountEvidence: () => 0, history: { record: vi.fn() }, authored: undefined,
      ...(draftEdits ? { draftEdits } : {})
    };
    return new Proxy(base, { get: (target, key) => (key in target ? target[key as string] : vi.fn()) }) as unknown as AutomationStudioLlmEvidenceDecisionHandlerContext & Told;
  }
  const amend = (amendments: AutomationStudioFlowDraftAmendment[]) => ({ kind: "amend_draft" as const, amendments });
  const told = (context: Told): Record<string, unknown> => context.evidence.find((entry) => entry.toolId === "core.amendment_check")!.value;

  it("applies the edits and refuses a rerun not_an_edit, without carrying it out", () => {
    const steps = [stepOf(1), readOf(2, { disposition: "taken", drafted: "not_the_result" })];
    const context = handling(steps, "framework");
    const next = automationStudioLlmEvidenceHandleAmendment(context, 3, amend([{ step: 2, change: "result" }, { step: 1, change: "rerun", input: { target: "x" } }]), true);
    expect(next.kind).toBe("continue");
    expect(steps[1]).toMatchObject({ disposition: "kept", result: true });
    expect(told(context)).toMatchObject({ applied: 1, refused: [{ step: 1, reason: "not_an_edit" }] });
  });

  it("refuses a change outside the six when the option is set, and takes it as before when it is not", () => {
    const framework = [stepOf(1), stepOf(2, { disposition: "taken", drafted: "dead_end" })];
    const context = handling(framework, "framework");
    automationStudioLlmEvidenceHandleAmendment(context, 3, amend([{ step: 2, change: "add" }, { step: 1, change: "drop" }]), true);
    expect(framework[1]).toMatchObject({ disposition: "taken" });
    expect(told(context)).toMatchObject({ applied: 1, refused: [{ step: 2, reason: "not_an_edit" }] });
    const old = [stepOf(1), stepOf(2, { disposition: "taken" })];
    automationStudioLlmEvidenceHandleAmendment(handling(old), 3, amend([{ step: 2, change: "add" }]), true);
    expect(old[1]).toMatchObject({ disposition: "kept" });
  });

  it("stops telling the model to add when every keep was of a step already in the Flow, and says the old words unset", () => {
    const decision = amend([{ step: 1, change: "keep" }]);
    const framework = handling([stepOf(1)], "framework");
    automationStudioLlmEvidenceHandleAmendment(framework, 3, decision, true);
    const words = String(told(framework).instruction);
    expect(words.startsWith("keep adds nothing here")).toBe(true);
    expect(words).toContain("with act naming it");
    expect(words).not.toContain("add and act");
    const old = handling([stepOf(1)]);
    automationStudioLlmEvidenceHandleAmendment(old, 3, decision, true);
    expect(String(told(old).instruction)).toContain("with add and act naming it");
  });
});
