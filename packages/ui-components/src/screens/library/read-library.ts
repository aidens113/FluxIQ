import type { SubflowLibraryPort } from "./port.ts";
import type { SubflowCard } from "./types.ts";

/** How many pages are read, at most, in one go: 10 of 50 is more subflows than a person browses. */
const MAX_PAGES = 10;
const PAGE = 50;

/** Every subflow of the project, or why they could not be read, in words. Never throws. */
export async function readLibrary(port: SubflowLibraryPort, projectId: string, stillWanted: () => boolean): Promise<{ cards: SubflowCard[] } | { problem: string } | undefined> {
  const cards: SubflowCard[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const answer = await port.list({ projectId, limit: PAGE, ...(cursor === null ? {} : { cursor }) });
    if (!stillWanted()) return undefined;
    if (!answer.ok) return { problem: `Could not read your subflows. ${answer.sentence}` };
    if (answer.value.refused) return { problem: "Your subflows cannot be read right now." };
    cards.push(...answer.value.parts);
    if (!answer.value.hasMore || answer.value.nextCursor === null) break;
    cursor = answer.value.nextCursor;
  }
  return { cards };
}
