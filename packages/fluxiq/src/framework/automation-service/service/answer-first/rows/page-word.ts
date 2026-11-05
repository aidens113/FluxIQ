// Which words only turn a list's page, in a call's input or in a page's address, matched by name
// without case or marks: a word that says where in the list a read is, or how many rows a page
// holds. A `p` is not read: on many sites it names a product, not a page. A domain that spells
// these another way simply says nothing here, and the rows alone tell a page from a re-read
// (`./list-after-read.ts`).

const PLACE_WORDS: ReadonlySet<string> = new Set(["page", "pg", "paged", "pagenumber", "pageindex", "pagenum", "pageno", "nextpage", "offset", "startindex", "skip", "cursor", "after", "scroll", "scrollby"]);
const SIZE_WORDS: ReadonlySet<string> = new Set(["limit", "pagesize", "perpage"]);

/** What a name says of a list's paging: where in it (`place`), how much of it (`size`), or nothing. */
export function automationStudioAnswerFirstPageWord(name: string): "place" | "size" | undefined {
  const word = name.toLowerCase().replace(/[^a-z0-9]+/gu, "");
  return PLACE_WORDS.has(word) ? "place" : SIZE_WORDS.has(word) ? "size" : undefined;
}
