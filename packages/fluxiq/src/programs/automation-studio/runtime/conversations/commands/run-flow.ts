// "Run it": running a saved Flow for real.
//
// The panel's `run.execute`, run by Core: one `run-runtime-session` call with
// the Flow, which answers when the run has ended. That can take minutes, so it
// runs in the background and the thread gets the ending when there is one.
//
// The run asks for the model (`explore_and_adapt`), so a step that broke can
// be repaired, under the caller's own session. A paired client's calls reach
// the endpoint as its person's unlocked session, so the endpoint cannot see
// the pairing; the command asks for its rule itself: the person's key pays only
// for the result checks that judge a repair (MVP item 23). A run that ended
// without failing then says what it learned, in plain words (`runLearned`
// below): only Core's closed change kinds (`patch[].kind`, then
// `appliedTo[].kind`), never the model's diagnosis, page text or a selector,
// and whether the next run starts with it (applied) or it waits for review.

import type { AutomationStudioChangeProposalKind, AutomationStudioFlowAdaptation } from "../../../model/index.ts";
import { automationStudioConversationCommandText } from "./argument.ts";
import type { AutomationStudioConversationCommand, AutomationStudioConversationCommandPort } from "./command.ts";
import { automationStudioConversationCallCause, automationStudioConversationCommandProgress } from "./progress.ts";

const TITLE = "Run a Flow";

type RunAnswer = {
  runtimeSession?: { runId?: unknown; status?: unknown };
  terminalReason?: unknown;
  createdAdaptationIds?: unknown;
  durableBehaviorChanged?: unknown;
  reauthored?: unknown;
};

export const AUTOMATION_STUDIO_CONVERSATION_RUN_FLOW: AutomationStudioConversationCommand = {
  background: true,
  capability: {
    id: "run.execute",
    title: TITLE,
    summary: "Runs the Flow for real and reports what came back.",
    group: "Running",
    control: "Run",
    arguments: [{ name: "flowId", describe: "The Flow to run.", required: true }],
    phrases: ["run it", "run the flow", "go", "start it", "execute the flow", "try it"],
    consequences: ["create_new"],
    reauthorizes: false
  },
  announce: ({ flowName }) => `Running ${flowName ? `"${flowName}"` : "the Flow"} now. I'll say here how it went.`,
  async run(context, args) {
    const progress = automationStudioConversationCommandProgress(TITLE, context.keyLocked);
    const flowId = automationStudioConversationCommandText(args, "flowId");
    if (!flowId) return progress.failed("I could not tell which Flow to run");
    progress.carry({ flowId });
    const response = await context.port.call("run-runtime-session", { projectId: context.projectId, flowId, runIntent: "explore_and_adapt", ...(context.paired ? { resultCheckCallerPays: "repair_checks" } : {}) });
    const answer = (response.payload ?? {}) as RunAnswer;
    const runId = typeof answer.runtimeSession?.runId === "string" ? answer.runtimeSession.runId : undefined;
    if (runId) progress.carry({ runId });
    if (!response.ok) {
      if (runId) progress.landed(`started run ${runId}`);
      return progress.failed(automationStudioConversationCallCause("the run", response));
    }
    const status = typeof answer.runtimeSession?.status === "string" ? answer.runtimeSession.status : "ended";
    const reason = typeof answer.terminalReason === "string" && answer.terminalReason && answer.terminalReason !== status ? `: ${answer.terminalReason.replace(/\.$/u, "")}` : "";
    const summary = `The run${runId ? ` ${runId}` : ""} ended ${status}${reason}.`;
    if (status === "failed" || status === "cancelled") return { ...progress.failed(`it ended ${status}${reason}`), summary };
    const adaptationIds = Array.isArray(answer.createdAdaptationIds) ? answer.createdAdaptationIds.filter((id): id is string => typeof id === "string" && id.length > 0) : [];
    const reauthored = answer.reauthored === "applied" || answer.reauthored === "not_applied" ? answer.reauthored : undefined;
    const learned = await runLearned({ port: context.port, projectId: context.projectId, flowId, adaptationIds, durableBehaviorChanged: answer.durableBehaviorChanged === true, reauthored });
    return progress.succeeded(learned ? `${summary} ${learned}` : summary);
  }
};

type AppliedTarget = NonNullable<AutomationStudioFlowAdaptation["appliedTo"]>[number]["kind"];

