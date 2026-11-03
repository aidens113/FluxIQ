import { rm } from "node:fs/promises";
import path from "node:path";
import type { JsonObject } from "../../../../core/index.ts";
import { ProgramJsonStore } from "../../../_shared/storage.ts";
import type { ModelExecutionOptions } from "../../../../runtime/models/execution/index.ts";
import type { ExecutionCallbackCall } from "../../../../runtime/execution-observation/index.ts";
import { prepareObservedExecutionCallback, invokeOwnedExecutionCallbackSync } from "../../../../runtime/execution-observation/owned/index.ts";
import { ExecutionCallbackPolicies } from "../../../../runtime/execution-observation/policies/index.ts";
import { OriginalExecutionPromiseReceipts } from "../../../../runtime/execution-observation/queue-completion/index.ts";
import type { AutomationStudioLlmBuildPurseOptions } from "../../../../runtime/agents/budget/index.ts";
import {
  AUTOMATION_STUDIO_FLOW_SPEND_PHASES,
  automationStudioFlowSpendPhaseOf,
  parseAutomationStudioFlowBootstrapCreationSpend,
  type AutomationStudioFlowBootstrapCreationSpend,
  type AutomationStudioFlowSpendItem,
  type AutomationStudioFlowSpendPhase
} from "../flow-bootstrap/index.ts";
import { AutomationStudioLlmBuildPurse, automationStudioLlmCurrentFlowPurse, automationStudioLlmFlowPurseScope } from "../llm/build-purse/index.ts";
import { automationStudioLlmStepLogScope } from "../llm/step-log/index.ts";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "./paths/index.ts";
import { AutomationStudioProjectStore } from "./projects/index.ts";

const nativeDate = Date;
const nativeNow = Date.now;
const nativeStoreWrite = ProgramJsonStore.prototype.write;
const nativeProjectStructure = AutomationStudioProjectStore.prototype.ensureProjectStructure;

// A Flow creation's spend (`flow-bootstrap/creation-spend/`): at most one per
// Flow, in `creation-spend.json` beside the Flow's own file. Held in memory as
// well, which is the whole store when the service has no storage root, as the
// incomplete-draft store is (`./incomplete-drafts.ts`).
//
// **In a Lab-scoped run it is the Flow's one purse (t438).** The user's words
// (2026-10-01): "bring the ceiling down to $0.1 per flow max". Every call a
// part of the Flow makes adds what it was charged (`add`, through
// `withFlowPurse`). Once a Flow's record is read, memory is the record: an
// addition reads and writes the total with nothing awaited between, so two
// additions can never both read the same total and one be lost, and each
// Flow's writes reach storage one after another in the order they were made.
//
// **Itemised (t728).** Each addition names the phase it belongs to and how
// many calls it was: a settled call by the scope it was made in
// (`flow-bootstrap/creation-spend/phase-of.ts`), the chat's reading as `chat`.
// The record keeps them as `calls` and `byPhase` beside `spentUsd`, which the
// `get-flow-spend` endpoint publishes read-only (`api/handlers/runs.ts`). A
// settled call also names the agent role its scope carries and the input
// tokens it reported, kept as `byRole` and `largestInputTokens`: the per-agent
// tallies and largest decision input the Lab used to read off the step log.
export class AutomationStudioFlowBootstrapCreationSpendStore {
  private readonly memory = new Map<string, AutomationStudioFlowBootstrapCreationSpend>();
  /** Flows whose record was read, or found absent: from then on memory is the record. */
  private readonly loaded = new Set<string>();
  /** Each Flow's last write still in flight, which the next write waits for. */
  private readonly writes = new Map<string, Promise<boolean>>();
  private readonly completions = new OriginalExecutionPromiseReceipts();
  private static readonly ownAdd = AutomationStudioFlowBootstrapCreationSpendStore.prototype.add;
  private static readonly ownPersist = AutomationStudioFlowBootstrapCreationSpendStore.prototype.persist;
  private static readonly ownWrite = AutomationStudioFlowBootstrapCreationSpendStore.prototype.write;
  private static readonly ownGet = AutomationStudioFlowBootstrapCreationSpendStore.prototype.get;
  private static readonly ownSpentNow = AutomationStudioFlowBootstrapCreationSpendStore.prototype.spentNowUsd;

  constructor(
    private readonly paths: AutomationStudioProjectPaths,
    private readonly flowPaths: AutomationStudioFlowPaths,
    private readonly projects: AutomationStudioProjectStore
  ) {
    ExecutionCallbackPolicies.remember(nativeDate, nativeNow, "pure");
    ExecutionCallbackPolicies.remember(projects, nativeProjectStructure, "pure");
  }

