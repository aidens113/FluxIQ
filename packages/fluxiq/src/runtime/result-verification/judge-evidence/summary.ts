import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultSemanticTrail, type AutomationStudioResultTrailSemanticOptions } from "../run-trail/semantic/index.ts";
import { automationStudioProjectJudgeEvidence } from "./project.ts";

type Projected = AutomationStudioRunResultSummary & { evidenceProjection: NonNullable<AutomationStudioRunResultSummary["evidenceProjection"]> };

/** One semantic request copy for Flow-less, completed-run and build judges; original rows/accounts/private evidence remain untouched. */
export function automationStudioResultJudgeSummary(summary: AutomationStudioRunResultSummary, options: AutomationStudioResultTrailSemanticOptions): Projected {
  const source = summary.buildTest ? "build-observation" : Object.hasOwn(summary, "acts") ? "call" : "flow-attempt";
  const trail = automationStudioResultSemanticTrail(summary.trail, { ...options, legacySource: source });
  const gaps = [...trail.projection.missing];
  let withheld = summary.withheld || trail.withheld;
  const held = summary as unknown as JsonObject;
  const hasActs = Array.isArray(held.acts) && held.acts.length > 0;
  const actionTrail = trail.trail?.entries.some((step) => object(step.found)?.role === "action") === true;
  const stateRequired = hasActs || actionTrail;
  const project = (source: string, value: JsonValue, phase?: "before" | "after"): JsonObject => {
    const finding = automationStudioProjectJudgeEvidence({ source: phase === undefined ? "legacy" : "state", evidence: { evidence: value }, ...(phase === undefined ? {} : { phase }) }, options.projectJudgeEvidence, options.deniedEvidenceKeys);
    if (finding.missing.length) gaps.push({ source, codes: finding.missing });
    withheld ||= finding.withheld;
    return { ...(finding.role === undefined ? {} : { role: finding.role }), ...(finding.evidence === undefined ? {} : { evidence: finding.evidence }), ...(finding.missing.length ? { missing: [...finding.missing] } : {}) };
  };
  const view = (key: "startView" | "endView", value: JsonValue): JsonValue | undefined => {
    // Complete data is judged from its complete rows and accounts. A support
    // capture's deliberate omission is not missing required state evidence.
    if (!stateRequired) return undefined;
    const original = object(value);
    if (!original) return project(key, value, key === "startView" ? "before" : "after");
    const actual = original.view ?? value;
    return { ...(original.after === undefined ? {} : { after: original.after }), view: project(key, actual, key === "startView" ? "before" : "after") };
  };
  const entries: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(held)) {
    if (value === undefined || key === "evidenceProjection") continue;
    if (key === "trail") {
      if (trail.trail) entries.push([key, trail.trail]);
    } else if (key === "startView" || key === "endView") {
      const shown = view(key, value);
      if (shown !== undefined) entries.push([key, shown]);
    } else if (key === "witnesses") {
      if (!stateRequired) continue;
      const witnesses = object(value);
      if (!witnesses) {
        entries.push([key, project("witnesses", value, "after")]);
        continue;
      }
      const shown: JsonObject = {};
      for (const phase of ["before", "after"] as const) if (witnesses[phase] !== undefined) shown[phase] = project(`witnesses.${phase}`, witnesses[phase]!, phase);
      entries.push([key, shown]);
    } else if (key === "looked") {
      // These are duplicate presentations of the actual call trail. Legacy
      // callers with no trail have no trustworthy source to replace them.
      if (!summary.trail?.entries.length && Array.isArray(value) && value.length > 0) entries.push([key, project("looked", { legacyLooks: value })]);
    } else if (key === "readPages" && Array.isArray(value)) {
      entries.push([key, value.map((page, at) => {
        const read = object(page);
        if (!read) return project(`readPages.${at + 1}`, page);
        const { where, ...data } = read;
        // Rows, condition/removal accounts and their order stay whole. Only
        // opaque page context is domain-projected, never bookkeeping-stripped.
        return { ...data, ...(where === undefined ? {} : { context: project(`readPages.${at + 1}.context`, { readPage: { where } }) }) };
      })]);
    } else if (key === "buildTest" && summary.buildTest) {
      entries.push([key, { ...summary.buildTest, steps: summary.buildTest.steps.map((step) => {
        const matches = (trail.trail?.entries ?? []).filter((entry) => entry.framework?.step === step.step);
        const projected = matches.length ? { semanticTrailEntries: matches.map((entry) => entry.n) } : step.observed === undefined ? undefined : project(`buildTest.${step.step}`, step.observed);
        return { ...step, ...(projected === undefined ? {} : { observed: projected }), ...(step.passes === undefined ? {} : { passes: step.passes.map((pass) => {
          const same = matches.filter((entry) => entry.framework?.pass === pass.pass);
          const observed = same.length ? { semanticTrailEntries: same.map((entry) => entry.n) } : pass.observed === undefined ? undefined : project(`buildTest.${step.step}.pass.${pass.pass}`, pass.observed);
          const { observed: _original, ...kept } = pass;
          return { ...kept, ...(observed === undefined ? {} : { observed }) };
        }) }) };
      }) }]);
    } else entries.push([key, value]);
  }
  if (!entries.some(([key]) => key === "trail") && trail.trail) entries.push(["trail", trail.trail]);
  const insert = entries.findIndex(([key]) => key === "earlierAdvice" || key === "unreadableReply");
  entries.splice(insert < 0 ? entries.length : insert, 0, ["evidenceProjection", { version: 1, missing: gaps }]);
  return { ...Object.fromEntries(entries), withheld } as Projected;
}

function object(value: JsonValue | undefined): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}
