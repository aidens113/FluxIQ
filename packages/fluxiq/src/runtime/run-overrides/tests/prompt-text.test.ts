// A run's overrides frame reaching the words a model is sent (W3, t899, B3a): append, replace, the
// locked and append-only guards, tool descriptions, the judge's criteria, the version, and two runs at once.
// The defaults with no frame are pinned in `../../llm/provider-task/tests/default-wording.test.ts`.
import { describe, expect, it } from "vitest";
import { automationStudioAnswerFirstSystemInstructions } from "../../answer-first/guidance/index.ts";
import { automationStudioJudgeCriteriaText, automationStudioOverriddenText, runWithAutomationStudioRunOverrides, type AutomationStudioRunOverrides } from "../index.ts";
import { AUTOMATION_STUDIO_FLOW_LESS_QUESTION, automationStudioFlowLessJudgedSummary } from "../../result-verification/flow-less/index.ts";
import { decisionRequest } from "../../llm/anthropic/tests/fixtures.ts";
import { packAutomationStudioLlmContext, type AutomationStudioLlmHarnessInput, type AutomationStudioLlmTaskRequest } from "../../llm/harness/index.ts";
import { automationStudioLlmTaskMessages, automationStudioLlmTaskSystemPrompt } from "../../llm/provider-task/index.ts";

type Tools = NonNullable<AutomationStudioLlmTaskRequest["context"]["evidenceLoop"]>["tools"];
const explorer = (): AutomationStudioLlmTaskRequest => {
  const task = decisionRequest();
  task.domainInstructions = automationStudioAnswerFirstSystemInstructions({ text: "Domain operating text." });
  task.context.supplementaryRecordings = [{ title: "A demonstration" }];
  task.context.reusableContext = { note: "earlier" } as unknown as NonNullable<AutomationStudioLlmTaskRequest["context"]["reusableContext"]>;
  task.context.evidenceLoop!.tools = [
    { toolId: "core.run_node", description: "Run one node.", effect: "mutate", inputSchema: { type: "object" } },
    { toolId: "core.run_flow", description: "Run the draft forward.", effect: "mutate", inputSchema: { type: "object" } },
    { toolId: "web.click", description: "Press a control.", effect: "mutate", inputSchema: { type: "object" } }
  ] satisfies Tools;
  return task;
};
const system = (frame: AutomationStudioRunOverrides): string => runWithAutomationStudioRunOverrides(frame, () => automationStudioLlmTaskSystemPrompt(explorer()));
const plain = automationStudioLlmTaskSystemPrompt(explorer());
const descriptions = (frame: AutomationStudioRunOverrides): Record<string, string> => runWithAutomationStudioRunOverrides(frame, () => {
  const tools = (JSON.parse(automationStudioLlmTaskMessages(explorer())[1]!.content) as { context: { evidenceLoop: { tools: { toolId: string; description: string }[] } } }).context.evidenceLoop.tools;
  return Object.fromEntries(tools.map((tool) => [tool.toolId, tool.description]));
});
const append = (text: string) => ({ mode: "append", text }) as const;
const replace = (text: string) => ({ mode: "replace", text }) as const;
const EFFICIENCY = "Be efficient: use as few decisions as the task needs. Every build has a small cost ceiling.";

