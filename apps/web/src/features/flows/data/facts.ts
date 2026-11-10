import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { asRecord, numberOf, textOf } from "../../home/model";
import { revisionEntries, runSummaries, type RunSummary } from "../wire";

/** The title Core saves a Flow's build instruction under (`flow-bootstrap-commands/save-goal.ts`). */
const BUILD_INSTRUCTION_TITLE = "Evidence-guided generation goal";

/** What the editor's header says about a Flow besides its steps. */
export type FlowFacts = {
  name: string;
  /** The Flow's description, else the instruction it was built from; absent when it has neither. */
  whatItDoes?: string;
  /** The Flow is declared in code, so its interface is changed there. */
  fromCode: boolean;
  /** Where in code it is declared, when the Flow says. */
  declaredIn?: string;
  /** The sites a run may act on, when the Flow names them. */
  sites: string[];
  lastRun?: RunSummary;
  /** False when the runs could not be read, so "not run yet" would be a guess. */
  runsRead: boolean;
  /** When the version the Flow is at was saved, when known. */
  savedAt?: number;
};

type FlowRef = { projectId: string; flowId: string };

/**
 * The Flow's name, what it does, where it is declared and how its last run went. Throws when
 * the Flow itself cannot be read; a part that cannot be read (runs, history) is left unknown.
 */
export async function loadFlowFacts(studio: ProgramCommandTransport, flow: FlowRef, signal: AbortSignal): Promise<FlowFacts> {
  const [flowAnswer, runsAnswer, historyAnswer] = await Promise.all([
    // The Flow without its nodes: the canvas endpoint answers the Flow's own fields beside the nodes in view.
    studio.post("get-graph-viewport", { ...flow, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, limit: 1 }, { signal }),
    studio.post("list-flow-runs", { ...flow, limit: 1, sort: "started", direction: "desc" }, { signal }),
    studio.post("list-graph-revisions", { ...flow, limit: 1 }, { signal })
  ]);
  const artifact = flowAnswer.ok ? asRecord(asRecord(flowAnswer.payload)?.flow) : undefined;
  if (!artifact) throw new Error(flowAnswer.error ?? "The Flow could not be read.");
  const source = asRecord(artifact.source);
  const runs = runsAnswer.ok ? runSummaries(runsAnswer.payload) : undefined;
  const saved = historyAnswer.ok ? revisionEntries(historyAnswer.payload)?.[0] : undefined;
  const sites = asRecord(artifact.executionDefaults)?.authorizedDomainIds;
  const facts: FlowFacts = {
    name: textOf(artifact.name) ?? "A Flow with no name",
    fromCode: source?.mode === "code",
    sites: Array.isArray(sites) ? sites.flatMap((site) => (textOf(site) ? [String(site)] : [])) : [],
    runsRead: runs !== undefined
  };
  const declaredIn = source?.mode === "code" ? textOf(source.moduleId) : undefined;
  if (declaredIn) facts.declaredIn = declaredIn;
  const lastRun = runs?.[0];
  if (lastRun) facts.lastRun = lastRun;
  const savedAt = numberOf(saved?.createdAt);
  if (savedAt) facts.savedAt = savedAt;
  const whatItDoes = textOf(artifact.description) ?? (await buildInstruction(studio, flow, signal));
  if (whatItDoes) facts.whatItDoes = whatItDoes.trim();
  return facts;
}

/** The instruction the Flow was built from, when it has one and it can be read. */
async function buildInstruction(studio: ProgramCommandTransport, flow: FlowRef, signal: AbortSignal): Promise<string | undefined> {
  const listed = await studio.post("list-flow-instructions", { ...flow, search: BUILD_INSTRUCTION_TITLE }, { signal });
  const instructions = listed.ok ? asRecord(listed.payload)?.instructions : undefined;
  const match = Array.isArray(instructions)
    ? instructions.map(asRecord).find((row) => row?.title === BUILD_INSTRUCTION_TITLE && row.flowId === flow.flowId && row.status !== "deleted")
    : undefined;
  const instructionId = textOf(match?.instructionId);
  if (!instructionId) return undefined;
  const read = await studio.post("get-flow-instruction", { projectId: flow.projectId, instructionId }, { signal });
  return read.ok ? textOf(asRecord(asRecord(read.payload)?.instruction)?.body) : undefined;
}
