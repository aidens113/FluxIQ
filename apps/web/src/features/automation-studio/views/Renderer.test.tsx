import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AutomationViewRenderer render fanout guards", () => {
  it("keeps State View model preparation inside the State View container", () => {
    const source = readFileSync(new URL("./Renderer.tsx", import.meta.url), "utf8");
    const rendererStart = source.indexOf("export const AutomationViewRenderer");
    const stateContainerStart = source.indexOf("const AutomationStateViewContainer", rendererStart);
    const rendererSource = source.slice(rendererStart, stateContainerStart);
    const stateContainerSource = source.slice(stateContainerStart);

    expect(rendererStart).toBeGreaterThan(-1);
    expect(stateContainerStart).toBeGreaterThan(rendererStart);
    expect(rendererSource).not.toContain("buildNodeStateInputSignature");
    expect(stateContainerSource).toContain("buildNodeStateInputSignature");
    expect(rendererSource).toContain('props.view.type === "state"');
    expect(rendererSource).toContain("<AutomationStateViewContainer");
  });

  it("renders through memoized per-view component boundaries instead of direct heavy views", () => {
    const source = readFileSync(new URL("./Renderer.tsx", import.meta.url), "utf8");

    expect(source).toContain("const MemoAutomationPolicyCanvas = memo(AutomationPolicyCanvas)");
    expect(source).toContain("const MemoAutomationRuntimeWorkspace = memo(AutomationRuntimeWorkspace)");
    expect(source).toContain("const MemoAutomationStateView = memo(AutomationStateView)");
    expect(source).toContain("const MemoAutomationInstructionsWorkspace = memo(AutomationInstructionsWorkspace)");
    expect(source).toContain("const MemoAutomationFlowSettingsWorkspace = memo(AutomationFlowSettingsWorkspace)");
    expect(source).toContain("const AutomationRuntimeViewContainer = memo(function AutomationRuntimeViewContainer");
    expect(source).toContain("const timelines = useMemo(() => props.selectedTimeline ? [props.selectedTimeline] : emptyViewArray");
  });
});
