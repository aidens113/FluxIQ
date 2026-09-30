// The chat window runs capabilities through the browser's program API, and
// that transport refuses the retired whole-document endpoints
// (`assertAutomationStudioBrowserEndpointAllowed`). The contract test talks to
// Core directly and never meets that guard, so `permission.allowModelRun` read
// its key with `get-flow` and passed there while throwing in the real chat
// window: chat build and explore could never get a grant. This file puts the
// guard in front of every capability's declaration, and drives the two grant
// capabilities through a transport that enforces it.

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
    if (endpoint === "issue-llm-execution-grant") return { ok: true, payload: { grant: { grantId: "grant.one" } } };
    return { ok: true, payload: { preflight: { purpose: "build_and_adapt" } } };
  });
  return { api: { get: vi.fn(), post } as unknown as ProgramCommandTransport, calls };
}

describe("capabilities use only endpoints the browser allows", () => {
  it("declares no endpoint the browser refuses", () => {
    const blocked = new Set<string>(AUTOMATION_STUDIO_BROWSER_BLOCKED_LEGACY_ENDPOINTS);
    const offenders = panelCapabilities().flatMap((capability) => capability.endpoints.filter((endpoint) => blocked.has(endpoint)).map((endpoint) => `${capability.id} -> ${endpoint}`));
    expect(offenders).toEqual([]);
  });

  it("issues a model-run grant from the key chosen in the Flow's settings", async () => {
    const { api, calls } = browserTransport();
    const dispatch = await dispatchPanelCapability({ transport: api, projectId: "p1", flowId: "f1" }, { capabilityId: "permission.allowModelRun", arguments: { purpose: "build_and_adapt" } });
    expect(dispatch.outcome.status).toBe("done");
    expect(calls).toEqual([
      { endpoint: "get-flow-metadata-detail", payload: { projectId: "p1", flowId: "f1" } },
      { endpoint: "issue-llm-execution-grant", payload: { projectId: "p1", flowId: "f1", keyId: "key.one", provider: "deepseek", model: "deepseek-flash", purpose: "build_and_adapt" } }
    ]);
  });

  it("checks what a model run needs the same way", async () => {
    const { api, calls } = browserTransport();
    const dispatch = await dispatchPanelCapability({ transport: api, projectId: "p1", flowId: "f1" }, { capabilityId: "permission.check" });
    expect(dispatch.outcome.status).toBe("done");
    expect(calls.map((call) => call.endpoint)).toEqual(["get-flow-metadata-detail", "preflight-llm-execution"]);
    expect(calls[1]!.payload).toMatchObject({ keyId: "key.one" });
  });

  it("still says so when no key is chosen", async () => {
    const post = vi.fn(async () => ({ ok: true, payload: { flow: { flowId: "f1", settings: { llm: {} } } } }));
    const dispatch = await dispatchPanelCapability({ transport: { get: vi.fn(), post } as unknown as ProgramCommandTransport, projectId: "p1", flowId: "f1" }, { capabilityId: "permission.allowModelRun" });
    expect(dispatch.outcome).toMatchObject({ status: "failed", error: expect.stringContaining("no model key chosen") });
    expect(post).toHaveBeenCalledTimes(1);
  });
});
