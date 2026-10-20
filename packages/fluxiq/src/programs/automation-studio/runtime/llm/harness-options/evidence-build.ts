// The durable id of the build the current async context works for (t728,
// audit finding 8).
//
// A project build's briefs each make their own evidence binding
// (`../../service/project-build/brief-ports.ts`), and that binding is handed
// only the project and the Flow. The build record's own id
// (`build.<uuid>`, `../../service/project-build/types.ts`) is in scope where the
// build starts, so the build runs inside this frame and every binding made
// under it reads the same id: the supervisor's calls and every brief's calls
// name one build, and a brief's own sub-scope tells concurrent briefs apart
// (`./evidence-build-scope.ts`).
//
// Kept once per process under a registered symbol, as that frame is (t738): a
// host that bundles Core beside a domain importing Core's `dist` loads this
// module twice, and a build frame set in one copy must be the one a binding
// made in the other reads.

import { AsyncLocalStorage } from "node:async_hooks";

/** The registered key every copy of this module keeps the one store under (header). */
const STORE = Symbol.for("fluxiq.automation-studio.evidence-build");

const holder = globalThis as typeof globalThis & { [STORE]?: AsyncLocalStorage<string> };
const builds: AsyncLocalStorage<string> = holder[STORE] ??= new AsyncLocalStorage<string>();

/** Runs `fn` as the work of build `buildId`: every evidence call it makes, however deep, names that build. */
export function runWithAutomationStudioEvidenceBuild<T>(buildId: string, fn: () => T): T {
  return builds.run(buildId, fn);
}

/** `fn`, made to run as the work of build `buildId` whenever it is called (`runWithAutomationStudioEvidenceBuild`). */
export function automationStudioEvidenceBuildBound<A extends unknown[], R>(buildId: string, fn: (...args: A) => R): (...args: A) => R {
  return (...args) => builds.run(buildId, () => fn(...args));
}

/** The build the current async context works for, or nothing outside every build frame. */
export function automationStudioEvidenceBuildId(): string | undefined {
  return builds.getStore();
}
