// Improving a Flow that already has steps, from what a person says should
// change. The creation panel refuses such a Flow by design; this is the door
// for it, and it has to send exactly what Core's `extend` build needs: the
// person's words saved as an active instruction first, then an exploration
// request carrying `mode: "extend"`.

import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../programs/shared-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../programs/shared-ui")>();
  return { ...actual, Modal: (props: { children: React.ReactNode; title: string }) => <section aria-label={props.title}>{props.children}</section> };
});

import { ImproveFlowPanel } from "../ImproveFlowPanel";
import { blankFlowExplorationRequest, type BlankFlowAuthoringReadiness } from "../blank-flow-authoring-model";
import { improveFlowFromWebsiteAdaptation, saveFlowImprovementInstruction, WEBSITE_EXPLORATION_COMMAND_TIMEOUT_MS } from "../authoring-commands";
import { existingFlowImprovementRequest, improvementInstruction } from "../existing-flow-improvement";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

/** A Flow a build already wrote: its parent graph is empty, its steps sit in a Subflow behind a Router. */
const builtFlow = {
  flowId: "flow.week-ahead",
  name: "Week ahead",
  nodes: [],
  edges: [],
  metadata: { flowRepresentationVersion: 1, flowRepresentationKind: "orchestration", llmProvider: "deepseek", llmModel: "deepseek-flash", llmSecretKeyId: "key.deepseek" }
};
const built: BlankFlowAuthoringReadiness = { loading: false, instructions: [{ instructionId: "instruction.generation", status: "active" }], router: { routerId: "router.one" }, subflowTotal: 1, error: "" };
const improvementPayload = {
  purpose: "build_and_adapt", projectId: "project.one", flowId: "flow.week-ahead", keyId: "key.deepseek", provider: "deepseek", model: "deepseek-flash",
  tokenLimits: { maxInputTokens: 48_000, maxOutputTokens: 8_000, maxTotalTokens: 56_000 }, maxTotalTokensPerRun: 560_000, timeoutMs: 45_000, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 1, providerRetryCount: 0
};
const CHANGE = "Sometimes a What's new announcement covers the queue. When it is showing, close it first; when it is not, go straight to the queue.";

function button(renderer: ReactTestRenderer, text: string) {
  return renderer.root.findAllByType("button").find((candidate) => candidate.children.some((child) => child === text));
}
function renderedText(value: any): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(renderedText).join("");
  return value ? renderedText(value.children) : "";
}
function commands(overrides: Record<string, unknown> = {}) {
  return {
    preflightLlm: vi.fn(async () => ({ ok: true, payload: { preflight: { purpose: "build_and_adapt", tokenLimits: { maxTotalTokens: 56_000 }, maxTotalTokensPerRun: 90_000 } } })),
    issueLlmGrant: vi.fn(async () => ({ ok: true, payload: { grant: { grantId: "grant.improve.one" } } })),
    saveImprovementInstruction: vi.fn(async () => ({ ok: true, payload: { instruction: { instructionId: "instruction.improvement.one", status: "active" } } })),
    improveFromWebsite: vi.fn(async () => ({ ok: true, payload: { adaptation: { projectId: "project.one", flowId: builtFlow.flowId, adaptationId: "adaptation.extend.one", status: "proposed" } } })),
    ...overrides
  } as any;
}
async function mount(improvementCommands: ReturnType<typeof commands>, readiness = built, flow: any = builtFlow) {
  const onOpenAdaptation = vi.fn();
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<ImproveFlowPanel commands={improvementCommands} flow={flow} onOpenAdaptation={onOpenAdaptation} projectId="project.one" readiness={readiness} />); });
  return { renderer, onOpenAdaptation };
}
async function ask(renderer: ReactTestRenderer, text = CHANGE) {
  await act(async () => { renderer.root.findByProps({ "aria-label": "What should change" }).props.onChange({ target: { value: text } }); });
  await act(async () => { await button(renderer, "Improve automation")!.props.onClick(); });
}

