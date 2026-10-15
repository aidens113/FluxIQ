// A builder's subflow trial puts the site back first, through the actual
// service (t578; A8 bigbox debug, cause A and fix 2): a scripted model plays
// the supervisor and two builders over a stub shop with no start hook. The
// cart held dish soap before the build.
//
// 1. Builder "first" adds oat milk and leaves the tab on another page. Its
//    first trial is refused until that act is undone; it undoes it through the
//    site's own control, naming the act under `undoes`, and its next trial
//    starts by loading the build's start page. After the yes it adds rye
//    bread, and completes.
// 2. Builder "second" runs after it. Its entry is prepared from the start
//    page. It adds jam; its first trial is refused naming both builders'
//    acts -- the rye bread "first" left, and its own jam -- and it undoes
//    both, the first one routed to the ledger that owns it. Its next trial
//    begins with the tab on the product page the undos were checked on, and
//    its run loads the start page itself, on the site as the build found it.
// 3. Each part asks a lasting act, so each subflow adds its own product, the
//    act declared as a real script must (t597). Every run of it -- a trial,
//    the second's entry -- leaves that add too, named as a trial step. Such an
//    act names no cart line, so the site offers no control this build may
//    take it back with: the second builder names them under `cannotUndo`, and
//    Core's reset before the ending says the same of the last trial's.
//
// Every run -- both trials and the entry -- loads the start page first, through
// the domain's arrival node, which declares a fixed output action as the web
// domain's does. The supervisor's whole trial is covered beside this, unchanged
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
// for it before removing its directory (`./settled-builds.ts`).

import { mkdtemp } from "node:fs/promises";
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
import { automationStudioTestDeclaredStepResolution } from "./declared-step-resolution.ts";
import { automationStudioTestSettledBuilds } from "./settled-builds.ts";

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
    ? [run("go.product", GO, { to: PRODUCT }, []), run("add.oat", ADD, { product: "oat-milk" }, ["create_new"]), run("go.away", GO, { to: ELSEWHERE }, []), submit, test("test.1"), run("undo.oat", REMOVE, { line: "oat-milk" }, ["delete"], "act-1"), test("test.2"),
      run("go.product.2", GO, { to: PRODUCT }, []), run("add.rye", ADD, { product: "rye-bread" }, ["create_new"])]
    : [run("go.product", GO, { to: PRODUCT }, []), run("add.jam", ADD, { product: "jam" }, ["create_new"]), submit, test("test.1"), run("undo.rye", REMOVE, { line: "rye-bread" }, ["delete"], "act-3"), run("undo.jam", REMOVE, { line: "jam" }, ["delete"], "act-5"), test("test.2", ["act-2", "act-4"])];
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
  const happened: string[] = [];
  const acted: string[] = [];
  const inputs: JsonObject[] = [];
  const nodes = [
    shopNode(ADD, "Add to cart", [{ id: "product", label: "Product", valueType: "string", required: true }]),
    shopNode(REMOVE, "Remove cart line", [{ id: "line", label: "Line", valueType: "string", required: true }]),
    shopNode(GO, "Go to page", [{ id: "to", label: "To", valueType: "string", required: true }])
  ];
  // What a Flow's run does: the arrival loads the page, and a part's add puts its product in the cart, as the builder's own add does.
  const runtime = new AutomationStudioNativeNodeRuntime({ permissions: [], runtimeCapabilities: ["example.actions"] }).register(
    { schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: "example.shop", packageVersion: "1.0.0", domainId: "example", nodes },
    { packageId: "example.shop", packageVersion: "1.0.0", implementations: Object.fromEntries(nodes.map((definition) => [definition.id, ({ parameters }: { parameters: Readonly<Record<string, unknown>> }) => {
      if (definition.id === GO) {
        site.tab = String(parameters.to);
        happened.push(`run loads ${site.tab}`);
      } else if (definition.id === ADD) {
        site.cart.push(String(parameters.product));
        acted.push(`run add ${String(parameters.product)}`);
        happened.push(`run adds ${String(parameters.product)}`);
      }
      return { status: "success" as const, route: "success", outputs: { success: true } };
    }])) }
  );
  const read = () => ({ lines: site.cart.map((line) => `line ${line}`), items: site.cart.map((line) => `line:${line}`) });
  const binding: AutomationStudioLlmEvidenceRuntimeBinding = {
    domainId: "example",
    deniedEvidenceKeys: [],
    tools: [{ toolId: "shop.look", description: "Look at the page.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }],
    runsNodes: { arrival: { node: GO, parameter: "to" } },
    resolvePlanNodeParameters: automationStudioTestDeclaredStepResolution,
    startState: async (input: { start?: JsonObject }) => {
      const now = read();
      const was = Array.isArray(input.start?.lines) ? (input.start!.lines as string[]) : undefined;
      const gone = was ? was.filter((line) => !now.lines.includes(line)) : [];
      const added = was ? now.lines.filter((line) => !was.includes(line)) : [];
      return { state: { lines: now.lines }, differs: [...gone.map((line) => `gone: ${line}`), ...added.map((line) => `new: ${line}`)], location: site.tab, lines: { gone, added }, items: now.items };
    },
    executeTool: async ({ toolId, value, permission }) => {
      inputs.push(structuredClone(value));
      if (toolId === "shop.look") return { kind: "llm_evidence_tool_execution", evidence: { page: site.tab, cart: [...site.cart] }, effectApplied: false };
      const parameters = (value.parameters ?? {}) as JsonObject;
      if (value.node === GO) {
        site.tab = String(parameters.to);
        return { kind: "llm_evidence_tool_execution", evidence: { ok: true, at: site.tab }, effectApplied: true };
      }
      const line = typeof parameters.line === "string" ? parameters.line : undefined;
      const consequences = (Array.isArray(value.consequences) ? value.consequences : []) as AutomationStudioActionConsequence[];
      const declaration: AutomationStudioActionDeclaration = { consequences, control: { name: value.node === ADD ? "Add to cart" : "Remove", kind: "button", ...(line ? { item: `line:${line}` } : {}) }, verb: "press", effect: "mutate" };
      const verdict = await permission!(declaration);
      if (!verdict.permitted) return { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "permission_required" }, effectApplied: false };
      if (value.node === ADD) {
        site.cart.push(String(parameters.product));
        acted.push(`add ${String(parameters.product)}`);
      } else if (line) {
        site.cart.splice(site.cart.indexOf(line), 1);
        acted.push(`remove ${line}`);
      }
      happened.push(`builder ${acted.at(-1)}`);
      return { kind: "llm_evidence_tool_execution", evidence: { ok: true, cart: [...site.cart] }, effectApplied: true };
    }
  };
  return { site, happened, acted, inputs, binding, runtime };
}

