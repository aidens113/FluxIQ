// The one store of run secrets per process, however many copies of Core it loads (the pattern of
// `../run-overrides/store.ts`): the registered symbol holds only the AsyncLocalStorage instance, never
// a secret. Each run's secrets live in that run's own async context, so concurrent runs never see each
// other's. Internal to this directory.

import { AsyncLocalStorage } from "node:async_hooks";

const STORE = Symbol.for("fluxiq.automation-studio.run-secrets");

type Store = AsyncLocalStorage<Readonly<Record<string, string>>>;

const holder = globalThis as typeof globalThis & { [STORE]?: Store };

export const automationStudioRunSecretsStore: Store = holder[STORE] ??= new AsyncLocalStorage<Readonly<Record<string, string>>>();
