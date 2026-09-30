// The pane a person lands on offers the right door for the Flow in front of
// them: describing the job for a blank Flow, improving it for one a build has
// already written. Before t178 a built Flow got a sentence and no way in.

import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

const loadReadiness = vi.fn();
vi.mock("../../../runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../runtime")>()),
  useRuntimeExecutionCommands: () => runtimeCommands
}));
vi.mock("../../../data/use-program-transport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../data/use-program-transport")>()),
  useProgramTransport: () => transport
}));

const transport = { get: vi.fn(), post: vi.fn() };
const runtimeCommands = {
  loadReadiness,
  generateBootstrap: vi.fn(),
  saveGenerationInstruction: vi.fn(),
  generateFromWebsite: vi.fn()
};

import { FlowEditorView } from "../FlowEditorView";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const flow = {
  flowId: "flow.one",
  name: "Earbuds",
  nodes: [],
  edges: [],
  metadata: { flowRepresentationVersion: 1, flowRepresentationKind: "orchestration", llmProvider: "deepseek", llmModel: "deepseek-flash", llmSecretKeyId: "key.deepseek" }
};

async function mount(readiness: Record<string, unknown>) {
  loadReadiness.mockResolvedValue({ instructions: [], router: null, subflowTotal: 0, error: "", ...readiness });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<FlowEditorView {...({ taskGraph: null, authoringFlow: flow, projectId: "project.one" } as any)} />); });
  return renderer;
}
const sections = (renderer: ReactTestRenderer) => renderer.root.findAll((node) => node.type === "section").map((node) => node.props["aria-label"]);

describe("the Flow editor's start pane", () => {
  it("offers to improve a Flow a build already wrote", async () => {
    const renderer = await mount({ router: { routerId: "router.one" }, subflowTotal: 1 });
    expect(sections(renderer)).toContain("Improve this automation");
    expect(sections(renderer)).not.toContain("Tell FluxIQ what to automate");
  });

  it("offers to describe the job for a blank Flow, and not to improve it", async () => {
    const renderer = await mount({});
    expect(sections(renderer)).toContain("Tell FluxIQ what to automate");
    expect(sections(renderer)).not.toContain("Improve this automation");
  });
});
