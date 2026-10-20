// Which build a domain's evidence call belongs to, said by Core (t728, audit
// finding 8).
//
// **Why Core says it.** A domain keeps memory per build: where the build has
// arrived, the addresses it has been shown, the ways out it cleared. Until now
// it found where a build begins by parsing Core's call ids -- `initial.<tool>`,
// a copy of Core's call-scope pattern, and the `held` key Core sets when a round
// continues a Flow -- so every change to Core's id format was a silent break
// downstream. Core owns that format (`../evidence-loop/call-id.ts`), so Core
// reads it, and every call a registry binding runs carries the answer in an
// async-context frame the domain reads with `automationStudioEvidenceBuildScope`.
//
// **What a frame says.**
// - `buildId`: the run, for a recovery exploration (`context.runId`); else the
//   build the binding was made for (`context.buildId`, the build record's
//   `build.<uuid>`); else the build frame the context runs in
//   (`./evidence-build.ts`, a project build's briefs); else an id the binding
//   mints once, so two bindings made outside every build never share memory.
// - `callScope`: the scope Core wrote into the round's opening id when the loop
//   runs beside others for one Flow (a project brief, when the host runs several
//   agents at once). Read off the binding's latest opening call, since later
//   calls of the round do not carry it; absent when the loop is unscoped.
// - `opening`: `"fresh"` on Core's opening call of a round that starts the
//   build's memory afresh (an arrival, a free first look, a repair's opening,
//   a builder that opens on its prepared entry); `"continuing"` on the opening
//   look of a round whose draft already holds the Flow (Core sets `held`), which
//   keeps the memory; absent on every later call of the round.
// - `move`: `"core"` on a call that is a move Core makes itself -- the site
//   reset's own arrivals at the start, an act's page or a stale list's place
//   (t743, `./core-move.ts`) -- so a domain applies to it none of the rules it
//   holds the model's calls to; absent on every call the model wrote. Set from
//   the async-context marker Core's move code runs inside, never from a call id.
//
// The frame is Core's alone: a domain reads it, and nothing a model writes can
// set it, since a model-written id never starts like an opening one.
//
// **One frame per process, however many copies of Core it loads** (t738,
// office run `run-mvgf04kw-310fc169`). The web panel bundles Core into its
// server, and the web domain's host module, loaded with a native `import()`,
// imports Core's `dist`: two copies of this module, each with its own store.
// Core set the frame in the panel's copy and the domain read its own, so the
// domain never saw one -- no build, no opening -- and every dependent builder's
// opening look, marked as its arrival, was refused as an unexpected key. The
// store is therefore kept once per process under a registered symbol, which
// every copy of this module finds, so a frame either copy sets is the one
// every copy reads. Nothing else is shared that way: the frame is still set
// only by a registry binding, and a domain only reads it.

import { AsyncLocalStorage } from "node:async_hooks";

/** Which build an evidence call belongs to, and how it stands to it (header). */
export type AutomationStudioEvidenceBuildScope = {
  readonly projectId: string;
  readonly flowId: string;
  readonly buildId: string;
  readonly callScope?: string;
  readonly opening?: "fresh" | "continuing";
  /** `"core"`: a move Core makes itself, not a call the model wrote (header, t743). */
  readonly move?: "core";
};

/** The registered key every copy of this module keeps the one store under (header). */
const STORE = Symbol.for("fluxiq.automation-studio.evidence-build-scope");

type Store = AsyncLocalStorage<Readonly<AutomationStudioEvidenceBuildScope>>;

const holder = globalThis as typeof globalThis & { [STORE]?: Store };
const calls: Store = holder[STORE] ??= new AsyncLocalStorage<Readonly<AutomationStudioEvidenceBuildScope>>();

/** Runs `fn` as an evidence call within `scope`: what `automationStudioEvidenceBuildScope` reads, however deep. */
export function runWithAutomationStudioEvidenceBuildScope<T>(scope: AutomationStudioEvidenceBuildScope, fn: () => T): T {
  const frame: { -readonly [K in keyof AutomationStudioEvidenceBuildScope]: AutomationStudioEvidenceBuildScope[K] } = { projectId: scope.projectId, flowId: scope.flowId, buildId: scope.buildId };
  if (scope.callScope !== undefined) frame.callScope = scope.callScope;
  if (scope.opening !== undefined) frame.opening = scope.opening;
  if (scope.move === "core") frame.move = "core";
  return calls.run(Object.freeze(frame), fn);
}

/** The build the current evidence call belongs to, or nothing outside every call a registry binding runs. */
export function automationStudioEvidenceBuildScope(): Readonly<AutomationStudioEvidenceBuildScope> | undefined {
  return calls.getStore();
}
