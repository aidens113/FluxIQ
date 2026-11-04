// @fluxiq-test-group real-sql
// Covers project-parts/run/: the real store, the real executor and frames, a host and a
// domain made of plain functions. What is asserted is what reached the domain.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RunProjectPartResponse } from "../../../../../../api-contracts/automation.ts";
import { createBlankAutomationStudioFlowArtifact, type AutomationStudioFlowArtifact, type AutomationStudioFlowSubflow, type AutomationStudioRuntimeSession } from "../../../../../../flows/authoring/model/index.ts";
import type { AutomationStudioFlowNode } from "../../../../../../flows/executable/graph/index.ts";
import type { AutomationStudioFactCondition } from "../../../../../../runtime/automation-host/contracts/index.ts";
import type { AutomationStudioHostRuntimeBoundary } from "../../../../../../runtime/automation-host/index.ts";
import { AutomationStudioProjectDatabasePool, AutomationStudioProjectPartStore } from "../../../../../persistence/automation/index.ts";
import { AutomationStudioProjectParts, saveProjectPartsOfAppliedFlow, type AutomationStudioProjectPartRunPorts, type AutomationStudioProjectPartRunRefusal, type AutomationStudioProjectPartsPorts } from "../../index.ts";
import type { AutomationStudioNativeNodeRuntime } from "../../../../../../runtime/native-nodes/index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";

type Collaborators = NonNullable<ReturnType<AutomationStudioProjectPartRunPorts["collaborators"]>>;

const PROJECT = "project.run";
const SITE = "https://shop.example";
const SEARCH = { selector: "#search" };
const PRESS = { selector: "#press" };

/** A step the domain runs: `reads` answers `found`, `press` records itself. */
function step(id: string, target: { selector: string } | undefined, consequences: string[], extra: Partial<AutomationStudioFlowNode> = {}): AutomationStudioFlowNode {
  return { id, definitionId: `custom.${id}`, definitionVersion: "1.0.0", label: "Plain step words", parameterValues: { ...(target ? { target } : {}) }, metadata: { declaredConsequences: consequences }, ...extra };
}

type GraphSeed = { key: string; nodes: AutomationStudioFlowNode[]; outputs?: boolean; inputs?: boolean };

function graphOf(seed: GraphSeed): AutomationStudioFlowArtifact {
  const blank = createBlankAutomationStudioFlowArtifact({ flowId: `graph.${seed.key}`, projectId: PROJECT, name: seed.key, now: 1, metadata: { parentFlowId: "flow.source", parentSubflowId: `subflow.${seed.key}`, subflowGraph: true } });
  const nodes = [{ id: `${seed.key}.start`, definitionId: "builtin.control.start", definitionVersion: "1.0.0", label: "Start" }, ...seed.nodes];
  return {
    ...blank,
    interface: {
      inputs: seed.inputs === false ? [] : [{ id: "query", name: "Search words", valueType: { kind: "string" }, required: true }],
      outputs: seed.outputs ? [{ id: "found", name: "How many were found", valueType: { kind: "unknown" }, metadata: { binding: { $state: { path: `${seed.key}.read.found` } } } }] : []
    },
    nodes,
    edges: nodes.slice(1).map((node, index) => ({ id: `${seed.key}.edge.${index}`, sourceNodeId: nodes[index]!.id, targetNodeId: node.id, sourcePortId: "success", targetPortId: "in" }))
  };
}

function subflowOf(key: string, name: string): AutomationStudioFlowSubflow {
  return { schemaVersion: "0.1", subflowId: `subflow.${key}`, flowId: "flow.source", projectId: PROJECT, name, description: name, role: "utility", graphFlowId: `graph.${key}`, createdAt: 1, updatedAt: 1, status: "active" } as unknown as AutomationStudioFlowSubflow;
}

/** The page: which targets are on it, and which site. Tests move it between reads. */
type Page = { origin: string; present: Set<string>; onRead?: (reads: number) => void; unknownFacts?: boolean };

function hostOf(page: Page, reads: { count: number }): AutomationStudioHostRuntimeBoundary {
  return {
    capabilities: ["fact-evaluation"],
    factEvaluator: (conditions: readonly AutomationStudioFactCondition[]) => {
      reads.count += 1;
      page.onRead?.(reads.count);
      return conditions.map((condition) => {
        if (page.unknownFacts) return { result: "unknown" as const, capturedAt: 1 };
        if (condition.fact === "url") return { result: new RegExp(String(condition.value), "u").test(`${page.origin}/page`) ? "true" as const : "false" as const, capturedAt: 1 };
        const selector = String((condition.target as { selector?: unknown }).selector);
        return { result: page.present.has(selector) ? "true" as const : "false" as const, capturedAt: 1 };
      });
    }
  };
}

