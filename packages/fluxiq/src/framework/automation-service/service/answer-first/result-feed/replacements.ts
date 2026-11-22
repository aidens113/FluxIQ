import { AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS, parseAutomationStudioRecordSchema, validateAutomationStudioRecords, type AutomationStudioRecordSchema } from "@fluxiq/contracts/automation";
import { readAutomationStudioResultEvidenceSourceRef, readAutomationStudioResultEvidenceSourceReplacements, type AutomationStudioResultEvidenceBundle, type AutomationStudioResultEvidencePage, type AutomationStudioResultEvidenceSourceRef, type AutomationStudioResultEvidenceSourceReplacements } from "../../../../../runtime/result-verification/index.ts";
import { stableJson } from "../../stable-json.ts";

type Receipt = AutomationStudioResultEvidenceSourceReplacements["receipts"][number];
type Historical = { page: AutomationStudioResultEvidencePage; ambiguous: boolean; observed: boolean };

/** Remembers actual producer identities. A receipt changes authority only; original rows and account facts stay intact. */
export function automationStudioAnswerFirstResultReplacements() {
  let metadata: AutomationStudioResultEvidenceSourceReplacements | null | undefined;
  let current: readonly AutomationStudioResultEvidencePage[] = [];
  const history = new Map<string, Historical>();
  const outgoing = (ref: AutomationStudioResultEvidenceSourceRef) => metadata?.receipts.some((entry) => entry.from.some((from) => key(from) === key(ref))) === true;
  const remember = (pages: readonly AutomationStudioResultEvidencePage[], observed = false) => {
    for (const page of pages) {
      const held = history.get(key(page));
      const duplicate = pages.filter((other) => key(other) === key(page)).length !== 1;
      const reused = observed && held?.observed === true && !current.some((prior) => key(prior) === key(page));
      history.set(key(page), { page: structuredClone(page), observed: observed || held?.observed === true, ambiguous: duplicate || reused || held?.ambiguous === true || held !== undefined && content(held.page) !== content(page) });
    }
  };
  const add = (receipt: Receipt): boolean => {
    if (receipt.from.some(outgoing) || [...receipt.from, ...receipt.to].some((ref) => history.get(key(ref))?.ambiguous)) return false;
    const parsed = readAutomationStudioResultEvidenceSourceReplacements({ version: 1, receipts: [...(metadata?.receipts ?? []), receipt] });
    if (!parsed) return false;
    metadata = parsed;
    return true;
  };
  const page = (from: AutomationStudioResultEvidencePage, to: AutomationStudioResultEvidencePage, schema: AutomationStudioRecordSchema | undefined): boolean => {
    if (!samePage(from, to) || key(from) === key(to) || !fresh(to, schema)) return false;
    const reused = history.get(key(to));
    if (reused?.observed && !current.some((prior) => key(prior) === key(to))) return false;
    return add({ kind: "page", from: [ref(from)], to: [ref(to)] });
  };
  return {
    remember,
    restore(value: AutomationStudioResultEvidenceBundle["sourceReplacements"]) {
      if (value === undefined) return;
      const parsed = readAutomationStudioResultEvidenceSourceReplacements(value);
      if (!parsed) { if (metadata === undefined) metadata = null; return; }
      const receipts = new Map([...(metadata?.receipts ?? []), ...parsed.receipts].map((entry) => [stableJson(entry), entry]));
      metadata = readAutomationStudioResultEvidenceSourceReplacements({ version: 1, receipts: [...receipts.values()] }) ?? null;
    },
    page,
    observed(bundle: AutomationStudioResultEvidenceBundle, schemas: ReadonlyMap<string, AutomationStudioRecordSchema>) {
      const added = bundle.pages.filter((entry) => !current.some((prior) => key(prior) === key(entry)));
      const removed = current.filter((entry) => !bundle.pages.some((next) => key(next) === key(entry)));
      // Both directions must be unique. A pair of indistinguishable page associations authorises neither.
      for (const prior of removed) {
        const matches = added.filter((entry) => samePage(prior, entry));
        if (matches.length === 1 && removed.filter((entry) => samePage(entry, matches[0]!)).length === 1) page(prior, matches[0]!, schemas.get(matches[0]!.source));
      }
      remember(bundle.pages, true);
      current = structuredClone(bundle.pages);
    },
    /** Called only after the feed proves a fresh whole forward collection, including its actual coverage. */
    collection(bundle: AutomationStudioResultEvidenceBundle, schemas: ReadonlyMap<string, AutomationStudioRecordSchema>): boolean {
      if (!bundle.pages.length || bundle.pages.some((entry) => !fresh(entry, schemas.get(entry.source)) || history.get(key(entry))?.ambiguous)) return false;
      const prior = [...history.values()].filter((entry) => !entry.ambiguous && !outgoing(entry.page) && !bundle.pages.some((next) => key(next) === key(entry.page))
        && bundle.pages.some((next) => sameCollection(entry.page, next) && sameRead(entry.page, next))).map((entry) => entry.page);
      return prior.length > 0 && add({ kind: "collection", from: prior.map(ref), to: bundle.pages.map(ref) });
    },
    evidence(bundle: AutomationStudioResultEvidenceBundle): AutomationStudioResultEvidenceBundle {
      return metadata === undefined ? bundle : { ...bundle, sourceReplacements: structuredClone(metadata) };
    }
  };
}

function ref(page: AutomationStudioResultEvidenceSourceRef): AutomationStudioResultEvidenceSourceRef {
  return { source: page.source, step: page.step, version: page.version, ...(page.datasetId === undefined ? {} : { datasetId: page.datasetId }) };
}
function key(page: AutomationStudioResultEvidenceSourceRef): string { return stableJson(ref(page)); }
function content(page: AutomationStudioResultEvidencePage): string { return stableJson({ conditions: page.conditions, fields: page.fields, listKey: page.listKey, where: page.where, place: page.place, rows: page.rows, invalidCount: page.invalidCount }); }
function sameRead(a: AutomationStudioResultEvidencePage, b: AutomationStudioResultEvidencePage): boolean { return stableJson({ conditions: a.conditions, fields: a.fields, listKey: a.listKey }) === stableJson({ conditions: b.conditions, fields: b.fields, listKey: b.listKey }); }
function samePage(a: AutomationStudioResultEvidencePage, b: AutomationStudioResultEvidencePage): boolean { return a.step === b.step && typeof a.place === "string" && a.place.trim().length > 0 && a.place === b.place && a.where === b.where && sameRead(a, b); }
function sameCollection(a: AutomationStudioResultEvidencePage, b: AutomationStudioResultEvidencePage): boolean { return (a.listKey !== undefined || a.where !== undefined) && (a.listKey === undefined || a.listKey === b.listKey) && (a.where === undefined || a.where === b.where); }
function fresh(page: AutomationStudioResultEvidencePage, schema: AutomationStudioRecordSchema | undefined): boolean {
  if (!readAutomationStudioResultEvidenceSourceRef(ref(page)) || page.invalidCount !== 0 || page.carried === true || !schema || !parseAutomationStudioRecordSchema(schema).ok) return false;
  const checked = validateAutomationStudioRecords(page.rows, schema, { maxRecords: AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRecordsCeiling });
  return !checked.invalidCount && !checked.truncated && stableJson(checked.rows) === stableJson(page.rows);
}
