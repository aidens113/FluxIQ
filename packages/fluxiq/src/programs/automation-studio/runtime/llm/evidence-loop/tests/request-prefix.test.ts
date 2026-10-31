// @fluxiq-test-group real-sql
// Each decision of a build must be a byte prefix of the next, up to the end of
// the last tool result the two share.
//
// A DeepSeek context cache matches a prefix, so a value that varies in front of
// the evidence strands every byte behind it. `run-mup2i28c-6c7fc209` made five
// build decisions of 15,722 / 59,061 / 173,545 / 174,103 / 214,853 input
// tokens and was served 0 / 1,024 / 14,976 / 15,360 / 1,792 of them from
// cache, although each window was the last one plus one tool result: the
// output schema (rebuilt whenever completion, amending or the tools are offered
// or withdrawn), the routing context (one more situation per new page state)
// and the offered tools all sat in front of the evidence. This drives a build
// through the real service and the real DeepSeek adapter, with only the network
// and the credential store stood in, and holds every consecutive pair of
// requests to the property (`../../deepseek/request-body.ts`).
//
// W2 round 2 (t193, 2026-10-02): what followed the window was read uncached on
// every call, however rarely it changed, because it followed the window's
// newest entry. The tools and the routing context now sit in front of the
// window, and the routing context's situations are entries of the window, each
// placed after the call it followed. So a request is a prefix of the next
// through every settled entry and through all of that, except where the tools
// were withdrawn, which costs one call.
//
// The output schema (t484) sits in front of the task's context. Behind the
// window it followed the newest entry, so it was read uncached on every
// decision: about half of `run-mv62icw0-070f88ad`'s cost. Measured over the
// recorded lab builds, it changed between 6.4% of consecutive decisions on this
// evidence-guided path, mostly with the tools, and 3.2% on the candidate path.
// So a request is a prefix of the next through the whole window, except where
// the offer changed: then the miss starts in the schema, once.
//
// Declared view members are references from their first appearance. Their
// historical bytes stay fixed while the latest whole views move in a tail.
// Compare captured serialized provider request bodies as UTF8, not JS offsets.

import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNativeNodeImplementation } from "../../../../nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/index.ts";
import { createAutomationStudioSessionKeyProviderResolver, type AutomationStudioLlmEvidenceRuntimeBinding, type AutomationStudioSessionKeyPorts } from "../../index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AutomationStudioService } from "../../../service.ts";

const KEY_ID = `secret:${randomUUID()}`;
const TOOL_ID = "demo.act";

/** One request as it went out: its two messages, and the user message parsed. */
type Sent = { wire: string; system: string; user: string; payload: SentPayload };
type SentEntry = { callId: string; toolId: string; value: unknown };
type SentPayload = { outputSchema?: unknown; context: { evidenceLoop: { evidence: SentEntry[]; tools?: unknown }; routing?: { situations?: unknown[] }; flowBootstrap?: { routing?: { situations?: unknown[]; situationsShown?: string } } } };

let tempRoot: string;
beforeEach(async () => { tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-request-prefix-")); });
afterEach(async () => { await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 }); });

