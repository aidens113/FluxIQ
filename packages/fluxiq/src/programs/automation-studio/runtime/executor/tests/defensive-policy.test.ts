import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import {
  AUTOMATION_STUDIO_MAX_NODE_RETRY_WAIT_MS,
  AUTOMATION_STUDIO_MAX_RETRY_WAIT_MS,
  AUTOMATION_STUDIO_MAX_RUN_RETRY_WAIT_MS,
  runAutomationStudioGraph,
  type AutomationStudioGraphExecutionOptions,
  type AutomationStudioGraphExecutionTrace
} from "../index.ts";

function actionNode(id: string, parameterValues: AutomationStudioFlowNode["parameterValues"] = {}): AutomationStudioFlowNode {
  return { id, definitionId: "builtin.policy.action", parameterValues: { outputId: `output.${id}`, ...parameterValues } };
}

/** A node Core has no definition for at all: the host-executed and composite dispatch paths. */
function hostNode(id: string, parameterValues: AutomationStudioFlowNode["parameterValues"] = {}): AutomationStudioFlowNode {
  return { id, definitionId: `importer.host.${id}`, parameterValues };
}

function flowOf(nodes: AutomationStudioFlowNode[], edges: AutomationStudioFlowDocument["edges"] = []): AutomationStudioFlowDocument {
  return { schemaVersion: "0.1", flowId: "flow.defensive", ownerKind: "routine", ownerId: "routine.test", name: "Defensive", createdAt: 1, updatedAt: 1, nodes, edges };
}

/** Records the waits instead of spending them, so a bounded backoff costs no wall clock. */
async function runWith(flow: AutomationStudioFlowDocument, options: Partial<AutomationStudioGraphExecutionOptions>): Promise<{ trace: AutomationStudioGraphExecutionTrace; waits: number[] }> {
  const waits: number[] = [];
  const trace = await runAutomationStudioGraph(flow, { delay: async (ms) => { waits.push(ms); }, ...options });
  return { trace, waits };
}

/** Throws on every attempt before `succeedFrom`, then lets the node through. */
function throwsUntil(succeedFrom: number, error: () => unknown, calls: { count: number }) {
  return () => {
    calls.count += 1;
    if (calls.count < succeedFrom) throw error();
    return { status: "success" as const, route: "success", outputs: { ok: true } };
  };
}

