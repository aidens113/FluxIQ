import type { createKeySessionService, createSQLiteKeyStore } from "fluxiq/platform";

type Composition = { store: Awaited<ReturnType<typeof createSQLiteKeyStore>>; service: ReturnType<typeof createKeySessionService> };
const state = globalThis as typeof globalThis & { __fluxiqKeyServices?: Map<string, Promise<Composition>> };

/** Shared across separately bundled Next routes; entries include root, origin and instance id. */
export const keySessionCompositions = state.__fluxiqKeyServices ??= new Map<string, Promise<Composition>>();
