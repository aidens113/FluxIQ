// The wording the explorer and the judge are sent when a run carries no overrides (W3, t899, B3a):
// pinned whole, so that the injection seam for a FluxNode's overrides leaves it byte for byte what it
// was, with no frame and with an empty one. A deliberate change to Core's own words updates the files.
import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstSystemInstructions } from "../../../answer-first/guidance/index.ts";
import { runWithAutomationStudioRunOverrides } from "../../../run-overrides/index.ts";
import { decisionRequest } from "../../anthropic/tests/fixtures.ts";
import type { AutomationStudioLlmTaskRequest } from "../../harness/index.ts";
import { automationStudioLlmTaskMessages } from "../request-messages.ts";
import { automationStudioLlmTaskSystemPrompt } from "../system-prompt.ts";

type Tools = NonNullable<AutomationStudioLlmTaskRequest["context"]["evidenceLoop"]>["tools"];
const explorer = (): AutomationStudioLlmTaskRequest => {
  const task = decisionRequest();
  task.domainInstructions = automationStudioAnswerFirstSystemInstructions({ version: "web.1", text: "Domain operating text." });
  task.context.supplementaryRecordings = [{ title: "A demonstration" }];
  task.context.reusableContext = { note: "earlier" } as unknown as NonNullable<AutomationStudioLlmTaskRequest["context"]["reusableContext"]>;
  task.context.evidenceLoop!.tools = [
    { toolId: "core.run_node", description: "Run one node.", effect: "mutate", inputSchema: { type: "object" } },
    { toolId: "core.run_flow", description: "Run the draft forward.", effect: "mutate", inputSchema: { type: "object" } },
    { toolId: "web.click", description: "Press a control.", effect: "mutate", inputSchema: { type: "object" } }
  ] satisfies Tools;
  return task;
};
const judge = (): AutomationStudioLlmTaskRequest => ({ context: {}, taskKind: "loop_verification", metadata: { source: "answerFirstJudge" } }) as unknown as AutomationStudioLlmTaskRequest;
const verification = (): AutomationStudioLlmTaskRequest => ({ context: {}, taskKind: "loop_verification" }) as unknown as AutomationStudioLlmTaskRequest;

const FRAMES: [string, <T>(fn: () => T) => T][] = [
  ["no frame", (fn) => fn()],
  ["an empty frame", (fn) => runWithAutomationStudioRunOverrides({}, fn)]
];

describe.each(FRAMES)("the default wording with %s", (_name, within) => {
  it("is the explorer's system prompt, whole", async () => {
    await expect(within(() => automationStudioLlmTaskSystemPrompt(explorer()))).toMatchFileSnapshot("./__snapshots__/explorer-system-prompt.txt");
  });

  it("is the judge's system prompt, whole", async () => {
    await expect(within(() => automationStudioLlmTaskSystemPrompt(judge()))).toMatchFileSnapshot("./__snapshots__/judge-system-prompt.txt");
    await expect(within(() => automationStudioLlmTaskSystemPrompt(verification()))).toMatchFileSnapshot("./__snapshots__/verification-system-prompt.txt");
  });

  it("is the tool descriptions in the decision's user message", async () => {
    const tools = within(() => (JSON.parse(automationStudioLlmTaskMessages(explorer())[1]!.content) as { context: { evidenceLoop: { tools: unknown[] } } }).context.evidenceLoop.tools);
    await expect(JSON.stringify(tools, null, 2)).toMatchFileSnapshot("./__snapshots__/tool-payload.json");
  });
});
