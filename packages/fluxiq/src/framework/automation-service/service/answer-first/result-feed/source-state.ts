import type { AutomationStudioResultEvidenceBundle, AutomationStudioResultEvidencePage } from "../../../../../runtime/result-verification/index.ts";
import type { AutomationStudioAnswerFirstResultRead } from "../result/index.ts";
import { stableJson } from "../../stable-json.ts";
import { readAutomationStudioAnswerFirstResultEvidence } from "./read-evidence.ts";
import { automationStudioAnswerFirstStoredDatasetId } from "../rows/index.ts";

type Missing = NonNullable<AutomationStudioResultEvidenceBundle["missingEvidence"]>[number];
type Collection = { listKey?: string; where?: string };
type Held = { reason: string; original: AutomationStudioResultEvidenceBundle | undefined; replacements: Map<number, AutomationStudioResultEvidencePage>; remaining: Set<number>; missing: Missing[]; unidentified: boolean; datasets: ReadonlyMap<string, string>; associations: ReadonlyMap<string, readonly Collection[]> };

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
      const missing = [...(parsed?.missingEvidence ?? [])];
      const observed = current.pages.filter((page) => missing.some((ref) => associated(ref, page, datasets))).map((page) => ({ ...structuredClone(page), ...(datasets.has(page.source) ? { datasetId: datasets.get(page.source)! } : {}) }));
      // These are actual current pages from the referenced dataset, not reconstructed missing originals.
      // Keep their unresolved references so persistence records the partial evidence without claiming readiness.
      const recorded = parsed && !parsed.pages.length && observed.length ? { ...parsed, pages: observed } : parsed;
      const associations = new Map(missing.map((ref) => [stableJson(ref), [...(recorded?.pages ?? []), ...current.pages].filter((page) => associated(ref, page, datasets)).flatMap((page) => page.listKey === undefined && page.where === undefined ? [] : [{ ...(page.listKey === undefined ? {} : { listKey: page.listKey }), ...(page.where === undefined ? {} : { where: page.where }) }])]));
      held = { reason, original: recorded, replacements: new Map(), remaining: new Set(recorded?.pages.map((_, index) => index)), missing, unidentified: !parsed?.pages.length, datasets: new Map(datasets), associations };
      recorded?.pages.forEach((page, index) => {
        const exact = preserveRestored ? current.pages.filter((entry) => entry.carried === true && entry.invalidCount === 0 && entry.source === page.source && entry.step === page.step && entry.version === page.version && entry.place === page.place && entry.where === page.where && sameRead(page, { conditions: entry.conditions, fields: entry.fields, ...(entry.listKey === undefined ? {} : { listKey: entry.listKey }) }) && stableJson(entry.rows) === stableJson(page.rows)) : [];
        if (exact.length === 1) {
          held!.replacements.set(index, structuredClone(exact[0]!));
          held!.remaining.delete(index);
          settle(page);
        }
      });
    },
    validate(current: AutomationStudioResultEvidenceBundle, datasets: ReadonlyMap<string, string>) {
      if (unavailable()) return;
      held = undefined;
      const missing = current.pages.filter((page) => page.invalidCount !== 0);
      if (!missing.length) return;
      held = { reason: `Contributing source validation is incomplete: ${missing.map((page) => `${page.source} (step ${page.step}, version ${page.version}: ${page.invalidCount === undefined ? "validation count unknown" : `${page.invalidCount} original rows rejected by schema`})`).join("; ")}. Retain the safe originals and repair/re-read the exact affected source; an unrelated read cannot replace it.`, original: structuredClone(current), replacements: new Map(), remaining: new Set(), missing: [], unidentified: false, datasets: new Map(datasets), associations: new Map() };
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
      if (!unavailable() || !current.pages.length) return false;
      const previous = held?.original?.pages ?? [];
      if (previous.some((prior) => !current.pages.some((page) => sameCollection(prior, page)))) return false;
      for (const ref of held!.missing) {
        const associated = held!.associations.get(stableJson(ref));
        if (!associated?.length || associated.some((prior) => !current.pages.some((page) => sameCollection(prior, page)))) return false;
      }
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

/** Keep each known source tuple together; a new capture's opaque dataset id need not equal the old one. */
function sameCollection(prior: Collection, page: Collection): boolean {
  return (prior.listKey !== undefined || prior.where !== undefined) && (prior.listKey === undefined || prior.listKey === page.listKey) && (prior.where === undefined || prior.where === page.where);
}

function associated(ref: Missing, page: AutomationStudioResultEvidencePage, datasets: ReadonlyMap<string, string>): boolean {
  return (page.datasetId ?? datasets.get(page.source)) === ref.datasetId && (ref.batchKey === undefined || ref.batchKey === page.source || ref.batchKey === `read/${encodeURIComponent(page.source)}`);
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
