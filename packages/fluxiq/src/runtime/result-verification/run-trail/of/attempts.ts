// A run's traced attempts, as trail steps (`../trail.ts`): the engine's own record of each step it ran, in run order,
// for the check of a finished run (`../../result-summary.ts`, `../../verify.ts`) and for a saved Flow's run inside an
// attempt (`SVC/answer-first/flow-run/flow-run.ts`, t963), whose result the completion judge then judges.
//
// `did` is the step's node definition (the attempt's own, else its node's), else its node id, and `on` its label;
// `asked` what it was asked to do: its node's parameters, else, for a step with none, what the run handed it (`inputs`); `outcome` how the attempt ended (its status, its route or why it was passed
// over, and its failure's code where it failed); `found` what it answered (`outputs`, and the engine's `message`),
// what it changed on the page it stayed on (the domain's `added` and `removed` view lines) and the domain's view after
// it, by the domain's declared view keys. A step that ran a child Flow is followed by that Flow's own steps, in order.
// Whole: nothing is cut (`../../step-changes.ts` says what the diff lines are).
//
// **But the host's raw capture of the page is not sent twice (t965, t967).** A step's `outputs` may
// carry the host's own capture of a page -- every element with its bounds, frame and viewport -- that
// the domain's views show: the page it left, in `found.view`, or, for a step that moved to another
// page, the page it started on, which the step before it shows as its own view. Live run
// `run-mwohvt8n-a57cad8a` (judge 0029): a press that opened a listing kept a 190 KB capture of the
// search page it was pressed on, since the rule matched only the page the view after it was of. Live run `run-mwodpw10-3d5748ab`
// (judge 0117): three such captures, about 1.1 MB each against a 17 KB view, made a 2.2 MB
// request the provider refused. So where the attempt has the domain's view after it, the capture
// of the same page in its outputs is left out and said to be shown as the view: an object in
// `outputs` that names the page the view is of (`location`), by any member, inside an answer that
// names it too -- the outermost such, with all it holds. What the step answered around it -- its
// validation, its rows, where it moved -- stays whole. A step with no view after it keeps its
// outputs as they are.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioResultTrailStep } from "../../contracts/index.ts";
import { automationStudioResultTrailSemanticStep, type AutomationStudioResultTrailSemanticOptions } from "../semantic/index.ts";
import { automationStudioResultFrameworkOutcome } from "../framework-outcome.ts";
import { automationStudioRecordBatchKey } from "../../../../engine/automation/records/index.ts";

/** One traced attempt, as far as this reads it. */
type TracedAttempt = {
  nodeId: string;
  attemptId?: string | undefined;
  definitionId?: string | undefined;
  route?: string | undefined;
  status?: string | undefined;
  effectApplied?: boolean | undefined;
  inputs?: Readonly<Record<string, unknown>> | undefined;
  outputs?: Readonly<Record<string, unknown>> | undefined;
  message?: string | undefined;
  failure?: { code?: string | undefined } | undefined;
  skipped?: unknown;
  childTrace?: { attempts?: readonly TracedAttempt[] | undefined } | undefined;
  stateRefs?: { stateDiff?: JsonObject; beforeAction?: { summary?: JsonObject | undefined }; afterAction?: { summary?: JsonObject | undefined } } | undefined;
};

/** A node of the Flow, as far as this reads it. */
type Node = { id: string; definitionId?: string | undefined; label?: string | undefined; parameterValues?: JsonObject | undefined; metadata?: JsonObject | undefined };

export function automationStudioResultTrailOfAttempts(attempts: readonly TracedAttempt[] | undefined, nodes: readonly Node[], viewKeys: readonly string[] | undefined, semantic?: AutomationStudioResultTrailSemanticOptions): AutomationStudioResultTrailStep[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const keys = (viewKeys ?? []).filter((key) => !key.includes("."));
  const steps: AutomationStudioResultTrailStep[] = [];
  const walk = (list: readonly TracedAttempt[] | undefined, path: readonly string[] | undefined): void => {
    for (const attempt of list ?? []) {
      const step = stepOf(attempt, byId.get(attempt.nodeId), keys, semantic);
      if (semantic?.judgeEvidenceVersion === 1 && path !== undefined && attempt.attemptId !== undefined) step.judgeSource = { source: automationStudioRecordBatchKey(path, attempt.attemptId) };
      steps.push(step);
      if (path !== undefined && attempt.attemptId !== undefined) walk(attempt.childTrace?.attempts, [...path, attempt.attemptId]);
      else walk(attempt.childTrace?.attempts, undefined);
    }
  };
  walk(attempts, []);
  return steps;
}

