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
// were withdrawn, which costs one call. The output schema stays behind the
// window: it changes more often, and in front each change would cost it all.
//
// A domain that declares which keys of a result are its view of the target
// has every view but the newest replaced by a reference (B1,
// `../../context-window.ts`). The view a request shows whole becomes a
// reference in the next, so the prefix then holds through every entry before
// the current view -- each written once and never changed -- and no further.

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
type Sent = { system: string; user: string; payload: SentPayload };
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
      if (toolsChanged(earlier, later)) {
        // The tools were withdrawn: the miss starts there, in front of the window, once.
        expect(matched, `call ${index} -> ${index + 1}: the prefix reaches the tools`).toBeGreaterThanOrEqual(earlier.system.length + 1 + earlier.user.indexOf('"tools"'));
        continue;
      }
      const mustMatch = earlier.system.length + 1 + endOfEntry(earlier, shared);
      expect(matched, `call ${index} -> ${index + 1}: first difference at ${matched}, inside ${pathAt(earlier, matched)}; must match through ${mustMatch}`).toBeGreaterThanOrEqual(mustMatch);
      // The node catalog and the tools are inside it.
      for (const key of ['"nodeCatalog"', '"tools"']) expect(prompt(earlier).indexOf(key), `call ${index} -> ${index + 1}: ${key} in the prefix`).toBeLessThan(matched);
    }
  }, 60_000);

  it("with views declared, shows only the newest whole, and every request is a prefix of the next through the entry before its view", async () => {
    const sent = await build((call) => call <= 5
      ? { kind: "tool_call", callId: `call.${call}`, toolId: TOOL_ID, input: { area: `area.${call}` }, add: true }
      : { kind: "complete", result: {} }, ["elements"]);

    expect(sent.length).toBeGreaterThanOrEqual(6);
    for (const [index, request] of sent.entries()) {
      const evidence = request.payload.context.evidenceLoop.evidence;
      const views = evidence.filter((entry) => isObject(entry.value) && "elements" in entry.value);
      const results = evidence.filter((entry) => entry.toolId === TOOL_ID);
      // One whole view at most -- the newest result -- and every earlier result
      // a reference to the one after it, keeping what the step said.
      expect(views.map((entry) => entry.callId), `request ${index + 1}`).toEqual(results.slice(-1).map((entry) => entry.callId));
      for (const [at, entry] of results.slice(0, -1).entries()) {
        expect(entry.value, `request ${index + 1}, ${entry.callId}`).toEqual({ area: `area.${at + 1}`, status: "changed", supersededBy: results[at + 1]!.callId });
      }
    }
    for (let index = 1; index < sent.length; index += 1) {
      const earlier = sent[index - 1]!;
      const later = sent[index]!;
      const evidence = earlier.payload.context.evidenceLoop.evidence;
      const view = evidence.findIndex((entry) => isObject(entry.value) && "elements" in entry.value);
      const settled = view < 0 ? evidence.filter(isToolResult).length : view;
      expect(JSON.stringify(later.payload.context.evidenceLoop.evidence.slice(0, settled)), `call ${index} -> ${index + 1}: entries before the view unchanged`).toBe(JSON.stringify(evidence.slice(0, settled)));
      if (toolsChanged(earlier, later)) continue;
      const mustMatch = earlier.system.length + 1 + endOfEntry(earlier, settled);
      const matched = commonPrefixLength(prompt(earlier), prompt(later));
      expect(matched, `call ${index} -> ${index + 1}: first difference at ${matched}, inside ${pathAt(earlier, matched)}; must match through ${mustMatch}`).toBeGreaterThanOrEqual(mustMatch);
    }
    // The window grows by a reference per step, not by a page: the last request
    // carries one page of 60 elements, where it used to carry five.
    const last = sent.at(-1)!.payload.context.evidenceLoop.evidence;
    expect(last.filter((entry) => isObject(entry.value) && "elements" in entry.value)).toHaveLength(1);
  }, 60_000);
});

function isObject(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

/** The tool id a routing situation is shown under in the window (`../../../route-state/build-routing.ts`). */
const ROUTE_STATE = "core.route_state";

/** A tool's result, or a route state: entries written once, where they happened, and never changed. */
function isToolResult(entry: SentEntry): boolean { return !entry.toolId.startsWith("core.") || entry.toolId === ROUTE_STATE; }

/** Whether the offered tools changed between two requests (withdrawn in the wrap-up). */
function toolsChanged(earlier: Sent, later: Sent): boolean {
  return JSON.stringify(earlier.payload.context.evidenceLoop.tools) !== JSON.stringify(later.payload.context.evidenceLoop.tools);
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

function prompt(request: Sent): string { return `${request.system}\n${request.user}`; }

function commonPrefixLength(left: string, right: string): number {
  let index = 0;
  while (index < left.length && index < right.length && left.charCodeAt(index) === right.charCodeAt(index)) index += 1;
  return index;
}

/** Where an offset into the prompt falls, as a JSON path, for a failure message a person can act on. */
function pathAt(request: Sent, offset: number): string {
  const inUser = offset - request.system.length - 1;
  if (inUser < 0) return "the system message";
  const walk = (node: unknown, start: number, trail: string[]): { end: number; hit?: string[] } => {
    const end = start + JSON.stringify(node).length;
    if (inUser < start || inUser >= end) return { end };
    if (node === null || typeof node !== "object") return { end, hit: trail };
    let cursor = start + 1;
    const entries = Array.isArray(node) ? node.map((item, index) => [String(index), item] as const) : Object.entries(node).filter(([, item]) => item !== undefined);
    for (const [key, item] of entries) {
      if (!Array.isArray(node)) cursor += JSON.stringify(key).length + 1;
      const inner = walk(item, cursor, [...trail, key]);
      if (inner.hit) return inner;
      cursor = inner.end + 1;
    }
    return { end, hit: trail };
  };
  return walk(request.payload, 0, []).hit?.join(".") || "the user message";
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
      sent.push({ system, user, payload: JSON.parse(user) as SentPayload });
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
