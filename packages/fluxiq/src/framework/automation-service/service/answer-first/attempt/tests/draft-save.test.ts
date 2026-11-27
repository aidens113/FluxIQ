import { AutomationStudioAttemptActRecord } from "../../../../../../runtime/answer-first/act-record/index.ts";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowCandidateDraftRecord } from "../../../candidate-drafts/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioAnswerFirstResultFeed } from "../../result-feed/index.ts";
import { automationStudioAnswerFirstSaveDraft } from "../draft-save.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "../state.ts";

// The draft is saved, and only then are its parts handed to the library: what the library does
// with them, or a library that throws, never changes what the attempt reports of its draft.
const PLAN = { plan: { schemaVersion: "0.1", subflows: [] }, risk: "low", subflows: [] };

vi.mock("../../../../../../runtime/llm/index.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../../runtime/llm/index.ts")>()),
  checkAutomationStudioFlowBootstrapCompletion: async (input: { result: { summary: string }; draftSteps: readonly { position: number; disposition: string }[] }) => (verdictFor.assembled = input.draftSteps.filter((step) => step.disposition === "kept").map((step) => step.position), verdictFor.refuse ? { ok: false, codes: ["draft.refused"], issues: [REFUSED_AT] } : { ok: true, summary: input.result.summary, buildPlan: verdictFor.plan ?? PLAN, ...(verdictFor.locator ? { locator: verdictFor.locator } : {}) })
}));
const verdictFor: { refuse: boolean; plan?: object | undefined; locator?: object | undefined; assembled?: number[] } = { refuse: false };
/** What a refused verdict always carries beside its codes: each issue and where it is. */
const REFUSED_AT = { severity: "error", code: "draft.refused", message: "Step 4 cannot be written down.", path: "draft.steps.4" };

type Parts = NonNullable<AutomationStudioAnswerFirstAttemptRun["input"]["parts"]>;
type Saved = Parameters<Parts["saveDraft"]>[0];

/** The library as the attempt holds it: only the save is the test's own. */
function libraryWith(saveDraft: Parts["saveDraft"]): Parts {
  return { saveDraft, shortlist: async () => undefined, runAs: async () => { throw new Error("no part is run here"); } };
}