function stepOf(attempt: TracedAttempt, node: Node | undefined, keys: readonly string[], semantic: AutomationStudioResultTrailSemanticOptions | undefined): AutomationStudioResultTrailStep {
  const failed = attempt.failure?.code;
  const parameters = node?.parameterValues && Object.keys(node.parameterValues).length ? node.parameterValues : undefined;
  const asked = parameters ?? (attempt.inputs && Object.keys(attempt.inputs).length ? (attempt.inputs as JsonValue) : undefined);
  const outcome = [attempt.status, attempt.route ? `route ${attempt.route}` : undefined, attempt.skipped !== undefined && attempt.skipped !== false ? "passed over" : undefined, failed ? `failure ${failed}` : undefined]
    .filter((part): part is string => typeof part === "string" && part.length > 0).join(", ");
  const diff = attempt.stateRefs?.stateDiff;
  const changed = diff ? Object.fromEntries((["added", "removed"] as const).flatMap((key) => (typeof diff[key] === "string" && (diff[key] as string).trim() ? [[key, diff[key]!]] : []))) : {};
  const after = attempt.stateRefs?.afterAction?.summary;
  const view = after ? Object.fromEntries(keys.filter((key) => Object.hasOwn(after, key)).map((key) => [key, after[key]!])) : {};
  // The pages the domain's views show around this step: the one it left and the one it started on (header).
  const before = attempt.stateRefs?.beforeAction?.summary;
  const addresses = new Set(Object.keys(view).length ? [after?.location, before?.location].flatMap((location) => (typeof location === "string" && location.trim() ? [pageAddress(location)] : [])) : []);
  const outputs = attempt.outputs && Object.keys(attempt.outputs).length ? (addresses.size ? withoutCapture(attempt.outputs as JsonValue, addresses) : (attempt.outputs as JsonValue)) : undefined;
  const found: JsonObject = {
    ...(outputs !== undefined ? { outputs } : {}),
    ...(attempt.message?.trim() ? { message: attempt.message.trim() } : {}),
    ...(Object.keys(changed).length ? { changed } : {}),
    ...(Object.keys(view).length ? { view } : {})
  };
  const step: AutomationStudioResultTrailStep = {
    did: attempt.definitionId ?? node?.definitionId ?? attempt.nodeId,
    ...(node?.label ? { on: node.label } : {}),
    ...(asked ? { asked } : {}),
    ...(outcome ? { outcome } : {}),
    ...(Object.keys(found).length ? { found } : {})
  };
  if (semantic === undefined) return step;
  // The projector reads actual outputs/states, before the legacy view/capture
  // heuristic above. Only its screened finding enters the durable checkpoint.
  const recordOutput = parameters?.recordOutput;
  const recordSchema = recordOutput && typeof recordOutput === "object" && !Array.isArray(recordOutput) ? recordOutput.schema : undefined;
  const envelope: JsonObject = {
    evidence: (attempt.outputs ?? {}) as JsonValue,
    source: { nodeId: attempt.nodeId, ...(attempt.attemptId === undefined ? {} : { attemptId: attempt.attemptId }) },
    ...(recordSchema === undefined ? {} : { recordSchema }),
    ...(before === undefined ? {} : { before }),
    ...(after === undefined ? {} : { after }),
    ...(diff === undefined ? {} : { changed: diff })
  };
  return automationStudioResultTrailSemanticStep(step, { source: "flow-attempt", definitionId: step.did, evidence: envelope, ...(asked === undefined ? {} : { asked }), ...(step.on === undefined ? {} : { on: step.on }) }, semantic, automationStudioResultFrameworkOutcome({ ...attempt, consequences: node?.metadata?.declaredConsequences }));
}

/** What stands in for the host's capture of a page the views show (header). */
const CAPTURE_SHOWN_AS_VIEW = "[the host's capture of the page: shown as a view, this step's or the one before it]";

/** An address as a page names it, its fragment and a closing slash apart. */
function pageAddress(address: string): string {
  return address.trim().replace(/#.*$/u, "").replace(/\/+$/u, "");
}

/**
 * `value` with the host's capture of the page at `address` left out (header): an object naming that page inside an
 * answer that already names it -- the answer says where it was, and the capture beside it is the page as the host
 * read it, every element and its geometry, which `found.view` shows as the domain reads it. The outermost such object
 * goes, with all it holds; the answer around it stays.
 */
function withoutCapture(value: JsonValue, addresses: ReadonlySet<string>, insideAnswer = false): JsonValue {
  if (Array.isArray(value)) return value.map((item) => withoutCapture(item, addresses, insideAnswer));
  if (value === null || typeof value !== "object") return value;
  const names = Object.values(value).some((member) => typeof member === "string" && addresses.has(pageAddress(member)));
  if (names && insideAnswer) return CAPTURE_SHOWN_AS_VIEW;
  return Object.fromEntries(Object.entries(value).map(([key, member]) => [key, withoutCapture(member, addresses, insideAnswer || names)]));
}