describe("a prompt section's text", () => {
  it("appends after the default, a blank line between", () => {
    expect(automationStudioOverriddenText("prompt", "core.efficiency", "Be quick.")).toBe("Be quick.");
    const text = runWithAutomationStudioRunOverrides({ prompts: { "core.efficiency": append("Also be kind.") } }, () => automationStudioOverriddenText("prompt", "core.efficiency", "Be quick."));
    expect(text).toBe("Be quick.\n\nAlso be kind.");
  });

  it("replaces an open section in the system prompt, and touches no other", () => {
    const prompt = system({ prompts: { "core.efficiency": replace("Take all the time you need.") } });
    expect(prompt).toContain("Take all the time you need.");
    expect(prompt).not.toContain("Be efficient: use as few decisions");
    expect(prompt.replace("Take all the time you need.", EFFICIENCY)).toBe(plain);
  });

  it("appends to each overridable section where it is pushed", () => {
    const ids = ["core.evidence_decision", "core.list_authoring", "core.efficiency", "core.decision_output", "core.reusable_context", "core.supplementary_recordings", "domain.instructions", "explorer.role.task", "explorer.role.work_list", "explorer.role.general_flow", "explorer.role.rows", "explorer.role.landed", "explorer.role.completion", "explorer.role.saved_flow"];
    for (const id of ids) {
      const prompt = system({ prompts: { [id]: append(`EXTRA<${id}>`) } });
      expect(prompt, id).toContain(`\n\nEXTRA<${id}>`);
      expect(prompt.split(`EXTRA<${id}>`).length, id).toBe(2);
    }
  });

  it("replaces one guidance paragraph and leaves the others as they were", () => {
    const prompt = system({ prompts: { "explorer.role.saved_flow": replace("No saved Flow exists.") } });
    expect(prompt).toContain("\n\nNo saved Flow exists.");
    expect(prompt).not.toContain("A Flow saved by an earlier attempt");
    expect(prompt).toContain("You will be told what already landed.");
  });

  it("ignores any entry on a locked section", () => {
    for (const id of ["core.output_rules", "core.person_limits", "judge.fields", "judge.order", "core.runtime_patch_consequences"]) {
      expect(system({ prompts: { [id]: replace("GONE") } }), id).toBe(plain);
      expect(system({ prompts: { [id]: append("MORE") } }), id).toBe(plain);
      expect(runWithAutomationStudioRunOverrides({ prompts: { [id]: replace("GONE") } }, () => automationStudioOverriddenText("prompt", id, "Default."))).toBe("Default.");
    }
  });

  it("ignores a replace on an append-only section, and honours its append", () => {
    for (const id of ["domain.instructions", "explorer.role.landed", "core.supplementary_recordings", "core.reusable_context"]) {
      expect(system({ prompts: { [id]: replace("GONE") } }), id).toBe(plain);
    }
    expect(system({ prompts: { "explorer.role.landed": append("Also count it.") } })).toContain("without it.\n\nAlso count it.\n\nEnd when you have the result");
  });

  it("ignores an id Core does not have, and an entry with no text", () => {
    expect(system({ prompts: { "made.up": replace("X") } })).toBe(plain);
    expect(system({ prompts: { "core.efficiency": append("  ") } })).toBe(plain);
  });

  it("reads the judge's verification section, and never its locked fields or order", () => {
    const judge = { context: {}, taskKind: "loop_verification", metadata: { source: "answerFirstJudge" } } as unknown as AutomationStudioLlmTaskRequest;
    const base = automationStudioLlmTaskSystemPrompt(judge);
    const frame: AutomationStudioRunOverrides = { prompts: { "judge.verification": replace("Judge only the rows."), "judge.fields": replace("X"), "judge.order": replace("Y") } };
    const prompt = runWithAutomationStudioRunOverrides(frame, () => automationStudioLlmTaskSystemPrompt(judge));
    expect(prompt).toContain("Judge only the rows.");
    expect(prompt).not.toContain("This call judges what one attempt at a person's request got");
    expect(prompt).toContain("Put your reading in the diagnosis object");
    expect(prompt).toContain("Write the reply's members in the order");
    expect(prompt).not.toBe(base);
    expect(runWithAutomationStudioRunOverrides({ prompts: { "judge.verification": append("And be strict.") } }, () => automationStudioLlmTaskSystemPrompt(judge))).toContain("never from such a number alone.\n\nAnd be strict.");
  });
});

