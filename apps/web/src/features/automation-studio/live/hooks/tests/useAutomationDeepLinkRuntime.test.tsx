import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { parseAutomationStudioDeepLink } from "../../../navigation";
import { automationStudioViewId } from "../../../views";
import { useAutomationDeepLinkRuntime } from "../useAutomationDeepLinkRuntime";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type Options = Parameters<typeof useAutomationDeepLinkRuntime>[0];
let renderer: ReactTestRenderer | undefined;

function Host(props: { options: Options }) {
  useAutomationDeepLinkRuntime(props.options);
  return null;
}

const flow = { flowId: "f", metadata: {} };
const flowById = new Map<string, any>([["f", flow]]);
const projectFlows = [flow];

function baseOptions(query: string, overrides: Partial<Options> = {}): Options {
  return {
    deepLink: parseAutomationStudioDeepLink(query),
    searchSignature: query,
    activeProjectId: "p",
    loadedProjectId: "p",
    activeViewId: automationStudioViewId.router,
    projectFlowSignature: "f",
    projectFlows,
    selection: null,
    selectedFlow: null,
    lastOpenFlowId: null,
    flowById,
    loadFlow: vi.fn(async () => flow),
    openSubflow: vi.fn(async () => undefined),
    selectFlow: vi.fn(() => true),
    openView: vi.fn(),
    openAdaptation: vi.fn(),
    ...overrides
  };
}

async function render(options: Options) {
  await act(async () => {
    if (renderer) renderer.update(<Host options={options} />);
    else renderer = create(<Host options={options} />);
  });
}

afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
});

it("opens Suggested changes with the linked adaptation selected, once", async () => {
  const options = baseOptions("project=p&flow=f&view=adaptations&detail=adaptation%3Aadapt-1");
  await render(options);
  expect(options.loadFlow).toHaveBeenCalledWith("f");
  expect(options.selectFlow).toHaveBeenCalledWith({ kind: "flow", id: "f" }, "preview");
  expect(options.openAdaptation).toHaveBeenCalledTimes(1);
  expect(options.openAdaptation).toHaveBeenCalledWith("f", "adapt-1");
  expect(options.openView).not.toHaveBeenCalled();

  // The user then navigates by hand: the link must not pull them back.
  await render({ ...options, activeViewId: automationStudioViewId.flowEditor, selection: { kind: "flow", id: "f" } as any, selectedFlow: flow });
  await render({ ...options, activeViewId: automationStudioViewId.router, selection: { kind: "flow", id: "f" } as any, selectedFlow: flow });
  expect(options.openAdaptation).toHaveBeenCalledTimes(1);
  expect(options.openView).not.toHaveBeenCalled();
  expect(options.loadFlow).toHaveBeenCalledTimes(1);
});

it("treats an adaptation detail without a view as a link to Suggested changes", async () => {
  const options = baseOptions("project=p&flow=f&detail=adaptation%3Aadapt-2");
  await render(options);
  expect(options.openAdaptation).toHaveBeenCalledWith("f", "adapt-2");
  expect(options.openView).not.toHaveBeenCalled();
});

it("selects the adaptation when its Flow and view are already showing", async () => {
  const options = baseOptions("project=p&flow=f&view=adaptations&detail=adaptation%3Aadapt-3", {
    activeViewId: automationStudioViewId.adaptations,
    selection: { kind: "flow", id: "f" } as any,
    selectedFlow: flow
  });
  await render(options);
  expect(options.loadFlow).not.toHaveBeenCalled();
  expect(options.openAdaptation).toHaveBeenCalledTimes(1);
  expect(options.openAdaptation).toHaveBeenCalledWith("f", "adapt-3");
});

it("keeps a plain Flow link on the router view", async () => {
  const options = baseOptions("project=p&flow=f");
  await render(options);
  expect(options.loadFlow).toHaveBeenCalledWith("f");
  expect(options.openView).toHaveBeenCalledWith(automationStudioViewId.router, "preview");
  expect(options.openAdaptation).not.toHaveBeenCalled();
});

it("leaves an explicit non-adaptation view authoritative", async () => {
  const options = baseOptions("project=p&flow=f&view=runtime-debug&detail=adaptation%3Aadapt-4");
  await render(options);
  expect(options.openAdaptation).not.toHaveBeenCalled();
  expect(options.openView).toHaveBeenCalledTimes(1);
  expect(vi.mocked(options.openView).mock.calls[0]![1]).toBe("preview");
});

it("waits for the Flow before acting on an adaptation link", async () => {
  const options = baseOptions("project=p&flow=f&detail=adaptation%3Aadapt-5", { flowById: new Map() });
  await render(options);
  expect(options.openAdaptation).not.toHaveBeenCalled();
  await render({ ...options, flowById });
  expect(options.openAdaptation).toHaveBeenCalledTimes(1);
});
