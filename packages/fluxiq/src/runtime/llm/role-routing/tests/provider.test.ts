// One provider over a model per role: each request reaches its role's model, `servedBy` names it, a person's wait on
// any of them is heard, and a domain's instructions are stamped on what it serves.
import { describe, expect, it } from "vitest";
import { automationStudioLlmProviderWithDomainInstructions } from "../../domain-instructions/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../harness/index.ts";
import { automationStudioLlmProviderRoutedByRole, runWithAutomationStudioLlmModelRole } from "../index.ts";

const request = (taskKind: string, requestId = "r1") => ({ requestId, taskKind, context: {} }) as unknown as AutomationStudioLlmTaskRequest;

function model(name: string, ran: string[], over: Partial<AutomationStudioLlmProvider> = {}): AutomationStudioLlmProvider {
  return {
    metadata: { provider: "mock", model: name },
    runTask: async (asked) => {
      ran.push(`${name}:${asked.taskKind}:${asked.domainInstructions?.domainId ?? "-"}`);
      return { model: name };
    },
    estimateCostUsd: ({ inputTokens }) => inputTokens * (name === "dear" ? 2 : 1),
    ...over
  };
}

describe("a provider routed by role", () => {
  it("sends each request to its role's model and names that model to whoever asks", async () => {
    const ran: string[] = [];
    const explore = model("cheap", ran);
    const judge = model("dear", ran);
    const routed = automationStudioLlmProviderRoutedByRole({ explore, judge });

    await routed.runTask(request("evidence_tool_decision"));
    await routed.runTask(request("loop_verification"));
    await routed.runTask(request("runtime_patch"));
    await runWithAutomationStudioLlmModelRole("repair", async () => await routed.runTask(request("evidence_tool_decision")));

    expect(ran).toEqual(["cheap:evidence_tool_decision:-", "dear:loop_verification:-", "cheap:runtime_patch:-", "cheap:evidence_tool_decision:-"]);
    expect(routed.servedBy?.(request("loop_verification"))).toBe(judge);
    expect(routed.servedBy?.(request("flow_bootstrap"))).toBe(explore);
    // The attempt's own model is the explore model, and a price asked without a request is its.
    expect(routed.metadata).toEqual(explore.metadata);
    expect(routed.estimateCostUsd?.({ inputTokens: 10, outputTokens: 0 })).toBe(10);
  });

  it("routes a repair round's decisions to the repair model", async () => {
    const ran: string[] = [];
    const routed = automationStudioLlmProviderRoutedByRole({ explore: model("cheap", ran), repair: model("fixer", ran) });
    await runWithAutomationStudioLlmModelRole("repair", async () => await routed.runTask(request("evidence_tool_decision")));
    await routed.runTask(request("runtime_diagnosis"));
    await routed.runTask(request("evidence_tool_decision"));
    expect(ran).toEqual(["fixer:evidence_tool_decision:-", "fixer:runtime_diagnosis:-", "cheap:evidence_tool_decision:-"]);
  });

  it("measures and waits by the model that serves, and hears a person's wait on any model", async () => {
    const ran: string[] = [];
    const waited: string[] = [];
    const listeners: Record<string, (state: "started" | "ended", heldMs: number) => void> = {};
    const withHolds = (name: string, measures: number) => model(name, ran, {
      measureInput: () => ({ estimatedInputTokens: measures, estimatedInputBytes: measures * 3 }),
      whenReady: async () => void waited.push(name),
      observeHolds: (listener) => {
        listeners[name] = listener;
        return () => delete listeners[name];
      }
    });
    const routed = automationStudioLlmProviderRoutedByRole({ explore: withHolds("cheap", 5), judge: withHolds("dear", 7) });

    expect(routed.measureInput?.(request("loop_verification"))).toEqual({ estimatedInputTokens: 7, estimatedInputBytes: 21 });
    await routed.whenReady?.(request("loop_verification"));
    expect(waited).toEqual(["dear"]);
    const heard: string[] = [];
    const stop = routed.observeHolds?.((state) => void heard.push(state));
    listeners.dear?.("started", 0);
    listeners.cheap?.("ended", 3);
    expect(heard).toEqual(["started", "ended"]);
    stop?.();
    expect(Object.keys(listeners)).toEqual([]);
  });

  it("refuses to measure on a model that does not, so the harness measures the packed request", () => {
    const routed = automationStudioLlmProviderRoutedByRole({ explore: model("cheap", [], { measureInput: () => ({ estimatedInputTokens: 1, estimatedInputBytes: 3 }) }), judge: model("dear", []) });
    expect(() => routed.measureInput?.(request("loop_verification"))).toThrow(/dear/u);
  });

  it("is stamped by a domain's instructions on whichever model serves, and names that one through the wrapper", async () => {
    const ran: string[] = [];
    const judge = model("dear", ran);
    const instructions = { domainId: "web", version: "web.v1", text: "Name controls by their labels." };
    const wrapped = automationStudioLlmProviderWithDomainInstructions(automationStudioLlmProviderRoutedByRole({ explore: model("cheap", ran), judge }), instructions);

    await wrapped.runTask(request("loop_verification"));
    const served = wrapped.servedBy?.(request("loop_verification"));
    await served?.runTask(request("loop_verification", "r2"));

    expect(ran).toEqual(["dear:loop_verification:web", "dear:loop_verification:web"]);
    expect(served?.metadata.model).toBe("dear");
    expect(served?.estimateCostUsd?.({ inputTokens: 10, outputTokens: 0 })).toBe(20);
    // A provider that routes nothing has nothing to forward.
    expect(automationStudioLlmProviderWithDomainInstructions(judge, instructions).servedBy).toBeUndefined();
  });
});