describe("every dispatch path gets the policy, with the node opting into nothing", () => {
  it("retries a built-in node whose dispatch throws a transient fault", async () => {
    const calls = { count: 0 };
    const { trace, waits } = await runWith(flowOf([actionNode("act")]), {
      effectDispatcher: throwsUntil(3, () => Object.assign(new Error("Service Unavailable"), { status: 503 }), calls)
    });

    expect(calls.count).toBe(3);
    expect(waits).toEqual([250, 1_000]);
    expect(trace.status).toBe("succeeded");
    expect(trace.attempts[0]?.fault).toMatchObject({ disposition: "retry", code: "executor.fault.status.503", source: "thrown_error" });
  });

  it("retries a host-executed node that throws, which used to reject the whole run", async () => {
    // `nativeNodeExecutor` was awaited outside the dispatch try, so a host node
    // that threw took the graph run down with it: no attempt, no trace, no ladder.
    const calls = { count: 0 };
    const { trace } = await runWith(flowOf([hostNode("step")]), {
      nativeNodeExecutor: async () => {
        calls.count += 1;
        if (calls.count < 2) throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:9"), { code: "ECONNREFUSED" });
        return { result: { status: "success", route: "success", outputs: { ok: true } } };
      }
    });

    expect(calls.count).toBe(2);
    expect(trace.status).toBe("succeeded");
    expect(trace.attempts[0]?.fault).toMatchObject({ code: "executor.fault.transport.econnrefused", effect: "unacted" });
  });

  it("retries a host-executed node that reports a failure with no structured record at all", async () => {
    const calls = { count: 0 };
    const { trace } = await runWith(flowOf([hostNode("step")]), {
      nativeNodeExecutor: async () => {
        calls.count += 1;
        return calls.count < 2
          ? { result: { status: "failed", route: "failed", outputs: {}, message: "The gateway answered with status 502." } }
          : { result: { status: "success", route: "success", outputs: { ok: true } } };
      }
    });

    expect(calls.count).toBe(2);
    expect(trace.status).toBe("succeeded");
    expect(trace.attempts[0]?.recoveryDecision?.selected?.kind).toBe("retry_node");
  });

  it("retries a composite Flow whose child execution throws", async () => {
    const calls = { count: 0 };
    const { trace } = await runWith(flowOf([hostNode("child")]), {
      compositeExecutor: async () => {
        calls.count += 1;
        if (calls.count < 2) throw new Error("fetch failed");
        return { result: { status: "success", route: "success", outputs: { ok: true } } };
      }
    });

    expect(calls.count).toBe(2);
    expect(trace.status).toBe("succeeded");
  });

  it("attempts a deterministic refusal exactly once, whichever path raised it", async () => {
    const notExecutable = await runWith(flowOf([hostNode("step")]), {});
    const badStatus = { count: 0 };
    const refusedByStatus = await runWith(flowOf([actionNode("act")]), {
      effectDispatcher: throwsUntil(Number.POSITIVE_INFINITY, () => Object.assign(new Error("Not Found"), { status: 404 }), badStatus)
    });

    expect(notExecutable.trace.attempts).toHaveLength(1);
    expect(notExecutable.trace.attempts[0]?.failure).toMatchObject({ code: "executor.node.not_executable", retryable: false });
    expect(badStatus.count).toBe(1);
    expect(refusedByStatus.waits).toEqual([]);
    expect(refusedByStatus.trace.attempts[0]?.fault?.disposition).toBe("refuse");
  });

  it("dispatches a node only through the one seam, so a path added later cannot bypass the policy", () => {
    // The guard is the reason this policy is a default rather than a convention.
    // Every way a node is run has to sit behind `node-execution.ts`, which never
    // rejects and classifies whatever it catches. Since t331 (8c5482e7) the
    // dispatch itself lives in `node-execution/attempt.ts` and the seam is the
    // one `try` around it, so the guard holds both halves: no other module
    // dispatches, and no other module starts an attempt.
    const runtimeDir = join(import.meta.dirname, "..", "..");
    const sources = collectSources(runtimeDir);
    const dispatchSites = sources.filter(({ text }) => /definition\.execute\(|options\.nativeNodeExecutor\?\.\(|options\.compositeExecutor\?\.\(|options\.effectDispatcher\(/u.test(text));
    const attemptStarts = sources.filter(({ text }) => /AutomationStudioNodeAttemptExecution\.execute\(/u.test(text));

    expect(dispatchSites.map(({ file }) => file)).toEqual(["executor/node-execution/attempt.ts"]);
    expect(attemptStarts.map(({ file }) => file)).toEqual(["executor/node-execution.ts"]);
  });
});

describe("what the run survived is on the trace, not computed and thrown away", () => {
  it("records each absorbed fault with its code, its attempt and what it cost", async () => {
    const calls = { count: 0 };
    const { trace } = await runWith(flowOf([actionNode("act")]), {
      effectDispatcher: throwsUntil(3, () => Object.assign(new Error("Too Many Requests"), { status: 429, headers: { "retry-after": "2" } }), calls)
    });

    expect(trace.status).toBe("succeeded");
    expect(trace.defence).toMatchObject({ absorbedCount: 2, refusedCount: 0, faultCount: 2, waitedMs: 4_000, waitBudgetMs: AUTOMATION_STUDIO_MAX_RUN_RETRY_WAIT_MS });
    expect(trace.defence?.entries).toEqual([
      expect.objectContaining({ nodeId: "act", attemptId: "act.attempt.1", attemptNumber: 1, outcome: "retried", code: "executor.fault.status.429", httpStatus: 429, hintedWaitMs: 2_000, waitedMs: 2_000 }),
      expect.objectContaining({ attemptId: "act.attempt.2", attemptNumber: 2, outcome: "retried", waitedMs: 2_000 })
    ]);
    expect(trace.defence?.entries[0]?.reason).toContain("429");
  });

  it("honours a delay the failing source asked for in place of the shorter backoff", async () => {
    const calls = { count: 0 };
    const { waits } = await runWith(flowOf([actionNode("act")]), {
      effectDispatcher: throwsUntil(2, () => Object.assign(new Error("Too Many Requests"), { status: 429, headers: { "retry-after": "5" } }), calls)
    });

    expect(waits).toEqual([5_000]);
  });

  it("records a fault it refused to absorb as well", async () => {
    const calls = { count: 0 };
    const { trace } = await runWith(flowOf([actionNode("act")]), {
      effectDispatcher: throwsUntil(Number.POSITIVE_INFINITY, () => new TypeError("cannot read properties of undefined"), calls)
    });

    expect(trace.status).toBe("failed");
    expect(trace.defence).toMatchObject({ absorbedCount: 0, refusedCount: 1, faultCount: 1, waitedMs: 0 });
    expect(trace.defence?.entries[0]).toMatchObject({ outcome: "stopped", code: "executor.fault.unclassified" });
  });
});

describe("the added wall clock is bounded and the bounds are the stated ones", () => {
  it("holds a document asking for 25 attempts an hour apart to one wait and one node of waiting", async () => {
    const calls = { count: 0 };
    const { waits } = await runWith(flowOf([actionNode("act", { retry: { maxAttempts: 25, backoffMs: 3_600_000 } })]), {
      effectDispatcher: throwsUntil(Number.POSITIVE_INFINITY, () => Object.assign(new Error("Service Unavailable"), { status: 503 }), calls)
    });

    expect(calls.count).toBe(25);
    expect(Math.max(...waits)).toBeLessThanOrEqual(AUTOMATION_STUDIO_MAX_RETRY_WAIT_MS);
    expect(waits.reduce((total, wait) => total + wait, 0)).toBe(AUTOMATION_STUDIO_MAX_NODE_RETRY_WAIT_MS);
  });

  it("stops absorbing by waiting once the run has spent its whole allowance", async () => {
    // Six steps, each allowed 30 s waits twice over. Five of them spend the run's
    // five minutes between them; the sixth is attempted once and not waited on.
    const nodes = ["one", "two", "three", "four", "five", "six"].map((id) => actionNode(id, { onFailure: "continue", retry: { maxAttempts: 3, backoffMs: 30_000 } }));
    const edges = nodes.slice(0, -1).map((node, index) => ({ id: `edge.${index}`, sourceNodeId: node.id, targetNodeId: nodes[index + 1]!.id, sourcePortId: "success" }));
    const calls = { count: 0 };
    const { trace, waits } = await runWith(flowOf(nodes, edges), {
      effectDispatcher: throwsUntil(Number.POSITIVE_INFINITY, () => Object.assign(new Error("Service Unavailable"), { status: 503 }), calls)
    });

    expect(waits.reduce((total, wait) => total + wait, 0)).toBe(AUTOMATION_STUDIO_MAX_RUN_RETRY_WAIT_MS);
    expect(trace.attempts.filter((attempt) => attempt.nodeId === "six")).toHaveLength(1);
    expect(trace.defence?.waitedMs).toBe(AUTOMATION_STUDIO_MAX_RUN_RETRY_WAIT_MS);
  });
});

describe("a Flow does not stop for a step that failed and nothing needed", () => {
  it("carries on to the next step and names what it walked past", async () => {
    const flow = flowOf(
      [actionNode("banner"), actionNode("read")],
      [{ id: "edge.onward", sourceNodeId: "banner", targetNodeId: "read", sourcePortId: "success" }]
    );
    const dispatched: string[] = [];
    const { trace } = await runWith(flow, {
      effectDispatcher: (effect) => {
        const outputId = String((effect.payload as { outputId?: unknown } | undefined)?.outputId ?? "");
        dispatched.push(outputId);
        return outputId === "output.banner"
          ? { status: "failed", route: "failed", outputs: {}, message: "The banner would not close.", failure: { category: "action_failed", code: "web.action.failed", retryable: false, stage: "dispatch" } }
          : { status: "success", route: "success", outputs: { ok: true } };
      }
    });

    expect(dispatched).toEqual(["output.banner", "output.read"]);
    expect(trace.status).toBe("succeeded");
    expect(trace.attempts[0]?.status).toBe("failed");
    expect(trace.defence?.continuedPastNodeIds).toEqual(["banner"]);
    expect(trace.defence?.entries[0]?.outcome).toBe("continued");
  });

  it("stops at a step a later one is bound to, rather than running it without its values", async () => {
    const flow = flowOf(
      [actionNode("read"), actionNode("use", { parameters: { text: { $state: { path: "read.success" } } } })],
      [{ id: "edge.onward", sourceNodeId: "read", targetNodeId: "use", sourcePortId: "success" }]
    );
    const dispatched: string[] = [];
    const { trace } = await runWith(flow, {
      effectDispatcher: (effect) => {
        dispatched.push(String((effect.payload as { outputId?: unknown } | undefined)?.outputId ?? ""));
        return { status: "failed", route: "failed", outputs: {}, message: "No rows.", failure: { category: "action_failed", code: "web.action.failed", retryable: false, stage: "dispatch" } };
      }
    });

    expect(dispatched).toEqual(["output.read"]);
    expect(trace.status).toBe("failed");
    expect(trace.defence?.entries[0]?.outcome).toBe("stopped");
  });
});

describe("nothing reaches the run service as a throw", () => {
  it("returns a trace naming the fault when a host callback throws after the run", async () => {
    // A rejection here ends the session and rethrows: no trace to persist, no
    // attempt row, nothing for a repair to read. A failed trace is the worst this
    // is allowed to do.
    const trace = await runAutomationStudioGraph(flowOf([actionNode("act")]), { effectDispatcher: () => ({ status: "success", route: "success", outputs: {} }) }, () => {
      throw Object.assign(new Error("the host store is gone"), { code: "ECONNRESET" });
    });

    expect(trace.status).toBe("failed");
    expect(trace.message).toContain("unhandled fault");
    expect(trace.message).toContain("executor.fault.transport.econnreset");
  });

  it("returns a trace when the run is handed something it cannot even start with", async () => {
    const trace = await runAutomationStudioGraph(flowOf([actionNode("act")]), { runtimeCapabilities: 7 as unknown as string[] });

    expect(trace.status).toBe("failed");
    expect(trace.message).toContain("unhandled fault");
  });
});

describe("a rung that changes the page is not gated on repeating the failed action", () => {
  it("clears an obstruction and attempts again although the failure itself is not retryable", async () => {
    // The rung built for dialogs was switched off by the dialog code: a dialog
    // over the page reports a non-retryable failure, and the rung required
    // retryable. Clearing it is a change to the page, not a repeat of the action.
    const dispatches: string[] = [];
    const flow = flowOf([
      actionNode("act"),
      { ...actionNode("dismiss"), metadata: { clearsInterference: true } }
    ]);
    const { trace } = await runWith(flow, {
      startNodeId: "act",
      effectDispatcher: (effect) => {
        const outputId = String((effect.payload as { outputId?: unknown } | undefined)?.outputId ?? "");
        dispatches.push(outputId);
        return outputId === "output.act" && dispatches.filter((entry) => entry === "output.act").length < 2
          ? { status: "failed", route: "failed", outputs: {}, message: "A dialog is in the way.", failure: { category: "unexpected_state", code: "web.action.blocked_by_dialog", retryable: false, stage: "execution" } }
          : { status: "success", route: "success", outputs: { ok: true } };
      }
    });

    expect(dispatches).toEqual(["output.act", "output.dismiss", "output.act"]);
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["act", "dismiss", "act"]);
    // The rung names itself on the attempt it asked for, not on the failure: the
    // decision recorded on a failed attempt is the one left standing once every
    // rung that ran has been consumed.
    expect(trace.attempts[2]?.retry?.rung).toBe("clear_interference");
  });
});

/** Every non-test source file under the runtime, with the path it is reported by. */
function collectSources(root: string, prefix = ""): Array<{ file: string; text: string }> {
  const sources: Array<{ file: string; text: string }> = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === "tests" || entry.name === "e2e") continue;
      sources.push(...collectSources(join(root, entry.name), `${prefix}${entry.name}/`));
      continue;
    }
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) continue;
    sources.push({ file: `${prefix}${entry.name}`, text: readFileSync(join(root, entry.name), "utf8") });
  }
  return sources;
}
// A lasting act in a graph run -- a saved Flow's playback and a candidate
// trial, which runs the candidate through this same executor -- is retried
// only when its failure shows it did not happen, settled as done when the
// state it was to produce already holds, and otherwise ends uncertain without
// a second act (t359, the user's rule of 2026-10-07). Every other node keeps
// the first attempt and three retries (t355).