  /** What the Flow's creation has spent so far, or `undefined` when nothing is recorded -- or only a file Core did not write. */
  async get(projectId: string, flowId: string): Promise<AutomationStudioFlowBootstrapCreationSpend | undefined> {
    const key = memoryKey(projectId, flowId);
    const held = this.memory.get(key);
    if (held) return structuredClone(held);
    if (this.loaded.has(key) || !this.paths.root) {
      this.loaded.add(key);
      return undefined;
    }
    const stored = await new ProgramJsonStore<JsonObject>(this.file(projectId, flowId), () => ({})).read();
    const record = parseAutomationStudioFlowBootstrapCreationSpend(stored, { projectId, flowId });
    // A write made while this read was in flight is the newer record.
    if (this.loaded.has(key)) return this.memory.has(key) ? structuredClone(this.memory.get(key)!) : undefined;
    this.loaded.add(key);
    if (!record) return undefined;
    this.memory.set(key, structuredClone(record));
    return record;
  }

  async save(record: AutomationStudioFlowBootstrapCreationSpend): Promise<AutomationStudioFlowBootstrapCreationSpend> {
    const key = memoryKey(record.projectId, record.flowId);
    this.loaded.add(key);
    this.memory.set(key, structuredClone(record));
    await this.persist(record.projectId, record.flowId);
    return record;
  }

  async delete(projectId: string, flowId: string): Promise<void> {
    const key = memoryKey(projectId, flowId);
    this.loaded.add(key);
    this.memory.delete(key);
    await this.persist(projectId, flowId);
  }

  /** What the Flow's record holds now, from memory; 0 before it was read, or when there is none. */
  spentNowUsd(projectId: string, flowId: string): number {
    return this.memory.get(memoryKey(projectId, flowId))?.spentUsd ?? 0;
  }

  /**
   * Adds `deltaUsd` to what the Flow has spent: compare-and-add, so two
   * additions never read the same total. `build` counts one more build of the
   * Flow's creation. `phase` itemises the addition, with the `calls` it was
   * (none when absent); an itemised addition is also tallied under the agent
   * `role` that made it, when one did, and its `inputTokens` (one call's
   * reported input) can raise `largestInputTokens`. A Flow with no record gets
   * one.
   */
  add(
    projectId: string,
    flowId: string,
    deltaUsd: number,
    options: { build?: boolean; phase?: AutomationStudioFlowSpendPhase; calls?: number; role?: string | undefined; inputTokens?: number | null } = {},
    execution?: ModelExecutionOptions
  ): Promise<void> {
    const observation = execution?.observation;
    const captured = observation ? Object.freeze({ observation }) satisfies ModelExecutionOptions : undefined;
    const work = async (): Promise<boolean> => {
      if (!Number.isFinite(deltaUsd) || deltaUsd < 0) throw new Error("A Flow's spend can only grow, by a finite amount of US dollars.");
      const calls = options.calls ?? 0;
      if (!Number.isSafeInteger(calls) || calls < 0) throw new Error("A Flow's spend counts calls in whole, non-negative numbers.");
      const inputTokens = options.inputTokens ?? null;
      if (inputTokens !== null && (!Number.isSafeInteger(inputTokens) || inputTokens < 0)) throw new Error("A call's input tokens are a whole, non-negative number.");
      const role = options.phase ? options.role : undefined;
      const key = memoryKey(projectId, flowId);
      if (!this.loaded.has(key)) {
        const get = this.get;
        if (get === AutomationStudioFlowBootstrapCreationSpendStore.ownGet) await get.call(this, projectId, flowId);
        else await invokeSpendCallback(observation, { receiver: this, callback: get, args: [projectId, flowId] });
      }
      // From here until the write is queued nothing is awaited: the total read is the total written.
      const current = this.memory.get(key);
      const now = invokeOwnedExecutionCallbackSync(observation, { receiver: Date, callback: Date.now, args: [] });
      this.memory.set(key, {
        kind: "flow_creation_spend",
        projectId,
        flowId,
        spentUsd: roundUsd((current?.spentUsd ?? 0) + deltaUsd),
        builds: Math.max(1, (current?.builds ?? 0) + (options.build ? 1 : 0)),
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
        calls: (current?.calls ?? 0) + (options.phase ? calls : 0),
        byPhase: itemised(current?.byPhase, options.phase, deltaUsd, calls),
        largestInputTokens: options.phase ? larger(current?.largestInputTokens ?? null, inputTokens) : current?.largestInputTokens ?? null,
        byRole: byRoleWith(current?.byRole ?? {}, role, deltaUsd, calls)
      });
      const persist = this.persist;
      if (persist === AutomationStudioFlowBootstrapCreationSpendStore.ownPersist) return await persist.call(this, projectId, flowId, captured);
      await invokeSpendCallback(observation, { receiver: this, callback: persist, args: [projectId, flowId] });
      return false;
    };
    const returned: Promise<void> = work().then(acknowledged => {
      if (acknowledged && observation) this.completions.issueObserved(returned, observation, { disposition: "settled", completionDigest: "flow.spend.original_prefix_committed", assessmentDigest: "flow.spend.owned_storage_acknowledged" });
    });
    return returned;
  }

