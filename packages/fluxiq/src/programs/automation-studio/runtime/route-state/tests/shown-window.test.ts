// The routing situations as window entries (W2 round 2, `../build-routing.ts`):
// each placed after the call it followed, the start before every entry, and the
// routing context left with none of its own -- so a situation is written once
// and read from cache on every later decision. Run 40 (t193,
// `run-muqclqt5-b04525e8`) sent its whole routing context, 23k characters by
// decision 16, uncached behind the window on every decision.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_ROUTE_STATE_TOOL_ID, startAutomationStudioBuildRouting } from "../index.ts";

const result = (path: string, extra: JsonObject = {}) => ({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, routeState: { page: { path, ...extra } } });
const entry = (callId: string) => ({ callId, toolId: "core.run_node", value: { ok: true } as JsonObject });

async function routed() {
  const routing = await startAutomationStudioBuildRouting({
    hostRuntime: { capabilities: [], observeRouteState: () => ({ page: { path: "/start" } }) },
    projectId: "p1", flowId: "f1", flowInputs: []
  });
  const execute = routing.recording(async (call: { callId: string; toolId: string }) => result(`/${call.callId}`, call.callId === "c2" ? { token: "sk-abcdefghijklmnopqrstuvwxyz0123456789" } : {}));
  const decide = routing.observing(async (input: { signal?: AbortSignal }) => input);
  return { routing, execute, decide };
}

describe("the routing situations as window entries", () => {
  it("places each after the call that left it, the start first, and keeps every earlier one where it was", async () => {
    const { routing, execute, decide } = await routed();
    await decide({});
    await execute({ callId: "c1", toolId: "core.run_node" });
    await decide({});
    const first = routing.shown([entry("c1"), { callId: "core.budget.1", toolId: "core.budget", value: {} }], []);
    expect(first.evidence.map((item) => item.callId)).toEqual(["core.route_state.1", "c1", "core.route_state.2", "core.budget.1"]);
    await execute({ callId: "c2", toolId: "core.run_node" });
    await decide({});
    const second = routing.shown([entry("c1"), entry("c2"), { callId: "core.budget.2", toolId: "core.budget", value: {} }], []);
    expect(second.evidence.map((item) => item.callId)).toEqual(["core.route_state.1", "c1", "core.route_state.2", "c2", "core.route_state.3", "core.budget.2"]);
    // Everything the first decision was shown of the window, up to its newest call, the second is shown in the same place.
    expect(JSON.stringify(second.evidence.slice(0, 3))).toBe(JSON.stringify(first.evidence.slice(0, 3)));
    expect(second.evidence[2]).toMatchObject({ toolId: AUTOMATION_STUDIO_ROUTE_STATE_TOOL_ID, value: { state: { "state.page.path": "/c1" } } });
  });

  it("leaves the routing context constant, listing no situation and saying where they are", async () => {
    const { routing, execute, decide } = await routed();
    await decide({});
    await execute({ callId: "c1", toolId: "core.run_node" });
    await decide({});
    const once = routing.shown([entry("c1")], []).context;
    await execute({ callId: "c2", toolId: "core.run_node" });
    await decide({});
    const twice = routing.shown([entry("c1"), entry("c2")], []).context;
    expect(once.situations).toEqual([]);
    expect(once.situationsShown).toMatch(/core\.route_state/u);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    // The routing context the build validates its Flow against still has every situation.
    expect(routing.context().situations).toHaveLength(3);
  });

  it("withholds a state value shaped like a credential, as the routing context did", async () => {
    const { routing, execute, decide } = await routed();
    await decide({});
    await execute({ callId: "c2", toolId: "core.run_node" });
    await decide({});
    const shown = routing.shown([entry("c2")], []).evidence.find((item) => item.callId === "core.route_state.2");
    expect(shown?.value).toEqual({ seen: "after exploring with core.run_node", state: { "state.page.path": "/c2" } });
  });
});
