// A plain fact on a Flow's run: it ran a saved part at an older version than the newest one
// that has passed elsewhere. It moves nothing and asks nothing, and a read that fails leaves
// the run's record as it was. The words hold a part's name and version numbers, no ids.
import { automationStudioPinOfSubflowId, type AutomationStudioPartPin } from "../../../../../engine/automation/frames/index.ts";
import type { AutomationStudioFlowRunDetail } from "../../../../../flows/authoring/model/index.ts";
import { automationStudioFlowVersionsFromMetadata } from "../../../../../runtime/flow-authoring/version/index.ts";
import type { AutomationStudioProjectDatabasePool } from "../../../../persistence/automation/index.ts";
import { withProjectPartStores, type AutomationStudioProjectPartStores } from "../stores.ts";
import { projectPartSameInterface } from "../part-interface.ts";

/** Where the facts sit on a run's metadata. */
export const PROJECT_PART_RUN_FACTS_KEY = "partVersionFacts";

/** The newest version newer than `pin`, with the same interface and no failure as its latest verdict, and whether it has passed a judged run. */
export async function projectPartNewerStanding(stores: AutomationStudioProjectPartStores, pin: AutomationStudioPartPin): Promise<{ version: number; passed: boolean; name: string } | undefined> {
  const record = await stores.parts.getVersion(pin.partId, pin.version);
  const pinned = record ? await stores.cardOf(record) : undefined;
  if (!pinned) return undefined;
  for (const newer of await stores.parts.listVersions(pin.partId)) {
    if (newer.version <= pin.version) return undefined;
    const card = await stores.cardOf(newer);
    if (card && projectPartSameInterface(pinned, card) && (await stores.verdictOf(newer)) !== "failed") return { version: newer.version, passed: card.trust.counts.judgedYes > 0, name: pinned.name };
  }
  return undefined;
}

/** The newer version told in words a person reads. */
export function projectPartNewerWords(input: { name: string; pinned: number; newer: number; passed: boolean }): string {
  return `"${input.name}" is pinned at version ${input.pinned}. Version ${input.newer} ${input.passed ? "has passed a judged run elsewhere" : "exists and has not been judged yet"}.`;
}

/** The run's record with the fact on it, when a part it ran has a newer version that passed. A library that cannot be reached says nothing. */
export async function automationStudioRunDetailWithPartFacts<Detail extends AutomationStudioFlowRunDetail | null>(pool: AutomationStudioProjectDatabasePool | undefined, projectId: string, detail: Detail): Promise<Detail> {
  if (!detail) return detail;
  const pins = new Map<string, AutomationStudioPartPin>();
  for (const version of automationStudioFlowVersionsFromMetadata(detail.metadata)) {
    const pin = automationStudioPinOfSubflowId(version.subflowId);
    if (pin) pins.set(`${pin.partId}@${pin.version}`, pin);
  }
  if (!pins.size) return detail;
  const facts = await withProjectPartStores(pool, projectId, async (stores) => {
    const told: { version: number; newerVersion: number; said: string }[] = [];
    for (const pin of pins.values()) {
      const newer = await projectPartNewerStanding(stores, pin);
      if (newer?.passed && !pins.has(`${pin.partId}@${newer.version}`)) told.push({ version: pin.version, newerVersion: newer.version, said: `This run used version ${pin.version} of "${newer.name}". Version ${newer.version} has passed a judged run elsewhere.` });
    }
    return told;
  });
  if (!Array.isArray(facts)) return detail;
  // Read each time, so a version since refuted stops being told of, whatever an earlier read saved.
  const { [PROJECT_PART_RUN_FACTS_KEY]: _earlier, ...metadata } = detail.metadata ?? {};
  return { ...detail, metadata: facts.length ? { ...metadata, [PROJECT_PART_RUN_FACTS_KEY]: facts } : metadata };
}