  /**
   * `run` under the Flow's one purse, in a Lab-scoped run (t438): every call it
   * makes is held against the Flow's ceiling beside what the Flow's record
   * says it has spent, read live, and what each call is charged is added to the
   * record as it settles. Within a purse already current, `run` runs under that
   * one. A write that failed is thrown once `run` is over.
   */
  async withFlowPurse<T>(projectId: string, flowId: string, ceilingUsd: number, run: () => Promise<T>): Promise<T> {
    if (automationStudioLlmCurrentFlowPurse()) return await run();
    await this.get(projectId, flowId);
    const writes: Array<Promise<PromiseSettledResult<void>>> = [];
    const spentNow = this.spentNowUsd;
    const options: AutomationStudioLlmBuildPurseOptions = {
      ceilingUsd,
      spentUsd: () => spentNow.call(this, projectId, flowId),
      onSettled: (chargedUsd, call, execution) => {
        // Settled inside the call's own async scope, so the step-log scope it was made in is still current.
        const scope = automationStudioLlmStepLogScope.current();
        const add = this.add;
        const item = { phase: automationStudioFlowSpendPhaseOf(call, scope), calls: 1, role: scope?.role, inputTokens: call.inputTokens };
        const write = add === AutomationStudioFlowBootstrapCreationSpendStore.ownAdd
          ? add.call(this, projectId, flowId, chargedUsd, item, execution)
          : invokeSpendCallback(execution?.observation, { receiver: this, callback: add, args: [projectId, flowId, chargedUsd, item] });
        // Retain the original operation's outcome immediately, even when the legacy caller does not await it.
        writes.push(write.then<PromiseSettledResult<void>, PromiseSettledResult<void>>(value => ({ status: "fulfilled", value }), reason => ({ status: "rejected", reason })));
        return write;
      }
    };
    const onSettled = options.onSettled!;
    const receipts = this.completions;
    const consume = receipts.consume;
    ExecutionCallbackPolicies.rememberManaged({ receiver: options, callback: onSettled, contract: "managed_direct_effects", consumeCompletion: input => consume.call(receipts, input) });
    if (spentNow === AutomationStudioFlowBootstrapCreationSpendStore.ownSpentNow) ExecutionCallbackPolicies.remember(options, options.spentUsd!, "pure");
    const purse = new AutomationStudioLlmBuildPurse(options);
    let outcome: { kind: "fulfilled"; value: T } | { kind: "rejected"; error: unknown };
    try {
      outcome = { kind: "fulfilled", value: await automationStudioLlmFlowPurseScope(purse, run) };
    } catch (error) {
      outcome = { kind: "rejected", error };
    }
    const failures: unknown[] = outcome.kind === "rejected" ? [outcome.error] : [];
    let written = 0;
    while (written < writes.length) {
      const pending = writes.slice(written);
      written = writes.length;
      const settled = await Promise.all(pending);
      for (const result of settled) if (result.status === "rejected" && !failures.includes(result.reason)) failures.push(result.reason);
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, "Flow work and queued spend commits failed.", { cause: failures[0] });
    if (outcome.kind === "rejected") throw outcome.error;
    return outcome.value;
  }

