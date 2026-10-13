// The candidate build's site reset (t462) with every Core part composed as
// `service.ts` composes them: the real ledger, the real permission wrapper with
// that ledger, and the real candidate authoring loop whose library calls go
// through the wrapper. Only the domain, the model and the trial runner are
// stand-ins. The domain behaves as a real one does: it knows nothing of
// `undoes`, refuses any input key it does not take, puts every lasting act to
// the permission check first, with the opaque token of the item its control
// sits in (t475), and acts only on a yes. Its reads list the items on the page
// by the same tokens. With `rowTokens: false` its lines name no row, as a
// one-line list with no twin does on the web (t479).

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import type { AutomationStudioActionConsequence, AutomationStudioActionDeclarationRecord } from "../../action-permissions/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../llm/index.ts";
import { automationStudioFlowBootstrapActionPermissions } from "../action-permissions.ts";
import { AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, runAutomationStudioFlowCandidateAuthoringLoop, type AutomationStudioCandidateTrialPort, type AutomationStudioCandidateTrialRequest } from "../candidate/index.ts";
import { AutomationStudioSiteResetLedger } from "../site-reset/index.ts";

const definition: AutomationStudioNodeDefinition = {
  schemaVersion: "0.1", id: "domain.demo.inspect", version: "1.0.0", label: "Inspect", description: "Inspect one value", category: "action",
  source: { kind: "importer", domainId: "demo", implementationKey: "inspect" }, availability: { kind: "domain", domainId: "demo" }, capabilities: { executable: true },
  inputs: [{ id: "in", label: "In", valueType: "any" }], outputs: [{ id: "success", label: "Success", valueType: "any" }],
  parameters: [{ id: "text", label: "Text", valueType: "string", required: true }]
};
const registry = new AutomationStudioNodeRegistry([definition]);
const resolution = { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [], permissions: [] };
const plan: JsonObject = { summary: "Inspect", plan: { schemaVersion: "0.1", router: { name: "Inspect", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } }, subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: [
  { key: "first", definitionId: definition.id, definitionVersion: definition.version, parameters: { text: "value" } }
], edges: [] }] } };
const arrival: JsonObject = { node: "demo.go", parameters: { to: "start" }, consequences: [] };
const runNode: AutomationStudioLlmEvidenceTool = {
  toolId: "core.run_node", description: "Run a node.", effect: "mutate", perCallEffect: true,
  inputSchema: { type: "object", properties: { node: { type: "string" }, parameters: { type: "object" }, consequences: { type: "array" } } },
  initialObservation: { input: { node: "demo.look", parameters: {}, consequences: [] }, arrival }
};

/** The only keys the stand-in domain takes on a call, as a real domain's input schema would. */
const DOMAIN_KEYS = ["node", "parameters", "consequences"];
/** The control each node presses; every name is shown to the model by the opening look. */
const CONTROLS: Readonly<Record<string, string>> = { "demo.add": "Add", "demo.remove": "Remove", "demo.edit": "Edit", "demo.confirm": "Confirm", "demo.decline": "Delete" };
/** The site's one page. */
const PAGE = "https://site.test/page";

type Entry = { callId: string; toolId: string; value: unknown };
type Step = (evidence: readonly Entry[]) => JsonObject;
type Decision = Awaited<ReturnType<Parameters<typeof runAutomationStudioFlowCandidateAuthoringLoop>[0]["loop"]["decide"]>>;
type Verdict = { permitted: boolean; missing?: readonly string[]; requestId?: string | null };
type Site = { lines: string[]; requests: Record<string, "pending" | "accepted" | "removed">; title: string; next: number; badge: number };