const BY_KIND: Record<AutomationStudioChangeProposalKind, string> = {
  edit_action_target: "it now finds the control it presses a different way",
  edit_expectation: "it changed what it waits to see after a step",
  edit_subflow: "it re-wrote some of its steps",
  create_subflow: "it added steps for a case it had not met before",
  edit_router: "it now picks a different path at one point",
  edit_recovery: "it learned a way past a step that goes wrong",
  insert_deterministic_path: "it added steps that get it past a step that goes wrong",
  promote_adaptation: "it kept a fix it had tried before",
  edit_instruction: "it changed the instructions it follows"
};

const BY_TARGET: Record<AppliedTarget, string> = {
  action_target: BY_KIND.edit_action_target,
  expectation: BY_KIND.edit_expectation,
  subflow: BY_KIND.edit_subflow,
  router: BY_KIND.edit_router,
  instruction: BY_KIND.edit_instruction
};

/** A re-authored Flow that was kept (t267 S4): only after a whole run with it was judged to answer. */
const REAUTHORED = "it re-wrote some of its steps, and a whole run with them was judged to do what you asked";

/** A re-author that was settled without being kept: the Flow is unchanged by it. */
const REAUTHOR_NOT_KEPT = "It tried re-writing some of its steps, but a run with them was not judged to do what you asked, so the Flow stays as it was.";

/** What a change that could not be read is called: something changed, and nothing is guessed about what. */
const UNREAD = "it changed how it runs";

type Learned = { what: string; applied: boolean };

/**
 * The sentences that say what the run's recorded changes taught the Flow, or
 * "" when it recorded none. `durableBehaviorChanged` is the run's own reading
 * of whether a change was applied, used only for a change that cannot be read.
 */
async function runLearned(input: {
  port: AutomationStudioConversationCommandPort;
  projectId: string;
  flowId: string;
  adaptationIds: readonly string[];
  durableBehaviorChanged: boolean;
  /** How the run's re-author settled (`run-runtime-session`'s `reauthored`): kept only once a whole re-run with it was judged to answer. */
  reauthored?: "applied" | "not_applied" | undefined;
}): Promise<string> {
  const learned: Learned[] = input.reauthored === "applied" ? [{ what: REAUTHORED, applied: true }] : [];
  for (const adaptationId of input.adaptationIds) {
    const response = await input.port.call("get-flow-adaptation", { projectId: input.projectId, flowId: input.flowId, adaptationId });
    const adaptation = response.ok ? (response.payload as { adaptation?: Partial<AutomationStudioFlowAdaptation> | null } | undefined)?.adaptation : undefined;
    const next = adaptation ? { what: changeWords(adaptation), applied: adaptation.status === "applied" } : { what: UNREAD, applied: input.durableBehaviorChanged };
    if (!learned.some((entry) => entry.what === next.what && entry.applied === next.applied)) learned.push(next);
  }
  const [only] = learned;
  if (!only) return input.reauthored === "not_applied" ? REAUTHOR_NOT_KEPT : "";
  if (learned.length === 1) return `It learned something from this run: ${only.what}. ${only.applied ? "The next run starts with it." : "That waits for your review before a run uses it."}`;
  const each = learned.map((entry) => `${entry.what.charAt(0).toUpperCase()}${entry.what.slice(1)}, ${entry.applied ? "and the next run starts with it" : "which waits for your review before a run uses it"}.`);
  return `It learned ${learned.length} things from this run. ${each.join(" ")}`;
}

/** The change in plain words, from its kinds alone. */
function changeWords(adaptation: Partial<AutomationStudioFlowAdaptation>): string {
  const byKind = (Array.isArray(adaptation.patch) ? adaptation.patch : []).flatMap((patch) => wordsFor(BY_KIND, patch?.kind));
  const byTarget = (Array.isArray(adaptation.appliedTo) ? adaptation.appliedTo : []).flatMap((target) => wordsFor(BY_TARGET, target?.kind));
  const words = [...new Set(byKind.length ? byKind : byTarget)];
  return words.length ? words.join(" and ") : UNREAD;
}

/** The words for a stored kind, or none for one Core does not name (a stored record is not trusted to hold only known kinds). */
function wordsFor(table: Readonly<Record<string, string>>, kind: unknown): string[] {
  return typeof kind === "string" && Object.hasOwn(table, kind) ? [table[kind]!] : [];
}
