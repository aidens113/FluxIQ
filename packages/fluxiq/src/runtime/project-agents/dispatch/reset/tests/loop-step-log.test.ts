import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AutomationStudioProjectSubflowBrief } from "../../../contracts/index.ts";
import type { AutomationStudioLlmBuildPurse } from "../../../../llm/build-purse/index.ts";
import { runAutomationStudioProjectResetLoop } from "../loop.ts";

type Input = Parameters<typeof runAutomationStudioProjectResetLoop>[0];

let directory: string;
let saved: string | undefined;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "fluxiq-reset-step-log-"));
  saved = process.env.FLUXIQ_LLM_STEP_LOG_DIR;
  process.env.FLUXIQ_LLM_STEP_LOG_DIR = directory;
});

afterEach(() => {
  if (saved === undefined) delete process.env.FLUXIQ_LLM_STEP_LOG_DIR;
  else process.env.FLUXIQ_LLM_STEP_LOG_DIR = saved;
  rmSync(directory, { recursive: true, force: true });
});

async function reset(stepLogPageText?: (evidence: unknown) => string | undefined): Promise<void> {
  let index = 0;
  const decisions = [{ kind: "tool_call", callId: "call.1", toolId: "test.inspect", input: {} }, { kind: "complete", result: {} }];
  const input: Input = {
    brief: { maxIterations: 6 } as Pick<AutomationStudioProjectSubflowBrief, "maxIterations"> as AutomationStudioProjectSubflowBrief,
    ports: {
      loop: {
        ...(stepLogPageText ? { stepLogPageText } : {}),
        tools: [{ toolId: "test.inspect", description: "Observe.", inputSchema: { type: "object" }, effect: "observe" }],
        decide: async () => decisions[index++] ?? { kind: "complete", result: {} },
        executeTool: async () => ({ kind: "llm_evidence_tool_execution", evidence: { page: "Kettle 42.99" }, effectApplied: false, resultCode: "test.ok" })
      }
    },
    remainingActs: async () => [],
    allowance: undefined as unknown as AutomationStudioLlmBuildPurse,
    signal: new AbortController().signal,
    callScope: undefined
  };
  await runAutomationStudioProjectResetLoop(input);
}

const pages = (): string[] => readdirSync(directory).flatMap((step) => {
  try { return [readFileSync(path.join(directory, step, "page.txt"), "utf8")]; } catch { return []; }
});

describe("the reset loop's step log", () => {
  it("writes page.txt from the reader its ports carry", async () => {
    await reset(() => "the reset page as read");
    expect(pages()).toEqual(["the reset page as read"]);
  });

  it("writes none when its ports carry no reader", async () => {
    await reset();
    expect(pages()).toEqual([]);
  });
});
