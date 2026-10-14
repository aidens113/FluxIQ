import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import {
  automationStudioProjectSubflowBrief,
  type AutomationStudioProjectStructurePlan,
  type AutomationStudioProjectSubflowBrief,
  type AutomationStudioProjectTaskSpec
} from "../contracts/index.ts";
import type { AutomationStudioProjectSupervisorBriefSize } from "./brief-sizing.ts";
import type { AutomationStudioProjectSupervisorInputIssue } from "./plan-input.ts";

/** The most briefs one dispatch sends. */
const MAX_BRIEFS = 20;

/** The entry case of a brief that names none: the page as the build observes it now. */
const OBSERVED_CURRENT = "observed-current";

/**
 * Reads the briefs `project.dispatch` was sent, each into a whole brief bound
 * to the plan in force: Core fills in the brief's id (`nextId`), the plan's
 * digest and the subflow's interface exactly as the plan holds it, so a brief
 * can neither name another plan nor widen its interface. Each is then held to
 * the brief contract (`../contracts/subflow-brief.ts`): its parts carried by
 * its subflow, its predecessors declared, its acts asked for. Every brief's
 * issues are answered, by the brief's place in what was sent. A survey is
 * refused: the dispatcher does not run one yet.
 *
 * A brief may leave its entry out, or its predecessors: the entry is then the
 * observed current page and its predecessors what the plan's `after` says runs
 * before its subflow (`./plan-input.ts`, t569).
 *
 * **Core sizes and permits (t570).** Given `sizes`, each brief's money, turns
 * and calls are Core's (`./brief-sizing.ts`), the supervisor's own figures only
 * lowering them. Its permitted acts are always Core's: every lasting act its
 * parts ask for in the task spec, whatever was written (on A8 round 1 the
 * supervisor was refused `project.brief_act_not_asked` three times, permitting
 * an act its parts did not name). A reset's are none.
 */
export function automationStudioProjectSupervisorBriefInput(input: {
  value: JsonObject;
  structure: AutomationStudioProjectStructurePlan;
  taskSpec: AutomationStudioProjectTaskSpec;
  /** What the plan in force says runs before each subflow, by key. */
  after?: Readonly<Record<string, readonly string[]>>;
  /** Core's size for each brief sent, by its place; absent, the briefs carry their own. */
  sizes?: readonly AutomationStudioProjectSupervisorBriefSize[];
  nextId: () => string;
}): { ok: true; briefs: AutomationStudioProjectSubflowBrief[]; reason: string } | { ok: false; issues: AutomationStudioProjectSupervisorInputIssue[] } {
  const { value, structure, taskSpec } = input;
  const sent = value.briefs;
  if (!Array.isArray(sent) || !sent.length) return { ok: false, issues: [{ code: "project.dispatch_no_briefs", path: "briefs" }] };
  if (sent.length > MAX_BRIEFS) return { ok: false, issues: [{ code: "project.too_many", path: "briefs" }] };
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";
  const issues: AutomationStudioProjectSupervisorInputIssue[] = reason ? [] : [{ code: "project.dispatch_reason_missing", path: "reason" }];
  const briefs: AutomationStudioProjectSubflowBrief[] = [];
  for (const [index, raw] of sent.entries()) {
    const at = `briefs.${index}`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      issues.push({ code: "project.not_object", path: at });
      continue;
    }
    const written = raw as JsonObject;
    // The dispatcher runs no survey yet (A5b): one would come back blocked without running.
    if (written.kind === "survey") {
      issues.push({ code: "project.brief_survey_unavailable", path: `${at}.kind` });
      continue;
    }
    const subflow = structure.plan.subflows.find((candidate) => candidate.key === written.subflowKey);
    const whole: JsonObject = { ...written, briefId: input.nextId(), planDigest: structure.digest };
    delete whole.interface;
    if (subflow?.interface) whole.interface = structuredClone(subflow.interface) as unknown as JsonObject;
    if (whole.parts === undefined && written.kind === "reset") whole.parts = [];
    whole.permittedActs = written.kind === "reset" ? [] : askedActs(taskSpec, whole.parts);
    const size = input.sizes?.[index];
    if (size) {
      whole.allowanceUsd = size.allowanceUsd;
      whole.maxIterations = size.maxIterations;
      if (size.maxCalls !== undefined) whole.maxCalls = size.maxCalls;
      else delete whole.maxCalls;
    } else delete whole.maxCalls;
    whole.entry = entryOf(written.entry, typeof written.subflowKey === "string" ? input.after?.[written.subflowKey] : undefined);
    const parsed = automationStudioProjectSubflowBrief.parse(whole);
    if (parsed.status === "invalid") {
      issues.push({ code: parsed.code, path: parsed.path.replace(/^brief/u, at) });
      continue;
    }
    for (const issue of automationStudioProjectSubflowBrief.issues(parsed.value, structure, taskSpec)) issues.push({ code: issue.code, path: issue.path.replace(/^brief/u, at) });
    briefs.push(parsed.value);
  }
  if (issues.length) return { ok: false, issues };
  return { ok: true, briefs, reason: reason.slice(0, 2000) };
}

/** Every lasting act the named parts ask for, once each, in the task spec's order; none when the parts are not a list. */
function askedActs(taskSpec: AutomationStudioProjectTaskSpec, parts: JsonValue | undefined): string[] {
  if (!Array.isArray(parts)) return [];
  const named = new Set(parts.filter((part): part is string => typeof part === "string"));
  return [...new Set(taskSpec.parts.filter((part) => named.has(part.id)).flatMap((part) => part.lastingActs))];
}

/** The entry as sent, with the observed current page and the plan's `after` filled in where left out; anything else is left for the brief's reader to refuse. */
function entryOf(sent: JsonValue | undefined, after: readonly string[] | undefined): JsonValue {
  if (sent === undefined) return { caseId: OBSERVED_CURRENT, predecessors: [...(after ?? [])] };
  if (!sent || typeof sent !== "object" || Array.isArray(sent)) return sent;
  const entry = sent as JsonObject;
  return { ...entry, ...(entry.caseId === undefined ? { caseId: OBSERVED_CURRENT } : {}), ...(entry.predecessors === undefined ? { predecessors: [...(after ?? [])] } : {}) };
}
