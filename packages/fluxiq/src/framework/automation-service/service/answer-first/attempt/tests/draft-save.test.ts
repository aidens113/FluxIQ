import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowCandidateDraftRecord } from "../../../candidate-drafts/index.ts";
import { automationStudioAnswerFirstSaveDraft } from "../draft-save.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "../state.ts";

// The draft is saved, and only then are its parts handed to the library: what the library does
// with them, or a library that throws, never changes what the attempt reports of its draft.
const PLAN = { plan: { schemaVersion: "0.1" }, risk: "low", subflows: [] };

vi.mock("../../../../../../runtime/llm/index.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../../runtime/llm/index.ts")>()),
  checkAutomationStudioFlowBootstrapCompletion: async (input: { result: { summary: string } }) => (verdictFor.refuse ? { ok: false, codes: ["draft.refused"] } : { ok: true, summary: input.result.summary, buildPlan: PLAN })
}));
const verdictFor = { refuse: false };

type Parts = NonNullable<AutomationStudioAnswerFirstAttemptRun["input"]["parts"]>;
type Saved = Parameters<Parts["saveDraft"]>[0];

/** The library as the attempt holds it: only the save is the test's own. */
function libraryWith(saveDraft: Parts["saveDraft"]): Parts {
  return { saveDraft, shortlist: async () => undefined, runAs: async () => { throw new Error("no part is run here"); } };
}

function runOf(parts: Parts | undefined, saved: AutomationStudioFlowCandidateDraftRecord[] = []): AutomationStudioAnswerFirstAttemptRun {
  const zero = { estimatedInputTokens: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  return {
    steps: [],
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

  it("writes the refusal's codes to the step log as a plain note", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "fluxiq-draft-refused-"));
    vi.stubEnv("FLUXIQ_LLM_STEP_LOG_DIR", directory);
    verdictFor.refuse = true;
    try {
      await automationStudioAnswerFirstSaveDraft(runOf(undefined), "Done.");
      const notes = readdirSync(directory).filter((name) => /^\d{4,}-note$/u.test(name)).map((name) => JSON.parse(readFileSync(path.join(directory, name, "meta.json"), "utf8")) as { line: string });
      expect(notes).toHaveLength(1);
      expect(notes[0]!.line).toContain("draft.refused");
    } finally {
      verdictFor.refuse = false;
      vi.unstubAllEnvs();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
