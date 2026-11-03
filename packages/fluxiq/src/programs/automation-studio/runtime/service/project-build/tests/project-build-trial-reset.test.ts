// @fluxiq-test-group real-sql
// A builder's subflow trial after the build's acts, through the actual
// service (t578; A8 bigbox debug, cause A and fix 2; t775): a scripted model
// plays the supervisor and two builders over a stub shop with no start hook.
// The cart held dish soap before the build.
//
// Since t775 (AGENTS.md "Reset as rarely as possible; judge the change") a
// trial is never refused for want of a reset: it runs on the site as it
// stands, and the build's acts there are said to the model and the judge under
// `startedWith`. An undo the build asks for, naming the act under `undoes`,
// still undoes exactly that act and never what was there before.
//
// 1. Builder "first" adds honey and rye bread while exploring, then leaves
//    the tab on another page. Its trial runs with both still in the cart,
//    said under startedWith, loads the start page and completes on its yes.
// 2. A reset the supervisor sends before the second builder's entry replays
//    its predecessor removes the first builder's explored and trial additions,
//    never the dish soap. Builder "second" adds butter, then undoes its
//    entry's oat milk and its own butter, the entry act routed to its owning
//    ledger. Its trial begins with the tab on the product page the undos were
//    checked on, nothing of the build said, and its run loads the start page
//    itself.
// 3. Each part asks a lasting act, so each subflow adds its own product, the
//    act declared as a real script must (t597). Every run of it -- a trial,
//    the second's entry -- leaves that add too, named as a trial step. Each
//    builder explores with a product its own script does not add, so the cart
//    never lists one line twice (a list showing duplicate rows witnesses
//    nothing, `flow-bootstrap/reset-settlement/collection-groups.ts`). Core
//    sends no reset of its own before the ending, so the second trial's adds
//    are left on the site, said as left.
//
// Every run -- both trials and the entry -- loads the start page first, through
// the domain's arrival node, which declares a fixed output action as the web
// domain's does. The supervisor's whole trial is covered beside this
// (`./project-build-reset.test.ts`).
//
// **Nothing here waits on the wall clock (t644).** Under load this build took
// over 60 s against 16 s quiet and failed on the 60 s watchdog, and the
// timed-out build, still writing, then failed the directory's removal with
// EBUSY or ENOTEMPTY (t616). Twelve of its quiet 16 s were the reset's settled
// reads: two reads of the page a second apart
// (`flow-bootstrap/site-reset/settle-ms.ts`), though this stub shop never
// changes by itself. That wait is held at zero below, so both reads still
// happen, back to back, and nothing asserted depends on time passing between
// them. The build's own bounds are never reached, so the watchdog is a hang
// guard only, and cleanup stops the build if it is still running and waits
// for it before removing its directory (`./settled-builds/index.ts`).

import { mkdtemp } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioActionConsequence, AutomationStudioActionDeclaration } from "../../../action-permissions/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../../llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AutomationStudioService } from "../../../service.ts";
import { blankFixture, caller, judgeReply, mockProvider } from "../../../tests/service-bootstrap/tests/fixtures.ts";
import { automationStudioTestDeclaredStepResolution } from "./declared-step-resolution/index.ts";
import { automationStudioTestSettledBuilds } from "./settled-builds/index.ts";
import { observeBuilderCalls } from "./brief-ports/tests/observe-builder-calls.ts";
import type { ExecutionScopeAttestation, ExecutionScopeAttestor, ExecutionScopeBinding, ExecutionScopeOwner } from "../../../../../../runtime/execution-admission/index.ts";
import type { NativeManagedCompletionRegistration } from "../../../../../../runtime/native-execution/admission/index.ts";
import type { AutomationNodeExecutionResult } from "../../../../../../components/automation/index.ts";
import type { AutomationStudioNativeNodeImplementation } from "../../../../../../components/automation/importer/index.ts";
import type { ExecutionCallbackCompletionConfiguration } from "../../../../../../runtime/execution-observation/configuration/index.ts";
import { ExecutionObservationSource, type ExecutionCallbackOutcome, type ExecutionCallbackSettlement } from "../../../../../../runtime/execution-observation/index.ts";
import { OriginalExecutionPromiseReceipts } from "../../../../../../runtime/execution-observation/queue-completion/index.ts";
import { AuthoringExecutionScope } from "../../../../../../runtime/flow-authoring/execution/index.ts";

