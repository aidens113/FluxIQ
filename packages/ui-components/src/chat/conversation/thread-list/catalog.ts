// The list of threads the chat can show, read from Core on each beat. No DOM.
//
// Every thread the person can see is read (`listAllThreads`): the project's
// when one is open, all of them otherwise. Each record goes through a checking
// reader and a record it cannot read is skipped; a list it cannot read is a
// failed read, which keeps the list held and is tried again on the next beat.
// A read while one is on its way asks for one more afterwards, so reads never
// overlap, and `forget` makes a read on its way land nowhere (the chat changed
// owner).

import type { ChatResult, ChatThreadCatalogQuery } from "../../ports/index.ts";
import { parseThreadList } from "./parse.ts";
import { sortThreadsForList } from "./order.ts";
import type { ChatThreadSummary } from "./summary.ts";

/** How many threads one read asks for. */
const THREAD_LIST_LIMIT = 25;

/** What the catalog reads through, and whom it tells. */
export type ThreadCatalogDeps = {
  list(query: ChatThreadCatalogQuery): Promise<ChatResult<{ conversations?: unknown }>>;
  /** The project to list, or undefined to span every project. */
  projectId(): string | undefined;
  /** Called when the list changed, or when the first read came back. */
  changed(): void;
};

/** The mounted catalog. */
export type ThreadCatalog = {
  /** The threads in list order. */
  threads(): readonly ChatThreadSummary[];
  /** True once a read has come back, so "no threads" can be told from "not read yet". */
  loaded(): boolean;
  /** Reads the list. Never rejects. */
  read(): Promise<void>;
  /** Drops the list and any read on its way, for another owner of the chat. */
  forget(): void;
};

/** Creates the catalog. */
export function createThreadCatalog(deps: ThreadCatalogDeps): ThreadCatalog {
  let held: readonly ChatThreadSummary[] = [];
  let signature = "[]";
  let loaded = false;
  let generation = 0;
  let inFlight: Promise<void> | undefined;
  let again = false;

  async function once(): Promise<void> {
    const mine = generation;
    const projectId = deps.projectId();
    let result: ChatResult<{ conversations?: unknown }>;
    try {
      result = await deps.list(projectId === undefined ? { limit: THREAD_LIST_LIMIT } : { projectId, limit: THREAD_LIST_LIMIT });
    } catch {
      result = { ok: false, sentence: "Couldn't reach FluxIQ. Try again.", code: "failed" };
    }
    if (mine !== generation) return;
    const parsed = result.ok ? parseThreadList(result.value.conversations) : undefined;
    const next = parsed === undefined ? held : sortThreadsForList(parsed);
    const nextSignature = parsed === undefined ? signature : JSON.stringify(next);
    const first = !loaded;
    loaded = true;
    if (nextSignature === signature && !first) return;
    held = next;
    signature = nextSignature;
    deps.changed();
  }

  return {
    threads: () => held,
    loaded: () => loaded,
    read() {
      if (inFlight !== undefined) {
        again = true;
        return inFlight;
      }
      const mine = generation;
      const reading = (async () => {
        do {
          again = false;
          await once();
        } while (again && mine === generation);
        if (mine === generation) inFlight = undefined;
      })();
      inFlight = reading;
      return reading;
    },
    forget() {
      generation += 1;
      held = [];
      signature = "[]";
      loaded = false;
      inFlight = undefined;
      again = false;
    }
  };
}
