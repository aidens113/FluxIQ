import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams()
}));
import { AdaptationsViewContent } from "../index";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const bootstrapAdaptation = {
  adaptationId: "adaptation.bootstrap",
  flowId: "flow.one",
  status: "proposed",
  trigger: "Instruction-built Flow Bootstrap",
  patch: [
    { kind: "edit_router", targetId: "router.one", after: { routerId: "router.one", name: "Checkout Router", ruleCount: 3, fallbackKind: "fail" } },
    { kind: "create_subflow", targetId: "subflow.pay", after: { subflowId: "subflow.pay", graphFlowId: "graph.pay", name: "Pay", role: "main", nodeCount: 3, edgeCount: 2, steps: [{ nodeId: "n1", label: "Open cart" }, { nodeId: "n3", label: "Confirm" }] } },
    { kind: "create_subflow", targetId: "subflow.refund", after: { subflowId: "subflow.refund", graphFlowId: "graph.refund", name: "Refund", role: "branch", nodeCount: 1, edgeCount: 0 } }
  ],
  validationResults: [],
  metadata: { adaptationKind: "flow_bootstrap", bootstrap: {} }
};

function commandsWith(adaptation: any, loadTopology?: any) {
  return {
    listAdaptations: vi.fn(async () => ({ ok: true, payload: { adaptations: [], page: { adaptations: [], limit: 25, offset: 0, total: 0 } } })),
    loadAdaptation: vi.fn(async () => ({ ok: true, payload: { adaptation } })),
    reviewAdaptation: vi.fn(),
    ...(loadTopology ? { loadTopology } : {})
  } as any;
}

async function openChanges(commands: any) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<AdaptationsViewContent commands={commands} flow={{ flowId: "flow.one" }} projectId="project.one" requestedAdaptationId="adaptation.bootstrap" />);
  });
  const changesTab = renderer.root.findAll((node) => node.type === "button" && node.children.includes("Changes"))[0]!;
  await act(async () => { changesTab.props.onClick(); });
  return renderer;
}

const textOf = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());

describe("Flow Bootstrap before/after diff", () => {
  it("shows an extend as changes to the existing automation, with step lists and review actions", async () => {
    const loadTopology = vi.fn(async () => ({ ok: true, payload: { topology: {
      router: { routerId: "router.one", ruleCount: 2 },
      subflows: [{ subflowId: "subflow.pay", name: "Pay", graphFlowId: "graph.pay", nodeCount: 2, edgeCount: 1, nodes: [{ nodeId: "n1", label: "Open cart" }, { nodeId: "n2", label: "Old step" }] }]
    } } }));
    const commands = commandsWith(bootstrapAdaptation, loadTopology);
    const renderer = await openChanges(commands);
    expect(loadTopology).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.one", subflowIds: ["subflow.pay", "subflow.refund"] });
    const text = textOf(renderer);
    expect(text).toContain("Changes to your existing automation");
    expect(text).toContain("Router rules");
    expect(text).toContain("2 rules");
    expect(text).toContain("3 rules");
    expect(text).toContain("Subflow Pay");
    expect(text).toContain("2 steps, 1 connection");
    expect(text).toContain("3 steps, 2 connections");
    expect(text).toContain("Not there yet");
    const added = renderer.root.findByProps({ "aria-label": "Added steps in Pay" });
    expect(JSON.stringify(added.children.map((child: any) => child.props?.children))).toContain("Confirm");
    const removed = renderer.root.findByProps({ "aria-label": "Removed steps in Pay" });
    expect(JSON.stringify(removed.children.map((child: any) => child.props?.children))).toContain("Old step");
    // The diff sits above the existing change cards, and its review action opens the same review dialog.
    const approve = renderer.root.findByProps({ "aria-label": "Review this change" }).findAll((node) => node.type === "button" && node.children.includes("Approve"))[0]!;
    await act(async () => { approve.props.onClick(); });
    expect(renderer.root.findAll((node) => typeof node.type !== "string" && node.props.title === "Approve Adaptation")).not.toHaveLength(0);
    await act(async () => renderer.unmount());
  });

  it("says what changes for a create and keeps working when the current Flow cannot be read", async () => {
    const loadTopology = vi.fn(async () => ({ ok: false, error: "Subflows unavailable." }));
    const renderer = await openChanges(commandsWith({ ...bootstrapAdaptation, metadata: { adaptationKind: "flow_bootstrap", bootstrap: { mode: "create" } } }, loadTopology));
    const text = textOf(renderer);
    expect(text).toContain("What changes");
    expect(text).not.toContain("Changes to your existing automation");
    expect(text).toContain("The current automation could not be read, so only the proposed version is shown.");
    expect(text).toContain("Subflows unavailable.");
    expect(text).toContain("3 rules");
    const retry = renderer.root.findAll((node) => node.type === "button" && node.children.includes("Retry"))[0]!;
    await act(async () => { retry.props.onClick(); });
    expect(loadTopology).toHaveBeenCalledTimes(2);
    await act(async () => renderer.unmount());
  });

  it("shows the proposed side alone without a topology command, and nothing for other adaptations", async () => {
    const withoutLoader = await openChanges(commandsWith(bootstrapAdaptation));
    expect(textOf(withoutLoader)).toContain("The current automation is not available here, so only the proposed version is shown.");
    await act(async () => withoutLoader.unmount());

    const loadTopology = vi.fn();
    const runtime = await openChanges(commandsWith({ ...bootstrapAdaptation, metadata: { adaptationKind: "runtime" } }, loadTopology));
    expect(textOf(runtime)).not.toContain("What changes");
    expect(loadTopology).not.toHaveBeenCalled();
    await act(async () => runtime.unmount());
  });
});
