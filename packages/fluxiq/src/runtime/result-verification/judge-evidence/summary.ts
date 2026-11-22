import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultSemanticTrail, type AutomationStudioResultTrailSemanticOptions } from "../run-trail/semantic/index.ts";
import { automationStudioProjectJudgeEvidence } from "./project.ts";
import { automationStudioResultEvidenceScreen } from "../result-evidence/index.ts";
import { automationStudioJudgeEvidenceFinding } from "./finding.ts";
import { automationStudioShownJudgeFinding } from "./shown.ts";
import { automationStudioReadJudgeEvidenceFormat } from "./format.ts";
import { automationStudioReadJudgeEvidenceHistory } from "./history.ts";
import { automationStudioReadJudgeWitnessAssociation } from "./witness-association.ts";

/** One semantic request copy for Flow-less, completed-run and build judges; original rows/accounts/private evidence remain untouched. */
export function automationStudioResultJudgeSummary(summary: AutomationStudioRunResultSummary, options: AutomationStudioResultTrailSemanticOptions): AutomationStudioRunResultSummary {
  const stored = Object.hasOwn(summary, "evidenceProjection") || summary.trail?.entries.some((step) => Object.hasOwn(step, "judgeEvidence")) === true;
  const declared = Object.hasOwn(options, "judgeEvidenceVersion");
  if (!declared && !stored) return summary;
  const unsupported = declared && options.judgeEvidenceVersion !== 1;
  const tagged = Object.hasOwn(summary, "evidenceProjection");
  const format = tagged ? automationStudioReadJudgeEvidenceFormat(summary.evidenceProjection) : undefined;
  const invalidFormat = unsupported || (tagged && format === undefined);
  if (options.deniedEvidenceKeys === undefined) {
    // This is explicit privacy withholding, not a lossy fit. No opaque row or
    // old semantic cell is even placed on a model-bound/loggable request copy.
    return { schemaVersion: summary.schemaVersion, totalRecordCount: summary.totalRecordCount, totalRefusedCount: summary.totalRefusedCount, totalRowsMissingRequired: summary.totalRowsMissingRequired, recordSetCount: summary.recordSetCount, recordSets: [], flowShape: [], withheld: true, evidenceProjection: { version: 1, missing: [{ source: "binding", codes: ["judge_evidence.denied_keys_missing"] }] } };
  }
  const source = summary.buildTest ? "build-observation" : Object.hasOwn(summary, "acts") ? "call" : "flow-attempt";
  const projector = invalidFormat ? undefined : options.projectJudgeEvidence;
  const trail = automationStudioResultSemanticTrail(summary.trail, { ...options, projectJudgeEvidence: projector, legacySource: source, alreadyProjected: tagged, invalidFormat, resultEvidence: summary.resultEvidence });
  const historical = new Map((trail.trail?.entries ?? []).map((step) => [step.callId ?? `n:${step.n}`, object(step.found)?.history]));
  const retained = format?.missing.flatMap((gap) => {
    if (gap.source === "binding") return [];
    const history = historical.get(gap.source);
    const resolved = Array.isArray(history) ? history.flatMap((item) => object(item)?.codes ?? []) : [];
    const codes = gap.codes.filter((code) => !resolved.includes(code));
    return codes.length ? [{ source: gap.source, codes }] : [];
  }) ?? [];
  const gaps = [...retained, ...trail.projection.missing];
  if (invalidFormat) gaps.push({ source: "binding", codes: ["judge_evidence.version_invalid"] });
  if (!unsupported && typeof projector !== "function") gaps.push({ source: "binding", codes: ["judge_evidence.projector_missing"] });
  let withheld = summary.withheld || trail.withheld;
  const held = summary as unknown as JsonObject;
  const hasActs = Array.isArray(held.acts) && held.acts.length > 0;
  const actionTrail = trail.trail?.entries.some((step) => object(step.found)?.role === "action") === true;
  const consequential = trail.trail?.entries.some((step) => {
    const facts = step.framework;
    if (facts?.effectApplied === true || object(facts?.failure)?.effect === "ambiguous") return true;
    if (!Array.isArray(facts?.consequences) || facts.consequences.length === 0) return false;
    return facts.effectApplied !== false || object(facts.failure)?.effect === "ambiguous" || object(facts.skipped) !== undefined;
  }) === true;
  const stateRequired = hasActs || consequential || actionTrail;
  if (stateRequired) {
    const witnesses = object(held.witnesses);
    if (held.startView === undefined && witnesses?.before === undefined) gaps.push({ source: "witnesses.before", codes: ["judge_evidence.before_state_missing"] });
    if (held.endView === undefined && witnesses?.after === undefined) gaps.push({ source: "witnesses.after", codes: ["judge_evidence.after_state_missing"] });
  }
  const project = (source: string, value: JsonValue, phase?: "before" | "after"): JsonObject => {
    const durable = object(value);
    const reopened = durable && Object.hasOwn(durable, "judgeEvidence") ? automationStudioJudgeEvidenceFinding(durable.judgeEvidence, options.deniedEvidenceKeys) : tagged ? automationStudioShownJudgeFinding(value, options.deniedEvidenceKeys) : undefined;
    const finding = invalidFormat ? { missing: ["judge_evidence.version_invalid"], withheld: true } : reopened ? reopened.ok ? reopened.finding : { missing: [reopened.code], withheld: true } : automationStudioProjectJudgeEvidence({ source: phase === undefined ? "legacy" : "state", evidence: { evidence: value }, ...(phase === undefined ? {} : { phase }) }, projector, options.deniedEvidenceKeys);
    if (finding.missing.length) gaps.push({ source, codes: finding.missing });
    withheld ||= finding.withheld;
    const history = "history" in finding ? automationStudioReadJudgeEvidenceHistory(finding.history) : undefined;
    return { ...(finding.role === undefined ? {} : { role: finding.role }), ...(finding.evidence === undefined ? {} : { evidence: finding.evidence }), ...(finding.missing.length ? { missing: [...finding.missing] } : {}), ...(history === undefined ? {} : { history: history.map((entry) => ({ codes: [...entry.codes], by: entry.by })) }) };
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
      if (Object.hasOwn(witnesses, "association")) {
        const association = automationStudioReadJudgeWitnessAssociation(witnesses.association);
        if (association === undefined) gaps.push({ source: "witnesses.association", codes: ["judge_evidence.witness_association_invalid"] });
        else shown.association = association;
      }
      entries.push([key, shown]);
    } else if (key === "looked") {
      if (!Array.isArray(value)) {
        entries.push([key, project("looked", { legacyLooks: value })]);
        continue;
      }
      const unmatched = value.flatMap((look, at) => {
        if (tagged) return [project(`looked.${at + 1}`, look)];
        const origin = object(look)?.callId;
        const same = typeof origin === "string" ? (summary.trail?.entries ?? []).filter((entry) => entry.callId === origin) : [];
        // A Core-stamped source, uniquely present in the actual trail, is
        // proof of correspondence. Any unrelated/ambiguous look remains.
        return same.length === 1 ? [] : [project(`looked.${at + 1}`, { legacyLook: look })];
      });
      if (unmatched.length) entries.push([key, unmatched]);
    } else if (key === "readPages" && Array.isArray(value)) {
      entries.push([key, value.map((page, at) => {
        const read = object(page);
        if (!read) return project(`readPages.${at + 1}`, page);
        const { where, context, ...data } = read;
        // Rows, condition/removal accounts and their order stay whole. Only
        // opaque page context is domain-projected, never bookkeeping-stripped.
        return { ...data, ...(tagged ? context === undefined ? {} : { context: project(`readPages.${at + 1}.context`, context) } : where === undefined ? {} : { context: project(`readPages.${at + 1}.context`, { readPage: { where } }) }) };
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
  const uniqueGaps = gaps.filter((gap, at) => gaps.findIndex((other) => other.source === gap.source && JSON.stringify(other.codes) === JSON.stringify(gap.codes)) === at);
  entries.splice(insert < 0 ? entries.length : insert, 0, ["evidenceProjection", { version: 1, missing: uniqueGaps }]);
  const screened = automationStudioResultEvidenceScreen(Object.fromEntries(entries), options.deniedEvidenceKeys);
  return { ...screened.value, withheld: withheld || screened.withheld } as unknown as AutomationStudioRunResultSummary;
}

function object(value: JsonValue | undefined): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}
