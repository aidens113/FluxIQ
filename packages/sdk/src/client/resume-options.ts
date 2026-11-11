import type { RunOptions } from "./run-types.ts";

/** What a resume takes: a resumed run keeps its first options and overrides, so `overrides` is not offered. */
export type ResumeOptions = Omit<RunOptions, "overrides">;
