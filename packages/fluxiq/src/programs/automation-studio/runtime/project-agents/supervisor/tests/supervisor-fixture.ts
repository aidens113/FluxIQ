// A project build's surroundings for the supervisor tests: a lending
// library's catalogue (no realistic Lab scenario uses one), the web domain's
// real node definitions with the candidate refusal tests' stub domain, an
// in-memory build record, a stub dispatcher whose builders are the real scoped
// submission controller run on fixed scripts, a stub ledger and a stub trial.
import type { JsonObject } from "../../../../../../core/index.ts";
import { refusalTestSubmission } from "../../../flow-bootstrap/candidate/tests/refusal-domain-fixture.ts";
import type { AutomationStudioCandidateTrialAct, AutomationStudioCandidateTrialPort, AutomationStudioCandidateTrialResult } from "../../../flow-bootstrap/candidate/index.ts";
import { AutomationStudioSiteResetProjectLedger } from "../../../flow-bootstrap/site-reset/index.ts";
import { AutomationStudioSubflowScopedSubmissionController, type AutomationStudioSubflowProposal } from "../../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioLlmBuildPurse, AutomationStudioLlmBuildPurseJudging } from "../../../llm/build-purse/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../../llm/evidence-loop.ts";
import { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../../service/paths/index.ts";
import type { AutomationStudioProjectBuilderReturn, AutomationStudioProjectInstructionSource, AutomationStudioProjectSubflowBrief } from "../../contracts/index.ts";
import type { AutomationStudioProjectDispatchRequest } from "../../dispatch/index.ts";
import { AutomationStudioProjectBuildRecordStore } from "../../record/index.ts";
import type { AutomationStudioProjectSupervisorKept, AutomationStudioProjectSupervisorPorts } from "../index.ts";

export const TASK = "Find the three newest titles by Ada Hart and place a hold on the first one. Then note the hold's collection shelf.";
export const SOURCES: AutomationStudioProjectInstructionSource[] = [{ sourceId: "instruction.1", text: TASK }];
export const BUILD = { projectId: "project.test", flowId: "flow.test", buildId: "build.1" };

/** One part per entry: id, words copied from the task, lasting acts. */
export function taskSpecInput(parts: Array<[string, string, string[]]>): JsonObject {
  return { parts: parts.map(([id, text, lastingActs]) => ({ id, quote: { sourceId: "instruction.1", text }, goalFacts: [`${text} is done`], lastingActs })), notAsked: ["borrowing any title"] };
}

/** A subflow in the supervisor's planning format (`../plan-input.ts`): its parts, the names it takes and hands on, and what runs before it. */
export function subflow(key: string, parts: string[], options: { inputs?: string[]; outputs?: string[]; after?: string[] } = {}): JsonObject {
  return { key, name: key.replace(/_/gu, " "), purpose: `Does ${parts.join(" and ")}.`, parts, ...options };
}

/** What `project.write_plan` is sent: the task spec and the subflows, nothing else. */
export function planInput(subflows: JsonObject[], spec: JsonObject): JsonObject {
  return { taskSpec: spec, subflows };
}

/** The script a builder of each subflow writes, by subflow key; a part reads every input it declares (`flow-bootstrap/subflow-candidate/callable-target.ts`, t581). */
const SCRIPTS: Record<string, string[]> = {
  main: ["flow: Find the titles", "step: open the catalogue", "  node: web.browser.navigate", "  url: https://library.test/catalogue"],
  find_newest: ["flow: Find the newest titles", "step: open the catalogue", "  node: web.browser.navigate", "  url: https://library.test/catalogue"],
  find_titles: ["flow: Find the titles", "part find_titles: find the titles", "  input: author", "  output: titles = $step.rows.records", "  step rows: read the rows", "    node: web.dom.extract_list", "    extractList: extraction.1", "    extractList.minItems: 0", "  step: type the author", "    node: web.dom.type", "    selector: .author", "    text: $input.author", "end"],
  place_hold: ["flow: Place a hold", "part place_hold: place the hold", "  input: titles", "  output: shelf = $step.read.records", "  step: press hold", "    node: web.dom.click", "    selector: .hold", "    consequences: create_new", "  step read: read the shelf", "    node: web.dom.extract_list", "    extractList: extraction.2", "    extractList.minItems: 0", "  step: type the titles", "    node: web.dom.type", "    selector: .titles", "    text: $input.titles", "end"],
  note_shelf: ["flow: Note the shelf", "part note_shelf: note the shelf", "  input: shelf", "  step: open the hold", "    node: web.browser.navigate", "    url: https://library.test/holds", "  step: type the shelf", "    node: web.dom.type", "    selector: .shelf", "    text: $input.shelf", "end"]
};

/** What the stub dispatcher answers a brief with: done unless the test says otherwise. */
export type BuilderPlan = (brief: AutomationStudioProjectSubflowBrief, attempt: number) => "done" | "blocked" | "partial";

/**
 * A build with its ports. The dispatcher runs the real scoped submission
 * controller on the subflow's script and answers done with its proposal; a
 * build brief of a subflow carrying a lasting act leaves one act in place,
 * which a done reset brief undoes. Every request it was handed is kept.
 */
export function project(options: {
  builder?: BuilderPlan;
  /** The trials a return that is not done lists (t606); none when absent. */
  notDoneTrials?: (brief: AutomationStudioProjectSubflowBrief, attempt: number) => AutomationStudioProjectBuilderReturn["trials"];
  trial?: (attempt: number) => AutomationStudioCandidateTrialResult["verdict"];
  /** What each whole trial's feedback says, beyond its verdict (t603); `{ said: <verdict> }` when absent. */
  trialFeedback?: (attempt: number) => JsonObject;
  trialActs?: boolean;
  withTrial?: boolean;
  purse?: AutomationStudioLlmBuildPurse;
  reserve?: AutomationStudioLlmBuildPurseJudging;
  /** Run as each brief starts, as its builder would spend. */
  onBrief?: (brief: AutomationStudioProjectSubflowBrief) => void;
  /** Run as each whole trial is judged, as its judge would spend. */
  onTrial?: () => void;
  /**
   * How the build's real lasting-act ledger is driven (t586; every build has
   * one since t590): a build brief's act is its subflow trial's, a whole trial's acts
   * are recorded under the supervisor as the service's trial port records them,
   * and a reset brief undoes each act in place through the site's own control
   * (`undoes`, the default) or finds none (`undoes: false`), then checks what
   * is left as a reset's completion does. `hook`: the trial port has the
   * deployment's start hook, which puts the whole site back.
   */
  ledger?: { hook?: boolean; undoes?: boolean };
} = {}) {
  const projects = new AutomationStudioProjectPaths(undefined);
  let clock = 1000;
  const record = new AutomationStudioProjectBuildRecordStore(projects, new AutomationStudioFlowPaths(projects), { now: () => (clock += 1) });
  const proposals = new Map<string, AutomationStudioSubflowProposal>();
  const dispatched: AutomationStudioProjectDispatchRequest[] = [];
  const attempts = new Map<string, number>();
  const trials: Array<{ revision: number; digest: string }> = [];
  const submission = refusalTestSubmission();
  const ledger = new AutomationStudioSiteResetProjectLedger();
  /** What the supervisor told the build it kept, each time a plan came into force (t590). */
  const kept: AutomationStudioProjectSupervisorKept[] = [];
  /** How many whole trials had run each time the start hook ran. */
  const hooks: number[] = [];
  /** A real reset brief: each act in place undone on its own item where the site has a control, then what is left checked, as its completion is. */
  const resetOnLedger = async (real: AutomationStudioSiteResetProjectLedger): Promise<boolean> => {
    const inPlace = real.snapshot().acts.filter((act) => act.inPlace);
    for (const act of inPlace) {
      if (options.ledger?.undoes === false) continue;
      real.forBrief(act.owner).explored({ callId: `undo-${act.act}`, toolId: "core.run_node", undoes: act.act, landed: true, on: "own", declared: { permitted: true, effect: "mutate", consequences: [], control: { name: "Cancel hold", kind: "button" }, verb: "click" } });
    }
    for (const owner of new Set(inPlace.map((act) => act.owner))) await real.forBrief(owner).beforeTrial({ compare: async () => ({ moved: false }) });
    return !real.snapshot().acts.some((act) => act.inPlace);
  };
  const dispatch: AutomationStudioProjectSupervisorPorts["dispatch"] = async (request) => {
    dispatched.push({ briefs: request.briefs.map((brief) => structuredClone(brief)), signal: request.signal });
    const returns: AutomationStudioProjectBuilderReturn[] = [];
    for (const brief of request.briefs) {
      options.onBrief?.(brief);
      const attempt = (attempts.get(brief.subflowKey) ?? 0) + 1;
      attempts.set(brief.subflowKey, attempt);
      const outcome = brief.kind === "reset" ? "done" : (options.builder?.(brief, attempt) ?? "done");
      if (brief.kind === "reset") {
        const undone = await resetOnLedger(ledger);
        returns.push({ briefId: brief.briefId, outcome: undone ? "done" : "blocked", reason: undone ? "Every act of this build is undone." : "The site offers no control that undoes these acts.", trials: [], spentUsd: 0.001, calls: 2 });
        continue;
      }
      if (outcome !== "done") {
        returns.push({ briefId: brief.briefId, outcome, reason: `The ${brief.subflowKey} control could not be found.`, trials: options.notDoneTrials?.(brief, attempt) ?? [], spentUsd: 0.01, calls: 4 });
        continue;
      }
      const proposal = await propose(brief);
      proposals.set(brief.briefId, proposal);
      if (brief.permittedActs.length) ledger.forBrief(brief.briefId).trialRan([{ step: 1, definitionId: "web.output.dom-click", label: `press hold for ${brief.subflowKey}`, consequences: ["create_new"] }], `trial-${brief.briefId}`);
      returns.push({ briefId: brief.briefId, outcome: "done", reason: "Its trial answered yes.", proposal: { subflowKey: brief.subflowKey, revision: proposal.revision, digest: proposal.digest }, trials: [{ kind: "subflow_trial", receiptId: `trial-${brief.briefId}`, digest: "c".repeat(64) }], spentUsd: 0.02, calls: 6 });
    }
    return { returns };
  };
  async function propose(brief: AutomationStudioProjectSubflowBrief): Promise<AutomationStudioSubflowProposal> {
    const view = await record.read(BUILD);
    const plan = view!.record.plans.at(-1)!.plan;
    const spec = view!.record.taskSpecs.at(-1)!.taskSpec;
    const subflow = plan.plan.subflows.find((candidate) => candidate.key === brief.subflowKey)!;
    const controller = new AutomationStudioSubflowScopedSubmissionController({
      scope: {
        buildId: BUILD.buildId, briefId: brief.briefId, planDigest: brief.planDigest, subflowKey: brief.subflowKey,
        parts: brief.parts.map((id) => {
          const part = spec.parts.find((candidate) => candidate.id === id)!;
          return { partId: id, sourceId: part.quote.sourceId, text: part.quote.text };
        }),
        ...(subflow.interface ? { interface: subflow.interface } : {}),
        ...(subflow.metadata?.["fluxiq.successCheck"] ? { successCheck: subflow.metadata["fluxiq.successCheck"] } : {}),
        predecessors: brief.entry.predecessors
      },
      siblings: plan.plan.subflows.map((candidate) => candidate.key).filter((key) => key !== brief.subflowKey),
      submission
    });
    const submitted = await controller.submit({ flow: SCRIPTS[brief.subflowKey]!.join("\n") });
    if (!submitted.ok) throw new Error(`fixture script refused: ${JSON.stringify(submitted.check.feedback)}`);
    return submitted.proposal;
  }
  const run: AutomationStudioCandidateTrialPort = async (request) => {
    trials.push({ revision: request.revision, digest: request.digest });
    options.onTrial?.();
    const verdict = options.trial?.(trials.length) ?? "yes";
    const trialActs: AutomationStudioCandidateTrialAct[] = options.trialActs ? [{ step: 1, definitionId: "web.output.dom-click", consequences: ["create_new"] }] : [];
    // As the service's whole-trial port records them (`service/project-build/whole-trials.ts`).
    if (trialActs.length) ledger.forBrief("supervisor").trialRan(trialActs, `run-${trials.length}`);
    return { revision: request.revision, digest: request.digest, verdict, feedback: options.trialFeedback?.(trials.length) ?? { said: verdict }, trialRunId: `run-${trials.length}`, ...(trialActs.length ? { acts: trialActs } : {}) };
  };
  const prepareStart: NonNullable<AutomationStudioCandidateTrialPort["prepareStart"]> = async () => {
    hooks.push(trials.length);
    return "reset";
  };
  const trialPort: AutomationStudioCandidateTrialPort = options.ledger?.hook ? Object.assign(run, { prepareStart }) : run;
  const ports: AutomationStudioProjectSupervisorPorts = {
    build: BUILD,
    record,
    instructionDigest: "e".repeat(64),
    sources: SOURCES,
    dispatch,
    proposals: (ref) => proposals.get(ref.briefId),
    projectLedger: ledger,
    kept: (told) => {
      kept.push({ planDigest: told.planDigest, madeUnder: new Map(told.madeUnder) });
    },
    submission: { ...submission, instructionText: TASK },
    ...(options.withTrial === false ? {} : { trial: { candidateId: "candidate.1", port: trialPort } }),
    ...(options.purse ? { purse: options.purse } : {}),
    ...(options.reserve ? { reserve: options.reserve } : {})
  };
  return { ports, record, dispatched, proposals, trials, ledger, hooks, kept };
}

/** A tool the harness offers beside the supervisor's: one observe-only look, and some it must not get. */
export const HOST_TOOLS: AutomationStudioLlmEvidenceTool[] = [
  { toolId: "web.page.read", description: "Read the page", effect: "observe", inputSchema: { type: "object" }, initialObservation: { input: {} } },
  { toolId: "core.run_node", description: "Run a node", effect: "mutate", perCallEffect: true, inputSchema: { type: "object" } },
  { toolId: "core.describe_nodes", description: "Describe nodes", effect: "observe", inputSchema: { type: "object" } },
  { toolId: "core.submit_candidate", description: "Submit", effect: "observe", inputSchema: { type: "object" } },
  { toolId: "project.dispatch", description: "A host's own", effect: "observe", inputSchema: { type: "object" } }
];
