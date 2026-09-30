// The chat window runs capabilities through the browser's program API, and
// that transport refuses the retired whole-document endpoints
// (`assertAutomationStudioBrowserEndpointAllowed`). The contract test talks to
// Core directly and never meets that guard, so a capability that read a Flow
// with `get-flow` passed there while throwing in the real chat window. This
// file puts the guard in front of every capability's declaration, and drives
// the builds through a transport that enforces it.

import { describe, expect, it, vi } from "vitest";
import type { ProgramCommandTransport } from "../../../../data/program-transport";
import { AUTOMATION_STUDIO_BROWSER_BLOCKED_LEGACY_ENDPOINTS, assertAutomationStudioBrowserEndpointAllowed } from "../../../../data-request-policy";
import { dispatchPanelCapability } from "../../index";
import { panelCapabilities } from "../../registry";

/** A transport that refuses exactly what the browser refuses. */
function browserTransport() {
  const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
  const post = vi.fn(async (endpoint: string, payload: Record<string, unknown>) => {
    assertAutomationStudioBrowserEndpointAllowed(endpoint);
    calls.push({ endpoint, payload });
    if (endpoint === "get-flow-metadata-detail") return { ok: true, payload: { flow: { flowId: "f1", settings: { llm: { provider: "deepseek", model: "deepseek-flash", secretKeyId: "key.one" } } } } };
    if (endpoint === "save-flow-instruction") return { ok: true, payload: { instruction: { instructionId: "instruction.one", status: "active" } } };
    return { ok: true, payload: { adaptation: { adaptationId: "adaptation.one", status: "proposed" } } };
  });
  return { api: { get: vi.fn(), post } as unknown as ProgramCommandTransport, calls };
}

describe("capabilities use only endpoints the browser allows", () => {
  it("declares no endpoint the browser refuses", () => {
    const blocked = new Set<string>(AUTOMATION_STUDIO_BROWSER_BLOCKED_LEGACY_ENDPOINTS);
    const offenders = panelCapabilities().flatMap((capability) => capability.endpoints.filter((endpoint) => blocked.has(endpoint)).map((endpoint) => `${capability.id} -> ${endpoint}`));
    expect(offenders).toEqual([]);
  });

  it("builds on one call, with no grant or preflight endpoint", async () => {
    const { api, calls } = browserTransport();
    const dispatch = await dispatchPanelCapability({ transport: api, projectId: "p1", flowId: "f1" }, { capabilityId: "flow.build" });
    expect(dispatch.outcome.status).toBe("done");
    expect(calls).toEqual([{ endpoint: "generate-flow-bootstrap-adaptation", payload: { projectId: "p1", flowId: "f1" } }]);
  });

  it("declares no grant or preflight endpoint and no model-run permission capability", () => {
    const endpoints = panelCapabilities().flatMap((capability) => capability.endpoints);
    expect(endpoints).not.toContain("issue-llm-execution-grant");
    expect(endpoints).not.toContain("preflight-llm-execution");
    const ids = panelCapabilities().map((capability) => capability.id);
    expect(ids).not.toContain("permission.allowModelRun");
    expect(ids).not.toContain("permission.check");
  });

  it("improves through the metadata detail the browser allows, and still says so when no key is chosen", async () => {
    const { api, calls } = browserTransport();
    const dispatch = await dispatchPanelCapability({ transport: api, projectId: "p1", flowId: "f1" }, { capabilityId: "flow.improve", arguments: { change: "Close the banner first." } });
    expect(dispatch.outcome.status).toBe("done");
    expect(calls.map((call) => call.endpoint)).toEqual(["get-flow-metadata-detail", "save-flow-instruction", "generate-flow-bootstrap-adaptation"]);
    const post = vi.fn(async () => ({ ok: true, payload: { flow: { flowId: "f1", settings: { llm: {} } } } }));
    const refused = await dispatchPanelCapability({ transport: { get: vi.fn(), post } as unknown as ProgramCommandTransport, projectId: "p1", flowId: "f1" }, { capabilityId: "flow.improve", arguments: { change: "x" } });
    expect(refused.outcome).toMatchObject({ status: "failed", error: expect.stringContaining("no DeepSeek model key chosen") });
    expect(post).toHaveBeenCalledTimes(1);
  });
});
