// Addressing the sealed objects a project already holds (t745 design note D4
// step 3, D5). A protected content store runs this when it opens: every sealed
// object with no content address, or one under a key other than the current
// one, is read, its stored sha256 verified, opened, its old address checked
// when it has one under a key still held, and then addressed under the current
// key. Each batch's addresses are written in one transaction, each guarded on
// the row still holding the address it was read with, so a concurrent writer
// is never overwritten and a crash loses at most the batch in flight.
//
// Pages are keyset by object id, so a row that cannot be verified, opened or
// matched is passed over and counted, never retried in the same pass and never
// written: it keeps its old form and still fails when read, exactly as before.
// Equal legacy copies may end up sharing one address; they are not merged.
import type { AutomationStudioProjectContentProtection } from "../content-protection.ts";
import type { AutomationStudioProjectObjectContentAddress, AutomationStudioProjectObjectRecord, AutomationStudioProjectObjectRepository } from "../object-repository.ts";
import { automationStudioContentObjectAddress } from "./content-object-address.ts";
import type { AutomationStudioContentAddressKeyring } from "./keyring.ts";

export type AutomationStudioContentObjectAddressBackfillOptions = {
  /** Rows read per batch (1-500, default 100). */
  batchSize?: number;
  /** Stop after this many batches, leaving the rest for a later pass. */
  maxBatches?: number;
};

export type AutomationStudioContentObjectAddressBackfillInput = {
  objects: AutomationStudioProjectObjectRepository;
  keyring: AutomationStudioContentAddressKeyring;
  protection: AutomationStudioProjectContentProtection;
  /** An object's stored bytes, after its sha256 and byte count are verified; throws when they are not. */
  readStored(object: AutomationStudioProjectObjectRecord): Promise<Buffer>;
};

export type AutomationStudioContentObjectAddressBackfillResult = {
  /** Rows addressed under the current key by this pass. */
  addressed: number;
  /** Rows passed over because they did not verify, open or match their old address. */
  skipped: number;
  skippedObjectIds: string[];
  /** Rows another writer changed between this pass reading and writing them. */
  raced: number;
  batches: number;
  /** False when `maxBatches` stopped the pass before it reached the last row. */
  complete: boolean;
};

type RowOutcome = { kind: "addressed"; next: AutomationStudioProjectObjectContentAddress } | { kind: "skipped" };

const DEFAULT_BATCH_SIZE = 100;

export async function backfillAutomationStudioContentObjectAddresses(
  input: AutomationStudioContentObjectAddressBackfillInput,
  options: AutomationStudioContentObjectAddressBackfillOptions = {}
): Promise<AutomationStudioContentObjectAddressBackfillResult> {
  const batchSize = Math.max(1, Math.min(500, Math.trunc(options.batchSize ?? DEFAULT_BATCH_SIZE)));
  const maxBatches = options.maxBatches === undefined ? Number.POSITIVE_INFINITY : Math.max(0, Math.trunc(options.maxBatches));
  // Only after a rotation can a row sit under a key other than the current
  // one; until then the pass reads only the partial index of unaddressed rows.
  const includeOtherKeys = await input.objects.hasRetiredContentAddressKey();
  const result: AutomationStudioContentObjectAddressBackfillResult = { addressed: 0, skipped: 0, skippedObjectIds: [], raced: 0, batches: 0, complete: false };
  let afterObjectId: string | null = null;
  while (result.batches < maxBatches) {
    const rows = await input.objects.listSealedObjectsNeedingContentAddress({ currentKeyId: input.keyring.currentKeyId, afterObjectId, limit: batchSize, includeOtherKeys });
    if (!rows.length) {
      result.complete = true;
      break;
    }
    result.batches += 1;
    const updates: { objectId: string; expected: AutomationStudioProjectObjectContentAddress; next: AutomationStudioProjectObjectContentAddress }[] = [];
    for (const row of rows) {
      afterObjectId = row.objectId;
      const outcome = await addressRow(input, row);
      if (outcome.kind === "skipped") {
        result.skipped += 1;
        result.skippedObjectIds.push(row.objectId);
        continue;
      }
      updates.push({ objectId: row.objectId, expected: { contentAddress: row.contentAddress, contentAddressKeyId: row.contentAddressKeyId }, next: outcome.next });
    }
    const changed = await input.objects.updateContentAddresses(updates);
    result.addressed += changed;
    result.raced += updates.length - changed;
    if (rows.length < batchSize) {
      result.complete = true;
      break;
    }
  }
  return result;
}

async function addressRow(input: AutomationStudioContentObjectAddressBackfillInput, row: AutomationStudioProjectObjectRecord): Promise<RowOutcome> {
  let plaintext: Buffer;
  try {
    const stored = await input.readStored(row);
    plaintext = await input.protection.open({ projectId: input.keyring.projectId, mediaType: row.mediaType, content: stored, encryption: row.encryption ?? "" });
  } catch {
    // The row's own failure stays with the row: it is left unaddressed and fails when read.
    return { kind: "skipped" };
  }
  try {
    const oldKeyId = row.contentAddressKeyId;
    if (row.contentAddress !== null && oldKeyId !== null && input.keyring.holds(oldKeyId)
      && automationStudioContentObjectAddress(input.keyring, oldKeyId, plaintext, row.mediaType) !== row.contentAddress) {
      return { kind: "skipped" };
    }
    const keyId = input.keyring.currentKeyId;
    return { kind: "addressed", next: { contentAddress: automationStudioContentObjectAddress(input.keyring, keyId, plaintext, row.mediaType), contentAddressKeyId: keyId } };
  } finally {
    plaintext.fill(0);
  }
}