type DomainStep = { status?: "success" | "failed"; effect?: "ambiguous" | "unacted"; outputs?: Record<string, unknown> };

function nativeOf(ran: string[], answers: Record<string, DomainStep | (() => DomainStep)>, seenQuery: unknown[]) {
  return {
    getRuntimeCapabilities: () => [],
    execute: async (node: AutomationStudioFlowNode, inputs: Record<string, unknown>) => {
      ran.push(node.id);
      if (node.parameterValues?.text !== undefined) seenQuery.push(node.parameterValues.text);
      const key = node.id.split(".").at(-1)!;
      const answer = answers[key];
      const made = typeof answer === "function" ? answer() : answer ?? {};
      if (made.status === "failed") return { result: { status: "failed", route: "failed", outputs: {}, message: "PAGEWORD failure", failure: { category: made.effect === "ambiguous" ? "ambiguous_or_unknown" : "action_failed", code: "domain.failed", retryable: true, stage: "execution", ...(made.effect ? { effect: made.effect } : {}) } } };
      return { result: { status: "success", route: "success", outputs: { ...(made.outputs ?? {}), given: inputs.query ?? null } } };
    },
    resolveActionEffect: () => undefined,
    resolveTargetRefresh: () => ({ kind: "none" }),
    getTargetHooks: () => ({ controlParameterKeys: new Set(["target"]) })
  };
}

