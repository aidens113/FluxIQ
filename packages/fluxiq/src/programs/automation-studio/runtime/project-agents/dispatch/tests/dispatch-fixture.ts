// A build to dispatch into, for the dispatcher's tests: an in-memory build
// record holding a three-part task on a garden-supplies catalogue (shaped
// unlike any Lab scenario), its structure plan, and briefs; a purse; the
// supervisor's cancellation scope; a stub host of the asked capacity; the
// project ledger; and a scripted stand-in for the builder loop that records
// what each brief was given and when it ran.
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapInterface } from "../../../flow-bootstrap/plan/index.ts";
import { AutomationStudioSiteResetProjectLedger } from "../../../flow-bootstrap/site-reset/index.ts";
import type { AutomationStudioSubflowBuilderOutcome, AutomationStudioSubflowProposal, runAutomationStudioSubflowBuilderLoop } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import { AutomationStudioLlmBuildPurse } from "../../../llm/build-purse/index.ts";
import { AutomationStudioBuildCancellation } from "../../../service/flow-bootstrap-commands/index.ts";
import { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../../service/paths/index.ts";
import { automationStudioProjectStructurePlan, automationStudioProjectTaskSpec, type AutomationStudioProjectStructurePlan, type AutomationStudioProjectSubflowBrief, type AutomationStudioProjectTaskSpec } from "../../contracts/index.ts";
import { AutomationStudioHostLeaseScope, type AutomationStudioHostResourceLease } from "../../host-resources/index.ts";
import { StubHost } from "../../host-resources/tests/stub-host.ts";
import { AutomationStudioProjectBuildRecordStore } from "../../record/index.ts";
import { createAutomationStudioProjectDispatcher, type AutomationStudioProjectBriefPortFactory, type AutomationStudioProjectBuilderPorts, type AutomationStudioProjectDispatchResult, type AutomationStudioProjectDispatcherInput } from "../index.ts";

export const REF = { projectId: "project.garden", flowId: "flow.garden", buildId: "build.garden" };
const SOURCE = "Open the seed catalogue and list the spring seeds. Open the first packet's page. Then add that packet to my planting list.";
const SUCCESS = [{ fact: "text", op: "contains", value: "Seeds", target: { handle: "t8" } }];
const PACKET_INTERFACE: AutomationStudioFlowBootstrapInterface = { inputs: [{ id: "packet", name: "Packet", valueType: { kind: "unknown" }, required: true }], outputs: [] };

function gardenTaskSpec(): AutomationStudioProjectTaskSpec {
  const spec = {
    parts: [
      { id: "p1", quote: { sourceId: "instruction.1", text: "list the spring seeds" }, goalFacts: ["spring seeds are listed"], lastingActs: [] },
      { id: "p2", quote: { sourceId: "instruction.1", text: "Open the first packet's page" }, goalFacts: ["the packet page is open"], lastingActs: [] },
      { id: "p3", quote: { sourceId: "instruction.1", text: "add that packet to my planting list" }, goalFacts: ["the packet is on the list"], lastingActs: ["create_new" as const] }
    ],
    notAsked: ["buying any seeds"]
  };
  return { ...spec, digest: automationStudioProjectTaskSpec.digest(spec) };
}

function gardenPlan(spec = gardenTaskSpec()): AutomationStudioProjectStructurePlan {
  const plan: Omit<AutomationStudioProjectStructurePlan, "digest"> = {
    taskSpecDigest: spec.digest,
    plan: {
      schemaVersion: "0.1",
      router: { name: "Garden", rules: [], fallback: { kind: "subflow", targetSubflowKey: "list_seeds" } },
      subflows: [
        { key: "list_seeds", name: "List seeds", role: "primary", nodes: [], edges: [], metadata: { "fluxiq.successCheck": structuredClone(SUCCESS) } },
        { key: "open_packet", name: "Open packet", role: "utility", nodes: [], edges: [], interface: structuredClone(PACKET_INTERFACE), metadata: { "fluxiq.successCheck": structuredClone(SUCCESS) } },
        { key: "plant_packet", name: "Plant packet", role: "utility", nodes: [], edges: [], interface: structuredClone(PACKET_INTERFACE), metadata: { "fluxiq.successCheck": structuredClone(SUCCESS) } }
      ]
    } as AutomationStudioProjectStructurePlan["plan"],
    partOf: { list_seeds: ["p1"], open_packet: ["p2"], plant_packet: ["p3"] }
  };
  return { ...plan, digest: automationStudioProjectStructurePlan.digest(plan) };
}

const BRIEF_SHAPES: Record<string, Pick<AutomationStudioProjectSubflowBrief, "subflowKey" | "parts" | "permittedActs"> & { interface?: AutomationStudioProjectSubflowBrief["interface"] }> = {
  list_seeds: { subflowKey: "list_seeds", parts: ["p1"], permittedActs: [] },
  open_packet: { subflowKey: "open_packet", parts: ["p2"], permittedActs: [], interface: PACKET_INTERFACE },
  plant_packet: { subflowKey: "plant_packet", parts: ["p3"], permittedActs: ["create_new"], interface: PACKET_INTERFACE }
};

/** A brief of `subflowKey`, waiting on `predecessors`. */
export function gardenBrief(briefId: string, subflowKey: string, predecessors: string[] = [], change?: (brief: AutomationStudioProjectSubflowBrief) => void): AutomationStudioProjectSubflowBrief {
  const shape = BRIEF_SHAPES[subflowKey]!;
  const brief: AutomationStudioProjectSubflowBrief = {
    briefId,
    kind: "build",
    planDigest: gardenPlan().digest,
    subflowKey,
    parts: [...shape.parts],
    entry: { caseId: "observed-current", predecessors },
    allowanceUsd: 0.02,
    maxIterations: 12,
    permittedActs: [...shape.permittedActs]
  };
  if (shape.interface) brief.interface = structuredClone(shape.interface);
  change?.(brief);
  return brief;
}

/** What the scripted builder saw of one brief. */
export type BuilderSeen = {
  briefId: string;
  callScope: string | undefined;
  lease: AutomationStudioHostResourceLease | undefined;
  signal: AbortSignal;
  purse: AutomationStudioLlmBuildPurse | undefined;
  maxIterations: number | undefined;
};

type BuilderInput = Parameters<typeof runAutomationStudioSubflowBuilderLoop>[0];
/** What the scripted builder does for one brief; absent, it spends one call and returns done. */
export type BuilderScript = (input: BuilderInput, seen: BuilderSeen) => Promise<AutomationStudioSubflowBuilderOutcome>;

/** A proposal and a yes for `input`'s scope, and one settled call on its allowance. */
export async function doneOutcome(input: BuilderInput): Promise<AutomationStudioSubflowBuilderOutcome> {
  spendOneCall(input.loop.purse);
  const proposal = proposalFor(input);
  input.accepted?.(proposal);
  return {
    loop: { ok: true, result: { subflowKey: proposal.scope.subflowKey, revision: 1, digest: proposal.digest }, trace: [], steps: [], accounting: {} } as unknown as AutomationStudioSubflowBuilderOutcome["loop"],
    proposal,
    trial: { partial: true, scope: "subflow", identity: { ...proposal.scope }, revision: 1, digest: proposal.digest, verdict: "yes", feedback: {} as JsonObject, entryPrepared: true },
    promotionAllowed: false
  };
}

export function proposalFor(input: BuilderInput): AutomationStudioSubflowProposal {
  const { buildId, briefId, planDigest, subflowKey } = input.scope;
  return { scope: { buildId, briefId, planDigest, subflowKey }, revision: 1, digest: "c".repeat(64), subflows: [], summary: "", changedPaths: [] };
}

function spendOneCall(purse: AutomationStudioLlmBuildPurse | undefined): void {
  const held = purse?.hold({ projectedCostUsd: 0.001, estimatedInputTokens: 10, maxOutputTokens: 10 });
  if (held?.ok) held.hold.settle();
}

/** Waits until `signal` aborts, then throws its reason, as a loop stopped mid-call does. */
export function untilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

export function gate(): { opened: Promise<void>; open: () => void } {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

export type GardenBuild = Awaited<ReturnType<typeof gardenBuild>>;

/** A recorded build with `briefs`, a host of `capacity`, and a dispatcher whose builder follows `scripts` by brief id. */
/** Briefs made once the build's record and purse exist, as a supervisor sizes them from the recorded plan (t570). */
export type GardenBriefs = AutomationStudioProjectSubflowBrief[] | ((context: { store: AutomationStudioProjectBuildRecordStore; purse: AutomationStudioLlmBuildPurse }) => Promise<AutomationStudioProjectSubflowBrief[]>);

export async function gardenBuild(options: { capacity: number; briefs: GardenBriefs; ceilingUsd?: number; maxCalls?: number; scripts?: Record<string, BuilderScript>; ports?: Partial<AutomationStudioProjectBriefPortFactory> }) {
  const projects = new AutomationStudioProjectPaths(undefined);
  const store = new AutomationStudioProjectBuildRecordStore(projects, new AutomationStudioFlowPaths(projects));
  await store.create({ ...REF, instructionDigest: "e".repeat(64), sourceIds: ["instruction.1"] });
  await store.recordTaskSpec(REF, gardenTaskSpec(), [{ sourceId: "instruction.1", text: SOURCE }]);
  await store.recordPlan(REF, gardenPlan());
  const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: options.ceilingUsd ?? 1, ...(options.maxCalls !== undefined ? { maxCalls: options.maxCalls } : {}) });
  // A brief may be sized from the recorded plan before it is recorded (`sized`).
  const sized = typeof options.briefs === "function" ? await options.briefs({ store, purse }) : options.briefs;
  for (const brief of sized) await store.recordBrief(REF, brief);
  const host = new StubHost({ capacity: options.capacity });
  const cancellation = new AutomationStudioBuildCancellation();
  const ledger = new AutomationStudioSiteResetProjectLedger();
  const seen: BuilderSeen[] = [];
  const events: string[] = [];
  let running = 0;
  let mostAtOnce = 0;
  const runBuilder: typeof runAutomationStudioSubflowBuilderLoop = async (input) => {
    const look: BuilderSeen = { briefId: input.scope.briefId, callScope: input.callScope, lease: AutomationStudioHostLeaseScope.current(), signal: input.loop.signal!, purse: input.loop.purse, maxIterations: input.loop.maxIterations };
    seen.push(look);
    running += 1;
    mostAtOnce = Math.max(mostAtOnce, running);
    events.push(`start ${look.briefId}`);
    try {
      return await (options.scripts?.[look.briefId] ?? doneOutcome)(input, look);
    } finally {
      running -= 1;
      events.push(`end ${look.briefId}`);
    }
  };
  const builderPorts = (): AutomationStudioProjectBuilderPorts => ({
    loop: { tools: [], decide: async () => ({ kind: "complete", result: {} }), executeTool: async () => ({ ok: true }) },
    submission: {} as unknown as AutomationStudioProjectBuilderPorts["submission"]
  });
  const dispatcherInput: AutomationStudioProjectDispatcherInput = {
    record: { store, ref: REF },
    purse,
    cancellation,
    host,
    ledger,
    ports: { builder: options.ports?.builder ?? builderPorts, reset: options.ports?.reset ?? (() => { throw new Error("no reset ports in this test"); }) },
    runBuilder
  };
  const dispatch = createAutomationStudioProjectDispatcher(dispatcherInput);
  /** Dispatches inside the supervisor's scope; resolves with the result even when the scope then reports the Flow stopped. */
  const run = (briefs = sized, signal = new AbortController().signal): Promise<AutomationStudioProjectDispatchResult> => {
    let result: AutomationStudioProjectDispatchResult | undefined;
    return cancellation.run(REF.projectId, REF.flowId, async () => {
      result = await dispatch({ briefs, signal });
    }).then(() => result!, (error: unknown) => {
      if (result) return result;
      throw error;
    });
  };
  return { store, host, purse, cancellation, ledger, briefs: sized, seen, events, mostAtOnce: () => mostAtOnce, dispatcherInput, run };
}