async function twoBuilders() {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-project-build-trial-reset-"));
  const domain = shop();
  /** Each builder's evidence at its latest decision. */
  const seen: Record<string, Entry[]> = {};
  let supervisorDecisions = 0;
  const provider = mockProvider(async (request) => {
    if (request.metadata?.source === "instructionAuthority") return decision({ kind: "tool_call", callId: "read", toolId: "none", input: {} });
    if (request.taskKind === "loop_verification") return judgeReply("yes");
    const loop = request.context.evidenceLoop!;
    const evidence = loop.evidence as Entry[];
    const tools = loop.tools.map((tool) => tool.toolId);
    if (!tools.length) return decision({ kind: "tool_call", callId: "read", toolId: "none", input: {} });
    if (tools.includes("project.write_plan")) {
      supervisorDecisions += 1;
      if (supervisorDecisions === 1) return decision({ kind: "tool_call", callId: "plan", toolId: "project.write_plan", input: PLAN });
      if (supervisorDecisions === 2) return decision({ kind: "tool_call", callId: "dispatch", toolId: "project.dispatch", input: { reason: "Build each subflow.", briefs: [brief("first", ["p1"], []), brief("second", ["p2"], ["first"])] } });
      return decision({ kind: "complete", result: { ended: "partial", reason: "Only the builders were under test." } });
    }
    const properties = (loop.completionSchema.properties ?? {}) as JsonObject;
    if (properties.subflowKey === undefined) {
      // Core's reset before the ending (t597): the trials' adds name no cart line, so the site offers no control this
      // build may take them back with, and the reset says so for every act it is shown.
      const shown = [...new Set([...JSON.stringify(evidence).matchAll(/"act":"(act-\d+)"/g)].map((match) => match[1]!))];
      domain.happened.push(`reset names ${JSON.stringify(shown)}`);
      return decision({ kind: "complete", result: { summary: "The site offers no control that takes back what the trials added.", cannotUndo: shown } });
    }
    const subflowKey = (properties.subflowKey as JsonObject).const as string;
    seen[subflowKey] = evidence.map((entry) => structuredClone(entry));
    return decision(builderDecision(subflowKey, evidence));
  });
  const service = new AutomationStudioService({ dataDir, llmProviderResolver: () => ({ provider, maxCallsPerRun: 120, maxEstimatedCostUsd: 0.2 }), llmEvidenceRuntime: domain.binding });
  service.bindNativeNodeRuntime(domain.runtime);
  const builds = automationStudioTestSettledBuilds(service, dataDir);
  cleanups.push(builds.cleanup);
  const { project, flow } = await blankFixture(service, "active", "example");
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

describe("a builder's subflow trial after the build's acts (t578)", () => {
  it("undoes every act of the build, across builders, before each trial, and starts each run on the loaded start page", async () => {
    const run = await twoBuilders();
    await run.build().catch(() => undefined);
    const { happened, acted, site, inputs } = run.domain;

    // Builder "first": its trial is refused while its own add is on the site, then runs once it is undone.
    const first = run.seen.first;
    expect(byCall(first, "test.1"), JSON.stringify(first?.map((entry) => entry.callId))).toMatchObject({ ok: false, code: "candidate.trial_reset_required", actsToUndo: [{ act: "act-1" }] });
    expect(byCall(first, "undo.oat")).toMatchObject({ ok: true });
    expect(byCall(first, "test.2")).toMatchObject({ ok: true, verdict: "yes", entryPrepared: true, leftOnSite: [{ act: "act-2" }] });
    // Each run's first act is loading the start page: the trials' and the entry's alike.
    expect(firstOfRun(happened, "trial of first"), JSON.stringify(happened)).toEqual({ ranOn: expect.any(String), first: `run loads ${START}`, ended: "succeeded" });

    // Builder "second": its entry, prepared from the start page, then its trial refused naming both builders' acts.
    expect(firstOfRun(happened, "entry for second")).toEqual({ ranOn: expect.any(String), first: `run loads ${START}`, ended: "succeeded" });
    expect(happened.findIndex((line) => line.startsWith("entry for second"))).toBeGreaterThan(happened.indexOf("trial of first succeeded"));
    const second = run.seen.second;
    expect(byCall(second, "test.1"), JSON.stringify(second?.map((item) => item.callId))).toMatchObject({ ok: false, code: "candidate.trial_reset_required" });
    // act-2: the first's trial add; act-3: the rye bread "first" left; act-4: the entry's add; act-5: its own jam.
    expect((byCall(second, "test.1")!.actsToUndo as JsonObject[]).map((act) => act.act).sort()).toEqual(["act-2", "act-3", "act-4", "act-5"]);
    expect(byCall(second, "undo.rye")).toMatchObject({ ok: true });
    expect(byCall(second, "undo.jam")).toMatchObject({ ok: true });
    expect(byCall(second, "test.2")).toMatchObject({ ok: true, verdict: "yes" });
    // The tab still showed the product page the undos were checked on when the trial began; the run loaded the start page itself.
    expect(firstOfRun(happened, "trial of second")).toEqual({ ranOn: PRODUCT, first: `run loads ${START}`, ended: "succeeded" });

    // Every explored act was the build's own and undone through the site's controls; the runs' own adds were named as
    // beyond them (header, 3). The line there before the build was never touched.
    expect(acted).toEqual(["add oat-milk", "remove oat-milk", "run add oat-milk", "add rye-bread", "run add oat-milk", "add jam", "remove rye-bread", "remove jam", "run add oat-milk", "run add jam"]);
    expect(site.cart).toEqual(["dish-soap", "oat-milk", "oat-milk", "oat-milk", "jam"]);
    // The domain never saw `undoes`.
    expect(inputs.every((value) => !Object.prototype.hasOwnProperty.call(value, "undoes"))).toBe(true);
  });
});
