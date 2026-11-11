// The types of a FluxNode as the SDK declares it and hands it to `run`.

import type { JsonObject, JsonValue } from "@fluxiq/contracts/core";
import type { FluxNodeSpec, FluxNodeSpecInput } from "@fluxiq/contracts/fluxnode";
import type { z, ZodTypeAny } from "zod";
import type { TypeSchemaInput } from "../schema/index.ts";
import type { FluxNodeOverridesInput } from "./overrides-input.ts";

/** What a run's outputs are typed as: the zod schema's output, or any JSON value for a raw JSON Schema or none. */
export type OutputOf<S> = S extends ZodTypeAny ? z.output<S> : JsonValue;

/** What a run's inputs are written as: the zod schema's input, or a JSON object for a raw JSON Schema or none. */
export type InputOf<S> = S extends ZodTypeAny ? z.input<S> : JsonObject;

/** What `check` returns: `true` to pass, or a reason (a string) or `false` to send the run back with a "no". */
export type CheckResult = boolean | string;

/** The developer's check, run in this process when the engine asks (plan, N4). */
export type FluxNodeCheck<I extends TypeSchemaInput | undefined, O extends TypeSchemaInput | undefined> = (arguments_: {
  outputs: OutputOf<O>;
  inputs: InputOf<I>;
}) => CheckResult | Promise<CheckResult>;

/**
 * What `defineFluxNode` takes: the spec's fields, with `inputs` and `outputs` as zod
 * schemas or raw JSON Schema, the check as a function, and `uses` as FluxNodes or names.
 */
export type FluxNodeDefinition<I extends TypeSchemaInput | undefined, O extends TypeSchemaInput | undefined> = {
  name: string;
  runtime: FluxNodeSpecInput["runtime"];
  goal: string;
  start: string;
  inputs?: I;
  outputs?: O;
  scope: FluxNodeSpecInput["scope"];
  check?: FluxNodeCheck<I, O>;
  options?: FluxNodeSpecInput["options"];
  overrides?: FluxNodeOverridesInput;
  uses?: Array<string | { readonly name: string }>;
};

/** A defined FluxNode: its validated spec, the original schemas, and the check that stays in this process. */
export type FluxNode<I extends TypeSchemaInput | undefined = undefined, O extends TypeSchemaInput | undefined = undefined> = {
  readonly name: string;
  readonly spec: FluxNodeSpec;
  readonly inputsSchema: I | undefined;
  readonly outputsSchema: O | undefined;
  readonly check: FluxNodeCheck<I, O> | undefined;
  /** The spec's hash (the task key with the name), computed once. */
  hash(): Promise<string>;
};

/** Any FluxNode, whatever its types. */
export type AnyFluxNode = FluxNode<TypeSchemaInput | undefined, TypeSchemaInput | undefined>;