describe("the cached prefix of a build's decisions", () => {
  it("makes every request a byte prefix of the next up to the end of the last tool result they share", async () => {
    // Five steps, each reaching a new page state and added to the draft, then
    // completion: the offer changes on the way (completion offered after the
    // first call, amending once a step is kept, the wrap-up withdrawing the
    // tools, the last decision withdrawing amending).
    const sent = await build((call) => call <= 5
      ? { kind: "tool_call", callId: `call.${call}`, toolId: TOOL_ID, input: { area: `area.${call}` }, add: true }
      : { kind: "complete", result: {} });

    expect(sent.length).toBeGreaterThanOrEqual(6);
    // The fixture exercises what used to break the prefix, or the property
    // below would hold for no reason.
    const changed = (read: (payload: SentPayload) => unknown) => sent.slice(1).some((request, index) => JSON.stringify(read(request.payload)) !== JSON.stringify(read(sent[index]!.payload)));
    expect(changed((payload) => payload.outputSchema), "the output schema changes during the build").toBe(true);
    // The situations now arrive as window entries, one more as each call reaches a new page; the routing context lists none.
    expect(changed((payload) => payload.context.evidenceLoop.evidence.filter((entry) => entry.toolId === ROUTE_STATE).length), "the window gains route states").toBe(true);
    for (const request of sent) {
      // The schema in front of the task's context, and so of the window.
      expect(Object.keys(request.payload)).toEqual(["taskKind", "promptVersion", "expectedOutput", "outputSchema", "context"]);
      expect(request.payload.context.routing, "no routing context behind the window").toBeUndefined();
      expect(request.payload.context.flowBootstrap?.routing?.situations).toEqual([]);
      expect(request.payload.context.flowBootstrap?.routing?.situationsShown).toMatch(/core\.route_state/u);
    }

    for (let index = 1; index < sent.length; index += 1) {
      const earlier = sent[index - 1]!;
      const later = sent[index]!;
      // Nothing is declared a view here, so every result stays whole.
      expect(later.payload.context.evidenceLoop.evidence.some((entry) => JSON.stringify(entry.value).includes("supersededBy"))).toBe(false);
      const shared = sharedToolResults(earlier.payload.context.evidenceLoop.evidence, later.payload.context.evidenceLoop.evidence);
      // A tool's result never leaves the window, so everything the earlier
      // call was shown of them the later one is shown too, in the same place.
      expect(shared, `call ${index} -> ${index + 1}: tool results kept`).toBe(earlier.payload.context.evidenceLoop.evidence.filter(isToolResult).length);
      const matched = commonPrefixLength(prompt(earlier), prompt(later));
      const offerChanged = offerChangeStart(earlier, later);
      if (offerChanged !== undefined) {
        // The offer changed (completion or amending offered or withdrawn, the tools withdrawn): the miss starts there, in front of the window, once.
        expect(matched, `call ${index} -> ${index + 1}: the prefix reaches the changed offer`).toBeGreaterThanOrEqual(offerChanged);
        continue;
      }
      const mustMatch = wireOffset(earlier, endOfEntry(earlier, shared));
      expect(matched, `call ${index} -> ${index + 1}: first difference at ${matched}, inside the UTF8 provider request; must match through ${mustMatch}`).toBeGreaterThanOrEqual(mustMatch);
      // The output schema, the node catalog and the tools are inside it.
      for (const key of ['"outputSchema"', '"nodeCatalog"', '"tools"']) expect(wireOffset(earlier, earlier.user.indexOf(key)), `call ${index} -> ${index + 1}: ${key} in the prefix`).toBeLessThan(matched);
    }
  }, 60_000);

  it("keeps every declared-view history byte fixed from its first appearance, with whole current views only in the tail", async () => {
    const sent = await build((call) => call <= 5
      ? { kind: "tool_call", callId: `call.${call}`, toolId: TOOL_ID, input: { area: `area.${call}.caf\u00e9.\u{1f9ed}` }, add: true }
      : { kind: "complete", result: {} }, ["elements"]);
    expect(sent.length).toBeGreaterThanOrEqual(6);
    for (const request of sent) {
      const evidence = request.payload.context.evidenceLoop.evidence;
      const results = evidence.filter((entry) => entry.toolId === TOOL_ID);
      for (const entry of results) {
        expect(isObject(entry.value)).toBe(true);
        if (!isObject(entry.value)) throw new Error("Expected a projected tool result");
        expect(entry.value.elements).toEqual({ "core.view_reference": { callId: entry.callId, group: "top" } });
        expect(entry.value).not.toHaveProperty("supersededBy");
      }
      const current = evidence.filter((entry) => entry.toolId === "core.current_view");
      expect(current).toHaveLength(results.length ? 1 : 0);
      if (results.length) {
        const latest = results.at(-1)!;
        expect(current[0]!.value).toEqual({ groups: [{ group: "top", callId: latest.callId, value: {
          elements: Array.from({ length: 60 }, (_, at) => ({ target: `target.${at}`, name: `Item ${at} in ${isObject(latest.value) ? String(latest.value.area) : ""}` }))
        } }] });
      }
    }
    for (let index = 1; index < sent.length; index += 1) {
      const earlier = sent[index - 1]!;
      const later = sent[index]!;
      const history = earlier.payload.context.evidenceLoop.evidence.filter(isToolResult);
      const shared = sharedToolResults(earlier.payload.context.evidenceLoop.evidence, later.payload.context.evidenceLoop.evidence);
      expect(shared, "all prior tool/route history is immutable, including the immediately previous view").toBe(history.length);
      const matched = commonPrefixLength(prompt(earlier), prompt(later));
      const offerChanged = offerChangeStart(earlier, later);
      const mustMatch = offerChanged ?? wireOffset(earlier, endOfEntry(earlier, shared));
      expect(matched, `request ${index} -> ${index + 1}: UTF8 prefix reaches ${matched}, needs ${mustMatch}`).toBeGreaterThanOrEqual(mustMatch);
    }
    expect(sent.some((request) => request.wire.includes("caf\u00e9.\u{1f9ed}")), "the real serialized request exercises multibyte UTF8").toBe(true);
  }, 60_000);
});