describe("improving a Flow that already has steps", () => {
  it("accepts exactly the Flows Core's extend accepts, which are the ones creation refuses", () => {
    expect(existingFlowImprovementRequest("project.one", builtFlow, built)).toEqual({ ok: true, payload: improvementPayload });
    expect(blankFlowExplorationRequest("project.one", builtFlow, built).ok).toBe(false);
    // Blank: creation's subject, not an improvement's.
    expect(existingFlowImprovementRequest("project.one", builtFlow, { ...built, router: null, subflowTotal: 0 }).ok).toBe(false);
    expect(existingFlowImprovementRequest("project.one", builtFlow, { ...built, router: null }).ok).toBe(false);
    expect(existingFlowImprovementRequest("project.one", builtFlow, { ...built, subflowTotal: 0 }).ok).toBe(false);
    // Steps in the parent graph: not an orchestration Flow a build wrote.
    expect(existingFlowImprovementRequest("project.one", { ...builtFlow, nodes: [{ id: "n" }] }, built).ok).toBe(false);
    expect(existingFlowImprovementRequest("project.one", { ...builtFlow, metadata: { ...builtFlow.metadata, llmSecretKeyId: "" } }, built).ok).toBe(false);
    expect(existingFlowImprovementRequest("project.one", builtFlow, { ...built, loading: true }).ok).toBe(false);
    expect(existingFlowImprovementRequest("project.one", builtFlow, { ...built, error: "unreachable" }).ok).toBe(false);
    // No instruction is needed beforehand: the person's words become one.
    expect(existingFlowImprovementRequest("project.one", builtFlow, { ...built, instructions: [] }).ok).toBe(true);
  });

  it("stores the words as a required generation instruction titled by its opening", () => {
    expect(improvementInstruction(`  ${CHANGE}  `)).toEqual({
      title: "Improvement: Sometimes a What's new announcement covers the queue.",
      body: CHANGE,
      requirement: "required",
      tags: ["generation"]
    });
    expect(improvementInstruction("x".repeat(200)).title).toBe(`Improvement: ${"x".repeat(67)}...`);
  });

  it("posts the instruction to save-flow-instruction and the build as an evidence-guided extend", async () => {
    const post = vi.fn(async () => ({ ok: true, payload: {} }));
    const api = { get: vi.fn(), post } as any;
    await saveFlowImprovementInstruction(api, { projectId: "p", flowId: "f", instruction: CHANGE });
    await saveFlowImprovementInstruction(api, { projectId: "p", flowId: "f", instruction: "Reworded.", instructionId: "instruction.improvement.one" });
    await improveFlowFromWebsiteAdaptation(api, { projectId: "p", flowId: "f", llmExecutionGrantId: "g" });
    expect(post.mock.calls[0]).toEqual(["save-flow-instruction", { projectId: "p", flowId: "f", ...improvementInstruction(CHANGE) }]);
    expect(post.mock.calls[1]).toEqual(["save-flow-instruction", { projectId: "p", flowId: "f", instructionId: "instruction.improvement.one", ...improvementInstruction("Reworded.") }]);
    expect(post.mock.calls[2]).toEqual(["generate-flow-bootstrap-adaptation", { projectId: "p", flowId: "f", llmExecutionGrantId: "g", evidenceGuided: true, mode: "extend" }, { policy: { timeoutMs: WEBSITE_EXPLORATION_COMMAND_TIMEOUT_MS } }]);
  });

  it("is not offered for a blank Flow", async () => {
    const { renderer } = await mount(commands(), { ...built, router: null, subflowTotal: 0 });
    expect(renderer.toJSON()).toBeNull();
  });

  it("saves, authorizes, builds the extend and opens the suggested change, in that order", async () => {
    const improvementCommands = commands();
    const { renderer, onOpenAdaptation } = await mount(improvementCommands);
    await ask(renderer);
    expect(improvementCommands.saveImprovementInstruction).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.week-ahead", instruction: CHANGE });
    expect(improvementCommands.preflightLlm).toHaveBeenCalledWith(improvementPayload);
    expect(improvementCommands.issueLlmGrant).toHaveBeenCalledWith({ ...improvementPayload, ttlMs: 60_000 });
    expect(improvementCommands.improveFromWebsite).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.week-ahead", llmExecutionGrantId: "grant.improve.one" });
    expect(improvementCommands.saveImprovementInstruction.mock.invocationCallOrder[0]).toBeLessThan(improvementCommands.preflightLlm.mock.invocationCallOrder[0]);
    expect(onOpenAdaptation).toHaveBeenCalledWith("flow.week-ahead", "adaptation.extend.one");
    expect(renderedText(renderer.toJSON())).toContain("Nothing has changed yet.");
  });

  it("asks before a large run, and a retry of the same words does not save a second instruction", async () => {
    const improvementCommands = commands({ preflightLlm: vi.fn(async () => ({ ok: true, payload: { preflight: { maxTotalTokensPerRun: 560_000, tokenLimits: { maxTotalTokens: 56_000 } } } })) });
    const { renderer } = await mount(improvementCommands);
    await ask(renderer);
    expect(improvementCommands.issueLlmGrant).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ "aria-label": "Confirm a large model run" })).toBeTruthy();
    await act(async () => { await button(renderer, "Continue")!.props.onClick(); });
    expect(improvementCommands.issueLlmGrant).toHaveBeenCalledWith({ ...improvementPayload, highTokenConfirmation: true, ttlMs: 60_000 });
    expect(improvementCommands.saveImprovementInstruction).toHaveBeenCalledTimes(1);
  });

  it("updates the saved instruction when the words change instead of adding another", async () => {
    const improvementCommands = commands({ improveFromWebsite: vi.fn(async () => ({ ok: false, payload: { diagnostic: { code: "flow_bootstrap.provider_timeout" } } })) });
    const { renderer } = await mount(improvementCommands);
    await ask(renderer);
    expect(renderedText(renderer.toJSON())).toContain("The model request timed out.");
    await ask(renderer, "Close the announcement when it shows.");
    expect(improvementCommands.saveImprovementInstruction).toHaveBeenLastCalledWith({ projectId: "project.one", flowId: "flow.week-ahead", instruction: "Close the announcement when it shows.", instructionId: "instruction.improvement.one" });
  });

  it("says a waiting suggested change has to be settled first", async () => {
    const improvementCommands = commands({ improveFromWebsite: vi.fn(async () => ({ ok: false, payload: { diagnostic: { code: "flow_bootstrap.pending_adaptation_exists" } } })) });
    const { renderer } = await mount(improvementCommands);
    await ask(renderer);
    expect(renderedText(renderer.toJSON())).toContain("A suggested change is already waiting for review.");
  });

  it("carries on with only the consequences the person allowed", async () => {
    const permissionRequest = {
      schemaVersion: "automation-studio.action-permission-request.v1",
      requestId: "permission.one",
      requestedAtMs: 1,
      action: { kind: "exploration_step", id: "web.dom.click", ref: "call.one", verb: "click" },
      control: { name: "Got it", kind: "button" },
      consequences: ["modify_existing"],
      missing: ["modify_existing"],
      reason: { stage: "authoring", instructionIds: ["instruction.improvement.one"] },
      authority: { granted: [], instructed: [] },
      sentence: "The run needs approval to change something that already exists."
    };
    const improveFromWebsite = vi.fn()
      .mockResolvedValueOnce({ ok: false, payload: { diagnostic: { code: "flow_bootstrap.permission_required", permissionRequest } } })
      .mockResolvedValueOnce({ ok: true, payload: { adaptation: { flowId: builtFlow.flowId, adaptationId: "adaptation.extend.two", status: "proposed" } } });
    const improvementCommands = commands({ improveFromWebsite });
    const { renderer, onOpenAdaptation } = await mount(improvementCommands);
    await ask(renderer);
    expect(renderer.root.findByProps({ "aria-label": "Confirm what the change may do" })).toBeTruthy();
    await act(async () => { await button(renderer, "Allow and continue")!.props.onClick(); });
    expect(improvementCommands.issueLlmGrant).toHaveBeenLastCalledWith({ ...improvementPayload, permittedConsequences: ["modify_existing"], ttlMs: 60_000 });
    expect(onOpenAdaptation).toHaveBeenCalledWith("flow.week-ahead", "adaptation.extend.two");
  });
});
