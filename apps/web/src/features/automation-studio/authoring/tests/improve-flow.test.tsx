const draft = (flowId: string, candidateId = "candidate.one") => ({ status: "draft", projectId: "project.one", flowId, candidateId, revision: 1, digest: "a".repeat(64), sourceInstructionIds: ["instruction.one"], baseDependencyDigest: "base", baseSettingsRevision: 0, verification: "not_performed", promotionAllowed: false, accounting: { requestId: "request", estimatedInputTokens: 1 } });
// Improving a Flow that already has steps, from what a person says should
// change. The creation panel refuses such a Flow by design; this is the door
// for it, and it has to send exactly what Core's `extend` build needs: the
// person's words saved as an active instruction first, then an exploration
// request carrying `authoringMode: "candidate", mode: "extend"`.

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
const improvementPayload = { projectId: "project.one", flowId: "flow.week-ahead" };
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
    saveImprovementInstruction: vi.fn(async () => ({ ok: true, payload: { instruction: { instructionId: "instruction.improvement.one", status: "active" } } })),
    improveFromWebsite: vi.fn(async () => ({ ok: true, payload: { candidate: draft(builtFlow.flowId) } })),
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
  for (const transition of ["project", "flow", "unmount"] as const) for (const outcome of ["success", "failure", "reject"] as const) {
    it(`ignores late improvement ${outcome} after ${transition}`, async () => {
      let resolve!: (value: any) => void;
      let reject!: (error: Error) => void;
      const pending = new Promise((done, fail) => { resolve = done; reject = fail; });
      const improvementCommands = commands({ improveFromWebsite: vi.fn(() => pending) });
      const { renderer, onOpenAdaptation } = await mount(improvementCommands);
      await ask(renderer);
      await act(async () => {
        if (transition === "unmount") renderer.unmount();
        else renderer.update(<ImproveFlowPanel commands={improvementCommands} flow={transition === "flow" ? { ...builtFlow, flowId: "flow.next" } : builtFlow} onOpenAdaptation={onOpenAdaptation} projectId={transition === "project" ? "project.next" : "project.one"} readiness={built} />);
      });
      await act(async () => {
        if (outcome === "reject") reject(new Error("Old request failed"));
        else resolve(outcome === "success" ? { ok: true, payload: { candidate: draft(builtFlow.flowId) } } : { ok: false });
        await pending.catch(() => undefined);
      });
      expect(onOpenAdaptation).not.toHaveBeenCalled();
      if (transition !== "unmount") {
        expect(button(renderer, "Review suggested change")).toBeUndefined();
        expect(renderer.root.findAllByProps({ role: "alert" })).toHaveLength(0);
        expect(renderer.root.findAllByType("progress")).toHaveLength(0);
        await act(async () => renderer.unmount());
      }
    });
  }
  it("keeps the returned proposal reviewable after wording changes", async () => {
    const improvementCommands = commands();
    const { renderer, onOpenAdaptation } = await mount(improvementCommands);
    await ask(renderer);
    await act(async () => renderer.root.findByProps({ "aria-label": "What should change" }).props.onChange({ target: { value: "A later request" } }));
    expect(button(renderer, "Review suggested change")).toBeUndefined();
    expect(onOpenAdaptation).not.toHaveBeenCalled();
    expect(improvementCommands.improveFromWebsite).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByProps({ "aria-label": "What should change" }).props.value).toBe("A later request");
    await act(async () => renderer.unmount());
  });
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
    await improveFlowFromWebsiteAdaptation(api, { projectId: "p", flowId: "f" });
    expect(post.mock.calls[0]).toEqual(["save-flow-instruction", { projectId: "p", flowId: "f", ...improvementInstruction(CHANGE) }]);
    expect(post.mock.calls[1]).toEqual(["save-flow-instruction", { projectId: "p", flowId: "f", instructionId: "instruction.improvement.one", ...improvementInstruction("Reworded.") }]);
    expect(post.mock.calls[2]).toEqual(["generate-flow-bootstrap-adaptation", { projectId: "p", flowId: "f", evidenceGuided: true, authoringMode: "candidate", mode: "extend" }, { policy: { timeoutMs: WEBSITE_EXPLORATION_COMMAND_TIMEOUT_MS } }]);
  });

  it("is not offered for a blank Flow", async () => {
    const { renderer } = await mount(commands(), { ...built, router: null, subflowTotal: 0 });
    expect(renderer.toJSON()).toBeNull();
  });

  it("saves, builds the extend and opens the suggested change, in that order, with no grant step", async () => {
    const improvementCommands = commands();
    const { renderer, onOpenAdaptation } = await mount(improvementCommands);
    await ask(renderer);
    expect(improvementCommands.saveImprovementInstruction).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.week-ahead", instruction: CHANGE });
    expect(improvementCommands.improveFromWebsite).toHaveBeenCalledWith(improvementPayload);
    expect(improvementCommands.improveFromWebsite.mock.calls[0]?.[0]).not.toHaveProperty("llmExecutionGrantId");
    expect(improvementCommands.saveImprovementInstruction.mock.invocationCallOrder[0]).toBeLessThan(improvementCommands.improveFromWebsite.mock.invocationCallOrder[0]);
    expect(onOpenAdaptation).not.toHaveBeenCalled();
    expect(renderedText(renderer.toJSON())).toContain("Verification pending");
  });

  it("never asks to confirm a large run, and a retry of the same words does not save a second instruction", async () => {
    const improveFromWebsite = vi.fn()
      .mockResolvedValueOnce({ ok: false, payload: { diagnostic: { code: "flow_bootstrap.provider_timeout" } } })
      .mockResolvedValue({ ok: true, payload: { candidate: draft(builtFlow.flowId) } });
    const improvementCommands = commands({ improveFromWebsite });
    const { renderer } = await mount(improvementCommands);
    await ask(renderer);
    expect(renderer.root.findAllByProps({ "aria-label": "Confirm a large model run" })).toHaveLength(0);
    await ask(renderer);
    expect(improveFromWebsite).toHaveBeenCalledTimes(2);
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
      .mockResolvedValueOnce({ ok: true, payload: { candidate: draft(builtFlow.flowId) } });
    const improvementCommands = commands({ improveFromWebsite });
    const { renderer, onOpenAdaptation } = await mount(improvementCommands);
    await ask(renderer);
    expect(renderer.root.findByProps({ "aria-label": "Confirm what the change may do" })).toBeTruthy();
    await act(async () => { await button(renderer, "Allow and continue")!.props.onClick(); });
    expect(improveFromWebsite.mock.calls[0]?.[0]).not.toHaveProperty("permittedConsequences");
    expect(improveFromWebsite).toHaveBeenLastCalledWith({ ...improvementPayload, permittedConsequences: ["modify_existing"] });
    expect(onOpenAdaptation).not.toHaveBeenCalled();
  });
});

it("saved improvement draft is pending and cannot open an apply action", async () => {
  const { renderer, onOpenAdaptation } = await mount(commands());
  await ask(renderer);
  expect(renderedText(renderer.toJSON())).toContain("Verification pending");
  expect(onOpenAdaptation).not.toHaveBeenCalled();
  expect(button(renderer, "Review suggested change")).toBeUndefined();
  await act(async () => renderer.unmount());
});
