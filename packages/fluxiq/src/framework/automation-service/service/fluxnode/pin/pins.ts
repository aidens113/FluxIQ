// A FluxNode's pin, enforced (fluxnode-plan N8): "A pinned FluxNode replays exactly that Flow, and its
// repairs wait as proposals until the developer pins again."
//
// **The seam.** A task's saved Flow is what its next attempt replays (`../../answer-first/route/`), kept in
// the task memory under the run's caller key (`../caller-key.ts`). A pinned FluxNode's `auto` run works in
// a Flow of its own beside the pinned one (the proposal Flow) under the `pinned` key, whose saved Flow is
// set to the pinned one before every run. So the replay runs exactly the pinned version, whatever was
// learned since, and whatever a repair or an exploration saves lands there, never on the learned Flow or
// on the pinned Flow's own record. The attempt itself is untouched: it still replays, repairs and explores
// until the result or the budget, so a pin adds no ending.
//
// **A change held.** After the run, a saved Flow there that is not the pinned one is a proposal: kept on the
// pin with the run that made it, and told on the run's result as `fluxnode.pinned_change_held`.
//
// **A pin that lands while a run is going** (begun unpinned): what that run saved over the learned Flow
// is held the same way, and the learned Flow set back to the pinned one.
//
// **Pinning again** adopts a proposal (the one named, else the newest), and the learned Flow becomes it
// too; with none waiting it pins what is pinned, and the first pin pins the learned Flow.
//
// **The task memory is reached by a dynamic import**, as the service reaches the attempt: a static one
// would close a module cycle through the result checks, which the service's barrel already reaches.

import { FLUXNODE_PINNED_CHANGE_HELD, type FluxNodeFlowProposal, type FluxNodeRunPathKind, type FluxNodeRunPinned } from "@fluxiq/contracts/fluxnode";
import type { AutomationStudioService } from "../../../service.ts";
import type { AutomationStudioAnswerFirstSavedFlow, AutomationStudioAnswerFirstTaskMemoryStore } from "../../answer-first/task-memory/index.ts";
import { fluxNodeCallerKey } from "../caller-key.ts";
import type { FluxNodeOwnerFlows, FluxNodeRegisteredSpec } from "../owner-flows.ts";
import type { FluxNodeRegistered } from "../pipeline/index.ts";
import { fluxNodePinRecordOf, fluxNodePinSaid, fluxNodePinVersionsOf, type FluxNodePinProposal, type FluxNodePinRecord } from "./record.ts";

/** Proposals a pin keeps, newest last: each run that changes the Flow differently adds one, so the oldest go. */
const KEPT_PROPOSALS = 20;
const PROPOSALS_KEY = "fluxNodeProposals";

/** A pinned FluxNode's run, set up: the Flow it works in, whether it replays the pin, and what ends it. */
export type FluxNodePinnedAttempt = {
  flowId: string;
  /** An `auto` run, which replays the pin; `explore` starts fresh under its own key and changes nothing. */
  replaysPin: boolean;
  pin: Pick<FluxNodeRunPinned, "flowVersion" | "stepsDigest">;
  /** After the attempt: the pin it ran, and the change it held, which this records. */
  settle(path: FluxNodeRunPathKind): Promise<FluxNodeRunPinned>;
};

/** What an export shows: the pin, the versions, the learned Flow, and the proposal a pin adopted. */
export type FluxNodePinView = { record?: FluxNodePinRecord | undefined; versions: string[]; learned?: AutomationStudioAnswerFirstSavedFlow | undefined; adopted?: FluxNodePinProposal | undefined };

export class FluxNodePins {
  constructor(private readonly service: AutomationStudioService, private readonly flows: Pick<FluxNodeOwnerFlows, "said" | "resay">, private readonly now: () => number) {}

  /** The steps' digest of a version with no steps: a pin of nothing learned yet. */
  static async nothingLearned(): Promise<string> {
    return (await import("../../answer-first/task-memory/index.ts")).automationStudioAnswerFirstStepsDigest([]);
  }

  /** The pin, the versions and the learned Flow, as the Flow and the task memory hold them now. */
  async view(registered: FluxNodeRegistered): Promise<FluxNodePinView> {
    const said = await this.flows.said(registered);
    const record = fluxNodePinRecordOf(said);
    return { ...(record ? { record } : {}), versions: fluxNodePinVersionsOf(said), ...withLearned(await this.learnedOf(registered)) };
  }

