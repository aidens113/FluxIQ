// What an unsure call whose doubt Core's record contradicts is told when it is
// asked once more (`../agreement/`, t503): what it took to be so, whose
// record says otherwise, Core's words naming that record, and what a reading
// is held to. One sentence frame for each kind of doubt: pages left unread
// (t503), rows a dedupe merged (t628, `../refuted-no/dedupe-doubt.ts`), and a step said to
// choose an option the request does not name (t655, `./narrowing.ts`).
// Core's words, naming no site or task.

/** Per kind of doubt: what the call took to be so, whose record says otherwise, and what a reading is held to. */
const DOUBTED = {
  pages: ["it took the list to have pages its read never reached", "Core's own record of each paging read", "any reading about pages"],
  dedupe: ["it took the answer's dedupe to have merged distinct rows into one", "Core's own record of this answer", "any reading about repeated or merged rows"],
  narrowing: ["it took a step to have chosen an option the request does not name", "Core's own record of that step and the request's own words", "any reading about that step"]
} as const;

/** The recheck a contradicted doubt of kind `about` (pages where absent) is asked again with, naming `record` (header). */
export function automationStudioResultDoubtRecheckWords(about: keyof typeof DOUBTED | undefined, record: string): string {
  const [took, whose, held] = DOUBTED[about ?? "pages"];
  return `This same evidence was judged before, and that answer could not tell because ${took}. ${whose} says otherwise: ${record} `
    + `Answer again from the evidence, holding ${held} to that record; answer unknown only for a doubt the record does not settle.`;
}
