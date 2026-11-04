// The saved parts the opening look offers: this project's library read for the ones that
// may fit the person's request, and `runtime/project-parts/shortlist` ranks and words them.
// Never throws, and says nothing where there is nothing to say: a library that cannot be
// read leaves the look as it was, and a build or an attempt goes on without it.
import { automationStudioPartOrigin, automationStudioKnownPartsOf, type AutomationStudioKnownPartCandidate, type AutomationStudioKnownParts } from "../../../../runtime/project-parts/index.ts";
import { automationStudioLlmBuildTrace } from "../../../../runtime/llm/index.ts";
import type { AutomationStudioProjectDatabasePool, AutomationStudioProjectPartQuery } from "../../../persistence/automation/index.ts";
import { withProjectPartStores } from "./stores.ts";

const PAGE = 50;
const MAX_PAGES = 3;

export type AutomationStudioProjectPartsShortlistInput = {
  projectId: string;
  /** The person's words: what the full-text search reads. */
  requestWords: string;
  /** Where the build starts, when it was told. Only its origin is read. */
  startLocation?: string | undefined;
  /** The lasting classes the request allows. */
  askedClasses: readonly string[];
};

/** Up to five parts of this project that may fit, or undefined when none can be offered (`runtime/project-parts/shortlist/rank.ts`). */
export async function shortlistProjectParts(pool: AutomationStudioProjectDatabasePool | undefined, input: AutomationStudioProjectPartsShortlistInput): Promise<AutomationStudioKnownParts | undefined> {
  if (!pool) return undefined;
  return await automationStudioLlmBuildTrace.timed("known-parts", async () => {
    try {
      const read = await withProjectPartStores(pool, input.projectId, async (stores) => {
        const startOrigin = automationStudioPartOrigin(input.startLocation);
        const found = new Map<string, AutomationStudioKnownPartCandidate>();
        const keep = async (query: AutomationStudioProjectPartQuery, ranked: boolean): Promise<void> => {
          let order = 0;
          let cursor: string | null = null;
          for (let page = 0; page < MAX_PAGES; page += 1) {
            const answer = await stores.parts.query({ ...query, limit: PAGE, ...(cursor ? { cursor } : {}) });
            for (const item of answer.items) {
              const rank = ranked ? order : undefined;
              order += 1;
              const known = found.get(item.part.partId);
              if (known) {
                if (rank !== undefined && known.textRank === undefined) known.textRank = rank;
                continue;
              }
              const card = await stores.cardOf(item.version);
              if (card) found.set(card.partId, { card, textRank: rank });
            }
            if (!answer.hasMore) return;
            cursor = answer.nextCursor;
          }
        };
        if (input.requestWords.trim()) await keep({ text: input.requestWords }, true);
        if (startOrigin) await keep({ site: startOrigin }, false);
        return automationStudioKnownPartsOf({ candidates: [...found.values()], startOrigin, askedClasses: input.askedClasses });
      });
      return typeof read === "object" && read !== null && "ok" in read ? { failed: "unavailable" as const } : { shortlist: read };
    } catch (error) {
      return { failed: error instanceof Error ? error.name : "Error" };
    }
  }, (result) => ("failed" in result ? `failed=${result.failed}` : `parts=${result.shortlist?.parts.length ?? 0}`)).then((result) => ("failed" in result ? undefined : result.shortlist));
}
