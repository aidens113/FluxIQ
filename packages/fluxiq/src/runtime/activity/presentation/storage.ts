import { AsyncLocalStorage } from "node:async_hooks";
import type { RuntimeActivityPresentation } from "./types.ts";

export const runtimeActivityPresentationStorage = new AsyncLocalStorage<RuntimeActivityPresentation>();
