// @fluxiq-test-group real-sql
// A later attempt carries the earlier attempt's acts as already done, and its judge sees the before
// reading the earlier attempt's judge saw (`../run-attempt.ts`, `../opening.ts`, `../../witnesses/`).
// Seen live in run-mw4dsh8i-3fb9dc39: attempt 1's judge said yes from a before reading, and every judge
// of attempt 2 had none, asked for before and after, and no look could give it after the acts.
// Through the real service, the real engine and a scripted model, at a lending library. Provider-free.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "../../../../../../runtime/llm/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_EARLIER_BEFORE_WORDS } from "../../witnesses/index.ts";
import { complete, RENEW_CARD, runNode } from "../../tests/fake-library.ts";
import { laterAttempts, readLoans } from "../../tests/later-attempts.ts";

vi.setConfig({ testTimeout: 180_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const CARD_TASK = "List every loan on my library account and renew the card.";
const cardAttempt = { instruction: CARD_TASK, permittedConsequences: ["modify_existing" as const], script: [readLoans(), runNode("card", RENEW_CARD, {}, ["modify_existing"], { add: true }), complete("Done.")] };
/** Words only the library's page view holds (`../../tests/fake-library.ts`): a reading's page text. */
const PAGE_TEXT = "Your account";

const beforeShown = (request: AutomationStudioLlmTaskRequest | undefined): unknown => (request?.context.resultSummary as unknown as { witnesses?: { before?: unknown } } | undefined)?.witnesses?.before;

describe("a later attempt carrying an earlier attempt's acts", () => {
  it("is judged on the before reading the earlier attempt's judge saw, read by nobody again", async () => {
    const lane = await laterAttempts(cleanups);
    const first = await lane.attempt(cardAttempt);
    const earlier = beforeShown(first.judgeCalls[0]);
    expect(earlier).toMatchObject({ page: { heading: PAGE_TEXT, renewed: 0 } });
    const second = await lane.attempt({ instruction: CARD_TASK, permittedConsequences: ["modify_existing"] });
    expect(lane.target.library.renewals.card).toBe(1);
    expect(second.answer.result?.acts).toEqual([expect.objectContaining({ state: "landed", what: expect.stringMatching(/^Already done earlier: /u) })]);
    expect(second.judgeCalls.length).toBeGreaterThan(0);
    for (const judged of second.judgeCalls) expect(beforeShown(judged)).toEqual(earlier);
    // A third attempt carries the second's record, and the second held the same reading under its own id.
    const third = await lane.attempt({ instruction: CARD_TASK, permittedConsequences: ["modify_existing"] });
    for (const judged of third.judgeCalls) expect(beforeShown(judged)).toEqual(earlier);
  });

  it("under another Flow too, as the chat makes a new Flow each time", async () => {
    const lane = await laterAttempts(cleanups);
    const first = await lane.attempt(cardAttempt);
    const second = await lane.attempt({ instruction: CARD_TASK, permittedConsequences: ["modify_existing"], flowId: "flow.another" });
    expect(lane.target.library.renewals.card).toBe(1);
    expect(second.judgeCalls.length).toBeGreaterThan(0);
    for (const judged of second.judgeCalls) expect(beforeShown(judged)).toEqual(beforeShown(first.judgeCalls[0]));
  });

  it("after Core restarted, the reading is not held: the judge is told the earlier attempt took it, and shown none from before the acts", async () => {
    const before = await laterAttempts(cleanups);
    const first = await before.attempt(cardAttempt);
    await before.service.close();
    const after = await laterAttempts(cleanups, { restart: before.restart() });
    const second = await after.attempt({ instruction: CARD_TASK, permittedConsequences: ["modify_existing"] });
    expect(after.target.library.renewals.card).toBe(1);
    expect(second.judgeCalls.length).toBeGreaterThan(0);
    const words = AUTOMATION_STUDIO_ANSWER_FIRST_EARLIER_BEFORE_WORDS;
    for (const judged of second.judgeCalls) {
      const shown = beforeShown(judged) as { note?: string; reading?: { page?: { renewed?: number } } } | undefined;
      expect([words.notHeld, words.takenAfter]).toContain(shown?.note);
      expect(shown).not.toEqual(beforeShown(first.judgeCalls[0]));
      // Any reading this attempt took is from after the carried act, and is shown as that.
      if (shown?.reading) expect(shown.reading.page?.renewed).toBe(1);
    }
  });

  it("puts no page text in what persists beside a Flow: the act record and the task's memory", async () => {
    const lane = await laterAttempts(cleanups);
    const first = await lane.attempt(cardAttempt);
    expect(JSON.stringify(beforeShown(first.judgeCalls[0]))).toContain(PAGE_TEXT);
    await lane.attempt({ instruction: CARD_TASK, permittedConsequences: ["modify_existing"] });
    expect(JSON.stringify(await lane.actsOn())).not.toContain(PAGE_TEXT);
    expect(JSON.stringify(await lane.kept(CARD_TASK))).not.toContain(PAGE_TEXT);
    const files = await flowSideFiles(lane.restart().dataDir);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(await readFile(file, "utf8"), file).not.toContain(PAGE_TEXT);
  });
});

/** Every act record and task memory file under the data directory. */
async function flowSideFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true });
  return entries
    .filter((entry) => entry.endsWith(".json"))
    .map((entry) => path.join(root, entry))
    .filter((file) => path.basename(file) === "attempt-acts.json" || file.split(path.sep).includes("task-memory"));
}
