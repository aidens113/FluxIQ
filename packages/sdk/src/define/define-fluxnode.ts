// `defineFluxNode`: declare a Flow in code. The spec is validated here with the
// contracts' own parser, so a mistake shows up where the node is written, not at the
// first run.

import { fluxNodeSpecHash, parseFluxNodeSpec } from "@fluxiq/contracts/fluxnode";
import { SdkError } from "../errors/index.ts";
import { typeSchemaFrom, type TypeSchemaInput } from "../schema/index.ts";
import { FLUXNODE_MARK } from "./fluxnode-mark.ts";
import type { FluxNode, FluxNodeDefinition } from "./types.ts";

/**
 * Declares a FluxNode. `inputs` and `outputs` take zod schemas (converted to the
 * contracts' JSON Schema subset) or raw JSON Schema; both are optional. With a zod
 * `outputs`, `run` returns those types. A `check` stays in this process.
 */
export function defineFluxNode<I extends TypeSchemaInput | undefined = undefined, O extends TypeSchemaInput | undefined = undefined>(definition: FluxNodeDefinition<I, O>): FluxNode<I, O> {
  const draft: Record<string, unknown> = {
    name: definition.name,
    runtime: definition.runtime,
    goal: definition.goal,
    start: definition.start,
    scope: definition.scope,
    hasCheck: definition.check !== undefined
  };
  if (definition.inputs !== undefined) draft.inputs = typeSchemaFrom(definition.inputs, "inputs");
  if (definition.outputs !== undefined) draft.outputs = typeSchemaFrom(definition.outputs, "outputs");
  if (definition.options !== undefined) draft.options = definition.options;
  if (definition.uses !== undefined) draft.uses = definition.uses.map((use) => (typeof use === "string" ? use : use.name));
  const parsed = parseFluxNodeSpec(draft);
  if (!parsed.ok) {
    const lines = parsed.issues.map((issue) => `${issue.path === "" ? "(spec)" : issue.path}: ${issue.message}`);
    throw new SdkError("invalid_definition", `FluxNode "${String(definition.name)}" is not valid:\n  ${lines.join("\n  ")}`, { issues: parsed.issues });
  }
  const spec = parsed.value;
  let hash: Promise<string> | undefined;
  const node = {
    [FLUXNODE_MARK]: true,
    name: spec.name,
    spec,
    inputsSchema: definition.inputs,
    outputsSchema: definition.outputs,
    check: definition.check,
    hash: () => (hash ??= fluxNodeSpecHash(spec))
  };
  return Object.freeze(node) as unknown as FluxNode<I, O>;
}