  /** Sets a pinned FluxNode's run up, or nothing where it is not pinned. */
  async begin(registered: FluxNodeRegisteredSpec, mode: "auto" | "explore", runId: string): Promise<FluxNodePinnedAttempt | undefined> {
    const record = fluxNodePinRecordOf(await this.flows.said(registered));
    if (!record) return undefined;
    const flowId = await this.proposalFlowOf(registered, record);
    const pin = { flowVersion: record.flowVersion, stepsDigest: record.stepsDigest };
    if (mode === "explore") return { flowId, replaysPin: false, pin, settle: async () => pin };
    const memory = await this.memory();
    const taskId = await taskIdOf(registered, true);
    const notes = (await memory.get(registered.projectId, await taskIdOf(registered, false)))?.notes ?? [];
    await memory.update(registered.projectId, taskId, (current) => {
      const { best: _replaced, ...rest } = current;
      // A first pinned run is told what the learned Flow's runs noted; later ones keep their own.
      const first = current.attempts.length === 0 && current.notes.length === 0;
      return { ...rest, flowId, ...(record.saved ? { best: structuredClone(record.saved) } : {}), notes: first ? notes : current.notes };
    });
    return {
      flowId, replaysPin: true, pin,
      settle: async (path) => {
        const best = (await memory.get(registered.projectId, taskId))?.best;
        return await this.held(registered, pin, best, { flowId, runId, path });
      }
    };
  }

  /** A run begun unpinned that ended pinned: what it saved over the learned Flow is held, and the learned Flow set back. Nothing where no pin landed. */
  async settleUnpinned(registered: FluxNodeRegisteredSpec, runId: string, path: FluxNodeRunPathKind): Promise<FluxNodeRunPinned | undefined> {
    const record = fluxNodePinRecordOf(await this.flows.said(registered));
    if (!record) return undefined;
    const learned = await this.learnedOf(registered);
    if (!changes(learned, record.stepsDigest)) return undefined;
    const pin = { flowVersion: record.flowVersion, stepsDigest: record.stepsDigest };
    const settled = await this.held(registered, pin, learned, { flowId: registered.flowId, runId, path });
    await this.setLearned(registered, record.saved);
    return settled;
  }

  /** Pins: the proposal named, else the newest waiting, else what is pinned, else the learned Flow. `unknownProposal` where the one named does not wait. */
  async pin(registered: FluxNodeRegistered, proposalId: string | undefined, at: number): Promise<FluxNodePinView | { unknownProposal: true }> {
    const learned = await this.learnedOf(registered);
    const done = await this.flows.resay<FluxNodePinView | { unknownProposal: true }>(registered, async (said) => {
      const current = fluxNodePinRecordOf(said);
      const adopted = proposalId === undefined ? current?.proposals.at(-1) : current?.proposals.find((each) => each.proposalId === proposalId);
      if (proposalId !== undefined && !adopted) return { value: { unknownProposal: true as const } };
      const saved = adopted ? adopted.saved : current ? current.saved : learned;
      const stepsDigest = saved?.stepsDigest ?? (await FluxNodePins.nothingLearned());
      const known = fluxNodePinVersionsOf(said);
      const versions = known.includes(stepsDigest) ? known : [...known, stepsDigest];
      const record: FluxNodePinRecord = {
        flowVersion: versions.indexOf(stepsDigest) + 1, stepsDigest, pinnedAt: at, ...(saved ? { saved } : {}),
        ...(current?.proposalFlowId === undefined ? {} : { proposalFlowId: current.proposalFlowId }),
        // An adopted proposal settles every one waiting: each was a change from the version it replaces.
        proposals: adopted ? [] : (current?.proposals ?? [])
      };
      return { said: fluxNodePinSaid(said, record, versions), value: { record, versions, ...(adopted ? { adopted } : {}) } };
    });
    if ("unknownProposal" in done) return done;
    if (done.adopted) await this.setLearned(registered, done.adopted.saved);
    return { ...done, ...withLearned(done.adopted?.saved ?? learned) };
  }

  /** The pin, with the change `best` would have made to it held as a proposal where it is one. */
  private async held(registered: FluxNodeRegistered, pin: Pick<FluxNodeRunPinned, "flowVersion" | "stepsDigest">, best: AutomationStudioAnswerFirstSavedFlow | undefined, made: { flowId: string; runId: string; path: FluxNodeRunPathKind }): Promise<FluxNodeRunPinned> {
    if (!best || !changes(best, pin.stepsDigest)) return { ...pin };
    const proposal = await this.propose(registered, best, made);
    if (!proposal) return { ...pin };
    const message = `This FluxNode is pinned, so the Flow this run changed was not saved over the pinned one (version ${pin.flowVersion}). It waits as proposal ${proposal.proposalId}: review it with an export and pin it to adopt it.`;
    return { ...pin, held: { code: FLUXNODE_PINNED_CHANGE_HELD, message, proposal } };
  }

