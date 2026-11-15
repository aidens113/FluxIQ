import type { AppContractError } from "./error.ts";

export type AppParseResult<T> = { ok: true; value: T } | { ok: false; error: AppContractError };
