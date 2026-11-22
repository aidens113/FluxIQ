import type { JsonObject } from "../../../core/index.ts";
import { automationStudioFlowBootstrapInstructionColumns } from "../../flow-authoring/bootstrap/answerability/index.ts";
import type { AutomationStudioResultEvidenceBundle, AutomationStudioResultEvidencePage } from "./types.ts";

/** Merge source snapshots, never reconstructing a page from a processed dataset's rows or counts. */
export function automationStudioResultEvidenceFromBatches(input: {
  datasets: readonly string[];
  entries?: readonly { datasetId: string; batchKey: string; nodeId?: string; invalidCount?: number; evidence?: JsonObject }[];
  instructionText?: string;
}): AutomationStudioResultEvidenceBundle {
  const pages: AutomationStudioResultEvidencePage[] = [];
  const coverage: AutomationStudioResultEvidenceBundle["coverage"][number][] = [];
  const working: AutomationStudioResultEvidenceBundle["working"][number][] = [];
  const looks: AutomationStudioResultEvidencePage[] = [];
  const missing: Array<{ datasetId: string; batchKey?: string }> = [];
  /** The latest stored processing account (t970): each publication is the whole answer, so its account is the answer's. */
  let processing: AutomationStudioResultEvidenceBundle["processing"];
  const datasets = new Set(input.datasets);
  for (const entry of input.entries ?? []) {
    if (!datasets.has(entry.datasetId)) continue;
    if (entry.invalidCount !== undefined && (!Number.isSafeInteger(entry.invalidCount) || entry.invalidCount < 0)) throw new Error("Stored batch validation provenance is invalid.");
    if (entry.nodeId !== undefined && (typeof entry.nodeId !== "string" || !entry.nodeId.trim())) throw new Error("Stored batch producer identity is invalid.");
    if (entry.evidence === undefined) {
      missing.push({ datasetId: entry.datasetId, batchKey: entry.batchKey });
      continue;
    }
    const bundle = entry.evidence;
    if (!Array.isArray(bundle.pages) || !Array.isArray(bundle.coverage) || !Array.isArray(bundle.working) || !Array.isArray(bundle.looks)) throw new Error("Stored result evidence is invalid.");
    for (const raw of [...bundle.pages, ...bundle.looks]) {
      if (isObject(raw) && Object.hasOwn(raw, "datasetId") && (typeof raw.datasetId !== "string" || !raw.datasetId.trim())) throw new Error("Stored result page dataset provenance is invalid.");
      if (isObject(raw) && Object.hasOwn(raw, "invalidCount") && (!Number.isSafeInteger(raw.invalidCount) || (raw.invalidCount as number) < 0)) throw new Error("Stored result page validation provenance is invalid.");
      if (!isObject(raw) || typeof raw.source !== "string" || typeof raw.step !== "string" || !Number.isSafeInteger(raw.version) || (raw.version as number) < 1 || !isObject(raw.fields) || !Array.isArray(raw.conditions) || !Array.isArray(raw.rows) || !raw.rows.every(isObject) || raw.kept !== raw.rows.length) throw new Error("Stored result page evidence is invalid.");
    }
    const declared = bundle as unknown as AutomationStudioResultEvidenceBundle;
    if (bundle.missingEvidence !== undefined) {
      if (!Array.isArray(bundle.missingEvidence) || !bundle.missingEvidence.every((ref) => isObject(ref) && typeof ref.datasetId === "string" && ref.datasetId.trim().length > 0 && (ref.batchKey === undefined || typeof ref.batchKey === "string" && ref.batchKey.trim().length > 0))) throw new Error("Stored missing source evidence is invalid.");
      missing.push(...declared.missingEvidence!);
    }
    pages.push(...declared.pages);
    coverage.push(...declared.coverage);
    working.push(...declared.working);
    looks.push(...declared.looks);
    if (isObject(bundle.processing)) processing = declared.processing;
  }
  for (const datasetId of datasets) if (!(input.entries ?? []).some((entry) => entry.datasetId === datasetId)) missing.push({ datasetId });
  // A capture with no later pager verdict states only the places actually recorded. No ended/completeness is invented.
  for (const step of new Set(pages.map((page) => page.step))) {
    if (coverage.some((held) => held.step === step)) continue;
    const reads = pages.filter((page) => page.step === step);
    const places = reads.flatMap((page) => page.place === undefined ? [] : [page.place]);
    const numbered = places.map((place) => /^(page|offset)=(\d+)$/u.exec(place));
    const first = numbered.some((place) => place?.[2] === "0" || (place?.[1] === "page" && place[2] === "1")) ? "read" : numbered.length && numbered.every((place) => place !== null) ? "not read" : "unknown";
    coverage.push({ step, version: reads.at(-1)!.version, places, first, ...(places.length ? { last: { place: places.at(-1)! } } : {}) });
  }
  const columns = automationStudioFlowBootstrapInstructionColumns(input.instructionText ?? "");
  return { pages, coverage, working, looks, ...(!columns.cutShort && columns.length ? { answerContract: { columns: [...columns] } } : {}), ...(processing ? { processing } : {}), ...(missing.length ? { missingEvidence: missing } : {}) };
}

function isObject(value: unknown): value is JsonObject { return typeof value === "object" && value !== null && !Array.isArray(value); }
