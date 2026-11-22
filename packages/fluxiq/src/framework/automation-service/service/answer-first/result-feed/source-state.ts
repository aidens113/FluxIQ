import type { AutomationStudioResultEvidenceBundle, AutomationStudioResultEvidencePage } from "../../../../../runtime/result-verification/index.ts";
import type { AutomationStudioAnswerFirstResultRead } from "../result/index.ts";
import { stableJson } from "../../stable-json.ts";
import { readAutomationStudioAnswerFirstResultEvidence } from "./read-evidence.ts";
import { automationStudioAnswerFirstStoredDatasetId } from "../rows/index.ts";

type Missing = NonNullable<AutomationStudioResultEvidenceBundle["missingEvidence"]>[number];
type Held = { reason: string; original: AutomationStudioResultEvidenceBundle | undefined; replacements: Map<number, AutomationStudioResultEvidencePage>; remaining: Set<number>; missing: Missing[]; unidentified: boolean; datasets: ReadonlyMap<string, string> };

/** Missing originals are resolved by their exact read association, never by any later read or a guessed page position. */
export function automationStudioAnswerFirstResultSourceState() {
  let held: Held | undefined;
  const unavailable = () => held !== undefined && (held.unidentified || held.missing.length > 0 || held.remaining.size > 0);
  const settle = (page: AutomationStudioResultEvidencePage) => {
    if (held) held.missing = held.missing.filter((ref) => !matchesSource(ref, page, page.datasetId ?? held!.datasets.get(page.source)));
  };
  return {
    reason: () => unavailable() ? held!.reason : undefined,
    hold(reason: string, original: AutomationStudioResultEvidenceBundle, current: AutomationStudioResultEvidenceBundle, preserveRestored: boolean, datasets: ReadonlyMap<string, string>) {
      const parsed = readAutomationStudioAnswerFirstResultEvidence(original);
      held = { reason, original: parsed, replacements: new Map(), remaining: new Set(parsed?.pages.map((_, index) => index)), missing: [...(parsed?.missingEvidence ?? [])], unidentified: !parsed?.pages.length, datasets: new Map(datasets) };
      parsed?.pages.forEach((page, index) => {
        const exact = preserveRestored ? current.pages.filter((entry) => entry.carried === true && entry.invalidCount === 0 && entry.source === page.source && entry.step === page.step && entry.version === page.version && entry.place === page.place && entry.where === page.where && sameRead(page, { conditions: entry.conditions, fields: entry.fields, ...(entry.listKey === undefined ? {} : { listKey: entry.listKey }) }) && stableJson(entry.rows) === stableJson(page.rows)) : [];
        if (exact.length === 1) { held!.replacements.set(index, structuredClone(exact[0]!)); held!.remaining.delete(index); settle(page); }
      });
    },
    validate(current: AutomationStudioResultEvidenceBundle, datasets: ReadonlyMap<string, string>) {
      if (unavailable()) return;
      held = undefined;
      const missing = current.pages.filter((page) => page.invalidCount !== 0);
      if (!missing.length) return;
      held = { reason: `Contributing source validation is incomplete: ${missing.map((page) => `${page.source} (step ${page.step}, version ${page.version}: ${page.invalidCount === undefined ? "validation count unknown" : `${page.invalidCount} original rows rejected by schema`})`).join("; ")}. Retain the safe originals and repair/re-read the exact affected source; an unrelated read cannot replace it.`, original: structuredClone(current), replacements: new Map(), remaining: new Set(), missing: [], unidentified: false, datasets: new Map(datasets) };
      current.pages.forEach((page, index) => page.invalidCount === 0 ? held!.replacements.set(index, structuredClone(page)) : held!.remaining.add(index));
    },
    replace(step: string, read: AutomationStudioAnswerFirstResultRead, datasetId: string | undefined): number | undefined {
      if (!unavailable() || !held?.original || read.invalidCount !== 0) return undefined;
      const matches = held.original.pages.flatMap((page, index) => page.step === step && typeof page.place === "string" && page.place.trim().length > 0 && page.place === read.place && page.where === read.where && sameRead(page, read.version) ? [index] : []);
      if (matches.length !== 1) return undefined;
      const index = matches[0]!;
      const original = held.original.pages[index]!;
      const { leftOut: _oldRead, invalidCount: _oldValidation, datasetId: _oldDataset, ...prior } = structuredClone(original);
      held.replacements.set(index, { ...prior, source: read.source, ...(datasetId === undefined ? {} : { datasetId }), conditions: structuredClone(read.version.conditions), fields: structuredClone(read.version.fields), kept: read.kept.length, rows: read.kept.map((row) => ({ ...row })), invalidCount: read.invalidCount, ...(read.leftOut === undefined ? {} : { leftOut: structuredClone(read.leftOut) }), carried: false });
      held.remaining.delete(index);
      settle(original);
      return original.version;
    },
    /** A verified complete fresh collection supersedes unavailable originals; it never claims they were restored. */
    supersede(current: AutomationStudioResultEvidenceBundle): boolean {
      if (!unavailable()) return false;
      const previous = held?.original?.pages ?? [];
      const identities = (key: "listKey" | "where") => [...new Set(previous.flatMap((page) => page[key] === undefined ? [] : [page[key]!]))];
      if (["listKey", "where"].some((key) => identities(key as "listKey" | "where").some((value) => !current.pages.some((page) => page[key as "listKey" | "where"] === value)))) return false;
      held = undefined;
      return true;
    },
    evidence(current: AutomationStudioResultEvidenceBundle): AutomationStudioResultEvidenceBundle {
      if (!unavailable()) return current;
      if (!held?.original) return { pages: [], coverage: [], working: [], looks: [] };
      const { processing: _historical, missingEvidence: _unresolved, ...original } = held.original;
      return { ...structuredClone(original), ...(held.missing.length ? { missingEvidence: structuredClone(held.missing) } : {}), pages: original.pages.map((page, index) => structuredClone(held!.replacements.get(index) ?? page)) };
    }
  };
}

function matchesSource(ref: Missing, page: AutomationStudioResultEvidencePage, datasetId: string | undefined): boolean {
  // This codec is compared with the known original source; no hash is reversed and no position is guessed.
  // A reference without a batch key is a WHOLE-dataset requirement. One page can never settle it.
  return ref.batchKey !== undefined && ref.datasetId === (datasetId ?? automationStudioAnswerFirstStoredDatasetId("read", page.source))
    && (ref.batchKey === page.source || ref.batchKey === `read/${encodeURIComponent(page.source)}`);
}

function sameRead(page: AutomationStudioResultEvidencePage, version: AutomationStudioAnswerFirstResultRead["version"]): boolean {
  return stableJson({ conditions: page.conditions, fields: page.fields, listKey: page.listKey ?? null }) === stableJson({ conditions: version.conditions, fields: version.fields, listKey: version.listKey ?? null });
}