function runOf(parts: Parts | undefined, saved: AutomationStudioFlowCandidateDraftRecord[] = [], steps: AutomationStudioFlowDraftStep[] = [], result = automationStudioAnswerFirstResultFeed({ instructionText: "look the item up", readRowsKey: undefined })): AutomationStudioAnswerFirstAttemptRun {
  const zero = { estimatedInputTokens: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  return {
    steps,
    result,
    // The attempt's act record: a saved Flow names the acts its calls made by their steps (`../draft-save.ts`, t1075).
    record: new AutomationStudioAttemptActRecord(),
    usage: { ...zero },
    input: {
      projectId: "project.one", flowId: "flow.one", registry: {}, resolution: {}, size: {}, binding: {}, routing: { signaturesOf: () => undefined },
      instructionText: "look the item up", instructionIds: ["instruction.one"], baseDependencyDigest: "digest", baseSettingsRevision: 1, source: undefined, startLocation: "https://shop.example/",
      stores: { drafts: { save: async (record: AutomationStudioFlowCandidateDraftRecord) => (saved.push(record), record) } },
      provider: { provider: { metadata: { provider: "test", model: "test" } } }, authority: { usage: { ...zero } }, creation: { purse: { spentUsd: () => 0 } },
      ...(parts ? { parts } : {})
    }
  } as unknown as AutomationStudioAnswerFirstAttemptRun;
}

describe("an answer-first draft's save", () => {
  it("hands the plan and the request to the library once the record is saved", async () => {
    const calls: Saved[] = [];
    const saved: AutomationStudioFlowCandidateDraftRecord[] = [];
    const outcome = await automationStudioAnswerFirstSaveDraft(runOf(libraryWith(async (input: Saved) => (calls.push(input), undefined)), saved), "Done.");
    expect(outcome.kind).toBe("saved");
    expect(saved).toHaveLength(1);
    expect(calls).toEqual([{ projectId: "project.one", flowId: "flow.one", candidateId: saved[0]!.candidateId, buildPlan: PLAN, instructionIds: ["instruction.one"], instructionText: "look the item up", startLocation: "https://shop.example/" }]);
  });

  it("still says saved when the library reports a failure of its own", async () => {
    const outcome = await automationStudioAnswerFirstSaveDraft(runOf(libraryWith(async () => ({ saved: [], skipped: [], failed: "TypeError" }))), "Done.");
    expect(outcome.kind).toBe("saved");
  });

  it("saves the draft with no library, and hands nothing over for a draft that was not assembled", async () => {
    expect((await automationStudioAnswerFirstSaveDraft(runOf(undefined), "Done.")).kind).toBe("saved");
    const calls: Saved[] = [];
    verdictFor.refuse = true;
    try {
      expect(await automationStudioAnswerFirstSaveDraft(runOf(libraryWith(async (input: Saved) => (calls.push(input), undefined))), "Done.")).toEqual({ kind: "kept", why: "not_assembled", codes: ["draft.refused"] });
    } finally {
      verdictFor.refuse = false;
    }
    expect(calls).toEqual([]);
  });

  it("writes the refusal's codes, and each issue's code and step, to the step log as a plain note", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "fluxiq-draft-refused-"));
    vi.stubEnv("FLUXIQ_LLM_STEP_LOG_DIR", directory);
    verdictFor.refuse = true;
    try {
      await automationStudioAnswerFirstSaveDraft(runOf(undefined), "Done.");
      const notes = readdirSync(directory).filter((name) => /^\d{4,}-note$/u.test(name)).map((name) => JSON.parse(readFileSync(path.join(directory, name, "meta.json"), "utf8")) as { line: string });
      expect(notes).toHaveLength(1);
      expect(notes[0]!.line).toContain("draft.refused");
      expect(notes[0]!.line).toContain("draft.refused at draft.steps.4");
      // Never the issue's words: a step log names where, and a refusal's words may quote a value.
      expect(notes[0]!.line).not.toContain("cannot be written down");
    } finally {
      verdictFor.refuse = false;
      vi.unstubAllEnvs();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  // Lead addition A (lane t905): the saved Flow reads the output step as the answer was read, or it is not saved
  // (run-mwcess01: the Flow's read lost the `where` its answer was read under, and the next attempt delivered 28 rows
  // for the 4 asked). A timetable's departures, read under one condition, as the draft holds it.
  describe("the output step's version on the save path", () => {
    const SOON = { field: "leaves", before: "09:00" };
    const read: AutomationStudioFlowDraftStep = { position: 2, id: "d2", callId: "departures", iteration: 2, actionId: "timetable.read", input: { node: "timetable.read", parameters: { where: [SOON], fields: { stop: "stop", leaves: "leaves" } } }, effect: "observe", proposes: true, disposition: "kept" };
    const withResult = () => {
      const result = automationStudioAnswerFirstResultFeed({ instructionText: "List the departures before nine.", readRowsKey: undefined });
      result.port.record([{ kind: "page", step: { id: "departures", position: 2 }, read: { source: "departures", version: { conditions: [SOON], fields: { stop: "stop", leaves: "leaves" } }, place: "page=1", kept: [{ stop: "Quay", leaves: "08:10" }] } }]);
      return result;
    };
    const planReading = (parameters: object) => ({ plan: { schemaVersion: "0.1", subflows: [{ key: "main", nodes: [{ key: "n1", parameters }] }] }, risk: "low", subflows: [] });

    it("refuses a Flow whose read of the output step dropped its conditions, and keeps the steps", async () => {
      verdictFor.plan = planReading({ fields: { stop: "stop", leaves: "leaves" } });
      verdictFor.locator = { nodes: { "0.0": { draftStepId: "d2", draftStep: 2 } } };
      const saved: AutomationStudioFlowCandidateDraftRecord[] = [];
      try {
        const outcome = await automationStudioAnswerFirstSaveDraft(runOf(undefined, saved, [{ ...read }], withResult()), "Done.");
        expect(outcome).toEqual({ kind: "kept", why: "not_assembled", codes: ["answer_first.output_step_version_not_saved"] });
        expect(saved).toEqual([]);
      } finally {
        verdictFor.plan = undefined;
        verdictFor.locator = undefined;
      }
    });

    it("saves a Flow whose read holds the output step's conditions and columns", async () => {
      verdictFor.plan = planReading({ where: [SOON], fields: { stop: "stop", leaves: "leaves" } });
      verdictFor.locator = { nodes: { "0.0": { draftStepId: "d2", draftStep: 2 } } };
      try {
        expect((await automationStudioAnswerFirstSaveDraft(runOf(undefined, [], [{ ...read }], withResult()), "Done.")).kind).toBe("saved");
      } finally {
        verdictFor.plan = undefined;
        verdictFor.locator = undefined;
      }
    });

    it("saves the same authored four-column read through its recorded resolution of an unprojected predicate", async () => {
      const fields = { title: "card-title", store: "card-store", price: "card-price", rating: "card-rating" };
      const where = [{ field: "sponsored-mark", is: "present", not: true }];
      const resolved = {
        fields: Object.fromEntries(Object.entries(fields).map(([key, selector]) => [key, { kind: "text", selector: `.${selector}`, required: false }])),
        where: [{ read: { kind: "text", selector: ".sponsored-mark", required: false }, is: "present", not: true }]
      };
      const kept = { ...read, input: { node: "timetable.read", parameters: { extractList: { fields, where } } }, ranWith: { node: "timetable.read", parameters: { extractList: resolved } } };
      const result = automationStudioAnswerFirstResultFeed({ instructionText: "List the products with title, store, price and rating.", readRowsKey: undefined });
      result.port.record([{ kind: "page", step: { id: "departures", position: 2 }, read: { source: "departures", version: { conditions: where, fields }, kept: [{ title: "Dock", store: "Quay", price: "8", rating: "4.7" }] } }]);
      verdictFor.plan = planReading({ extractList: resolved });
      verdictFor.locator = { nodes: { "0.0": { draftStepId: "d2", draftStep: 2 } } };
      const saved: AutomationStudioFlowCandidateDraftRecord[] = [];
      try {
        expect((await automationStudioAnswerFirstSaveDraft(runOf(undefined, saved, [kept], result), "Done.")).kind).toBe("saved");
        expect(saved).toHaveLength(1);
        expect(result.port.outputStep()).toMatchObject({ version: 1, reads: { conditions: where, fields } });
        expect(Object.keys(result.port.outputStep()!.reads.fields)).toEqual(["title", "store", "price", "rating"]);
      } finally {
        verdictFor.plan = undefined;
        verdictFor.locator = undefined;
      }
    });

    // run-mwop7kt3 (and run-mwdbj3vf before it): a list read is recorded as it was written. The domain keeps a list
    // read's handle in `ranWith`, with what the handle stood for beside it, and resolves it again when the plan is
    // assembled, so the plan's read is the domain's resolution of exactly the recorded read, never `ranWith` itself.
    // Every such Flow was refused `output_step_version_not_saved`, saved nothing, and no later attempt's continuation
    // could be proven. A library's catalogue, read under one exclusion over a column it does not keep.
    describe("a list read recorded as written and resolved again at assembly", () => {
      const fields = { title: "col-title", author: "col-author", shelf: "col-shelf" };
      const where = [{ field: "col-on-loan", is: "present", not: true }];
      const binding = { location: "https://library.example/catalogue", itemCount: 12, extractList: { item: ".book", fields: { "col-title": { kind: "text", selector: ".t" } } } };
      const listRead = { handle: "extraction.1", fields, where, minItems: 1 };
      const step = (recorded: object): AutomationStudioFlowDraftStep => ({
        ...read, callId: "books", actionId: "catalogue.read",
        input: { node: "catalogue.read", parameters: { extractList: listRead } },
        ranWith: { node: "catalogue.read", parameters: { extractList: { ...recorded, extractionBinding: binding } } }
      });
      const resolution = (over: object = {}) => ({
        item: ".book",
        fields: { title: { kind: "text", selector: ".t", required: false }, author: { kind: "text", selector: ".a", required: false }, shelf: { kind: "text", selector: ".s", required: false } },
        where: [{ read: { kind: "text", selector: ".loan", required: false }, is: "present", not: true }],
        minItems: 1,
        ...over
      });
      const outcomeOf = async (recorded: object, plan: object) => {
        const result = automationStudioAnswerFirstResultFeed({ instructionText: "List the books on the shelf with title, author and shelf.", readRowsKey: undefined });
        result.port.record([{ kind: "page", step: { id: "books", position: 2 }, read: { source: "books", version: { conditions: where, fields }, kept: [{ title: "Tides", author: "Ames", shelf: "B4" }] } }]);
        verdictFor.plan = planReading({ extractList: plan });
        verdictFor.locator = { nodes: { "0.0": { draftStepId: "d2", draftStep: 2 } } };
        const saved: AutomationStudioFlowCandidateDraftRecord[] = [];
        try {
          return { outcome: await automationStudioAnswerFirstSaveDraft(runOf(undefined, saved, [step(recorded)], result), "Done."), saved };
        } finally {
          verdictFor.plan = undefined;
          verdictFor.locator = undefined;
        }
      };

      it("saves the Flow whose plan is the domain's resolution of the read the answer was read as", async () => {
        const { outcome, saved } = await outcomeOf(listRead, resolution());
        expect(outcome.kind).toBe("saved");
        expect(saved).toHaveLength(1);
      });

      it("refuses one whose resolution lost a condition or a column, or whose recorded read is not the answer's", async () => {
        const refused = { kind: "kept", why: "not_assembled", codes: ["answer_first.output_step_version_not_saved"] };
        expect((await outcomeOf(listRead, resolution({ where: [] }))).outcome).toEqual(refused);
        const { shelf: _shelf, ...twoColumns } = resolution().fields;
        expect((await outcomeOf(listRead, resolution({ fields: twoColumns }))).outcome).toEqual(refused);
        // Recorded under another version than the one whose rows are the answer: its resolution is another read.
        expect((await outcomeOf({ ...listRead, where: [{ field: "col-on-loan", is: "present" }] }, resolution())).outcome).toEqual(refused);
        expect((await outcomeOf({ ...listRead, fields: { title: "col-title", author: "col-author" } }, resolution())).outcome).toEqual(refused);
      });
    });
  });

  // Lead addition C (lane t905, run-mwcncux8): a cinema's listings read in pages by a loop (read, Next page, repeat while
  // Next page answers), then Next page and the same read again by hand, both added. The hand-made read is the loop's read
  // (D2) and the Next page before it only moved the list on for it, so neither is assembled into the saved Flow.
  it("leaves a paging loop's hand-made copy, and the press that moved the list on for it, out of what is assembled", async () => {
    const result = automationStudioAnswerFirstResultFeed({ instructionText: "List every showing.", readRowsKey: undefined });
    const version = { conditions: [], fields: { film: "film", time: "time" }, listKey: "list.showings" };
    const read = (position: number, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep => ({ position, id: `d${position}`, callId: `c${position}`, iteration: position, actionId: "listings.read", input: { node: "listings.read", parameters: { fields: version.fields } }, effect: "observe", proposes: true, disposition: "kept", ...over });
    const next = (position: number, handle: string): AutomationStudioFlowDraftStep => ({ position, id: `d${position}`, callId: `c${position}`, iteration: position, actionId: "listings.press", input: { node: "listings.press", parameters: { target: { handle } } }, effect: "mutate", effectApplied: true, proposes: true, disposition: "kept", control: "Next page" });
    const steps = [read(1, { routing: { kind: "repeat", through: "d2", while: "d2" } }), next(2, "t4"), next(3, "t19"), read(4)];
    result.port.record([{ kind: "page", step: { id: "c1", position: 1 }, read: { source: "c1", version, place: "page=1", kept: [{ film: "Harbour Lights", time: "18:00" }] } }]);
    result.port.record([{ kind: "page", step: { id: "c4", position: 4 }, read: { source: "c4", version, place: "page=2", kept: [{ film: "Night Ferry", time: "20:30" }] } }]);
    const run = runOf(undefined, [], steps, result);
    verdictFor.plan = { plan: { schemaVersion: "0.1", subflows: [{ key: "main", nodes: [{ key: "n1", parameters: { fields: version.fields } }] }] }, risk: "low", subflows: [] };
    verdictFor.locator = { nodes: { "0.0": { draftStepId: "d1", draftStep: 1 } } };
    try {
      expect((await automationStudioAnswerFirstSaveDraft(run, "Done.")).kind).toBe("saved");
    } finally {
      verdictFor.plan = undefined;
      verdictFor.locator = undefined;
    }
    expect(verdictFor.assembled).toEqual([1, 2]);
    expect(run.steps.filter((step) => step.disposition === "dropped").map((step) => step.position)).toEqual([3, 4]);
    expect(result.port.header()).toContain("2 rows over 2 pages");
  });
});