  /** Writes the Flow's record as memory now holds it, after any write still in flight. */
  private async persist(projectId: string, flowId: string, execution?: ModelExecutionOptions): Promise<boolean> {
    if (!this.paths.root) return true;
    const key = memoryKey(projectId, flowId);
    const previous = this.writes.get(key) ?? Promise.resolve(true);
    const callback = this.write;
    const writePrefix = async (): Promise<boolean> => {
      if (callback === AutomationStudioFlowBootstrapCreationSpendStore.ownWrite) return await callback.call(this, projectId, flowId, execution);
      await invokeSpendCallback(execution?.observation, { receiver: this, callback, args: [projectId, flowId] });
      return false;
    };
    // An earlier write's failure is its own caller's; this one still writes the newer record.
    const write = previous.then(writePrefix, writePrefix);
    this.writes.set(key, write);
    try {
      return await write;
    } finally {
      if (this.writes.get(key) === write) this.writes.delete(key);
    }
  }

  private async write(projectId: string, flowId: string, execution?: ModelExecutionOptions): Promise<boolean> {
    const record = this.memory.get(memoryKey(projectId, flowId));
    const file = this.file(projectId, flowId);
    if (!record) {
      // A document the program-state database holds is deleted there; one on disk, from disk.
      if (!await ProgramJsonStore.deletePath(file)) await rm(file, { force: true });
      return true;
    }
    const projects = this.projects;
    const ensure = projects.ensureProjectStructure;
    await invokeSpendCallback(execution?.observation, { receiver: projects, callback: ensure, args: [projectId] });
    const store = new ProgramJsonStore<JsonObject>(file, () => ({}));
    const callback = store.write;
    if (callback === nativeStoreWrite) {
      await callback.call(store, record as unknown as JsonObject);
      return true;
    }
    await invokeSpendCallback(execution?.observation, { receiver: store, callback, args: [record as unknown as JsonObject] });
    return false;
  }

  private file(projectId: string, flowId: string): string {
    return path.join(this.flowPaths.flowDirectory(projectId, flowId), "creation-spend.json");
  }
}

async function invokeSpendCallback<TReceiver, TArguments extends unknown[], TResult>(observation: ModelExecutionOptions["observation"], call: ExecutionCallbackCall<TReceiver, TArguments, TResult>): Promise<Awaited<TResult>> {
  const owned = await prepareObservedExecutionCallback(observation, call);
  let outcome: { kind: "fulfilled"; value: Awaited<TResult> } | { kind: "rejected"; error: unknown };
  try {
    outcome = { kind: "fulfilled", value: await owned.invoke() };
    if (observation && owned.completion() !== "settled") {
      if (owned.completion() !== "unknown") owned.unknown();
      throw new Error("flow_spend.callback_unverified");
    }
  } catch (error) {
    outcome = { kind: "rejected", error };
  }
  try {
    await owned.flush();
  } catch (error) {
    if (outcome.kind === "rejected" && outcome.error !== error) throw new AggregateError([outcome.error, error], "Spend callback and observation drain failed.", { cause: outcome.error });
    throw error;
  }
  if (outcome.kind === "rejected") throw outcome.error;
  return outcome.value;
}

function memoryKey(projectId: string, flowId: string): string {
  return `${projectId}:${flowId}`;
}

/** The record's spend by phase with `phase` grown by `usd` and `calls`; every phase present, an earlier record's unitemised spend left out. */
function itemised(
  current: Record<AutomationStudioFlowSpendPhase, AutomationStudioFlowSpendItem> | undefined,
  phase: AutomationStudioFlowSpendPhase | undefined,
  usd: number,
  calls: number
): Record<AutomationStudioFlowSpendPhase, AutomationStudioFlowSpendItem> {
  const next = Object.fromEntries(AUTOMATION_STUDIO_FLOW_SPEND_PHASES.map((each) => [each, { calls: current?.[each].calls ?? 0, usd: current?.[each].usd ?? 0 }])) as Record<AutomationStudioFlowSpendPhase, AutomationStudioFlowSpendItem>;
  if (phase) next[phase] = { calls: next[phase].calls + calls, usd: roundUsd(next[phase].usd + usd) };
  return next;
}

/** The role tallies with `role` grown by `usd` and `calls`; unchanged when no role made the addition. */
function byRoleWith(current: Record<string, AutomationStudioFlowSpendItem>, role: string | undefined, usd: number, calls: number): Record<string, AutomationStudioFlowSpendItem> {
  const next = structuredClone(current);
  if (role) next[role] = { calls: (next[role]?.calls ?? 0) + calls, usd: roundUsd((next[role]?.usd ?? 0) + usd) };
  return next;
}

function larger(current: number | null, next: number | null): number | null {
  return next === null ? current : current === null ? next : Math.max(current, next);
}

/** Rounded to the billionth, as a purse rounds. */
function roundUsd(value: number): number {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}
