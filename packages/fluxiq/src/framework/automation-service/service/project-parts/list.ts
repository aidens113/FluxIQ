// Searching the library. The store filters what it can in SQL (words, origin, lasting
// class, which Flow calls or made a part); trust and port names are read from the card,
// so they are applied here, after, and the page is filled from the rows that remain: a
// cursor names a place in the store's own order, so a page never skips a part the
// filters dropped nor repeats one.
import type { AutomationStudioSubflowCard } from "@fluxiq/contracts/automation";
import { PROJECT_PART_TRUST_TIERS, type ListProjectPartsRequest, type ListProjectPartsResponse } from "../../../../api-contracts/automation.ts";
import {
  decodeAutomationStudioProjectPartCursor,
  encodeAutomationStudioProjectPartCursor,
  type AutomationStudioProjectDatabasePool,
  type AutomationStudioProjectPartMatch,
  type AutomationStudioProjectPartQuery
} from "../../../persistence/automation/index.ts";
import type { AutomationStudioProjectPartsRefusal } from "./library-types.ts";
import { withProjectPartStores, type AutomationStudioProjectPartStores } from "./stores.ts";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
const CHUNK = 50;

export type AutomationStudioListProjectPartsInput = Omit<ListProjectPartsRequest, "limit"> & { limit?: unknown };

export async function listProjectParts(pool: AutomationStudioProjectDatabasePool | undefined, input: AutomationStudioListProjectPartsInput): Promise<ListProjectPartsResponse | AutomationStudioProjectPartsRefusal> {
  const limit = pageLimit(input.limit);
  const keep = cardFilterOf(input);
  return withProjectPartStores(pool, input.projectId, async (stores) => {
    if (!keep) return { parts: [], nextCursor: null, hasMore: false };
    const query = storeQueryOf(input);
    let offset = decodeAutomationStudioProjectPartCursor(typeof input.cursor === "string" ? input.cursor : null);
    const parts: AutomationStudioSubflowCard[] = [];
    let nextOffset = offset;
    for (;;) {
      const page = await stores.parts.query({ ...query, limit: CHUNK, cursor: encodeAutomationStudioProjectPartCursor(offset) });
      const cards = await cardsOf(stores, page.items);
      for (const [index, card] of cards.entries()) {
        if (!card || !keep(card)) continue;
        if (parts.length === limit) return { parts, nextCursor: encodeAutomationStudioProjectPartCursor(nextOffset), hasMore: true };
        parts.push(card);
        nextOffset = offset + index + 1;
      }
      if (!page.hasMore) return { parts, nextCursor: null, hasMore: false };
      offset += page.items.length;
    }
  });
}

function pageLimit(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.min(MAX_LIMIT, Math.trunc(value))) : DEFAULT_LIMIT;
}

function cardsOf(stores: AutomationStudioProjectPartStores, items: readonly AutomationStudioProjectPartMatch[]): Promise<(AutomationStudioSubflowCard | undefined)[]> {
  return Promise.all(items.map((item) => stores.cardOf(item.version)));
}

function storeQueryOf(input: AutomationStudioListProjectPartsInput): AutomationStudioProjectPartQuery {
  const site = siteOf(input.site);
  const lasting = wordsOf(input.lasting);
  return {
    ...(typeof input.query === "string" ? { text: input.query } : {}),
    ...(site ? { site } : {}),
    ...(lasting.length ? { lasting } : {}),
    ...(typeof input.usedByFlowId === "string" && input.usedByFlowId ? { callerFlowId: input.usedByFlowId } : {}),
    ...(typeof input.sourceFlowId === "string" && input.sourceFlowId ? { sourceFlowId: input.sourceFlowId } : {})
  };
}

/** The filters only a card can answer: its trust tier, and the names of its ports. Null when a trust filter was given that no tier satisfies. */
function cardFilterOf(input: AutomationStudioListProjectPartsInput): ((card: AutomationStudioSubflowCard) => boolean) | null {
  const tiers = wordsOf(input.trust);
  if (input.trust !== undefined && !tiers.some((tier) => (PROJECT_PART_TRUST_TIERS as readonly string[]).includes(tier))) return null;
  const inputs = wordsOf(input.inputName).map((word) => word.toLowerCase());
  const outputs = wordsOf(input.outputName).map((word) => word.toLowerCase());
  return (card) => (tiers.length === 0 || tiers.includes(card.trust.tier)) && portsHave(card.inputs, inputs) && portsHave(card.outputs, outputs);
}

function portsHave(ports: AutomationStudioSubflowCard["inputs"], wanted: readonly string[]): boolean {
  return wanted.every((word) => ports.some((port) => port.name.toLowerCase() === word || port.id.toLowerCase() === word));
}

function wordsOf(value: unknown): string[] {
  const list = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  return list.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

/** A site as an origin: an origin as it is, a bare host read as https. Anything else is kept as given and matches nothing. */
function siteOf(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const text = value.trim();
  if (/^https?:\/\//u.test(text) && URL.canParse(text)) return new URL(text).origin;
  return URL.canParse(`https://${text}`) ? new URL(`https://${text}`).origin : text;
}
