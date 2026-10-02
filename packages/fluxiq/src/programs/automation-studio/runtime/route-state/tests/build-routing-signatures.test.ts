// The route signatures a build records for each draft step (t243): the page a
// step started on and the page it left, as the host signs them, looked up by
// the step's own page digests.
//
// Keyed by digest, not by call id, because call ids repeat across repair
// rounds (`initial.<tool>` opens every round). A step's `stateBefore` is the
// previous call's `stateAfter` whenever nothing moved the page in between, so a
// step that started on a page the build saw gets its expected pre-state.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../../host-runtime.ts";
import { startAutomationStudioBuildRouting } from "../index.ts";

type Call = { callId: string; toolId: string };
const routeStateOf = (page: string): JsonObject => ({ page: { path: `/${page}` }, controls: [`${page} heading`, `${page} button`] });
/** A signer that keeps no page text: the path alone, renamed. */
const signer: Pick<AutomationStudioHostRuntimeBoundary, "signRouteState"> = {
  signRouteState: (state) => ({ at: String((state.page as JsonObject).path) })
};
const result = (digests: { before?: string; after?: string } | undefined, routeState?: JsonObject) => ({
  kind: "llm_evidence_tool_execution", evidence: {}, effectApplied: true,
  ...(digests ? { stateDigests: digests } : {}),
  ...(routeState ? { routeState } : {})
});

async function routingWith(host: Partial<AutomationStudioHostRuntimeBoundary>, start: "now" | "first_look" = "first_look") {
  return await startAutomationStudioBuildRouting({
    hostRuntime: { capabilities: [], observeRouteState: () => routeStateOf("observed"), ...host },
    projectId: "p.1", flowId: "f.1", flowInputs: [], start
  });
}

