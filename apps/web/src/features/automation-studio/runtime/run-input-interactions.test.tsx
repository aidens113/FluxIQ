import React, { useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { RuntimeRunControlPanel, createRuntimeReadinessRequestGate, parseRuntimeRunInputDocument, runtimeFlowReadinessIssues } from "./index";
import { commitAutomationStudioMutation, subscribeToAutomationStudioMutations } from "../stores/mutation-transaction-store";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const ready = { loading: false, instructions: [{ status: "active" }], router: null, subflowTotal: 0, error: "" };
const flow = {
  flowId: "flow.inputs",
  name: "Input Flow",
  nodes: [{ id: "start" }],
  interface: { inputs: [
    { id: "email", name: "Email", required: true, valueType: { kind: "string" } },
    { id: "attempts", name: "Attempts", valueType: { kind: "number" }, defaultValue: 2 },
    { id: "approved", name: "Approved", valueType: { kind: "boolean" } },
    { id: "context", name: "Context", valueType: { kind: "json" } }
  ] }
};

function Harness(props: { onRun: ReturnType<typeof vi.fn>; readiness?: typeof ready }) {
  const [inputText, setInputText] = useState('{"attempts":2}');
  return <RuntimeRunControlPanel activeRunId={null} activeRunStartedAt={null} canRetry={false} disabled={false} flow={flow} inputText={inputText} maxSteps="50" readiness={props.readiness ?? ready} runningMode={null} onInputText={setInputText} onMaxSteps={() => undefined} onOpenLiveLog={() => undefined} onRetry={() => undefined} onRetryReadiness={() => undefined} onRun={props.onRun} onStop={() => undefined} />;
}

function button(renderer: ReactTestRenderer, text: string) {
  return renderer.root.findAllByType("button").find((candidate) => candidate.findAll((node) => node.children.some((child) => child === text)).length > 0);
}

describe("runtime run-input interactions", () => {
  it("synchronizes ordinary typed fields with Advanced JSON and validates before Run", async () => {
    const onRun = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<Harness onRun={onRun} />); });
    const email = renderer.root.findAllByType("input").find((input) => input.props.value === "" && input.props.type !== "number");
    expect(email).toBeDefined();
    await act(async () => email!.props.onChange({ target: { value: "person@example.test" } }));
    const advanced = renderer.root.findAllByType("textarea").at(-1)!;
    expect(JSON.parse(advanced.props.value)).toMatchObject({ email: "person@example.test", attempts: 2 });
    expect(button(renderer, "Run")?.props.disabled).toBe(false);
    await act(async () => advanced.props.onChange({ target: { value: "{broken" } }));
    expect(renderer.root.findByProps({ role: "alert" }).children.join("")).toContain("invalid JSON");
    expect(button(renderer, "Run")?.props.disabled).toBe(true);
    expect(onRun).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it("selects exactly the three canonical run modes", async () => {
    const onRun = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<Harness onRun={onRun} />); });
    const manual = button(renderer, "Manual approval")!;
    await act(async () => manual.props.onClick());
    await act(async () => button(renderer, "Run")!.props.onClick());
    expect(onRun).toHaveBeenCalledWith("manual_approval");
    const labels = renderer.root.findAllByType("strong").flatMap((item) => item.children.filter((child) => typeof child === "string"));
    expect(labels).toEqual(expect.arrayContaining(["Fully adaptive", "Manual approval", "No LLM intervention"]));
    await act(async () => renderer.unmount());
  });

  it("shows linked onboarding, retry, and blocks stale/error readiness", async () => {
    const issues = runtimeFlowReadinessIssues({ ...flow, nodes: [] }, { instructions: [], router: null, subflowTotal: 0, error: "" });
    expect(issues).toEqual([
      { label: "Add at least one active instruction.", action: "Open Instructions", target: "instructions" },
      { label: "Add runnable Nodes or create a subflow.", action: "Open Subflows", target: "subflows" }
    ]);
    expect(runtimeFlowReadinessIssues({ ...flow, nodes: [] }, { instructions: [{ status: "active" }], router: { rules: [] }, subflowTotal: 1, error: "" })).toEqual([
      { label: "Connect an active Router path to a subflow.", action: "Open Router", target: "router" }
    ]);
    expect(parseRuntimeRunInputDocument("[]")).toEqual({ ok: false, error: "Advanced inputs must be a JSON object." });
    const openTarget = vi.fn();
    const retry = vi.fn();
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<RuntimeRunControlPanel activeRunId={null} activeRunStartedAt={null} canRetry={false} disabled={false} flow={{ ...flow, nodes: [] }} inputText='{"email":"ready"}' maxSteps="50" readiness={{ loading: false, instructions: [], router: null, subflowTotal: 0, error: "" }} runningMode={null} onInputText={() => undefined} onMaxSteps={() => undefined} onOpenLiveLog={() => undefined} onOpenTarget={openTarget} onRetry={() => undefined} onRetryReadiness={retry} onRun={() => undefined} onStop={() => undefined} />); });
    await act(async () => button(renderer, "Open Instructions")!.props.onClick());
    await act(async () => button(renderer, "Open Subflows")!.props.onClick());
    expect(openTarget.mock.calls).toEqual([["instructions"], ["subflows"]]);
    await act(async () => renderer.update(<RuntimeRunControlPanel activeRunId={null} activeRunStartedAt={null} canRetry={false} disabled={false} flow={flow} inputText='{"email":"ready"}' maxSteps="50" readiness={{ loading: false, instructions: [], router: null, subflowTotal: 0, error: "offline" }} runningMode={null} onInputText={() => undefined} onMaxSteps={() => undefined} onOpenLiveLog={() => undefined} onRetry={() => undefined} onRetryReadiness={retry} onRun={() => undefined} onStop={() => undefined} />));
    expect(button(renderer, "Run")?.props.disabled).toBe(true);
    await act(async () => button(renderer, "Retry")!.props.onClick());
    expect(retry).toHaveBeenCalledTimes(1);
    await act(async () => renderer.unmount());
  });

  it("drops stale readiness responses and invalidates immediately on relevant mutations", () => {
    const gate = createRuntimeReadinessRequestGate();
    const stale = gate.begin();
    const current = gate.begin();
    expect(gate.isCurrent(stale)).toBe(false);
    expect(gate.isCurrent(current)).toBe(true);
    gate.invalidate();
    expect(gate.isCurrent(current)).toBe(false);
    const changed = vi.fn();
    const unsubscribe = subscribeToAutomationStudioMutations(changed, { kinds: ["instruction.changed", "router.changed", "subflow.changed", "flow-settings.changed"], projectId: "project.one", flowId: "flow.one" });
    commitAutomationStudioMutation({ kind: "instruction.changed", projectId: "project.one", flowId: "flow.one", instructionId: "instruction.one" });
    commitAutomationStudioMutation({ kind: "router.changed", projectId: "project.one", flowId: "flow.one" });
    commitAutomationStudioMutation({ kind: "subflow.changed", projectId: "project.one", flowId: "flow.one", subflowId: "subflow.one" });
    commitAutomationStudioMutation({ kind: "flow-settings.changed", projectId: "project.one", flowId: "flow.other" });
    expect(changed).toHaveBeenCalledTimes(3);
    unsubscribe();
  });
});