function isObject(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

/** The tool id a routing situation is shown under in the window (`../../../route-state/build-routing.ts`). */
const ROUTE_STATE = "core.route_state";

/** A tool's result, or a route state: entries written once, where they happened, and never changed. */
function isToolResult(entry: SentEntry): boolean { return !entry.toolId.startsWith("core.") || entry.toolId === ROUTE_STATE; }

/**
 * Where in the earlier prompt the later one may first differ when the offer
 * changed between them, or undefined when it did not. The output schema is
 * written first and the tools after the head, so a changed schema -- which
 * every change of the tools also is -- may differ from inside it, past its
 * key; changed tools alone, from their key.
 */
function offerChangeStart(earlier: Sent, later: Sent): number | undefined {
  const at = (key: string) => wireOffset(earlier, earlier.user.indexOf(key) + key.length);
  if (JSON.stringify(earlier.payload.outputSchema) !== JSON.stringify(later.payload.outputSchema)) return at('"outputSchema":');
  if (JSON.stringify(earlier.payload.context.evidenceLoop.tools) !== JSON.stringify(later.payload.context.evidenceLoop.tools)) return at('"tools":');
  return undefined;
}

/** How many entries from the start the two windows share byte for byte, counting only up to the last tool result. */
function sharedToolResults(earlier: readonly SentEntry[], later: readonly SentEntry[]): number {
  let shared = 0;
  for (let index = 0; index < earlier.length && index < later.length; index += 1) {
    if (!isToolResult(earlier[index]!) || JSON.stringify(earlier[index]) !== JSON.stringify(later[index])) break;
    shared = index + 1;
  }
  return shared;
}

/** The offset in the user message just past the first `count` evidence entries (the window's opening bracket when none). */
function endOfEntry(request: Sent, count: number): number {
  const opening = '"evidence":[';
  const start = request.user.indexOf(opening);
  expect(start).toBeGreaterThan(-1);
  const entries = request.payload.context.evidenceLoop.evidence.slice(0, count);
  return start + opening.length + entries.reduce((total, entry, index) => total + JSON.stringify(entry).length + (index ? 1 : 0), 0);
}

function prompt(request: Sent): string { return request.wire; }

function commonPrefixLength(left: string, right: string): number {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  let index = 0;
  while (index < leftBytes.length && index < rightBytes.length && leftBytes[index] === rightBytes[index]) index += 1;
  return index;
}

/** UTF8 offset in the actual captured wire body, including JSON string escaping. */
function wireOffset(request: Sent, userOffset: number): number {
  expect(userOffset).toBeGreaterThanOrEqual(0);
  const quotedUser = JSON.stringify(request.user);
  const start = request.wire.indexOf(quotedUser);
  expect(start).toBeGreaterThanOrEqual(0);
  const escapedPrefix = JSON.stringify(request.user.slice(0, userOffset)).slice(1, -1);
  return Buffer.byteLength(request.wire.slice(0, start + 1) + escapedPrefix, "utf8");
}

/** One evidence-guided build, answering the n-th decision call with `reply(n)`; every request it sent. */
async function build(reply: (call: number) => JsonObject, observedStateKeys?: readonly string[]): Promise<Sent[]> {
  const sent: Sent[] = [];
  const service = new AutomationStudioService({ dataDir: tempRoot });
  service.bindNativeNodeRuntime(webRuntime());
  // A host that can observe its route state, so the build's routing context
  // gains a situation as each call reaches a new page.
  service.bindHostRuntime({ capabilities: [], observeRouteState: () => ({ page: { path: "/" } }) });
  const resolveForCaller = createAutomationStudioSessionKeyProviderResolver({
    ports: sessionKeyPorts(),
    fetchImpl: (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
      const system = body.messages.find((message) => message.role === "system")!.content;
      const user = body.messages.find((message) => message.role === "user")!.content;
      sent.push({ wire: String(init?.body), system, user, payload: JSON.parse(user) as SentPayload });
      const content = JSON.stringify({ kind: "evidence_tool_decision", summary: "Next.", decision: reply(sent.length) });
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content } }], usage: { prompt_tokens: 1_200, completion_tokens: 150, total_tokens: 1_350 } }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch
  });
  const tokenLimits = { maxInputTokens: 60_000, maxOutputTokens: 2_000, maxTotalTokens: 62_000 };
  service.bindLlmExecutionProvider((input) => {
    const resolution = resolveForCaller(input);
    if (!resolution) return undefined;
    return { ...resolution, maxCallsPerRun: 8, tokenLimits, maxTotalTokensPerRun: tokenLimits.maxTotalTokens * 8, timeoutMs: 25_000, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 2 };
  });
  service.bindLlmEvidenceRuntime(binding(observedStateKeys));
  try {
    const project = await service.createProject({ name: "Prefix", domainId: "web-automation" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.created", name: "Blank Flow" });
    const now = Date.now();
    await service.saveFlowInstruction(project.id, {
      schemaVersion: "0.1", instructionId: "instruction.build", title: "Build", body: "Open the catalog, filter it, and add two items to the cart.",
      scope: { kind: "flow", projectId: project.id, flowId: flow.flowId }, priority: 100, status: "active", requirement: "required", createdAt: now, updatedAt: now
    });
    // How the build ends is not this test's subject; what it sent on the way is.
    await service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, evidenceGuided: true, caller: { actorUserId: "user.lab", actorSessionId: "session.lab" } }).catch(() => undefined);
  } finally {
    await service.close();
  }
  return sent;
}