const latestOf = (toolId: string, evidence: readonly Entry[]) => [...evidence].reverse().find((entry) => entry.toolId === toolId)?.value as JsonObject | undefined;
const receipt = (evidence: readonly Entry[]) => {
  const value = latestOf("core.submit_candidate", evidence)!;
  return { revision: value.revision as number, digest: value.digest as string };
};
const node = (callId: string, name: string, consequences: AutomationStudioActionConsequence[], extra: JsonObject = {}): Step => () => ({ kind: "tool_call", toolId: "core.run_node", callId, input: { node: name, parameters: {}, consequences, ...extra } });
/** Adds a new line to the list, with the page's own Add button (in no item). */
const add = (callId: string, extra: JsonObject = {}) => node(callId, "demo.add", ["create_new"], extra);
/** Renames the page: a lasting change on a control in no item. */
const edit = (callId: string) => node(callId, "demo.edit", ["modify_existing"]);
/** Removes one line by its own Remove button, which sits in that line. */
const remove = (callId: string, line: string, undoes?: string) => node(callId, "demo.remove", ["delete"], { parameters: { line }, ...(undoes ? { undoes } : {}) });
/** The same Remove, declared with other classes, as the model may declare it (lane B round 11 declared `modify_existing`). */
const removeAs = (callId: string, line: string, consequences: AutomationStudioActionConsequence[], undoes?: string) => node(callId, "demo.remove", consequences, { parameters: { line }, ...(undoes ? { undoes } : {}) });
/** An add whose line lands on another page, as an Add to cart on a product page does: here only a badge changes. */
const addElsewhere = (callId: string) => node(callId, "demo.add", ["create_new"], { parameters: { elsewhere: true } });
/** Confirms one request by the Confirm button in its row. */
const confirm = (callId: string, row: string) => node(callId, "demo.confirm", ["modify_existing"], { parameters: { row } });
/** The Delete button in one request's row. */
const decline = (callId: string, row: string, consequences: AutomationStudioActionConsequence[], undoes?: string) => node(callId, "demo.decline", consequences, { parameters: { row }, ...(undoes ? { undoes } : {}) });
const submit = (callId: string): Step => () => ({ kind: "tool_call", toolId: "core.submit_candidate", callId, input: plan });
const test = (callId: string, cannotUndo?: string[]): Step => (evidence) => ({ kind: "tool_call", toolId: AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, callId, input: { ...receipt(evidence), ...(cannotUndo ? { cannotUndo } : {}) } });

/** What the stand-in domain reads of the page: its lines, and the item tokens its declarations use. */
function view(site: Site, rowTokens: boolean): { lines: string[]; items: string[] } {
  const rows = Object.entries(site.requests);
  return {
    lines: [`title ${site.title}`, `badge ${site.badge}`, ...site.lines.map((line) => `line ${line}`), ...rows.map(([row, status]) => `request ${row} ${status}`)],
    items: [...(rowTokens ? site.lines.map((line) => `line:${line}`) : []), ...rows.filter(([, status]) => status !== "removed").map(([row]) => `row:${row}`)]
  };
}

