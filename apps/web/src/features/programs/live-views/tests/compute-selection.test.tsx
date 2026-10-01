import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComputeControlLive } from "../compute-control";

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../../program-api", () => ({ useProgramApi: () => api }));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let renderer: ReactTestRenderer;
let payload: any;
const text = () => JSON.stringify(renderer.toJSON());
const nodeButton = (name: string) => renderer.root.findAllByType("button").find((button) => button.findAllByType("strong").some((strong) => strong.children.includes(name)))!;
const named = (type: string, name: string) => renderer.root.findAllByType(type).find((node) => node.props["aria-label"] === name)!;
beforeEach(() => {
  vi.stubGlobal("window", { setInterval: vi.fn(() => 1), clearInterval: vi.fn() });
  payload = {
    nodes: [
      { id: "a", label: "Alpha", status: "online", lastHeartbeatMs: Date.now(), capabilities: ["one"], domainIds: [] },
      { id: "b", label: "Beta", status: "offline", lastHeartbeatMs: Date.now(), capabilities: ["two"], domainIds: [] }
    ],
    commands: [{ id: "b-command", targetComputeId: "b", kind: "beta-command", status: "queued", createdAtMs: Date.now() }],
    leases: []
  };
  api.get.mockReset().mockImplementation(async () => ({ ok: true, payload }));
});
afterEach(() => { if (renderer) act(() => renderer.unmount()); vi.unstubAllGlobals(); });

describe("Compute visible selection", () => {
  for (const filter of ["search", "health", "capability"] as const) {
    it(`reconciles detail and activity when ${filter} hides the selected node`, async () => {
      await act(async () => { renderer = create(<ComputeControlLive />); });
      act(() => nodeButton("Beta").props.onClick());
      expect(text()).toContain("beta-command");
      act(() => {
        if (filter === "search") named("input", "Search compute nodes").props.onChange({ target: { value: "Alpha" } });
        if (filter === "health") named("select", "Filter node health").props.onChange({ target: { value: "healthy" } });
        if (filter === "capability") named("select", "Filter node capability").props.onChange({ target: { value: "one" } });
      });
      expect(renderer.root.findByType("h2").children).toEqual(["Alpha"]);
      expect(text()).not.toContain("beta-command");
    });
  }

  it("clears detail and activity when nothing matches and when a node disappears", async () => {
    await act(async () => { renderer = create(<ComputeControlLive />); });
    act(() => nodeButton("Beta").props.onClick());
    act(() => named("input", "Search compute nodes").props.onChange({ target: { value: "no-match" } }));
    expect(text()).toContain("No node selected");
    expect(text()).not.toContain("beta-command");
    act(() => named("input", "Search compute nodes").props.onChange({ target: { value: "" } }));
    act(() => nodeButton("Beta").props.onClick());
    payload = { ...payload, nodes: payload.nodes.slice(0, 1) };
    await act(async () => named("button", "Refresh compute nodes").props.onClick());
    expect(renderer.root.findByType("h2").children).toEqual(["Alpha"]);
    expect(text()).not.toContain("beta-command");
  });
});