/** One mutating tool whose every call reaches a new page state, returns a page-sized result and records a proposable step. */
function binding(observedStateKeys?: readonly string[]): AutomationStudioLlmEvidenceRuntimeBinding {
  return {
    domainId: "web-automation",
    deniedEvidenceKeys: [],
    ...(observedStateKeys ? { observedStateKeys } : {}),
    tools: [{
      toolId: TOOL_ID,
      description: "Act on one area of the demo site and report what it shows.",
      inputSchema: { type: "object", additionalProperties: false, required: ["area"], properties: { area: { type: "string", maxLength: 40 } } },
      effect: "mutate"
    }],
    executeTool: async (input) => ({
      kind: "llm_evidence_tool_execution",
      evidence: { area: String(input.value.area), status: "changed", elements: Array.from({ length: 60 }, (_, at) => ({ target: `target.${at}`, name: `Item ${at} in ${String(input.value.area)}` })) },
      effectApplied: true,
      resultCode: "demo.action.succeeded",
      routeState: { page: { path: `/${String(input.value.area)}` } },
      draft: { actionId: TOOL_ID, input: { area: String(input.value.area) }, effect: "mutate", proposes: true }
    })
  };
}

function webRuntime(): AutomationStudioNativeNodeRuntime {
  const definitions = webDomainNodeDefinitionsFixture();
  const implementations = Object.fromEntries(definitions.map((definition): [string, AutomationStudioNativeNodeImplementation] => {
    const implementationKey = definition.source.kind === "importer" ? definition.source.implementationKey : definition.id;
    return [implementationKey, () => ({ status: "success", route: "success", outputs: { success: true } })];
  }));
  return new AutomationStudioNativeNodeRuntime({ permissions: ["web-automation.action"], runtimeCapabilities: ["web.actions"] }).register({
    schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "@fluxiq-web-extension/domain", packageVersion: "1.0.0", domainId: "web-automation", nodes: definitions
  }, { packageId: "@fluxiq-web-extension/domain", packageVersion: "1.0.0", implementations });
}

/** Secret Keys stood in: one enabled DeepSeek key, released per call. */
function sessionKeyPorts(): AutomationStudioSessionKeyPorts {
  let minted = 0;
  return {
    snapshot: async () => ({ keys: [{ id: KEY_ID, kind: "llm", provider: "deepseek", enabled: true, updatedAtMs: 1 }] }),
    createSessionRevealAuthorization: async (input) => { minted += 1; return { authorizationId: `secret-reveal:${minted}`, keyId: input.id, keyUpdatedAtMs: 1 }; },
    revealKeyWithAuthorization: async () => ({ value: "test-deepseek-credential" }),
    revokeRevealAuthorization: () => {}
  };
}
