import type { JsonValue } from "@fluxiq/contracts/core";

/**
 * One input the Flow takes, at the value its test used (t252 D4): the Flow's
 * parameter, declared by its first binding, and the steps that use it.
 */

export type BuildTestInput = { name: string; test: JsonValue; steps: number[] };