/** A site with a line that was there before the build and four pending requests, behind the real ledger and permission wrapper. */
function build(rowTokens = true) {
  const site: Site = { lines: ["before"], requests: { tom: "pending", amara: "pending", lin: "pending", marta: "pending" }, title: "Home", next: 1, badge: 0 };
  const state = { site, inputs: [] as JsonObject[], acted: [] as string[], said: [] as string[] };
  const ledger = new AutomationStudioSiteResetLedger();
  let requests = 0;
  const wrapper = automationStudioFlowBootstrapActionPermissions({
    permittedConsequences: [],
    instructionIds: ["instruction.one"],
    authoringMode: "candidate",
    siteReset: ledger,
    newRequestId: () => `permission-request:${++requests}`,
    deriveInstructed: async () => [],
    say: async (text) => { state.said.push(text); },
    executeTool: async (call) => {
      state.inputs.push(structuredClone(call.value));
      const unknown = Object.keys(call.value).filter((key) => !DOMAIN_KEYS.includes(key));
      if (unknown.length) return { kind: "llm_evidence_tool_execution", effectApplied: false, evidence: { ok: false, code: "input.unknown_keys", keys: unknown } };
      const name = String(call.value.node);
      const parameters = (call.value.parameters ?? {}) as JsonObject;
      const consequences = (call.value.consequences ?? []) as AutomationStudioActionConsequence[];
      const item = typeof parameters.line === "string" ? (rowTokens ? `line:${parameters.line}` : undefined) : typeof parameters.row === "string" ? `row:${parameters.row}` : undefined;
      // As the web domain does, every call that declares (an empty list too) is put to the gate, with what the node does to the page and where its control sits.
      if (Array.isArray(call.value.consequences)) {
        const verdict = await call.permission!({ consequences, control: { name: CONTROLS[name] ?? name, kind: "button", ...(item ? { item } : {}) }, verb: "press", effect: name === "demo.look" ? "observe" : "mutate" }) as Verdict;
        if (!verdict.permitted) return { kind: "llm_evidence_tool_execution", effectApplied: false, evidence: { ok: false, code: "permission_required", missing: [...(verdict.missing ?? [])], requestId: verdict.requestId ?? null } };
      }
      state.acted.push(name);
      if (name === "demo.add" && parameters.elsewhere === true) site.badge += 1;
      else if (name === "demo.add" && parameters.broken !== true) site.lines.push(`added-${site.next++}`);
      if (name === "demo.remove") site.lines = site.lines.filter((line) => line !== parameters.line);
      if (name === "demo.edit") site.title = "Renamed";
      if (name === "demo.confirm") site.requests[String(parameters.row)] = "accepted";
      if (name === "demo.decline") site.requests[String(parameters.row)] = "removed";
      return { kind: "llm_evidence_tool_execution", effectApplied: name !== "demo.look", evidence: { ok: true, lines: [...site.lines], requests: { ...site.requests }, controls: Object.values(CONTROLS) } };
    }
  });
  const binding = {
    startState: async (input: { start?: JsonObject }) => {
      const now = view(site, rowTokens);
      const was = Array.isArray(input.start?.lines) ? (input.start!.lines as string[]) : undefined;
      const gone = was ? was.filter((line) => !now.lines.includes(line)) : [];
      const added = was ? now.lines.filter((line) => !was.includes(line)) : [];
      return { state: { lines: now.lines }, differs: [...gone.map((line) => `gone: ${line}`), ...added.map((line) => `new: ${line}`)], location: PAGE, lines: { gone, added }, items: now.items };
    },
    runsNodes: { arrival: { node: "demo.go", parameter: "to" }, runnable: ["demo.go"] }
  };
  return { state, ledger, wrapper, binding };
}

/**
 * The trial runner: each trial adds one line through the Flow's own step, and reports that act. With `hook`, its start
 * hook puts the site back first; with `gap`, it leaves the title as it finds it, as content a look after it would still
 * see -- a rotating carousel, a cover the runtime closed -- leaves a difference no undo is for.
 */
function portOf(asked: AutomationStudioCandidateTrialRequest[], site: Site, hook?: { put: Site; ran: number; gap: boolean }): AutomationStudioCandidateTrialPort {
  const port: AutomationStudioCandidateTrialPort = async (request) => {
    asked.push(request);
    site.lines.push(`trial-${asked.length}`);
    return { revision: request.revision, digest: request.digest, verdict: "unsure", feedback: { said: "unsure" }, trialRunId: `trial.${asked.length}`, acts: [{ step: 1, definitionId: definition.id, label: "Inspect", consequences: ["create_new"] }] };
  };
  if (hook) {
    port.prepareStart = async () => {
      hook.ran += 1;
      site.lines = [...hook.put.lines];
      site.requests = { ...hook.put.requests };
      if (!hook.gap) site.title = hook.put.title;
      site.badge = hook.put.badge;
      return "reset";
    };
  }
  return port;
}

async function run(steps: Step[], options: { hook?: boolean; gap?: boolean; rowTokens?: boolean } = {}) {
  const built = build(options.rowTokens ?? true);
  const asked: AutomationStudioCandidateTrialRequest[] = [];
  const seen: Entry[][] = [];
  const hook = options.hook ? { put: structuredClone(built.state.site), ran: 0, gap: options.gap === true } : undefined;
  let index = 0;
  const outcome = await runAutomationStudioFlowCandidateAuthoringLoop({
    submission: { projectId: "project.test", flowId: "flow.test", registry, resolution, baseDependencyDigest: "accepted.base", binding: built.binding },
    trial: { candidateId: "candidate.reset", port: portOf(asked, built.state.site, hook) },
    siteReset: built.ledger,
    siteResetSettleMs: 0,
    loop: {
      tools: [runNode], maxIterations: steps.length, maxToolCalls: steps.length + 2,
      unusableDecisions: { maxConsecutive: steps.length, maxInARow: steps.length, stalled: () => new Error("stalled") },
      executeTool: built.wrapper.executeTool,
      decide: async ({ evidence }) => {
        seen.push(evidence.map((entry) => ({ ...entry })));
        const step = steps[index++];
        if (!step) throw new Error("script exhausted");
        return step(evidence) as unknown as Decision;
      }
    }
  }).catch((error: unknown) => ({ error }));
  return { ...built, outcome, seen, asked, hook };
}

