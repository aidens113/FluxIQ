// The one store of run frames per process, however many copies of Core it loads (the t738
// pattern, `../llm/harness-options/evidence-build-scope.ts`): the web panel bundles Core while the
// domain imports Core's `dist`, so a module-local store would be two. The registered symbol holds
// only the AsyncLocalStorage instance, never a frame: each frame lives in its own run's async
// context, so concurrent runs in one process never see each other's overrides. Internal to this
// directory.

import { AsyncLocalStorage } from "node:async_hooks";
import type { AutomationStudioRunOverrides } from "./frame.ts";

const STORE = Symbol.for("fluxiq.automation-studio.run-overrides");

type Store = AsyncLocalStorage<Readonly<AutomationStudioRunOverrides>>;

const holder = globalThis as typeof globalThis & { [STORE]?: Store };

export const automationStudioRunOverridesStore: Store = holder[STORE] ??= new AsyncLocalStorage<Readonly<AutomationStudioRunOverrides>>();
