// A FluxNode's canonical form and spec hash (plan, N1). The name plus the spec hash is
// the task key. Inputs never change it, and neither do options or whether there is a
// check: changing the goal, the input or output types, the scope, the runtime or the
// start starts a new learned Flow beside the old one.

import type { JsonObject } from "../../core.ts";
import { canonicalJson } from "../json/index.ts";
import { canonicalJsonTypeSchema } from "../type-schema/index.ts";
import type { FluxNodeSpec } from "./definition.ts";
import type { FluxNodeScope } from "./scope.ts";

/**
 * The parts of a spec that make it a different task, in canonical form: runtime,
 * goal with every run of whitespace one space, start, inputs, outputs and scope,
 * with every set sorted.
 */
export function fluxNodeSpecIdentity(spec: FluxNodeSpec): JsonObject {
  const identity: JsonObject = {
    runtime: spec.runtime,
    goal: spec.goal.trim().replace(/\s+/gu, " "),
    start: spec.start,
    scope: canonicalScope(spec.scope)
  };
  if (spec.inputs !== undefined) identity["inputs"] = canonicalJsonTypeSchema(spec.inputs);
  if (spec.outputs !== undefined) identity["outputs"] = canonicalJsonTypeSchema(spec.outputs);
  return identity;
}

/**
 * The whole spec as canonical JSON text: the identity's parts plus name, check,
 * uses and options, with sets sorted and keys in order. Two specs that say the same
 * thing give the same text.
 */
export function canonicalFluxNodeSpec(spec: FluxNodeSpec): string {
  const form = fluxNodeSpecIdentity(spec);
  form["name"] = spec.name;
  form["hasCheck"] = spec.hasCheck;
  form["goal"] = spec.goal;
  if (spec.uses !== undefined) form["uses"] = [...new Set(spec.uses)].sort();
  if (spec.options !== undefined) {
    const options: JsonObject = {};
    const keys = ["retries", "judge", "budgetUsd", "model", "mode", "timeoutMs"] as const;
    for (const key of keys) {
      const value = spec.options[key];
      if (value !== undefined) options[key] = value;
    }
    form["options"] = options;
  }
  return canonicalJson(form);
}

/**
 * The spec hash: SHA-256 of the identity's canonical JSON, as 64 lowercase hex
 * characters. Uses `globalThis.crypto.subtle`, present in browsers and Node 20+.
 */
export async function fluxNodeSpecHash(spec: FluxNodeSpec): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) throw new Error("A spec hash needs globalThis.crypto.subtle (a secure browser context or Node 20+).");
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(fluxNodeSpecIdentity(spec))));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalScope(scope: FluxNodeScope): JsonObject {
  const form: JsonObject = { acts: [...new Set(scope.acts)].sort() };
  if (scope.sites !== undefined) form["sites"] = [...new Set(scope.sites)].sort();
  if (scope.apps !== undefined) form["apps"] = [...new Set(scope.apps)].sort();
  return form;
}
