// A move Core makes itself, said in the frame of the call that makes it (t743,
// office rerun round 4 `run-mvgvyaip-d856e135`).
//
// **Why.** Core goes places on its own: before a trial, the site reset takes the
// target back to the start, to an act's page, or to a stale list's place to read
// it again (`../../flow-bootstrap/site-reset/start-check.ts`), through the same
// run-node tool and the same registry binding the model's calls go through. A
// domain that holds the model to rules of its own -- the web domain refuses an
// address the brief was never shown -- applied them to Core's look as well, and
// refused it unrun: Core could not read the list it had itself asked the model
// to settle, and the brief ended on an address its own look could not reach.
//
// **How it is said.** Core's move code runs its call inside
// `runAsAutomationStudioCoreMove`; the registry binding reads the marker as it
// frames the call and writes `move: "core"` into the frame a domain reads
// (`./evidence-build-scope.ts`). Never derived from a call id's shape, so
// nothing a model writes can set it: a model's call is run by the evidence loop,
// never inside Core's marker.
//
// **One marker per process, however many copies of Core it loads**, for the
// reason the frame's header gives (t738): kept under a registered symbol that
// every copy of this module finds, so a marker one copy sets is the one the
// registry of any copy reads.

import { AsyncLocalStorage } from "node:async_hooks";

/** The registered key every copy of this module keeps the one marker under (header). */
const STORE = Symbol.for("fluxiq.automation-studio.core-move");

type Store = AsyncLocalStorage<true>;

const holder = globalThis as typeof globalThis & { [STORE]?: Store };
const moves: Store = holder[STORE] ??= new AsyncLocalStorage<true>();

/** Runs `fn` as a move Core makes itself (header): every registry call it makes, however deep, is framed `move: "core"`. */
export function runAsAutomationStudioCoreMove<T>(fn: () => T): T {
  return moves.run(true, fn);
}

/** Whether the current call is part of a move Core makes itself (header). */
export function automationStudioCoreMoveRunning(): boolean {
  return moves.getStore() === true;
}
