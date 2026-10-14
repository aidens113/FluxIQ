import type { JsonObject } from "../../../../../core/index.ts";
import {
  automationStudioProjectSubflowBrief,
  type AutomationStudioProjectStructurePlan,
  type AutomationStudioProjectSubflowBrief,
  type AutomationStudioProjectTaskSpec
} from "../contracts/index.ts";
import type { AutomationStudioProjectSupervisorInputIssue } from "./plan-input.ts";

/** The most briefs one dispatch sends. */
const MAX_BRIEFS = 20;

/**
 * Reads the briefs `project.dispatch` was sent, each into a whole brief bound
 * to the plan in force: Core fills in the brief's id (`nextId`), the plan's
 * digest and the subflow's interface exactly as the plan holds it, so a brief
 * can neither name another plan nor widen its interface. Each is then held to
 * the brief contract (`../contracts/subflow-brief.ts`): its parts carried by
 * its subflow, its predecessors declared, its acts asked for. Every brief's
 * issues are answered, by the brief's place in what was sent. A survey is
 * refused: the dispatcher does not run one yet.
 */
export function automationStudioProjectSupervisorBriefInput(input: {
  value: JsonObject;
  structure: AutomationStudioProjectStructurePlan;
  taskSpec: AutomationStudioProjectTaskSpec;
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
    if (whole.permittedActs === undefined) whole.permittedActs = [];
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
