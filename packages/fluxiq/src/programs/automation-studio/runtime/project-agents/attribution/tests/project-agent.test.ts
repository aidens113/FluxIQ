// One call sets both records of which agent did the work: the activity
// stream's agent and the step log's role and brief id.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { automationStudioActivityHub, currentAutomationStudioActivityAgent, emitAutomationStudioActivity, runWithAutomationStudioActivity } from "../../../activity/index.ts";
import { automationStudioLlmStepLogScope, automationStudioLlmStepLogTool } from "../../../llm/step-log/index.ts";
import { withAutomationStudioProjectAgent } from "../index.ts";

let directory: string;
let seen: ClientGatewayActivity[] = [];
let unsubscribe: () => void = () => undefined;

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "fluxiq-project-agent-"));
  seen = [];
  unsubscribe = automationStudioActivityHub.subscribe((event) => seen.push(event));
});

afterEach(() => {
  unsubscribe();
  rmSync(directory, { recursive: true, force: true });
});

const env = () => ({ FLUXIQ_LLM_STEP_LOG_DIR: directory });

describe("withAutomationStudioProjectAgent", () => {
  it("stamps the activity event and the step the work makes with the same agent", async () => {
    const tool = automationStudioLlmStepLogTool(async (_request: { callId: string; toolId: string }) => ({ ok: true }), env());
    const result = await runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, () =>
      withAutomationStudioProjectAgent({ role: "builder", briefId: "b-save", subflowName: "Save recipe" }, async () => {
        emitAutomationStudioActivity({ phase: "building", label: "Looking at the page" });
        await tool({ callId: "c1", toolId: "web.look" });
        return "built";
      }, env()));

    expect(result).toBe("built");
    expect(seen.map((event) => event.agent)).toEqual([{ role: "builder", briefId: "b-save", subflowName: "Save recipe" }]);
    const meta = JSON.parse(readFileSync(path.join(directory, "0001-tool-web.look", "meta.json"), "utf8")) as Record<string, unknown>;
    expect(meta).toMatchObject({ role: "builder", briefId: "b-save" });
    expect(currentAutomationStudioActivityAgent()).toBeUndefined();
    expect(automationStudioLlmStepLogScope.current()).toBeUndefined();
  });

  it("names the supervisor with no brief id in both", () => {
    runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, () =>
      withAutomationStudioProjectAgent({ role: "supervisor" }, () => {
        emitAutomationStudioActivity({ phase: "thinking", label: "Planning" });
        expect(automationStudioLlmStepLogScope.current()).toEqual({ role: "supervisor" });
      }, env()));
    expect(seen[0]!.agent).toEqual({ role: "supervisor" });
  });

  it("still stamps activity with the step log off", () => {
    runWithAutomationStudioActivity({ kind: "build", id: "b1", projectId: "p1" }, () =>
      withAutomationStudioProjectAgent({ role: "repair", briefId: "b-fix" }, () => {
        emitAutomationStudioActivity({ phase: "repairing", label: "Repairing" });
        expect(automationStudioLlmStepLogScope.current()).toBeUndefined();
      }, {}));
    expect(seen[0]!.agent).toEqual({ role: "repair", briefId: "b-fix" });
  });
});