describe("runProjectPart", () => {
  let rootDir = "";
  let pool: AutomationStudioProjectDatabasePool;
  let page: Page;
  let reads: { count: number };
  let ran: string[];
  let seenQuery: unknown[];
  let sessions: AutomationStudioRuntimeSession[];
  let answers: Record<string, DomainStep | (() => DomainStep)>;
  let parts: AutomationStudioProjectParts;
  let personGate: { held: number; stop?: boolean };

  const save = async (seeds: GraphSeed[], requestWords = "do what a person asked"): Promise<string> => {
    const saved = await saveProjectPartsOfAppliedFlow({
      pool, projectId: PROJECT, flowId: "flow.source", requestWords, startLocation: `${SITE}/start`,
      subflows: seeds.map((seed) => ({ subflow: subflowOf(seed.key, `Part ${seed.key.replace(/[^a-z]/gu, "")}`), graphFlow: graphOf(seed) }))
    });
    if (saved.skipped.length) throw new Error(`skipped: ${JSON.stringify(saved.skipped)}`);
    return saved.saved.at(-1)!.partId;
  };
  const runOf = async (partId: string, more: Partial<Parameters<AutomationStudioProjectParts["run"]>[0]> = {}) => await parts.run({ projectId: PROJECT, partId, inputs: { query: "shoes" }, ...more });
  const finished = (answer: RunProjectPartResponse | AutomationStudioProjectPartRunRefusal) => answer as RunProjectPartResponse;
  const refused = (answer: RunProjectPartResponse | AutomationStudioProjectPartRunRefusal) => (answer as AutomationStudioProjectPartRunRefusal).code;
  const recorded = async (partId: string) => {
    const store = await AutomationStudioProjectPartStore.open({ pool, projectId: PROJECT });
    try {
      return await store.listRuns({ partId, version: 1 });
    } finally {
      await store.close();
    }
  };

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-part-run-test-"));
    pool = new AutomationStudioProjectDatabasePool({ rootDir });
    page = { origin: SITE, present: new Set(["#search", "#press"]) };
    reads = { count: 0 };
    ran = [];
    seenQuery = [];
    sessions = [];
    answers = { read: { outputs: { found: 3 } } };
    personGate = { held: 0 };
    parts = new AutomationStudioProjectParts({
      pool,
      ports: {} as unknown as AutomationStudioProjectPartsPorts,
      run: {
        collaborators: () => ({
          catalogue: () => ({ listPublishedFlowSnapshots: async () => [], listFlowPublicationRecords: async () => [] }),
          writeRuntimeSession: async (_projectId: string, session: AutomationStudioRuntimeSession) => {
            sessions.push(structuredClone(session));
          },
          executor: () => ({ hostRuntime: hostOf(page, reads), nativeNodeRuntime: nativeOf(ran, answers, seenQuery) as unknown as AutomationStudioNativeNodeRuntime }),
          runDatasets: () => ({ available: false }) as unknown as ReturnType<Collaborators["runDatasets"]>,
          conversations: () => ({ available: false }) as unknown as ReturnType<Collaborators["conversations"]>
        }),
        openRun: () => ({ gate: { checkpoint: () => personGate.stop ? Promise.resolve({ outcome: "stop" as const, message: "Stopped by a person." }) : null }, close: () => undefined }),
        getRuntimeSession: async () => null,
        driving: { admissions: new Set(), listRuntimeSessions: async () => [] }
      }
    });
  });
  afterEach(async () => {
    await pool.closeAll();
    await rm(rootDir, { recursive: true, force: true });
  });

  it("a read part: gives its input, hands back its output by port id, at no model call, in a part run's session", async () => {
    const partId = await save([{ key: "a", outputs: true, nodes: [step("a.read", SEARCH, [], { parameterValues: { target: SEARCH, text: { $state: { path: "query" } } } })] }]);
    const answer = finished(await runOf(partId));
    expect(answer).toMatchObject({ status: "succeeded", acts: [], modelCalls: 0 });
    expect(answer.outputs).toEqual({ found: 3 });
    expect(seenQuery).toEqual(["shoes"]);
    expect(ran).toEqual(["a.read"]);
    expect(sessions.at(-1)).toMatchObject({ runId: answer.runId, status: "succeeded", metadata: { partRun: { partId, version: 1, caller: "person", outcome: "succeeded" }, inputs: { query: expect.not.stringContaining("shoes") } } });
    expect(JSON.stringify(sessions.at(-1)!.trace)).not.toContain("shoes");
    expect(await recorded(partId)).toMatchObject([{ runId: answer.runId, outcome: "succeeded", modelCalls: 0 }]);
  });

  it.each([
    ["not in the library", () => undefined, "part.not_found"],
    ["on another site", () => { page.origin = "https://elsewhere.example"; }, "part.wrong_site"],
    ["a site read as unknown", () => { page.unknownFacts = true; }, "part.wrong_site"],
    ["its first control not on the page", () => { page.present.delete("#search"); }, "part.not_at_start"]
  ])("refuses a read part %s, with no session and nothing dispatched", async (name, arrange, code) => {
    const partId = await save([{ key: "a", outputs: true, nodes: [step("a.read", SEARCH, [])] }]);
    arrange();
    const answer = await runOf(name === "not in the library" ? "part.missing" : partId);
    expect(refused(answer)).toBe(code);
    expect((answer as AutomationStudioProjectPartRunRefusal).message).not.toMatch(/search|elsewhere|shop\.example/u);
    expect(ran).toEqual([]);
    expect(sessions).toEqual([]);
    expect(await recorded(partId)).toEqual([]);
  });

  it("refuses inputs before anything runs", async () => {
    const partId = await save([{ key: "a", nodes: [step("a.read", SEARCH, [])] }]);
    expect(refused(await parts.run({ projectId: PROJECT, partId }))).toBe("part.input_missing");
    expect(refused(await parts.run({ projectId: PROJECT, partId, inputs: { query: "a", other: "b" } }))).toBe("part.input_unknown");
    expect(ran).toEqual([]);
  });

  it("a lasting part: refused unasked, refused untold, and run when both are said", async () => {
    const partId = await save([{ key: "a", nodes: [step("a.read", SEARCH, []), step("a.press", PRESS, ["create_new"])] }]);
    expect(refused(await runOf(partId))).toBe("part.act_not_allowed");
    const told = await runOf(partId, { permittedConsequences: ["create_new"] });
    expect(refused(told)).toBe("part.confirm_repeat");
    expect((told as AutomationStudioProjectPartRunRefusal).classes).toEqual(["create_new"]);
    expect(ran).toEqual([]);
    const answer = finished(await runOf(partId, { permittedConsequences: ["create_new"], acknowledgedRepeat: true }));
    expect(answer).toMatchObject({ status: "succeeded", acts: ["create_new"], modelCalls: 0 });
    expect(ran).toEqual(["a.read", "a.press"]);
  });

  it("stops before the first lasting step when its target left the page after the read before it, and nothing lasting is done", async () => {
    const partId = await save([{ key: "a", nodes: [step("a.read", SEARCH, []), step("a.press", PRESS, ["create_new"])] }]);
    answers.read = () => {
      page.present.delete("#press");
      return {};
    };
    const answer = finished(await runOf(partId, { permittedConsequences: ["create_new"], acknowledgedRepeat: true }));
    expect(answer).toMatchObject({ status: "stopped", acts: [], modelCalls: 0, stoppedAt: { stepLabel: "Plain step words", reason: expect.stringContaining("no longer on it") } });
    expect(ran).toEqual(["a.read"]);
    expect(await recorded(partId)).toMatchObject([{ outcome: "stopped" }]);
    expect(JSON.stringify(answer)).not.toContain("#press");
  });

  it.each<[string, () => void, string]>([
    ["a host that cannot answer", () => {
      answers.read = () => {
        page.unknownFacts = true;
        return {};
      };
    }, "could not be told apart"]
  ])("stops before the first lasting step on %s", async (_name, arrange, reason) => {
    const partId = await save([{ key: "a", nodes: [step("a.read", SEARCH, []), step("a.press", PRESS, ["create_new"])] }]);
    arrange();
    const answer = finished(await runOf(partId, { permittedConsequences: ["create_new"], acknowledgedRepeat: true }));
    expect(answer).toMatchObject({ status: "stopped", stoppedAt: { reason: expect.stringContaining(reason) } });
    expect(ran).toEqual(["a.read"]);
  });

  it("stops when the page is not the one the lasting step recorded", async () => {
    const recordedPage = { routeSignatures: { before: { page: "recorded" } }, declaredConsequences: ["create_new"] };
    const partId = await save([{ key: "a", nodes: [step("a.read", SEARCH, []), step("a.press", PRESS, ["create_new"], { metadata: recordedPage })] }]);
    const original = parts["dependencies"].run!.collaborators;
    parts["dependencies"].run!.collaborators = () => {
      const bound = original()!;
      return { ...bound, executor: () => ({ ...bound.executor(), hostRuntime: { ...bound.executor().hostRuntime!, capabilities: ["fact-evaluation"], observeRouteState: () => ({ page: "another" }), signRouteState: (state: JsonObject) => state } }) };
    };
    const answer = finished(await runOf(partId, { permittedConsequences: ["create_new"], acknowledgedRepeat: true }));
    expect(answer).toMatchObject({ status: "stopped", stoppedAt: { reason: expect.stringContaining("not the one this step runs on") } });
    expect(ran).toEqual(["a.read"]);
  });

  it("goes on when the page is the one the lasting step recorded", async () => {
    const recordedPage = { routeSignatures: { before: { page: "recorded" } }, declaredConsequences: ["create_new"] };
    const partId = await save([{ key: "a", nodes: [step("a.read", SEARCH, []), step("a.press", PRESS, ["create_new"], { metadata: recordedPage })] }]);
    const original = parts["dependencies"].run!.collaborators;
    parts["dependencies"].run!.collaborators = () => {
      const bound = original()!;
      return { ...bound, executor: () => ({ ...bound.executor(), hostRuntime: { ...bound.executor().hostRuntime!, capabilities: ["fact-evaluation"], observeRouteState: () => ({ page: "recorded" }), signRouteState: (state: JsonObject) => state } }) };
    };
    const answer = finished(await runOf(partId, { permittedConsequences: ["create_new"], acknowledgedRepeat: true }));
    expect(answer).toMatchObject({ status: "succeeded", acts: ["create_new"] });
  });

  it("stops at a lasting step with no target it can check", async () => {
    const partId = await save([{ key: "a", nodes: [step("a.read", SEARCH, []), step("a.press", undefined, ["create_new"])] }]);
    const answer = finished(await runOf(partId, { permittedConsequences: ["create_new"], acknowledgedRepeat: true }));
    expect(answer).toMatchObject({ status: "stopped", stoppedAt: { reason: expect.stringContaining("could not be checked") } });
    expect(ran).toEqual(["a.read"]);
  });

  it("an act whose answer was lost stops the run, says so, and is not pressed twice", async () => {
    const partId = await save([{ key: "a", nodes: [step("a.read", SEARCH, []), step("a.press", PRESS, ["create_new"]), step("a.after", SEARCH, [])] }]);
    answers.press = { status: "failed", effect: "ambiguous" };
    const answer = finished(await runOf(partId, { permittedConsequences: ["create_new"], acknowledgedRepeat: true }));
    expect(answer).toMatchObject({ status: "stopped", acts: [], stoppedAt: { reason: expect.stringContaining("may or may not have happened") } });
    expect(ran).toEqual(["a.read", "a.press"]);
    expect(JSON.stringify(answer)).not.toContain("PAGEWORD");
  });

  it("a read that cannot be done keeps its automatic retries, and says plainly that it failed", async () => {
    const partId = await save([{ key: "a", nodes: [step("a.read", SEARCH, [])] }]);
    answers.read = { status: "failed", effect: "unacted" };
    const answer = finished(await runOf(partId));
    expect(answer).toMatchObject({ status: "failed", modelCalls: 0, stoppedAt: { reason: "This step could not be done." } });
    expect(JSON.stringify(answer)).not.toContain("PAGEWORD");
    expect(await recorded(partId)).toMatchObject([{ outcome: "failed" }]);
  });

  it("a read's retries land when the page answers on a later try", async () => {
    const partId = await save([{ key: "a", nodes: [step("a.read", SEARCH, [])] }]);
    const tries = { count: 0 };
    answers.read = () => {
      tries.count += 1;
      return tries.count < 2 ? { status: "failed", effect: "unacted" } : {};
    };
    const answer = finished(await runOf(partId));
    expect(answer.status).toBe("succeeded");
    expect(ran).toEqual(["a.read", "a.read"]);
  });

  it("a lasting class the definition's trusted floor adds is stopped at the step, though the card did not name it", async () => {
    const partId = await save([{ key: "a", nodes: [step("a.read", SEARCH, []), step("a.press", PRESS, [])] }]);
    const original = parts["dependencies"].run!.collaborators;
    parts["dependencies"].run!.collaborators = () => {
      const bound = original()!;
      return { ...bound, executor: () => ({ ...bound.executor(), nativeNodeRuntime: { ...bound.executor().nativeNodeRuntime!, execute: bound.executor().nativeNodeRuntime!.execute, getRuntimeCapabilities: () => [], getTargetHooks: () => ({ controlParameterKeys: new Set(["target"]) }), resolveTargetRefresh: () => ({ kind: "none" }), resolveActionEffect: (node: AutomationStudioFlowNode) => node.id.endsWith("press") ? { effectClass: "commit", permissionConsequences: ["delete"] } : undefined } as unknown as AutomationStudioNativeNodeRuntime }) };
    };
    const answer = finished(await runOf(partId));
    expect(answer).toMatchObject({ status: "stopped", stoppedAt: { reason: expect.stringContaining("not asked for") } });
    expect(ran).toEqual(["a.read"]);
  });

  it("a person's stop stops it where it stands", async () => {
    const partId = await save([{ key: "a", nodes: [step("a.read", SEARCH, [])] }]);
    personGate.stop = true;
    const answer = finished(await runOf(partId));
    expect(answer.status).toBe("cancelled");
    expect(ran).toEqual([]);
  });

  describe("a part that calls a part", () => {
    const callStep = (id: string, subflowId: string): AutomationStudioFlowNode => ({ id, definitionId: "builtin.control.call-subflow", definitionVersion: "1.0.0", label: "Call", parameterValues: { subflowId, inputs: { query: { $state: { path: "query" } } }, outputs: {} }, metadata: {} });

    it("goes to the version it pins, and the first lasting step inside the call is the one checked", async () => {
      const partId = await save([
        { key: "inner", nodes: [step("inner.press", PRESS, ["create_new"])] },
        { key: "outer", nodes: [step("outer.read", SEARCH, []), callStep("outer.call", "subflow.inner")] }
      ]);
      const card = await parts.get({ projectId: PROJECT, partId });
      expect((card as { card: { lastingClasses: string[] } }).card.lastingClasses).toEqual(["create_new"]);
      answers.read = () => {
        page.present.delete("#press");
        return {};
      };
      const stopped = finished(await runOf(partId, { permittedConsequences: ["create_new"], acknowledgedRepeat: true }));
      expect(stopped).toMatchObject({ status: "stopped", acts: [] });
      expect(ran).toEqual(["outer.read"]);
      answers.read = {};
      page.present.add("#press");
      ran.length = 0;
      const done = finished(await runOf(partId, { permittedConsequences: ["create_new"], acknowledgedRepeat: true }));
      expect(done).toMatchObject({ status: "succeeded", acts: ["create_new"] });
      expect(ran).toEqual(["outer.read", "inner.press"]);
    });

    it("answers part.calls_not_available when a pinned version cannot be read, with nothing asked of the page", async () => {
      const partId = await save([
        { key: "inner", nodes: [step("inner.read", SEARCH, [])] },
        { key: "outer", nodes: [step("outer.read", SEARCH, []), callStep("outer.call", "subflow.inner")] }
      ]);
      const store = await AutomationStudioProjectPartStore.open({ pool, projectId: PROJECT });
      const original = AutomationStudioProjectPartStore.prototype.listCallsFrom;
      AutomationStudioProjectPartStore.prototype.listCallsFrom = async function (input) {
        return input.partId === partId ? [{ ...(await original.call(this, input))[0]!, version: 99 }] : await original.call(this, input);
      };
      try {
        const answer = await runOf(partId);
        expect(refused(answer)).toBe("part.calls_not_available");
        expect(reads.count).toBe(0);
        expect(ran).toEqual([]);
      } finally {
        AutomationStudioProjectPartStore.prototype.listCallsFrom = original;
        await store.close();
      }
    });
  });

  describe("as a build runs it", () => {
    it("is not asked to confirm, puts each lasting step to the build's own gate, and hands back the acts for its ledger", async () => {
      const partId = await save([{ key: "a", nodes: [step("a.read", SEARCH, []), step("a.press", PRESS, ["create_new"])] }]);
      const asked: unknown[] = [];
      const answer = await parts.runAs({ projectId: PROJECT, partId, inputs: { query: "shoes" }, caller: "build", permittedConsequences: ["create_new"], permission: async (declaration) => {
        asked.push(declaration.consequences);
        return { permitted: true };
      } });
      expect("ok" in answer).toBe(false);
      expect(asked).toEqual([["create_new"]]);
      if ("ok" in answer) throw new Error("refused");
      expect(answer.response.acts).toEqual(["create_new"]);
      expect(answer.landedActs).toHaveLength(1);
      expect(answer.landedActs[0]).toMatchObject({ consequences: ["create_new"], definitionId: "custom.a.press" });
    });

    it("stops at the step when the build's gate says no, and nothing lasting is done", async () => {
      const partId = await save([{ key: "a", nodes: [step("a.read", SEARCH, []), step("a.press", PRESS, ["create_new"])] }]);
      const answer = await parts.runAs({ projectId: PROJECT, partId, inputs: { query: "shoes" }, caller: "build", permittedConsequences: ["create_new"], permission: async () => ({ permitted: false, missing: ["create_new"], requestId: null }) });
      if ("ok" in answer) throw new Error("refused");
      expect(answer.response).toMatchObject({ status: "stopped", acts: [] });
      expect(answer.landedActs).toEqual([]);
      expect(ran).toEqual(["a.read"]);
    });

    it("refuses a repeat of a lasting run, and lets a read run again", async () => {
      const lasting = await save([{ key: "a", nodes: [step("a.read", SEARCH, []), step("a.press", PRESS, ["create_new"])] }]);
      const read = await save([{ key: "b", nodes: [step("b.read", SEARCH, [])] }]);
      const base = { projectId: PROJECT, inputs: { query: "shoes" }, caller: "build" as const, permittedConsequences: ["create_new"], repeated: () => true };
      expect(await parts.runAs({ ...base, partId: lasting })).toMatchObject({ ok: false, code: "part.repeat_refused" });
      expect(ran).toEqual([]);
      expect("ok" in await parts.runAs({ ...base, partId: read })).toBe(false);
    });
  });

  it("refuses a run id it cannot use, and answers parts.unavailable with no project database", async () => {
    const partId = await save([{ key: "a", nodes: [step("a.read", SEARCH, [])] }]);
    expect(refused(await runOf(partId, { newRunId: "not-a-uuid" }))).toBe("parts.run_id_refused");
    expect(ran).toEqual([]);
    const none = new AutomationStudioProjectParts({ pool: undefined, ports: {} as unknown as AutomationStudioProjectPartsPorts });
    expect(refused(await none.run({ projectId: PROJECT, partId }))).toBe("parts.unavailable");
  });
});
