import type { AutomationStudioResultEvidenceBundle, AutomationStudioResultEvidencePage } from "../../../../../runtime/result-verification/index.ts";
import type { AutomationStudioAnswerFirstResultRead } from "../result/index.ts";
import { stableJson } from "../../stable-json.ts";
import { readAutomationStudioAnswerFirstResultEvidence } from "./read-evidence.ts";

/** Missing originals are resolved by their exact read association, never by any later read or a guessed page position. */
export function automationStudioAnswerFirstResultSourceState() {
  let held: { reason: string; original: AutomationStudioResultEvidenceBundle | undefined; replacements: Map<number, AutomationStudioResultEvidencePage>; remaining: Set<number>; unknown: boolean } | undefined;
  const unavailable = () => held !== undefined && (held.unknown || held.remaining.size > 0);
  return {
    reason: () => unavailable() ? held!.reason : undefined,
    hold(reason: string, original: AutomationStudioResultEvidenceBundle, current: AutomationStudioResultEvidenceBundle, preserveRestored: boolean) {
      const parsed = readAutomationStudioAnswerFirstResultEvidence(original);
      held = { reason, original: parsed, replacements: new Map(), remaining: new Set(parsed?.pages.map((_, index) => index)), unknown: !parsed?.pages.length || Boolean(parsed?.missingEvidence?.length) };
      parsed?.pages.forEach((page, index) => {
        const exact = preserveRestored ? current.pages.filter((entry) => entry.carried === true && entry.source === page.source && entry.step === page.step && entry.version === page.version && entry.place === page.place && entry.where === page.where && sameRead(page, { conditions: entry.conditions, fields: entry.fields, ...(entry.listKey === undefined ? {} : { listKey: entry.listKey }) }) && stableJson(entry.rows) === stableJson(page.rows)) : [];
        if (exact.length === 1) { held!.replacements.set(index, structuredClone(exact[0]!)); held!.remaining.delete(index); }
      });
    },
    replace(step: string, read: AutomationStudioAnswerFirstResultRead): number | undefined {
      if (!unavailable() || !held?.original) return undefined;
      const matches = held.original.pages.flatMap((page, index) => page.step === step && typeof page.place === "string" && page.place.trim().length > 0 && page.place === read.place && page.where === read.where && sameRead(page, read.version) ? [index] : []);
      if (matches.length !== 1) return undefined;
      const index = matches[0]!;
      const original = held.original.pages[index]!;
      const { leftOut: _oldRead, ...prior } = structuredClone(original);
      held.replacements.set(index, { ...prior, source: read.source, conditions: structuredClone(read.version.conditions), fields: structuredClone(read.version.fields), kept: read.kept.length, rows: read.kept.map((row) => ({ ...row })), ...(read.leftOut === undefined ? {} : { leftOut: structuredClone(read.leftOut) }), carried: false });
      held.remaining.delete(index);
      return original.version;
    },
    evidence(current: AutomationStudioResultEvidenceBundle): AutomationStudioResultEvidenceBundle {
      if (!unavailable()) return current;
      if (!held?.original) return { pages: [], coverage: [], working: [], looks: [] };
      const { processing: _historical, ...original } = held.original;
      return { ...structuredClone(original), pages: original.pages.map((page, index) => structuredClone(held!.replacements.get(index) ?? page)) };
    }
  };
}

function sameRead(page: AutomationStudioResultEvidencePage, version: AutomationStudioAnswerFirstResultRead["version"]): boolean {
  return stableJson({ conditions: page.conditions, fields: page.fields, listKey: page.listKey ?? null }) === stableJson({ conditions: version.conditions, fields: version.fields, listKey: version.listKey ?? null });
}