const NOT_FOUND: AutomationStudioFailureRecord = { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" };
const BUSY: AutomationStudioFailureRecord = { category: "action_failed", code: "web.action.rate_limited", retryable: true, stage: "execution", effect: "unacted" };
/** The press was sent and only its answer is missing: the verb threw after the gesture, the page changed under it. */
const AFTER_DISPATCH: AutomationStudioFailureRecord = { category: "action_failed", code: "web.action.failed", retryable: true, stage: "execution" };
/** The producer's own statement that an act was made and its answer lost (the web domain's committing verbs). */
const STATED_ACTED: AutomationStudioFailureRecord = { category: "page_changed", code: "web.page.changed", retryable: true, stage: "execution", effect: "ambiguous" };

/** A Flow's web press as the build writes it: no domain metadata, only what its step declared. */
function press(id: string, declared?: string[], parameterValues: AutomationStudioFlowNode["parameterValues"] = {}): AutomationStudioFlowNode {
  return { id, definitionId: "web.output.dom-click", parameterValues: { target: id, ...parameterValues }, ...(declared ? { metadata: { declaredConsequences: declared } } : {}) };
}

function lastingFlowOf(nodes: AutomationStudioFlowNode[]): AutomationStudioFlowDocument {
  const edges = nodes.slice(1).map((node, index) => ({ id: `e${index}`, sourceNodeId: nodes[index]!.id, targetNodeId: node.id, sourcePortId: "success" }));
  return { schemaVersion: "0.1", flowId: "flow.lasting", ownerKind: "routine", ownerId: "routine.test", name: "Lasting", createdAt: 1, updatedAt: 1, nodes, edges };
}

/** Answers the first node's attempts with `failures` in turn and then success; every other node succeeds. Records each dispatch. */
async function runLasting(nodes: AutomationStudioFlowNode[], failures: readonly AutomationStudioFailureRecord[], options: Partial<AutomationStudioGraphExecutionOptions> = {}): Promise<{ trace: AutomationStudioGraphExecutionTrace; dispatched: string[] }> {
  const dispatched: string[] = [];
  const trace = await runAutomationStudioGraph(lastingFlowOf(nodes), {
    delay: async () => {},
    nativeNodeExecutor: async ({ node }) => {
      dispatched.push(node.id);
      const failure = node.id === nodes[0]!.id ? failures[dispatched.filter((id) => id === node.id).length - 1] : undefined;
      return failure
        ? { result: { status: "failed", route: "failed", outputs: {}, message: "The press failed.", failure } }
        : { result: { status: "success", route: "success", outputs: {} } };
    },
    ...options
  });
  return { trace, dispatched };
}

describe("a lasting press in a graph run", () => {
  it("is retried when it failed before it was dispatched, and succeeds", async () => {
    const notFound = await runLasting([press("add", ["create_new"]), press("next")], [NOT_FOUND, NOT_FOUND, NOT_FOUND]);
    expect(notFound.dispatched).toEqual(["add", "add", "add", "add", "next"]);
    expect(notFound.trace.status).toBe("succeeded");

    const busy = await runLasting([press("add", ["create_new"]), press("next")], [BUSY]);
    expect(busy.dispatched).toEqual(["add", "add", "next"]);
    expect(busy.trace.status).toBe("succeeded");
  });

  it("is not pressed again when it failed after dispatch and the state it was to produce holds, and counts as done", async () => {
    const { trace, dispatched } = await runLasting([press("add", ["create_new"], { expectedState: { conditions: [{ path: "cart.count" }] } }), press("next")], [AFTER_DISPATCH], {
      hostRuntime: { capabilities: ["expectation-evaluation"], expectationEvaluator: () => ({ passed: true, checkedConditionCount: 1 }) }
    });
    expect(dispatched).toEqual(["add", "next"]);
    expect(trace.status).toBe("succeeded");
    expect(trace.attempts[0]?.transitionComparison?.metadata).toMatchObject({ expectationSatisfiedAfterFailure: true });
    expect(trace.defence?.entries[0]).toMatchObject({ outcome: "continued", code: "web.action.failed" });
  });

  it("ends uncertain without a second press when nothing shows whether it took effect", async () => {
    const { trace, dispatched } = await runLasting([press("add", ["create_new"]), press("next")], [AFTER_DISPATCH, AFTER_DISPATCH]);
    expect(dispatched).toEqual(["add"]);
    expect(trace.status).toBe("failed");
    expect(trace.message).toMatch(/^Outcome uncertain: add makes a lasting act/u);
    expect(trace.defence?.entries[0]).toMatchObject({ outcome: "stopped", code: "web.action.failed" });
  });

  it("takes the producer's word that an undeclared press was made, and ends uncertain", async () => {
    const { trace, dispatched } = await runLasting([press("send"), press("next")], [STATED_ACTED, STATED_ACTED]);
    expect(dispatched).toEqual(["send"]);
    expect(trace.status).toBe("failed");
    expect(trace.message).toMatch(/^Outcome uncertain:/u);
  });
});

describe("a node whose act does not last", () => {
  it("keeps the first attempt and three retries on the same fault", async () => {
    const declaredNone = await runLasting([press("open", []), press("next")], [AFTER_DISPATCH, AFTER_DISPATCH, AFTER_DISPATCH, AFTER_DISPATCH]);
    expect(declaredNone.dispatched).toEqual(["open", "open", "open", "open"]);
    expect(declaredNone.trace.status).toBe("failed");
    expect(declaredNone.trace.message).not.toMatch(/uncertain/u);

    const recovers = await runLasting([press("open"), press("next")], [AFTER_DISPATCH, AFTER_DISPATCH, AFTER_DISPATCH]);
    expect(recovers.dispatched).toEqual(["open", "open", "open", "open", "next"]);
    expect(recovers.trace.status).toBe("succeeded");
  });
});