const undoRecords = (records: readonly AutomationStudioActionDeclarationRecord[]) => records.filter((record) => record.undoes !== undefined);

describe("a candidate build puts the site back before each trial, through the real ledger, wrapper and loop", () => {
  it("refuses the first test while the explored add is in place, and runs no trial", async () => {
    const { seen, asked, state } = await run([add("call.add"), submit("call.submit"), test("call.test"), submit("call.again")]);
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[3]!)).toMatchObject({
      ok: false, code: "candidate.trial_reset_required",
      actsToUndo: [{ act: "act-1", did: "press \"Add\" button", call: "call.add", stillThere: ["line added-1"] }]
    });
    expect(asked).toHaveLength(0);
    expect(state.site.lines).toEqual(["before", "added-1"]);
  });

  it("removes the line the act created by naming it: the domain never sees `undoes`, the delete is not asked about, and the trial then runs", async () => {
    const { seen, asked, state, wrapper } = await run([add("call.add"), submit("call.submit"), test("call.test.1"), remove("call.undo", "added-1", "act-1"), test("call.test.2"), submit("call.again")]);
    expect(latestOf("core.run_node", seen[4]!)).toMatchObject({ ok: true, lines: ["before"] });
    expect(state.inputs.every((value) => !Object.prototype.hasOwnProperty.call(value, "undoes"))).toBe(true);
    expect(wrapper.request()).toBeUndefined();
    expect(undoRecords(wrapper.declarations())).toEqual([expect.objectContaining({ consequences: ["delete"], permitted: true, undoes: "act-1", control: { name: "Remove", kind: "button" } })]);
    const ran = latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[5]!)!;
    expect(ran).toMatchObject({ verdict: "unsure", trialRunId: "trial.1" });
    expect(ran.startedWith).toBeUndefined();
    expect(ran.leftOnSite).toEqual([{ act: "act-2", did: "trial step 1 \"Inspect\"" }]);
    expect(asked).toHaveLength(1);
  });

  // Lane B round 10 (`run-mv5tusj4-b7ee0630`): the reset removed the line the cart held before the build began, twice,
  // unasked, under the acts of two adds. The safety rule (t475): the reset can only ever remove the line the build added.
  it("never removes the line that was there before the build: under the add's act it is refused unrun, and the act is kept", async () => {
    const { seen, asked, state, wrapper } = await run([
      add("call.add"), submit("call.submit"), test("call.test.1"), remove("call.undo.before", "before", "act-1"), test("call.test.2"), submit("call.again")
    ]);
    const refused = latestOf("core.run_node", seen[4]!)!;
    expect(refused).toMatchObject({ ok: false, code: "candidate.undo_wrong_target", act: "act-1", cannotUndo: [{ act: "act-1" }] });
    expect(String(refused.instruction)).toContain("never acts on another item");
    expect(state.acted).not.toContain("demo.remove");
    expect(wrapper.request()).toBeUndefined();
    expect(undoRecords(wrapper.declarations())).toEqual([]);
    // The act is kept at that first refusal: the next test runs the trial with it in place, and says so.
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[5]!)).toMatchObject({ verdict: "unsure", trialRunId: "trial.1", startedWith: { cannotUndo: [{ act: "act-1" }] } });
    expect(asked).toHaveLength(1);
    expect(state.site.lines).toEqual(["before", "added-1", "trial-1"]);
  });

  it("removes the added line unasked once, then refuses the earlier line named under the same act, and asks about it named under none", async () => {
    const { seen, state, wrapper } = await run([
      add("call.add"), submit("call.submit"), test("call.test.1"), remove("call.undo", "added-1", "act-1"), remove("call.undo.again", "before", "act-1"),
      remove("call.remove.before", "before"), submit("call.again")
    ]);
    expect(latestOf("core.run_node", seen[4]!)).toMatchObject({ ok: true, lines: ["before"] });
    expect(latestOf("core.run_node", seen[5]!)).toMatchObject({ ok: false, code: "candidate.undo_already_done", act: "act-1", undoneBy: "call.undo" });
    expect(latestOf("core.run_node", seen[6]!)).toMatchObject({ ok: false, code: "permission_required", missing: ["delete"], requestId: "permission-request:1" });
    expect(wrapper.request()).toMatchObject({ missing: ["delete"] });
    expect(state.site.lines).toEqual(["before"]);
  });

  it("refuses unrun a removal under an act that only changed something on a control in no item, and keeps that act", async () => {
    const { seen, state, wrapper } = await run([edit("call.edit"), remove("call.remove", "before", "act-1"), submit("call.submit")]);
    expect(latestOf("core.run_node", seen[2]!)).toMatchObject({ ok: false, code: "candidate.undo_wrong_target", act: "act-1" });
    expect(state.inputs.every((value) => !Object.prototype.hasOwnProperty.call(value, "undoes"))).toBe(true);
    expect(wrapper.request()).toBeUndefined();
    expect(state.acted).toContain("demo.edit");
    expect(state.acted).not.toContain("demo.remove");
    expect(undoRecords(wrapper.declarations())).toEqual([]);
  });

  it("records no act for an add whose page shows nothing new, so the trial runs without asking for an undo", async () => {
    const { seen, asked } = await run([add("call.add", { parameters: { broken: true } }), submit("call.submit"), test("call.test"), submit("call.again")]);
    const ran = latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[3]!)!;
    expect(ran).toMatchObject({ verdict: "unsure", trialRunId: "trial.1" });
    expect(ran.startedWith).toBeUndefined();
    expect(asked).toHaveLength(1);
  });

  it("keeps a trial's own act when the model aims its undo at a line it cannot be tied to, and runs the next trial with it", async () => {
    const { seen, asked, state } = await run([
      add("call.add"), submit("call.submit"), test("call.test.1"), remove("call.undo.1", "added-1", "act-1"), test("call.test.2"),
      test("call.test.3"), remove("call.undo.2", "trial-1", "act-2"), test("call.test.4"), submit("call.again")
    ]);
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[5]!)).toMatchObject({ trialRunId: "trial.1" });
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[6]!)).toMatchObject({ ok: false, code: "candidate.trial_reset_required", actsToUndo: [{ act: "act-2", did: "trial step 1 \"Inspect\"" }] });
    // A trial's act has no item of its own Core can tie a control to: refused unrun, and kept.
    expect(latestOf("core.run_node", seen[7]!)).toMatchObject({ ok: false, code: "candidate.undo_wrong_target", act: "act-2" });
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[8]!)).toMatchObject({ verdict: "unsure", trialRunId: "trial.2", startedWith: { cannotUndo: [{ act: "act-2" }] } });
    expect(asked).toHaveLength(2);
    expect(state.site.lines).toEqual(["before", "trial-1", "trial-2"]);
  });

  // Lane D round 10 (`run-mv5tusge-1400ddf7`, `run-mv5upw4g-2482be12`): requests confirmed while exploring; no control
  // takes a confirmation back, and the model aimed Delete and Confirm at another request's row under `undoes`.
  it("lane D: two confirms no control reverses; an undo on another row is refused unrun, and the trial runs with both kept", async () => {
    const { seen, asked, state, wrapper, outcome } = await run([
      confirm("call.confirm.1", "amara"), confirm("call.confirm.2", "lin"), submit("call.submit"), test("call.test.1"),
      decline("call.undo.tom", "tom", ["delete"], "act-1"), decline("call.undo.marta", "marta", [], "act-2"),
      test("call.test.2"), submit("call.again")
    ]);
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[4]!)).toMatchObject({ code: "candidate.trial_reset_required", actsToUndo: [{ act: "act-1" }, { act: "act-2" }] });
    expect(latestOf("core.run_node", seen[5]!)).toMatchObject({ ok: false, code: "candidate.undo_wrong_target", act: "act-1" });
    // Declaring nothing lasting does not make another row's control an undo either.
    expect(latestOf("core.run_node", seen[6]!)).toMatchObject({ ok: false, code: "candidate.undo_wrong_target", act: "act-2" });
    expect(state.site.requests).toEqual({ tom: "pending", amara: "accepted", lin: "accepted", marta: "pending" });
    expect(wrapper.request()).toBeUndefined();
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[7]!)).toMatchObject({ verdict: "unsure", trialRunId: "trial.1", startedWith: { cannotUndo: [{ act: "act-1" }, { act: "act-2" }] } });
    expect(asked).toHaveLength(1);
    // The build went on: every scripted decision was asked for, and nothing ended it on the refusals.
    expect(seen).toHaveLength(8);
    expect(outcome).toMatchObject({ loop: { code: "llm_evidence_loop.iteration_limit" } });
  });

  it("lane D: an undo on the act's own row is admitted but removes nothing unasked; refused, the act is kept and the model is told plainly", async () => {
    const { seen, asked, state, wrapper } = await run([
      confirm("call.confirm", "amara"), submit("call.submit"), test("call.test.1"), decline("call.undo", "amara", ["delete"], "act-1"), test("call.test.2"), submit("call.again")
    ]);
    const refused = latestOf("core.run_node", seen[4]!)!;
    expect(refused).toMatchObject({ ok: false, code: "candidate.undo_refused", act: "act-1", refusal: { code: "permission_required", missing: ["delete"] } });
    expect(String(refused.instruction)).toContain("this act stays as it is");
    expect(wrapper.request()?.missing).toEqual(["delete"]);
    expect(state.site.requests.amara).toBe("accepted");
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[5]!)).toMatchObject({ verdict: "unsure", startedWith: { cannotUndo: [{ act: "act-1" }] } });
    expect(asked).toHaveLength(1);
  });

  // Lane D round 10 (`run-mv5tusge-1400ddf7`): with the Lab's fixture reset, the gate still asked the model to undo,
  // eight calls, and the hook then put the site back anyway. The hook now runs first, and the check after it is clean.
  it("runs the deployment's start hook before the check, so a clean start is confirmed with no undo asked of the model", async () => {
    const { seen, asked, state, hook } = await run([
      confirm("call.confirm", "amara"), add("call.add"), submit("call.submit"), test("call.test.1"), test("call.test.2"), submit("call.again")
    ], { hook: true });
    const first = latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[4]!)!;
    expect(first).toMatchObject({ verdict: "unsure", trialRunId: "trial.1" });
    expect(first.startedWith).toBeUndefined();
    // The trial's own act is gone once the hook runs again, so the second test runs too.
    const second = latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[5]!)!;
    expect(second).toMatchObject({ verdict: "unsure", trialRunId: "trial.2" });
    expect(second.startedWith).toBeUndefined();
    expect(asked).toHaveLength(2);
    expect(hook?.ran).toBe(2);
    expect(state.site.lines).toEqual(["before", "trial-2"]);
  });

  // Lane B round 11 (`run-mv5yaapd-ad19eaae`): the add sat in no row and its line landed on another page; the cart's
  // only line, the soap from before the build, named no row either, and two missing items compared equal. The reset
  // pressed Remove on the soap, declared `modify_existing`, unasked. The rule (t479): no positive match, no press.
  it("B shape: a one-line cart whose line names no row; the reset can never remove the line that was there before the build", async () => {
    for (const consequences of [["modify_existing"], ["delete"]] as AutomationStudioActionConsequence[][]) {
      const { seen, asked, state, wrapper } = await run([
        addElsewhere("call.add"), submit("call.submit"), test("call.test.1"), removeAs("call.undo.soap", "before", consequences, "act-1"), test("call.test.2"), submit("call.again")
      ], { rowTokens: false });
      expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[3]!)).toMatchObject({ code: "candidate.trial_reset_required", actsToUndo: [{ act: "act-1" }] });
      expect(latestOf("core.run_node", seen[4]!)).toMatchObject({ ok: false, code: "candidate.undo_wrong_target", act: "act-1", cannotUndo: [{ act: "act-1" }] });
      expect(state.acted).not.toContain("demo.remove");
      expect(wrapper.request()).toBeUndefined();
      expect(undoRecords(wrapper.declarations())).toEqual([]);
      // No positively identified reverse: the act is kept, the trial runs with it, and the line from before is there.
      expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[5]!)).toMatchObject({ verdict: "unsure", trialRunId: "trial.1", startedWith: { cannotUndo: [{ act: "act-1" }] } });
      expect(asked).toHaveLength(1);
      expect(state.site.lines).toEqual(["before", "trial-1"]);
    }
  });

  it("B shape, two lines that name no row: neither line is removed, the added one included, since neither can be told apart", async () => {
    const { seen, state } = await run([
      add("call.add"), submit("call.submit"), test("call.test.1"), removeAs("call.undo", "added-1", ["modify_existing"], "act-1"), test("call.test.2"), submit("call.again")
    ], { rowTokens: false });
    expect(latestOf("core.run_node", seen[4]!)).toMatchObject({ ok: false, code: "candidate.undo_wrong_target", act: "act-1" });
    expect(state.acted).not.toContain("demo.remove");
    expect(latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[5]!)).toMatchObject({ trialRunId: "trial.1", startedWith: { cannotUndo: [{ act: "act-1" }] } });
    expect(state.site.lines).toEqual(["before", "added-1", "trial-1"]);
  });

  it("a two-line cart with row tokens: the reset removes only the line the act added, and the trial starts clean", async () => {
    const { seen, asked, state, wrapper } = await run([
      add("call.add"), submit("call.submit"), test("call.test.1"), removeAs("call.undo", "added-1", ["modify_existing"], "act-1"), test("call.test.2"), submit("call.again")
    ]);
    expect(latestOf("core.run_node", seen[4]!)).toMatchObject({ ok: true, lines: ["before"] });
    expect(wrapper.request()).toBeUndefined();
    const ran = latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[5]!)!;
    expect(ran).toMatchObject({ verdict: "unsure", trialRunId: "trial.1" });
    expect(ran.startedWith).toBeUndefined();
    expect(asked).toHaveLength(1);
    expect(state.site.lines).toEqual(["before", "trial-1"]);
  });

  // Lane B round 11 (`run-mv5yaapd-ad19eaae`): after the hook, a look on each act's own page still saw a rotating
  // carousel and a chat card's cover, so the model was asked to undo two acts -- ten calls -- and removed the soap.
  it("hook first: a look after it would still see a difference, yet the model is asked to undo nothing (t479)", async () => {
    const { seen, asked, state, hook } = await run([
      edit("call.edit"), addElsewhere("call.add"), submit("call.submit"), test("call.test.1"), test("call.test.2"), submit("call.again")
    ], { hook: true, gap: true, rowTokens: false });
    for (const [index, trialRunId] of [[4, "trial.1"], [5, "trial.2"]] as const) {
      const ran = latestOf(AUTOMATION_STUDIO_CANDIDATE_TEST_TOOL_ID, seen[index]!)!;
      expect(ran).toMatchObject({ verdict: "unsure", trialRunId });
      expect(ran.startedWith).toBeUndefined();
    }
    expect(seen.flat().some((entry) => JSON.stringify(entry.value).includes("candidate.trial_reset_required"))).toBe(false);
    expect(state.acted).not.toContain("demo.remove");
    expect(hook?.ran).toBe(2);
    expect(asked).toHaveLength(2);
    // The gap the hook left is still there, and nothing of the build's was pressed to "undo" it.
    expect(state.site.title).toBe("Renamed");
    expect(state.site.lines).toEqual(["before", "trial-2"]);
  });

  it("raises no cross-check finding for the undo records", async () => {
    const { wrapper, state } = await run([add("call.add"), submit("call.submit"), test("call.test.1"), remove("call.undo", "added-1", "act-1"), test("call.test.2"), submit("call.again")]);
    const others = wrapper.declarations().filter((record) => record.undoes === undefined);
    expect(undoRecords(wrapper.declarations())).toHaveLength(1);
    const crossCheck = await wrapper.crossCheck();
    expect(crossCheck).toMatchObject({ declared: ["create_new"], undeclared: [], actions: others.length });
    expect(crossCheck?.verdict).not.toBe("undeclared");
    expect(crossCheck?.declared).not.toContain("delete");
    expect(state.said).toEqual([]);
  });
});
