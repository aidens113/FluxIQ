import type { PinnedAnswer } from "./pinned-https.ts";

/** Throws, quoting the start of the body, unless the answer has the status. */
export function expectStatus(answer: PinnedAnswer, status: number, what: string): void {
  if (answer.status !== status) throw new Error(`${what} answered ${answer.status}, not ${status}: ${answer.body.slice(0, 300)}`);
}
