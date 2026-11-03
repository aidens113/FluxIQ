// What Core told the model of an amendment reaches that amendment's answer step
// (t174-w116, R3 of debug `run-musq0b1m-0472cfa0`): `0061-answer-amend_draft/`
// held the refusal codes but not the words the model was given, which could be
// read only from the next request.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";

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