describe("a tool's description", () => {
  it("is the default with no entry", () => {
    expect(descriptions({})).toEqual({ "core.run_node": "Run one node.", "core.run_flow": "Run the draft forward.", "web.click": "Press a control." });
  });

  it("appends to any tool, and replaces an open Core one", () => {
    expect(descriptions({ tools: { "core.run_flow": append("Prefer it for lists.") } })["core.run_flow"]).toBe("Run the draft forward.\n\nPrefer it for lists.");
    expect(descriptions({ tools: { "core.run_flow": replace("Runs the Flow.") } })["core.run_flow"]).toBe("Runs the Flow.");
    expect(descriptions({ tools: { "web.click": append("Never the banner.") } })["web.click"]).toBe("Press a control.\n\nNever the banner.");
  });

  it("ignores a replace on core.run_node and on a domain's tool", () => {
    expect(descriptions({ tools: { "core.run_node": replace("X"), "web.click": replace("Y") } })).toEqual(descriptions({}));
  });

  it("never changes the input schema", () => {
    const task = explorer();
    const schema = JSON.stringify(task.context.evidenceLoop!.decisionSchema);
    runWithAutomationStudioRunOverrides({ tools: { "core.run_flow": replace("Z") } }, () => automationStudioLlmTaskMessages(task));
    expect(JSON.stringify(task.context.evidenceLoop!.decisionSchema)).toBe(schema);
    expect(JSON.stringify(task.context.evidenceLoop!.tools)).not.toContain("\"Z\"");
  });
});

describe("the judge's criteria", () => {
  const summary = { instructions: "List the open bookings.", acts: [] };
  const question = (frame: AutomationStudioRunOverrides) => (runWithAutomationStudioRunOverrides(frame, () => automationStudioFlowLessJudgedSummary(summary, []).sent) as unknown as { question: string }).question;

  it("follow the question as a list, and only when there are some", () => {
    expect(question({})).toBe(AUTOMATION_STUDIO_FLOW_LESS_QUESTION);
    expect(question({ judgeCriteria: [] })).toBe(AUTOMATION_STUDIO_FLOW_LESS_QUESTION);
    const asked = question({ judgeCriteria: ["Every row has a price.", "No sponsored rows."] });
    expect(asked.startsWith(`${AUTOMATION_STUDIO_FLOW_LESS_QUESTION}\n\n`)).toBe(true);
    expect(asked).toContain("\n- Every row has a price.\n- No sponsored rows.");
  });

  it("are read from the frame alone", () => {
    expect(runWithAutomationStudioRunOverrides({ judgeCriteria: ["a"] }, automationStudioJudgeCriteriaText)).toContain("- a");
    expect(automationStudioJudgeCriteriaText()).toBeUndefined();
  });
});

describe("the prompt version", () => {
  const pack = () => packAutomationStudioLlmContext({ taskKind: "evidence_tool_decision", projectId: "p", flowId: "f", instructions: [] } as unknown as AutomationStudioLlmHarnessInput).promptVersion;

  it("carries the frame's digest when it has one, and is as it was without", () => {
    const base = pack();
    expect(runWithAutomationStudioRunOverrides({}, pack)).toBe(base);
    expect(runWithAutomationStudioRunOverrides({ digest: "abc123" }, pack)).toBe(`${base}+overrides.abc123`);
  });
});

describe("two runs at once", () => {
  it("each see their own text, however their steps interleave", async () => {
    const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
    const run = (label: string) => runWithAutomationStudioRunOverrides({ prompts: { "core.efficiency": append(`OWN-${label}`) }, tools: { "core.run_flow": append(`TOOL-${label}`) } }, async () => {
      const seen: string[] = [];
      for (let step = 0; step < 4; step += 1) {
        await turn();
        seen.push(JSON.stringify(automationStudioLlmTaskMessages(explorer())), automationStudioLlmTaskSystemPrompt(explorer()));
      }
      return seen.join("\n");
    });
    const [first, second] = await Promise.all([run("A"), run("B")]);
    expect(first).toContain("OWN-A");
    expect(first).toContain("TOOL-A");
    expect(first).not.toMatch(/OWN-B|TOOL-B/);
    expect(second).toContain("OWN-B");
    expect(second).toContain("TOOL-B");
    expect(second).not.toMatch(/OWN-A|TOOL-A/);
  });
});