describe("the route signatures a build records", () => {
  it("looks a step's signatures up by its page digests, a step's before being the previous call's after", async () => {
    const routing = await routingWith(signer);
    const replies: Record<string, ReturnType<typeof result>> = {
      "initial.core.run_node": result({ before: "D0", after: "D0" }, routeStateOf("home")),
      "c.1": result({ before: "D0", after: "D1" }, routeStateOf("search")),
      "c.2": result({ before: "D1", after: "D2" }, routeStateOf("results"))
    };
    const executeTool = routing.recording(async (call: Call) => replies[call.callId]!);
    for (const callId of Object.keys(replies)) await executeTool({ callId, toolId: "core.run_node" });

    expect(routing.signaturesOf({ stateBefore: "D0", stateAfter: "D1" })).toEqual({ before: { at: "/home" }, after: { at: "/search" } });
    expect(routing.signaturesOf({ stateBefore: "D1", stateAfter: "D2" })).toEqual({ before: { at: "/search" }, after: { at: "/results" } });
    // A page the build never saw maps nothing, and a step with no digests has no signatures.
    expect(routing.signaturesOf({ stateBefore: "D9", stateAfter: "D2" })).toEqual({ after: { at: "/results" } });
    expect(routing.signaturesOf({})).toBeUndefined();
  });

  it("counts the free first look: the page a run starts on is the first step's pre-state", async () => {
    const routing = await routingWith(signer);
    const executeTool = routing.recording(async (call: Call) => call.callId === "initial.core.run_node"
      ? result({ before: "D0", after: "D0" }, routeStateOf("home"))
      : result({ before: "D0", after: "D1" }));
    await executeTool({ callId: "initial.core.run_node", toolId: "core.run_node" });
    await executeTool({ callId: "c.1", toolId: "core.run_node" });
    // The action reported no route state, so the page it left maps nothing.
    expect(routing.signaturesOf({ stateBefore: "D0", stateAfter: "D1" })).toEqual({ before: { at: "/home" } });
  });

  it("a free first look that carried no route state counts the state observed right after it", async () => {
    const routing = await routingWith(signer);
    const executeTool = routing.recording(async (_call: Call) => result({ before: "D0", after: "D0" }));
    await executeTool({ callId: "initial.core.run_node", toolId: "core.run_node" });
    expect(routing.signaturesOf({ stateBefore: "D0" })).toEqual({ before: { at: "/observed" } });
  });

  it("keys by digest, so a repair round's repeated call ids do not overwrite an earlier page", async () => {
    const routing = await routingWith(signer);
    let round = 0;
    const executeTool = routing.recording(async (_call: Call) => round === 0
      ? result({ before: "D0", after: "D0" }, routeStateOf("home"))
      : result({ before: "D5", after: "D5" }, routeStateOf("cart")));
    await executeTool({ callId: "initial.core.run_node", toolId: "core.run_node" });
    round = 1;
    await executeTool({ callId: "initial.core.run_node", toolId: "core.run_node" });
    expect(routing.signaturesOf({ stateBefore: "D0", stateAfter: "D5" })).toEqual({ before: { at: "/home" }, after: { at: "/cart" } });
  });

  it("an observation without a digest maps nothing", async () => {
    const routing = await routingWith(signer, "now");
    const executeTool = routing.recording(async (_call: Call) => result(undefined, routeStateOf("home")));
    await executeTool({ callId: "c.1", toolId: "core.run_node" });
    await routing.observing(async (_decision: { signal?: AbortSignal }) => undefined)({});
    expect(routing.signaturesOf({ stateBefore: "D0", stateAfter: "D1" })).toBeUndefined();
  });

  it("a host without a signer records nothing", async () => {
    const routing = await routingWith({});
    const executeTool = routing.recording(async (_call: Call) => result({ before: "D0", after: "D1" }, routeStateOf("search")));
    await executeTool({ callId: "c.1", toolId: "core.run_node" });
    expect(routing.signaturesOf({ stateBefore: "D0", stateAfter: "D1" })).toBeUndefined();
  });

  it("a host whose signature is not a small JSON object records nothing for that page", async () => {
    const routing = await routingWith({ signRouteState: () => ({ page: "x".repeat(5_000) }) });
    const executeTool = routing.recording(async (_call: Call) => result({ before: "D0", after: "D1" }, routeStateOf("search")));
    await executeTool({ callId: "c.1", toolId: "core.run_node" });
    expect(routing.signaturesOf({ stateAfter: "D1" })).toBeUndefined();
  });

  describe("what a step did to the page (its effect)", () => {
    /** A host that records an effect as the two paths, so a test can see which states it was given. */
    const effects: Pick<AutomationStudioHostRuntimeBoundary, "signRouteState" | "signRouteEffect"> = {
      ...signer,
      signRouteEffect: (before, after) => ({ from: String((before.page as JsonObject).path), to: String((after.page as JsonObject).path) })
    };

    it("records an effect for a step whose before digest is the previous call's after, from the full states either side", async () => {
      const routing = await routingWith(effects);
      const replies: Record<string, ReturnType<typeof result>> = {
        "initial.core.run_node": result({ before: "D0", after: "D0" }, routeStateOf("home")),
        "c.1": result({ before: "D0", after: "D1" }, routeStateOf("picker")),
        "c.2": result({ before: "D1", after: "D2" }, routeStateOf("chosen"))
      };
      const executeTool = routing.recording(async (call: Call) => replies[call.callId]!);
      for (const callId of Object.keys(replies)) await executeTool({ callId, toolId: "core.run_node" });

      expect(routing.signaturesOf({ stateBefore: "D0", stateAfter: "D1" })).toEqual({ before: { at: "/home" }, after: { at: "/picker" }, effect: { from: "/home", to: "/picker" } });
      expect(routing.signaturesOf({ stateBefore: "D1", stateAfter: "D2" })).toEqual({ before: { at: "/picker" }, after: { at: "/chosen" }, effect: { from: "/picker", to: "/chosen" } });
    });

    it("records none for a look, whose before and after digests are equal", async () => {
      const routing = await routingWith(effects);
      const replies: Record<string, ReturnType<typeof result>> = {
        "initial.core.run_node": result({ before: "D0", after: "D0" }, routeStateOf("home")),
        "c.1": result({ before: "D0", after: "D0" }, routeStateOf("home"))
      };
      const executeTool = routing.recording(async (call: Call) => replies[call.callId]!);
      for (const callId of Object.keys(replies)) await executeTool({ callId, toolId: "core.run_node" });
      expect(routing.signaturesOf({ stateBefore: "D0", stateAfter: "D0" })).toEqual({ before: { at: "/home" }, after: { at: "/home" } });
    });

    it("records none when the call did not start on the page the previous call left", async () => {
      const routing = await routingWith(effects);
      const replies: Record<string, ReturnType<typeof result>> = {
        "initial.core.run_node": result({ before: "D0", after: "D0" }, routeStateOf("home")),
        "c.1": result({ before: "D7", after: "D8" }, routeStateOf("elsewhere"))
      };
      const executeTool = routing.recording(async (call: Call) => replies[call.callId]!);
      for (const callId of Object.keys(replies)) await executeTool({ callId, toolId: "core.run_node" });
      expect(routing.signaturesOf({ stateBefore: "D7", stateAfter: "D8" })).toEqual({ after: { at: "/elsewhere" } });
    });

    it("records none after a call that threw, which may have moved the page", async () => {
      const routing = await routingWith(effects);
      let call = 0;
      const executeTool = routing.recording(async (_call: Call) => {
        call += 1;
        if (call === 1) return result({ before: "D0", after: "D0" }, routeStateOf("home"));
        if (call === 2) throw new Error("lost");
        return result({ before: "D0", after: "D1" }, routeStateOf("picker"));
      });
      await executeTool({ callId: "initial.core.run_node", toolId: "core.run_node" });
      await expect(executeTool({ callId: "c.1", toolId: "core.run_node" })).rejects.toThrow("lost");
      await executeTool({ callId: "c.2", toolId: "core.run_node" });
      expect(routing.signaturesOf({ stateBefore: "D0", stateAfter: "D1" })?.effect).toBeUndefined();
    });

    it("records none when the host records no effects", async () => {
      const routing = await routingWith(signer);
      const replies: Record<string, ReturnType<typeof result>> = {
        "initial.core.run_node": result({ before: "D0", after: "D0" }, routeStateOf("home")),
        "c.1": result({ before: "D0", after: "D1" }, routeStateOf("picker"))
      };
      const executeTool = routing.recording(async (call: Call) => replies[call.callId]!);
      for (const callId of Object.keys(replies)) await executeTool({ callId, toolId: "core.run_node" });
      expect(routing.signaturesOf({ stateBefore: "D0", stateAfter: "D1" })).toEqual({ before: { at: "/home" }, after: { at: "/picker" } });
    });

    it("returns an effect alone when neither page was signed", async () => {
      const routing = await routingWith({ signRouteEffect: effects.signRouteEffect! });
      const replies: Record<string, ReturnType<typeof result>> = {
        "initial.core.run_node": result({ before: "D0", after: "D0" }, routeStateOf("home")),
        "c.1": result({ before: "D0", after: "D1" }, routeStateOf("picker"))
      };
      const executeTool = routing.recording(async (call: Call) => replies[call.callId]!);
      for (const callId of Object.keys(replies)) await executeTool({ callId, toolId: "core.run_node" });
      expect(routing.signaturesOf({ stateBefore: "D0", stateAfter: "D1" })).toEqual({ effect: { from: "/home", to: "/picker" } });
    });
  });
});
