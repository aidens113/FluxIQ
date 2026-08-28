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
  it("sleeps unopened views and freezes activated views while they are hidden", () => {
    const source = readFileSync(new URL("./Renderer.tsx", import.meta.url), "utf8");

    expect(source).toContain("const sleepingViewTypes = new Set");
    expect(source).toContain('"design"');
    expect(source).toContain('"runtime"');
    expect(source).toContain('"state"');
    expect(source).toContain('"instructions"');
    expect(source).toContain('"settings"');
    expect(source).toContain('"adaptations"');
    expect(source).toContain("if (!props.viewActive && !props.keepMounted && sleepingViewTypes.has(props.view.type)) return <AutomationSleepingView view={props.view} />;");
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('role="status"');
    expect(source).toContain("automation-view-loading-indicator");
    expect(source).toContain("function automationViewRendererPropsEqual");
    expect(source).toContain('key === "viewActive" || key === "keepMounted" || key === "viewActivity"');
    expect(source).toContain('<MemoAutomationPolicyCanvas activeRef={props.viewActivity}');
    expect(source).toContain('<MemoAutomationClientGatewayView activeRef={props.viewActivity}');
    expect(source).toContain('if (!previous.viewActive && !next.viewActive) return true');
    expect(source).not.toContain('typeof previousValue === "function"');
  });
});