  /** Keeps `saved` on the pin as a proposal, the same steps once. Nothing where it is what is pinned now, or nothing is. */
  private async propose(registered: FluxNodeRegistered, saved: AutomationStudioAnswerFirstSavedFlow, made: { flowId: string; runId: string; path: FluxNodeRunPathKind }): Promise<FluxNodeFlowProposal | undefined> {
    return await this.flows.resay(registered, async (said) => {
      const current = fluxNodePinRecordOf(said);
      if (!current || current.stepsDigest === saved.stepsDigest) return { value: undefined };
      const proposal: FluxNodeFlowProposal = { proposalId: `proposal.${saved.stepsDigest.slice(0, 16)}`, flowId: made.flowId, stepsDigest: saved.stepsDigest, runId: made.runId, path: made.path, proposedAt: this.now() };
      const proposals = [...current.proposals.filter((each) => each.stepsDigest !== saved.stepsDigest), { ...proposal, saved: structuredClone(saved) }].slice(-KEPT_PROPOSALS);
      return { said: fluxNodePinSaid(said, { ...current, proposals }, fluxNodePinVersionsOf(said)), value: proposal };
    });
  }

  /** The Flow a pinned FluxNode's runs work in: the one the pin names while it stands, else a new one, named on the pin. */
  private async proposalFlowOf(registered: FluxNodeRegisteredSpec, record: FluxNodePinRecord): Promise<string> {
    if (record.proposalFlowId !== undefined && (await this.flowStands(registered.projectId, record.proposalFlowId))) return record.proposalFlowId;
    const made = await this.service.createFlow({ projectId: registered.projectId, name: `${registered.name} (proposals)`, description: `Changes held while FluxNode ${registered.name} (spec ${registered.specHash.slice(0, 12)}) is pinned.` });
    const saved = await this.service.saveFlow({ projectId: registered.projectId, flow: { ...made, metadata: { ...(made.metadata ?? {}), [PROPOSALS_KEY]: { name: registered.name, specHash: registered.specHash, pinnedFlowId: registered.flowId } } } });
    return await this.flows.resay(registered, async (said) => {
      const current = fluxNodePinRecordOf(said);
      return current ? { said: fluxNodePinSaid(said, { ...current, proposalFlowId: saved.flowId }, fluxNodePinVersionsOf(said)), value: saved.flowId } : { value: saved.flowId };
    });
  }

  /** Whether the project still holds the Flow: one a person deleted is made again. */
  private async flowStands(projectId: string, flowId: string): Promise<boolean> {
    return (await this.service.listFlows(projectId)).some((entry) => entry.flow.flowId === flowId);
  }

  private async learnedOf(registered: FluxNodeRegistered): Promise<AutomationStudioAnswerFirstSavedFlow | undefined> {
    const best = (await (await this.memory()).get(registered.projectId, await taskIdOf(registered, false)))?.best;
    return best && best.steps.length > 0 ? best : undefined;
  }

  /** Sets the learned Flow, the one an unpinned run would replay, to `saved` (none: nothing learned). */
  private async setLearned(registered: FluxNodeRegistered, saved: AutomationStudioAnswerFirstSavedFlow | undefined): Promise<void> {
    await (await this.memory()).update(registered.projectId, await taskIdOf(registered, false), (current) => {
      const { best: _replaced, ...rest } = current;
      return { ...rest, flowId: current.flowId || registered.flowId, ...(saved ? { best: structuredClone(saved) } : {}) };
    });
  }

  private async memory(): Promise<AutomationStudioAnswerFirstTaskMemoryStore> {
    return (await import("../../answer-first/task-memory/index.ts")).automationStudioAnswerFirstTaskMemoryOf(this.service, { paths: this.service.projectPaths, projects: this.service.projects });
  }
}

/** The task memory's id for the FluxNode's learned Flow, or its pinned runs'. */
async function taskIdOf(registered: FluxNodeRegistered, pinned: boolean): Promise<string> {
  return (await import("../../answer-first/task-key/index.ts")).automationStudioAnswerFirstTaskKey({ instructionText: "", callerKey: fluxNodeCallerKey({ name: registered.name, specHash: registered.specHash, pinned }) });
}

/** A saved Flow with steps that are not the pinned version's. */
function changes(saved: AutomationStudioAnswerFirstSavedFlow | undefined, pinnedDigest: string): saved is AutomationStudioAnswerFirstSavedFlow {
  return saved !== undefined && saved.steps.length > 0 && saved.stepsDigest !== pinnedDigest;
}

function withLearned(learned: AutomationStudioAnswerFirstSavedFlow | undefined): { learned?: AutomationStudioAnswerFirstSavedFlow } {
  return learned ? { learned } : {};
}
