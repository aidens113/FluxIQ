import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../nodes/index.ts";
import { buildAutomationStudioFlowBootstrapRoutingContext } from "../../flow-bootstrap/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../flow-bootstrap/plan/tests/index.ts";
import { createAutomationStudioDeepSeekProvider } from "../deepseek-provider.ts";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema } from "../evidence-loop.ts";
import { runAutomationStudioLlmHarness } from "../harness.ts";

// A model can only write a route it can mean if it is told how the router
// decides, what a condition can test, and what the page looked like. This
// proves that the routing context a Flow build assembles reaches the provider's
// wire payload, screened, and that a credential-shaped value does not.

const registry = new AutomationStudioNodeRegistry(webDomainNodeDefinitionsFixture());
const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const tools = [{ toolId: "inspect", description: "Collect bounded evidence.", inputSchema: { type: "object" } }];
const completionSchema = { type: "object" };

const routing = buildAutomationStudioFlowBootstrapRoutingContext({
  current: "The Flow is blank: it has no routes and no subflows yet.",
  flowInputs: [{ id: "account", valueType: "string", required: true }],
  statePaths: [{ path: "state.page.dialog", description: "The name of the dialog standing open." }, { path: "state.page.path", description: "The path." }],
  observations: [
    { seen: "where a run starts, before any step runs", state: { page: { path: "/queue", dialog: "What's new in Cadence", token: "sk-live-0123456789abcdefghijklmnop" } } },
    { seen: "after exploring with inspect", state: { page: { path: "/queue", dialog: "What's new in Cadence", token: "sk-live-0123456789abcdefghijklmnop" } } }
  ]
});

describe("the routing context a Flow build sends", () => {
  it("reaches the DeepSeek payload with the paths, the situations seen and how the router decides", async () => {
    let outbound = "";
    const provider = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async (input) => { outbound = input.outboundBody; return "test-secret"; },
      fetchImpl: (async () => new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ kind: "evidence_tool_decision", summary: "Look first.", decision: { kind: "tool_call", callId: "call.1", toolId: "inspect", input: {} } }) } }],
        usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 }
      }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch
    });
    const result = await runAutomationStudioLlmHarness({
      taskKind: "evidence_tool_decision",
      projectId: "project.one",
      flowId: "flow.one",
      instructions: [],
      deniedEvidenceKeys: ["html", "selector"],
      evidenceLoop: { iteration: 1, tools, evidence: [], decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, completionSchema), completionSchema, canComplete: true },
      flowBootstrap: { registry, resolution, maxInputTokens: 5_000, routing },
      provider
    });
    expect(result.ok).toBe(true);
    const payload = JSON.parse((JSON.parse(outbound) as { messages: Array<{ role: string; content: string }> }).messages.find((message) => message.role === "user")!.content) as {
      context: { flowBootstrap: { routing: typeof routing } };
    };
    const sent = payload.context.flowBootstrap.routing;
    expect(sent.decides).toContain("before any step runs");
    expect(sent.current).toBe("The Flow is blank: it has no routes and no subflows yet.");
    expect(sent.paths.map((path) => path.path)).toEqual(["inputs.account", "state.page.dialog", "state.page.path"]);
    // Two observations of the same state are one situation.
    expect(sent.situations).toEqual([{ seen: "where a run starts, before any step runs", state: { "state.page.path": "/queue", "state.page.dialog": "What's new in Cadence" } }]);
    expect(outbound).not.toContain("sk-live-0123456789abcdefghijklmnop");
  });

  it("refuses a routing context carrying a key the domain denies, before any provider is called", async () => {
    let called = false;
    const tainted = structuredClone(routing);
    tainted.situations = [{ seen: "where a run starts", state: { "state.page.html": "<div>" } }];
    (tainted.situations[0]!.state as Record<string, unknown>).html = "<div>";
    await expect(runAutomationStudioLlmHarness({
      taskKind: "evidence_tool_decision",
      projectId: "project.one",
      flowId: "flow.one",
      instructions: [],
      deniedEvidenceKeys: ["html"],
      evidenceLoop: { iteration: 1, tools, evidence: [], decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, completionSchema), completionSchema, canComplete: true },
      flowBootstrap: { registry, resolution, maxInputTokens: 5_000, routing: tainted },
      provider: { metadata: { provider: "mock", model: "m" }, runTask: async () => { called = true; return { response: {} }; } }
    })).rejects.toThrow(/denies/u);
    expect(called).toBe(false);
  });
});
