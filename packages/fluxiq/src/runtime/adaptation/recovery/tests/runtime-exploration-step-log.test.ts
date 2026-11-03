import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { automationStudioHarnessOptionRegistry, type AutomationStudioLlmEvidenceTool } from "../../../llm/index.ts";
import { resolveAutomationStudioExplorationBudget } from "../exploration-budget.ts";
import { runAutomationStudioRuntimeExploration } from "../runtime-exploration.ts";

// The step log writes a tool step's `page.txt` from the domain's reader, which the
// exploration loop is handed and nothing else supplies.
const TOOLS: AutomationStudioLlmEvidenceTool[] = [
  { toolId: "test.inspect", description: "Observe the current state.", inputSchema: { type: "object" }, effect: "observe" }
];

let directory: string;
let saved: string | undefined;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "fluxiq-exploration-step-log-"));
  saved = process.env.FLUXIQ_LLM_STEP_LOG_DIR;
  process.env.FLUXIQ_LLM_STEP_LOG_DIR = directory;
});

afterEach(() => {
  if (saved === undefined) delete process.env.FLUXIQ_LLM_STEP_LOG_DIR;
  else process.env.FLUXIQ_LLM_STEP_LOG_DIR = saved;
  rmSync(directory, { recursive: true, force: true });
});

async function explore(stepLogPageText?: (evidence: unknown) => string | undefined): Promise<void> {
  let index = 0;
  const decisions = [{ kind: "tool_call", callId: "call.1", toolId: "test.inspect", input: {} }, { kind: "complete", result: { finding: "x" } }];
  const registry = automationStudioHarnessOptionRegistry({
    binding: {
      domainId: "test.domain",
      deniedEvidenceKeys: [],
      tools: TOOLS,
      executeTool: async (input) => ({ kind: "llm_evidence_tool_execution", evidence: { observed: input.toolId, page: "Kettle 42.99" }, effectApplied: false, resultCode: "test.ok" })
    }
  });
  await runAutomationStudioRuntimeExploration({
    loop: registry.evidenceLoopBinding({ projectId: "project.one", flowId: "flow.one" }, { scope: { kind: "global" }, allowSideEffectsWithoutPolicy: true }),
    ...(stepLogPageText ? { stepLogPageText } : {}),
    decide: async () => decisions[index++] ?? { kind: "complete", result: {} },
    budget: resolveAutomationStudioExplorationBudget({ maxDurationMs: 60_000 })
  });
}

const pages = (): string[] => readdirSync(directory).flatMap((step) => {
  const file = path.join(directory, step, "page.txt");
  try { return [readFileSync(file, "utf8")]; } catch { return []; }
});

describe("the exploration loop's step log", () => {
  it("writes page.txt from the reader it is given", async () => {
    await explore((evidence) => JSON.stringify(evidence).includes("Kettle 42.99") ? "the page as the domain reads it" : undefined);
    expect(pages()).toEqual(["the page as the domain reads it"]);
  });

  it("writes none, and fails nothing, when it is given no reader", async () => {
    await explore();
    expect(pages()).toEqual([]);
  });
});