// The reset's settled read, its two reads back to back (header).
vi.mock("../../../flow-bootstrap/site-reset/index.ts", async (original) => ({ ...(await original<object>()), AUTOMATION_STUDIO_SITE_RESET_SETTLE_MS: 0 }));
// A hang guard only (header).
vi.setConfig({ testTimeout: 300_000, hookTimeout: 300_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const START = "https://shop.test/";
const ELSEWHERE = "https://shop.test/account";
const PRODUCT = "https://shop.test/product";
const ADD = "domain.example.add-to-cart";
const REMOVE = "domain.example.remove-line";
const GO = "domain.example.go";

/** Owns this test's one synchronous in-memory shop until its service has stopped. */
class ShopScopeOwner implements ExecutionScopeAttestor, ExecutionScopeOwner {
  readonly #resourceKey = `isolated.shop.${randomUUID()}`;
  readonly #proofs = new WeakMap<object, NonNullable<ReturnType<ExecutionScopeOwner["readBinding"]>>>();
  readonly #anchors = new Map<string, object>();
  readonly #baselineProofDigest: string;
  #site: { cart: string[]; tab: string } | undefined;

  constructor(site: { cart: string[]; tab: string }) {
    this.#site = site;
    this.#baselineProofDigest = createHash("sha256").update(JSON.stringify({ resource: this.#resourceKey, cart: site.cart, tab: site.tab, queuedWork: false })).digest("hex");
  }

  attest(anchor: ExecutionScopeBinding): ExecutionScopeAttestation | null {
    if (!this.#site) return null;
    const anchorKey = JSON.stringify([anchor.projectId, anchor.ownerKey, anchor.continuationKey, anchor.coverageEpoch]);
    let proof = this.#anchors.get(anchorKey);
    if (!proof) {
      proof = Object.freeze({});
      const binding = Object.freeze({ projectId: anchor.projectId, ownerKey: anchor.ownerKey, continuationKey: anchor.continuationKey, coverageEpoch: anchor.coverageEpoch, resourceKeys: Object.freeze([this.#resourceKey]) });
      this.#proofs.set(proof, Object.freeze({ binding, baseline: "complete", baselineProofDigest: this.#baselineProofDigest }));
      this.#anchors.set(anchorKey, proof);
    }
    return { owner: this, proof };
  }

  readBinding(proof: object): ReturnType<ExecutionScopeOwner["readBinding"]> {
    return this.#site ? this.#proofs.get(proof) ?? null : null;
  }

  close(): void { this.#site = undefined; }
}

type Entry = { callId: string; toolId: string; value: unknown };
const lastOf = (evidence: readonly Entry[], toolId: string) => [...evidence].reverse().find((entry) => entry.toolId === toolId)?.value as JsonObject | undefined;
const byCall = (evidence: readonly Entry[] | undefined, callId: string) => evidence?.find((entry) => entry.callId === callId)?.value as JsonObject | undefined;
const decision = (decided: JsonObject) => ({ response: { kind: "evidence_tool_decision", summary: "Scripted", decision: decided }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.0001 } });

const PLAN = {
  taskSpec: {
    parts: [
      { id: "p1", quote: { sourceId: "instruction.build", text: "Create a deterministic" }, goalFacts: ["The Flow is deterministic"], lastingActs: ["create_new"] },
      { id: "p2", quote: { sourceId: "instruction.build", text: "Start to End Flow." }, goalFacts: ["The Flow runs from its start to its end"], lastingActs: ["create_new"] }
    ],
    notAsked: []
  },
  subflows: [{ key: "first", name: "first", parts: ["p1"] }, { key: "second", name: "second", parts: ["p2"], after: ["first"] }]
};
const brief = (subflowKey: string, parts: string[], predecessors: string[]) => ({ kind: "build", subflowKey, parts, entry: { caseId: "observed-current", predecessors }, allowanceUsd: 0.03, maxIterations: 20, permittedActs: ["create_new"] });

/** What each part adds to the cart. */
const PRODUCT_OF: Record<string, string> = { first: "oat-milk", second: "jam" };

/** A part's script: its part asks a lasting act, so it adds its product, the act declared as a real script must (t597). */
const script = (subflowKey: string): JsonObject => ({ flow: [`flow: ${subflowKey}`, `part ${subflowKey}: carry out its part`, "  step add: add the product", `    node: ${ADD}`, `    product: ${PRODUCT_OF[subflowKey]!}`, "    consequences: create_new", "end"].join("\n") });

/** Each builder's script, one call per step in order (header), then the completion. */
function builderDecision(subflowKey: string, evidence: readonly Entry[]): JsonObject {
  const submitted = lastOf(evidence, "core.submit_subflow");
  const run = (callId: string, node: string, parameters: JsonObject, consequences: AutomationStudioActionConsequence[], undoes?: string) => ({ callId, decided: () => ({ kind: "tool_call", callId, toolId: "core.run_node", input: { node, parameters, consequences, ...(undoes ? { undoes } : {}) } }) });
  const submit = { callId: "submit", decided: () => ({ kind: "tool_call", callId: "submit", toolId: "core.submit_subflow", input: script(subflowKey) }) };
  const test = (callId: string, cannotUndo?: string[]) => ({ callId, decided: () => ({ kind: "tool_call", callId, toolId: "core.test_subflow", input: { revision: submitted!.revision as number, digest: submitted!.digest as string, ...(cannotUndo ? { cannotUndo } : {}) } }) });
  const steps = subflowKey === "first"
    ? [run("go.product", GO, { to: PRODUCT }, []), run("add.honey", ADD, { product: "honey" }, ["create_new"]), run("add.rye", ADD, { product: "rye-bread" }, ["create_new"]), run("go.away", GO, { to: ELSEWHERE }, []), submit, test("test.1")]
    : [run("go.product", GO, { to: PRODUCT }, []), run("add.butter", ADD, { product: "butter" }, ["create_new"]), submit, run("undo.entry", REMOVE, { line: "oat-milk" }, ["delete"], "act-4"), run("undo.butter", REMOVE, { line: "butter" }, ["delete"], "act-5"), test("test.1")];
  const next = steps.find((step) => !evidence.some((entry) => entry.callId === step.callId));
  if (next) return next.decided();
  return { kind: "complete", result: { subflowKey, revision: submitted!.revision as number, digest: submitted!.digest as string } };
}

/** One session's run, from what happened: the page the tab showed as it started, the first thing its run did, and how it ended. */
function firstOfRun(happened: readonly string[], what: string): { ranOn: string; first: string | undefined; ended: string | undefined } | undefined {
  const started = happened.findIndex((line) => line.startsWith(`${what} running on `));
  if (started < 0) return undefined;
  const after = happened.slice(started).filter((line) => !line.startsWith(`${what} running on `));
  return { ranOn: happened[started]!.slice(`${what} running on `.length), first: after[0], ended: after.find((line) => line.startsWith(`${what} `))?.slice(what.length + 1) };
}

function shopNode(id: string, label: string, parameters: AutomationStudioNodeDefinition["parameters"]): AutomationStudioNodeDefinition {
  return {
    schemaVersion: "0.1", id, version: "1.0.0", label, description: `${label} in the shop.`, category: "action",
    source: { kind: "importer", domainId: "example", packageId: "example.shop", implementationKey: id },
    availability: { kind: "domain", domainId: "example" }, requiredRuntimeCapabilities: ["example.actions"], capabilities: { executable: true, codeBacked: true },
    inputs: [{ id: "in", label: "In", valueType: "any", required: false }], outputs: [{ id: "success", label: "Success", valueType: "any" }], parameters,
    outputAction: { fixedOutputId: id }
  };
}

/** The shop: its cart, which page the tab shows, and everything in the order it happened. */
function shop() {
  const site = { cart: ["dish-soap"], tab: START };
  const scopeOwner = new ShopScopeOwner(site);
  const happened: string[] = [];
  const acted: string[] = [];
  const inputs: JsonObject[] = [];
  type RawRequest = Parameters<AutomationStudioLlmEvidenceRuntimeBinding["executeTool"]>[0];
  type RawResult = Awaited<ReturnType<AutomationStudioLlmEvidenceRuntimeBinding["executeTool"]>>;
  const preparingRaw = new WeakMap<RawRequest, object>();
  const rawReturns = new WeakMap<object, object>();
  const rawReceipts = new WeakMap<object, { value: RawResult; completionDigest: string; assessmentDigest: string }>();
  const nodes = [
    shopNode(ADD, "Add to cart", [{ id: "product", label: "Product", valueType: "string", required: true }]),
    shopNode(REMOVE, "Remove cart line", [{ id: "line", label: "Line", valueType: "string", required: true }]),
    shopNode(GO, "Go to page", [{ id: "to", label: "To", valueType: "string", required: true }])
  ];
  const completions: NativeManagedCompletionRegistration[] = [];
  const receipts = new WeakMap<AutomationNodeExecutionResult, { completionDigest: string; assessmentDigest: string }>();
  let ordinal = 0;
  const implementations = Object.fromEntries(nodes.map(definition => {
    const implementation: AutomationStudioNativeNodeImplementation = ({ parameters }) => {
      const before = { cart: [...site.cart], tab: site.tab };
      if (definition.id === GO) {
        site.tab = String(parameters.to);
        happened.push(`run loads ${site.tab}`);
      } else if (definition.id === ADD) {
        site.cart.push(String(parameters.product));
        acted.push(`run add ${String(parameters.product)}`);
        happened.push(`run adds ${String(parameters.product)}`);
      }
      const result: AutomationNodeExecutionResult = { status: "success", route: "success", outputs: { success: true } };
      // This owner executes all fixture mutations synchronously and queues no work. Only its original returned object is a receipt.
      receipts.set(result, {
        completionDigest: createHash("sha256").update(JSON.stringify({ definition: definition.id, ordinal: ++ordinal, before, after: { cart: [...site.cart], tab: site.tab } })).digest("hex"),
        assessmentDigest: createHash("sha256").update("isolated synchronous shop mutations completed; no queued work").digest("hex")
      });
      return result;
    };
    completions.push({ implementation, packageId: "example.shop", packageVersion: "1.0.0", definitionId: definition.id, definitionVersion: definition.version,
      contract: "managed_direct_effects", consumeCompletion: ({ outcome }) => {
        if (outcome.kind !== "fulfilled") return null;
        const actual = receipts.get(outcome.value);
        receipts.delete(outcome.value);
        return actual ? { disposition: "settled", ...actual } : null;
      }
    });
    return [definition.id, implementation];
  }));
  // What a Flow's run does: the arrival loads the page, and a part's add puts its product in the cart, as the builder's own add does.
  const runtime = new AutomationStudioNativeNodeRuntime({ permissions: [], runtimeCapabilities: ["example.actions"] }).register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.shop", packageVersion: "1.0.0", domainId: "example", nodes },
    { packageId: "example.shop", packageVersion: "1.0.0", implementations }
  );
  const read = () => ({ lines: site.cart.map((line) => `line ${line}`), items: site.cart.map((line) => `line:${line}`) });
  const resolverReceipts = new OriginalExecutionPromiseReceipts();
  const resolvePlanNodeParameters: NonNullable<AutomationStudioLlmEvidenceRuntimeBinding["resolvePlanNodeParameters"]> = (input) => {
    const original = AuthoringExecutionScope.of(input);
    const returned = automationStudioTestDeclaredStepResolution(input, { name: input.nodeDefinitionId === ADD ? "Add to cart" : "Remove", kind: "button", resource: "r:shop", scope: "p:cart", page: "s:product", subject: `line:${String(input.parameters.product ?? input.parameters.line)}` }).then(value => {
      if (original) resolverReceipts.issue(returned, original.context.callbacks, original.context.parent, {
        disposition: "settled",
        completionDigest: createHash("sha256").update(JSON.stringify({ ordinal: ++ordinal, definition: input.nodeDefinitionId, value })).digest("hex"),
        assessmentDigest: createHash("sha256").update("isolated resolver awaited original observed permission; no queued work").digest("hex")
      });
      return value;
    });
    return returned;
  };
  const binding: AutomationStudioLlmEvidenceRuntimeBinding = {
    domainId: "example",
    deniedEvidenceKeys: [],
    tools: [{ toolId: "shop.look", description: "Look at the page.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }],
    runsNodes: { arrival: { node: GO, parameter: "to" } },
    resolvePlanNodeParameters,
    startState: async (input: { start?: JsonObject }) => {
      const now = read();
      const was = Array.isArray(input.start?.lines) ? (input.start!.lines as string[]) : undefined;
      const gone = was ? was.filter((line) => !now.lines.includes(line)) : [];
      const added = was ? now.lines.filter((line) => !was.includes(line)) : [];
      return { state: { lines: now.lines }, differs: [...gone.map((line) => `gone: ${line}`), ...added.map((line) => `new: ${line}`)], location: site.tab, lines: { gone, added }, items: now.items, resource: "r:shop", scope: "p:shop", collections: [{ scope: "p:cart", group: "g:cart", subjects: now.items, states: Object.fromEntries(site.cart.map((line) => [`line:${line}`, line])) }] };
    },
    executeTool: async (request) => {
      const originalInvocation = preparingRaw.get(request);
      if (!originalInvocation) throw new Error("isolated_shop.original_raw_invocation_required");
      const { toolId, value, permission } = request;
      const before = { cart: [...site.cart], tab: site.tab };
      const completed = (result: RawResult): RawResult => {
        rawReceipts.set(originalInvocation, {
          value: result,
          completionDigest: createHash("sha256").update(JSON.stringify({ toolId, value, ordinal: ++ordinal, before, after: { cart: [...site.cart], tab: site.tab } })).digest("hex"),
          assessmentDigest: createHash("sha256").update("isolated shop operation completed synchronously after permission; no queued effects").digest("hex")
        });
        return result;
      };
      inputs.push(structuredClone(value));
      if (toolId === "shop.look") return completed({ kind: "llm_evidence_tool_execution", evidence: { page: site.tab, cart: [...site.cart] }, effectApplied: false });
      const parameters = (value.parameters ?? {}) as JsonObject;
      if (value.node === GO) {
        site.tab = String(parameters.to);
        return completed({ kind: "llm_evidence_tool_execution", evidence: { ok: true, at: site.tab }, effectApplied: true });
      }
      const line = typeof parameters.line === "string" ? parameters.line : undefined;
      const consequences = (Array.isArray(value.consequences) ? value.consequences : []) as AutomationStudioActionConsequence[];
      const declaration: AutomationStudioActionDeclaration = { consequences, control: { name: value.node === ADD ? "Add to cart" : "Remove", kind: "button", resource: "r:shop", scope: "p:cart", page: "s:product", subject: `line:${String(parameters.product ?? line)}`, ...(line ? { item: `line:${line}` } : {}) }, verb: "press", effect: "mutate" };
      const verdict = await permission!(declaration);
      if (!verdict.permitted) return completed({ kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "permission_required" }, effectApplied: false });
      if (value.node === ADD) {
        site.cart.push(String(parameters.product));
        acted.push(`add ${String(parameters.product)}`);
      } else if (line) {
        site.cart.splice(site.cart.indexOf(line), 1);
        acted.push(`remove ${line}`);
      }
      happened.push(`builder ${acted.at(-1)}`);
      return completed({ kind: "llm_evidence_tool_execution", evidence: { ok: true, cart: [...site.cart] }, effectApplied: true });
    }
  };
  const perform = binding.executeTool;
  const executeTool: typeof perform = (request) => {
    const invocation = Object.freeze({});
    preparingRaw.set(request, invocation);
    try {
      const original = perform.call(binding, request);
      rawReturns.set(original, invocation);
      return original;
    } finally {
      preparingRaw.delete(request);
    }
  };
  binding.executeTool = executeTool;
  const rawCompletion = ({ outcome, returned }: { outcome: ExecutionCallbackOutcome<RawResult>; returned?: ReturnType<typeof executeTool> | undefined }): ExecutionCallbackSettlement | null => {
    if (!returned || outcome.kind !== "fulfilled") return null;
    const invocation = rawReturns.get(returned);
    if (!invocation) return null;
    const receipt = rawReceipts.get(invocation);
    if (!receipt || receipt.value !== outcome.value) return null;
    rawReturns.delete(returned);
    rawReceipts.delete(invocation);
    return { disposition: "settled", completionDigest: receipt.completionDigest, assessmentDigest: receipt.assessmentDigest };
  };
  const callbackCompletions: ExecutionCallbackCompletionConfiguration = {
    configure(registrar) {
      registrar.manage({ receiver: binding, callback: executeTool, contract: "managed_direct_effects", consumeCompletion: rawCompletion });
      registrar.manage({ receiver: binding, callback: resolvePlanNodeParameters, contract: "managed_direct_effects", consumeCompletion: input => resolverReceipts.consume(input) });
      if (binding.startState) registrar.manage({ receiver: binding, callback: binding.startState, contract: "no_direct_effects" });
    }
  };
  return { site, happened, acted, inputs, binding, runtime, completions, scopeOwner, callbackCompletions, rawCompletion };
}

async function twoBuilders() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-project-build-trial-reset-"));
  const domain = shop();
  const diagnosticStartedAt = Date.now();
  let diagnosticCleaning = false;
  let diagnosticCancelled = false;
  const phase = (label: string, fields: Record<string, string | number | boolean> = {}): void => {
    process.stderr.write(`${JSON.stringify({ diagnostic: "isolated_callback_phase", phase: label, elapsedMs: Date.now() - diagnosticStartedAt, cleanup: diagnosticCleaning, ...fields })}\n`);
  };
  const errorLabel = (error: unknown): string => {
    const descriptor = error !== null && typeof error === "object" ? Object.getOwnPropertyDescriptor(error, "message") : undefined;
    const message: unknown = descriptor && "value" in descriptor ? descriptor.value : undefined;
    if (typeof message === "string" && /^execution_(?:admission|observation)\.[a-z0-9_]+$/u.test(message)) return message;
    const codeDescriptor = error !== null && typeof error === "object" ? Object.getOwnPropertyDescriptor(error, "code") : undefined;
    const code: unknown = codeDescriptor && "value" in codeDescriptor ? codeDescriptor.value : undefined;
    return typeof code === "string" && /^SQLITE_[A-Z_]+$/u.test(code) ? code : "other_error";
  };
  /** Each builder's evidence at its latest decision. */
  const seen: Record<string, Entry[]> = {};
  const stopObserving = observeBuilderCalls((key, entry) => {
    (seen[key] ??= []).push(entry);
    const call = ["initial.shop.look", "go.product", "add.honey", "add.rye", "go.away", "submit", "test.1", "add.butter", "undo.entry", "undo.butter"].includes(entry.callId) ? entry.callId : "other";
    phase("builder.result", { actor: key === "first" || key === "second" ? key : "other", call });
  });
  cleanups.push(async () => stopObserving());
  let supervisorDecisions = 0;
  let resetCalls = 0;
  const providerReceipts = new WeakMap<Promise<unknown>, { value: unknown; completionDigest: string }>();
  const provider = mockProvider((request) => {
    try {
      const value = (() => {
        if (request.metadata?.source === "instructionAuthority") return decision({ kind: "tool_call", callId: "read", toolId: "none", input: {} });
        if (request.taskKind === "loop_verification") return judgeReply("yes");
        const loop = request.context.evidenceLoop!;
        const evidence = loop.evidence as Entry[];
        const tools = loop.tools.map((tool) => tool.toolId);
        if (!tools.length) return decision({ kind: "tool_call", callId: "read", toolId: "none", input: {} });
        if (tools.includes("project.write_plan")) {
          supervisorDecisions += 1;
          if (supervisorDecisions === 1) return decision({ kind: "tool_call", callId: "plan", toolId: "project.write_plan", input: PLAN });
          if (supervisorDecisions === 2) return decision({ kind: "tool_call", callId: "dispatch.first", toolId: "project.dispatch", input: { reason: "Build the first part.", briefs: [brief("first", ["p1"], [])] } });
          if (supervisorDecisions === 3) return decision({ kind: "tool_call", callId: "reset", toolId: "project.dispatch", input: { reason: "Restore this build's effects before replaying its predecessor.", briefs: [{ kind: "reset", subflowKey: "main", parts: [], entry: { caseId: "observed-current", predecessors: [] }, allowanceUsd: 0.03, maxIterations: 20 }] } });
          if (supervisorDecisions === 4) return decision({ kind: "tool_call", callId: "dispatch.second", toolId: "project.dispatch", input: { reason: "Build the dependent part on the restored site.", briefs: [brief("second", ["p2"], ["first"])] } });
          return decision({ kind: "complete", result: { ended: "partial", reason: "Only the builders were under test." } });
        }
        const properties = (loop.completionSchema.properties ?? {}) as JsonObject;
        if (properties.subflowKey === undefined) {
          const reversals = [{ line: "honey", act: "act-1" }, { line: "oat-milk", act: "act-3" }, { line: "rye-bread", act: "act-2" }];
          const reversal = reversals[resetCalls++];
          if (reversal) return decision({ kind: "tool_call", callId: `reset.${reversal.act}`, toolId: "core.run_node", input: { node: REMOVE, parameters: { line: reversal.line }, consequences: ["delete"], undoes: reversal.act } });
          return decision({ kind: "complete", result: { summary: "The build's cart additions were removed through their own controls." } });
        }
        const subflowKey = (properties.subflowKey as JsonObject).const as string;
        seen[subflowKey] = evidence.map((entry) => structuredClone(entry));
        return decision(builderDecision(subflowKey, evidence));
      })();
      // This fixture owns the complete synchronous script decision and counters;
      // it starts no provider, timer, delegated callback or queued write.
      const returned = Promise.resolve(value);
      providerReceipts.set(returned, { value, completionDigest: createHash("sha256").update(JSON.stringify({ supervisorDecisions, resetCalls, value })).digest("hex") });
      return returned;
    } catch (error) {
      return Promise.reject(error);
    }
  });
  const unknown = ExecutionObservationSource.prototype.unknown;
  let cancelUnsupported: (() => void) | undefined;
  const originalConsoleError = console.error;
  const coverageDiagnostic = vi.spyOn(console, "error").mockImplementation((message, ...details) => {
    originalConsoleError.call(console, message, ...details);
    if (message === "Isolated unsupported automation callback") cancelUnsupported?.();
  });
  const callbackFields = (identity: { receiver?: unknown; callback: unknown }): string[] => {
    const receiver = identity.receiver;
    if (receiver === null || typeof receiver !== "object" && typeof receiver !== "function") return [];
    return Reflect.ownKeys(receiver).filter(key => Object.getOwnPropertyDescriptor(receiver, key)?.value === identity.callback).map(key => typeof key === "string" ? key : "symbol");
  };
  let loggedUnknown = false;
  const unknownDiagnostic = vi.spyOn(ExecutionObservationSource.prototype, "unknown").mockImplementation(function (this: ExecutionObservationSource, handle) {
    if (!loggedUnknown) {
      loggedUnknown = true;
      type Diagnostic = { identity: { receiver?: unknown; callback: { name?: string } }; state: string; gap: boolean; children: Set<Diagnostic> };
      const source = this as unknown as { sourceKey: string; invocations: WeakMap<object, Diagnostic> };
      const actual = source.invocations.get(handle);
      console.error("Isolated first unknown callback", {
        source: source.sourceKey, callback: actual?.identity.callback.name, state: actual?.state, gap: actual?.gap,
        receiverMethods: actual ? callbackFields(actual.identity) : [],
        children: [...actual?.children ?? []].map(child => ({ callback: child.identity.callback.name, state: child.state, gap: child.gap }))
      });
    }
    return unknown.call(this, handle);
  });
  type CompletionDiagnostic = { handle: object; identity: { receiver?: unknown; callback: { name?: string } }; state: string; gap: boolean; children: Set<CompletionDiagnostic>; contract?: { pure: boolean } };
  const completionPrototype = ExecutionObservationSource.prototype as unknown as { complete(state: CompletionDiagnostic, outcome: { kind: string }, rechecking?: boolean): Promise<void> };
  const complete = completionPrototype.complete;
  let loggedIncomplete = false;
  const completionDiagnostic = vi.spyOn(completionPrototype, "complete").mockImplementation(async function (this: ExecutionObservationSource, ...args: Parameters<typeof complete>) {
    const [state, outcome] = args;
    const claim = state.identity.callback.name === "claim";
    let ready = "not_read";
    if (claim) {
      try { ready = this.frameCompletion(state.handle)?.disposition ?? "not_ready"; }
      catch { ready = "unreadable"; }
      phase("claim.complete.begin", { frame: ready, children: state.children.size, gap: state.gap, outcome: outcome.kind });
    }
    try {
      await complete.apply(this, args);
      if (claim) phase("claim.complete.end", { state: state.state });
    } catch (error) {
      phase("complete.reject", { role: claim ? "claim" : "other", code: errorLabel(error), error: error instanceof DOMException ? "DOMException" : error instanceof AggregateError ? "AggregateError" : error instanceof Error ? "Error" : "other" });
      if (!diagnosticCleaning && !diagnosticCancelled) {
        diagnosticCancelled = true;
        phase("diagnostic.cancel_on_error");
        cancelUnsupported?.();
      }
      throw error;
    }
    finally {
      if (!loggedIncomplete && state.state !== "settled") {
        loggedIncomplete = true;
        console.error("Isolated first incomplete callback", {
          source: (this as unknown as { sourceKey: string }).sourceKey,
          callback: state.identity.callback.name, state: state.state, gap: state.gap,
          receiverMethods: callbackFields(state.identity),
          managed: Boolean(state.contract), pure: state.contract?.pure, outcome: outcome.kind,
          children: [...state.children].map(child => ({ callback: child.identity.callback.name, state: child.state, gap: child.gap }))
        });
      }
    }
  });
  const service = new AutomationStudioService({ dataDir, llmProviderResolver: () => ({ provider, maxCallsPerRun: 120, maxEstimatedCostUsd: 0.2 }), llmEvidenceRuntime: domain.binding, executionScopeAttestor: domain.scopeOwner, executionCallbackCompletions: {
    configure(registrar) {
      domain.callbackCompletions.configure(registrar);
      registrar.manage({ receiver: provider, callback: provider.runTask, contract: "managed_direct_effects", consumeCompletion: ({ returned, outcome }) => {
        if (!returned || outcome.kind !== "fulfilled") return null;
        const receipt = providerReceipts.get(returned);
        if (!receipt || receipt.value !== outcome.value) return null;
        providerReceipts.delete(returned);
        return { disposition: "settled", completionDigest: receipt.completionDigest, assessmentDigest: "isolated.script.decision.completed.no_queued_work" };
      } });
    }
  } });
  service.bindNativeNodeRuntime(domain.runtime, undefined, domain.completions);
  const builds = automationStudioTestSettledBuilds(service, dataDir);
  cleanups.push(async () => {
    diagnosticCleaning = true;
    phase("test.cleanup.begin");
    try { await builds.cleanup(); }
    finally {
      unknownDiagnostic.mockRestore();
      completionDiagnostic.mockRestore();
      coverageDiagnostic.mockRestore();
      domain.scopeOwner.close();
    }
  });
  const { project, flow } = await blankFixture(service, "active", "example");
  cancelUnsupported = () => { service.buildCancellation.cancel(project.id, flow.flowId); };
  // Each trial's and entry's session as it starts and ends, with the page the tab showed as it started.
  const internal = service as unknown as { writeRuntimeSession(projectId: string, session: { status: string; metadata?: JsonObject }, ...rest: unknown[]): Promise<unknown> };
  const write = internal.writeRuntimeSession.bind(service);
  vi.spyOn(internal, "writeRuntimeSession").mockImplementation(async (projectId, session, ...rest) => {
    const entry = session.metadata?.entryPreparation as JsonObject | undefined;
    const trial = session.metadata?.subflowTrial as JsonObject | undefined;
    const what = entry ? `entry for ${String(entry.subflowKey)}` : trial ? `trial of ${String(trial.subflowKey)}` : undefined;
    if (what && session.status === "running") domain.happened.push(`${what} running on ${domain.site.tab}`);
    else if (what && session.status !== "queued") domain.happened.push(`${what} ${session.status}`);
    return await write(projectId, session, ...rest);
  });
  return {
    domain, seen,
    build: () => builds.track(project.id, flow.flowId, service.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller(), evidenceGuided: true, authoringMode: "project", startLocation: START, permittedConsequences: ["create_new"] }))
  };
}

describe("a builder's subflow trial after the build's acts (t578, t775)", () => {
  it("accepts only the shop owner's original live proof and preserves its persisted anchor", () => {
    const owner = new ShopScopeOwner({ cart: ["dish-soap"], tab: START });
    const anchor: ExecutionScopeBinding = { projectId: "project.isolated", ownerKey: "owner.persisted", continuationKey: "flow.persisted", coverageEpoch: "epoch.persisted", resourceKeys: ["persisted.anchor"] };
    const attestation = owner.attest(anchor);
    expect(attestation?.owner).toBe(owner);
    expect(attestation).not.toBeNull();
    if (!attestation) throw new Error("isolated shop attestation missing");
    const record = owner.readBinding(attestation.proof);
    expect(record).toMatchObject({ baseline: "complete", binding: { projectId: anchor.projectId, ownerKey: anchor.ownerKey, continuationKey: anchor.continuationKey, coverageEpoch: anchor.coverageEpoch } });
    expect(record?.binding.resourceKeys).toEqual([expect.stringMatching(/^isolated\.shop\./)]);
    expect(owner.attest(anchor)?.proof).toBe(attestation.proof);
    expect(owner.readBinding({ ...attestation.proof })).toBeNull();
    expect(new ShopScopeOwner({ cart: ["dish-soap"], tab: START }).readBinding(attestation.proof)).toBeNull();
    owner.close();
    expect(owner.readBinding(attestation.proof)).toBeNull();
    expect(owner.attest(anchor)).toBeNull();
  });

  it("declines foreign, copied and rejected native outcomes without an original shop receipt", () => {
    const domain = shop();
    const foreign: AutomationNodeExecutionResult = { status: "success", route: "success", outputs: { success: true } };
    for (const registration of domain.completions) {
      if (registration.contract !== "managed_direct_effects") throw new Error("shop completion contract missing");
      expect(registration.consumeCompletion({ invocation: Object.freeze({}), outcome: { kind: "fulfilled", value: foreign } })).toBeNull();
      expect(registration.consumeCompletion({ invocation: Object.freeze({}), outcome: { kind: "fulfilled", value: structuredClone(foreign) } })).toBeNull();
      expect(registration.consumeCompletion({ invocation: Object.freeze({}), outcome: { kind: "rejected", error: new Error("synthetic shop completion interrupted") } })).toBeNull();
    }
    expect(domain.acted).toEqual([]);
    expect(domain.site.cart).toEqual(["dish-soap"]);
    domain.scopeOwner.close();
  });

  it("authenticates only each original raw shop operation and rejects copied, swapped, repeated or failed completions", async () => {
    const domain = shop();
    try {
      const request = {
        projectId: "project.isolated", flowId: "flow.isolated", callId: "raw.go", toolId: "core.run_node",
        value: { node: GO, parameters: { to: PRODUCT } },
        permission: async () => { throw new Error("An isolated navigation must not ask lasting-act permission."); }
      };
      const first = domain.binding.executeTool(request);
      const second = domain.binding.executeTool(request);
      const firstValue = await first;
      const secondValue = await second;
      expect(domain.site.tab).toBe(PRODUCT);
      expect(domain.rawCompletion({ returned: first, outcome: { kind: "fulfilled", value: secondValue } })).toBeNull();
      expect(domain.rawCompletion({ returned: first, outcome: { kind: "fulfilled", value: structuredClone(firstValue) } })).toBeNull();
      expect(domain.rawCompletion({ returned: Promise.resolve(firstValue), outcome: { kind: "fulfilled", value: firstValue } })).toBeNull();
      expect(domain.rawCompletion({ returned: first, outcome: { kind: "fulfilled", value: firstValue } })).toMatchObject({ disposition: "settled" });
      expect(domain.rawCompletion({ returned: first, outcome: { kind: "fulfilled", value: firstValue } })).toBeNull();
      expect(domain.rawCompletion({ returned: second, outcome: { kind: "fulfilled", value: secondValue } })).toMatchObject({ disposition: "settled" });
      const failure = new Error("isolated shop permission interrupted");
      const failed = domain.binding.executeTool({ ...request, value: { node: ADD, parameters: { product: "uncommitted" } }, permission: async () => { throw failure; } });
      await expect(failed).rejects.toBe(failure);
      expect(domain.rawCompletion({ returned: failed, outcome: { kind: "rejected", error: failure } })).toBeNull();
      expect(domain.site.cart).toEqual(["dish-soap"]);
    } finally {
      domain.scopeOwner.close();
    }
  });

  it("runs each trial on the site as it stands, with the build's acts said; undoes the build asks for remove exactly its own acts, across builders; and each run starts on the loaded start page", async () => {
    const run = await twoBuilders();
    await run.build().catch(() => undefined);
    const { happened, acted, site, inputs } = run.domain;

    // Builder "first": its trial ran with its own honey still in the cart (t775), never refused for it; the act is said under
    // startedWith, by its line, and after the run both it and the trial's own add are said as left on the site.
    const first = run.seen.first;
    const firstTrial = byCall(first, "test.1");
    expect(firstTrial, JSON.stringify({ calls: first?.map(entry => entry.callId), code: firstTrial?.code, reason: firstTrial?.reason })).toMatchObject({ ok: true, verdict: "yes", entryPrepared: true, startedWith: { acts: [{ act: "act-1", call: "add.honey", stillThere: ["line honey"] }, { act: "act-2", call: "add.rye", stillThere: ["line rye-bread"] }] }, leftOnSite: [{ act: "act-1" }, { act: "act-2" }, { act: "act-3" }] });
    expect((firstTrial!.startedWith as JsonObject).acts).toHaveLength(2);
    expect(firstTrial).not.toHaveProperty("code");
    // Each run's first act is loading the start page: the trials' and the entry's alike.
    expect(firstOfRun(happened, "trial of first"), JSON.stringify(happened)).toEqual({ ranOn: expect.any(String), first: `run loads ${START}`, ended: "succeeded" });

    // The supervisor's reset, asked for before the dependent entry replays its predecessor, removed exactly the first builder's
    // acts -- its honey, its trial's oat milk, its rye bread -- and never the dish soap, before that entry ran.
    expect(acted.slice(0, 6)).toEqual(["add honey", "add rye-bread", "run add oat-milk", "remove honey", "remove oat-milk", "remove rye-bread"]);
    expect(happened.findIndex((line) => line.startsWith("entry for second"))).toBeGreaterThan(happened.indexOf("builder remove rye-bread"));

    // Builder "second": its entry, prepared from the start page, after the first's trial.
    expect(firstOfRun(happened, "entry for second"), JSON.stringify({ happened, seen: run.seen })).toEqual({ ranOn: expect.any(String), first: `run loads ${START}`, ended: "succeeded" });
    expect(happened.findIndex((line) => line.startsWith("entry for second"))).toBeGreaterThan(happened.indexOf("trial of first succeeded"));
    // It asked to undo its entry's oat milk and its own butter by naming each act: both admitted and landed, the entry's act
    // routed to the ledger that owns it.
    const second = run.seen.second;
    expect(byCall(second, "undo.entry"), JSON.stringify(second?.map((item) => item.callId))).toMatchObject({ ok: true, cart: ["dish-soap", "butter"] });
    expect(byCall(second, "undo.butter")).toMatchObject({ ok: true, cart: ["dish-soap"], resetSettlement: { settled: "act-5", actsStillOpen: [] } });
    // Its trial then started with nothing of the build on the site, so nothing is said under startedWith.
    const secondTrial = byCall(second, "test.1");
    expect(secondTrial).toMatchObject({ ok: true, verdict: "yes", entryPrepared: true });
    expect(secondTrial).not.toHaveProperty("startedWith");
    // The tab still showed the product page the undos were checked on when the trial began; the run loaded the start page itself.
    expect(firstOfRun(happened, "trial of second")).toEqual({ ranOn: PRODUCT, first: `run loads ${START}`, ended: "succeeded" });

    // Every removal was of a line this build added. Core sends no reset of its own before the ending (t775): the second trial's
    // run -- its predecessor's oat milk and its own jam -- is left on the site, said as left by that trial. The line there before
    // the build is never touched or adopted by a reset.
    expect(acted).toEqual(["add honey", "add rye-bread", "run add oat-milk", "remove honey", "remove oat-milk", "remove rye-bread", "run add oat-milk", "add butter", "remove oat-milk", "remove butter", "run add oat-milk", "run add jam"]);
    expect(secondTrial).toMatchObject({ leftOnSite: [{ act: "act-6" }, { act: "act-7" }] });
    expect(site.cart).toEqual(["dish-soap", "oat-milk", "jam"]);
    // The domain never saw `undoes`.
    expect(inputs.every((value) => !Object.prototype.hasOwnProperty.call(value, "undoes"))).toBe(true);
  });
});
