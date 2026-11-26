// A step an applied decision leaves without its way to its page is told to the
// model, and is no refusal anywhere (live run `run-muwao5n4-44977b2a`, lane D,
// D2-1). Decision 0025 put the request listing in at step 2, before both
// navigations that reach the requests page, and was told only "applied".
//
// The framework's edits move no step (t1037): a step is left so when `keep` puts back a step the framework left out
// after one that does not bring it to its page. The handler is stood in for with the parts it reads, as in
// `./amendment-told.test.ts`; the loop builds this context (`../../evidence-loop.ts`).
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-authoring/draft/index.ts";
import { automationStudioLlmEvidenceHandleAmendment } from "../amendment.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "../types.ts";

const HOME = "https://example.test/";
const FRIENDS = "https://example.test/friends/";
const REQUESTS = "https://example.test/friends/requests/";
type Step = AutomationStudioFlowDraftStep;
type Told = { evidence: { toolId: string; value: JsonObject }[]; recordRow: ReturnType<typeof vi.fn> };

/** One step as the loop appends it, with the page the host wrote it found. */
const step = (n: number, page: string, over: Partial<Step> = {}): Step => ({
  position: n, id: `d${n}`, iteration: n, actionId: "web.dom.click", input: { n }, effect: "mutate", effectApplied: true,
  disposition: "kept", replay: { from: { location: page } }, ...over
});

function handling(draftSteps: Step[]): AutomationStudioLlmEvidenceDecisionHandlerContext & Told {
  const base: Record<string, unknown> = {
    input: {}, limits: {}, trace: [], accounting: {}, draftSteps, evidence: [],
    amendmentMemory: { before: vi.fn(), after: () => undefined, refusals: (refused: unknown[]) => refused },
    noProgress: { steps: 0, stepped: vi.fn(), reached: () => false, redirect: vi.fn(), cleared: vi.fn() },
    counters: { draftAmendments: 0, unusableInARow: 0 }, refusalRun: { refused: () => 1 },
    repeats: { acted: vi.fn(), amendmentBlocks: () => undefined, blocks: () => undefined, refusedAgain: vi.fn() },
    loops: { checkAmendment: () => undefined, amended: () => undefined },
    toolIds: new Set<string>(), recordRow: vi.fn(), accountEvidence: () => 0, history: { record: vi.fn() }, authored: undefined
  };
  return new Proxy(base, { get: (target, key) => (key in target ? target[key as string] : vi.fn()) }) as unknown as AutomationStudioLlmEvidenceDecisionHandlerContext & Told;
}

describe("a step an applied decision leaves without its way to its page", () => {
  it("is told beside the applied decision, and the decision reads applied, refusing nothing", () => {
    // Home (in the Flow), to friends (out), then the listing on the requests page, left out by the framework.
    const steps = [step(1, HOME), step(2, FRIENDS, { disposition: "dropped" }), step(3, REQUESTS, { actionId: "web.dom.extract_list", effect: "observe", proposes: true, disposition: "taken", drafted: "dead_end" })];
    const context = handling(steps);
    automationStudioLlmEvidenceHandleAmendment(context, 4, { kind: "amend_draft", amendments: [{ step: 3, change: "keep" }] }, true);

    const told = context.evidence.find((entry) => entry.toolId === "core.amendment_check")?.value;
    expect(told).toMatchObject({
      ok: true,
      code: "llm_evidence_loop.draft_step_unreached",
      refused: [],
      applied: 1,
      unreached: [{ step: 3, after: 1, reachedBy: [2], note: expect.stringContaining("the step before it now, step 1, does not leave the page where step 3 acted") }]
    });
    expect(String((told as JsonObject).instruction)).not.toContain("changed nothing");
    // Not a refusal anywhere the decision is recorded: the row carries none, so its answer reads applied.
    const row = context.recordRow.mock.calls[0]![0] as JsonObject;
    expect(row).toMatchObject({ resultCode: "llm_evidence_loop.draft_amended", amended: 1 });
    expect(row.amendmentsRefused).toBeUndefined();
  });
});
