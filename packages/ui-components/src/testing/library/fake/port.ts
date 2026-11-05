// A library port with no Core behind it, for building and testing the screen. It holds made-up subflows,
// answers as a real adapter answers (a failed read is a failed `ChatResult`, a refusal is a value, nothing
// throws), and runs nothing real. A run is checked as Core checks it: a missing required input, and a lasting
// act nobody permitted, are refused before anything happens. It records what it was asked.

import type { ChatResult } from "../../../chat/ports/index.ts";
import type { SubflowCard, SubflowLastingClass, SubflowLibraryPort, SubflowRefusal, SubflowRefusalCode, SubflowRunOutcome, SubflowRunStop } from "../../../screens/library/index.ts";
import { fakeSubflowCards } from "./cards.ts";
import { fakeSubflowDetail } from "./detail.ts";

export type FakeSubflowLibraryOptions = { cards?: readonly SubflowCard[]; now?: number; pageSize?: number };

type Method = "list" | "read" | "run";
type Failure = Extract<ChatResult<never>, { ok: false }>;

export type FakeSubflowLibraryPort = SubflowLibraryPort & {
  readonly calls: ReadonlyArray<{ method: Method; query: unknown }>;
  /** The next call to `method` answers this refusal, with nothing done. */
  refuseNext(method: Method, refusal: { code: SubflowRefusalCode; message?: string; classes?: SubflowLastingClass[] }): void;
  /** The next call to `method` is a failed read. */
  failNext(method: Method, failure: Failure): void;
  /** The next run that is not refused stops here instead of finishing. */
  stopNext(stop: SubflowRunStop): void;
  /** The next run waits until the returned function is called, so a test can look at it while it runs. */
  holdNextRun(): () => void;
};

const SAMPLE: Readonly<Record<string, string | number>> = { order: "A-4821", total: "$18.40", titles: "Salt Roads; The Winter Atlas; A Small Harbour" };

/** A port over the made-up library, or over `cards`. */
export function createFakeSubflowLibraryPort(options: FakeSubflowLibraryOptions = {}): FakeSubflowLibraryPort {
  const cards = structuredClone([...(options.cards ?? fakeSubflowCards(options.now))]);
  const pageSize = options.pageSize ?? 50;
  const calls: Array<{ method: Method; query: unknown }> = [];
  const refusals = new Map<Method, SubflowRefusal>();
  const failures = new Map<Method, Failure>();
  const stops: SubflowRunStop[] = [];
  const holds: Array<Promise<void>> = [];

  const early = (method: Method, query: unknown): Failure | SubflowRefusal | undefined => {
    calls.push({ method, query });
    const failure = failures.get(method);
    failures.delete(method);
    if (failure !== undefined) return failure;
    const refusal = refusals.get(method);
    refusals.delete(method);
    return refusal;
  };
  const answer = <T>(value: Failure | SubflowRefusal): ChatResult<T> => ("ok" in value ? value : { ok: true, value: value as T });
  const notFound: SubflowRefusal = { refused: true, code: "part.not_found", message: "Not saved." };

  return {
    calls,
    refuseNext(method, refusal) {
      refusals.set(method, { refused: true, code: refusal.code, message: refusal.message ?? "Refused.", ...(refusal.classes === undefined ? {} : { classes: refusal.classes }) });
    },
    failNext(method, failure) {
      failures.set(method, failure);
    },
    stopNext(stop) {
      stops.push(stop);
    },
    holdNextRun() {
      let release = (): void => undefined;
      holds.push(new Promise<void>((resolve) => (release = resolve)));
      return release;
    },
    async list(query) {
      const blocked = early("list", query);
      if (blocked !== undefined) return answer(blocked);
      const words = (query.text ?? "").toLowerCase().split(/\s+/u).filter((word) => word !== "");
      const matching = cards.filter((card) => words.every((word) => `${card.name} ${card.purpose}`.toLowerCase().includes(word)));
      const start = query.cursor === undefined || query.cursor === null ? 0 : Number(query.cursor);
      const size = Math.min(query.limit ?? pageSize, pageSize);
      const more = start + size < matching.length;
      return { ok: true, value: { refused: false, parts: structuredClone(matching.slice(start, start + size)), nextCursor: more ? String(start + size) : null, hasMore: more } };
    },
    async read(query) {
      const blocked = early("read", query);
      if (blocked !== undefined) return answer(blocked);
      const card = cards.find((item) => item.partId === query.partId);
      if (card === undefined) return { ok: true, value: notFound };
      return { ok: true, value: { refused: false, detail: structuredClone(fakeSubflowDetail(card, cards)) } };
    },
    async run(query) {
      const blocked = early("run", query);
      const held = holds.shift();
      if (held !== undefined) await held;
      if (blocked !== undefined) return answer(blocked);
      const card = cards.find((item) => item.partId === query.partId);
      if (card === undefined) return { ok: true, value: notFound };
      if (card.inputs.some((input) => input.required && (query.inputs[input.id] ?? "") === "")) return { ok: true, value: { refused: true, code: "part.input_missing", message: "Missing." } };
      const needed = card.lastingClasses.filter((item) => !(query.permitted ?? []).includes(item));
      if (needed.length > 0) return { ok: true, value: { refused: true, code: "part.act_not_allowed", message: "Not allowed.", classes: needed } };
      const stop = stops.shift();
      if (stop !== undefined) return { ok: true, value: { refused: false, status: "stopped", outputs: {}, rowCount: 0, stoppedAt: stop, acts: [] } };
      const outputs: SubflowRunOutcome["outputs"] = {};
      for (const output of card.outputs) outputs[output.id] = SAMPLE[output.id] ?? "done";
      return { ok: true, value: { refused: false, status: "succeeded", outputs, rowCount: card.partId === "list-loans" ? 3 : 0, acts: [...card.lastingClasses] } };
    }
  };
}
