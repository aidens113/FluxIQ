import { codeIdentifierFaults } from "./code-identifiers.ts";
import { generatedNameFaults } from "./generated-names.ts";
import { internalTermFaults } from "./internal-terms.ts";
import { stutterFaults } from "./stutter.ts";

/**
 * Why `text` must not reach a person as it is: each fault a short plain reason
 * naming the offending token -- an internal term (`subflow`, `trial`), a code
 * identifier (`core.submit_subflow`, `checkout_summary`, `routerRuns`), a
 * generated class-like name (`css-0732x7m`), or a phrase said twice. Empty
 * when the text is clean. Pure: a client may run it on anything it is about
 * to show, and a test on everything a producer says.
 */
export function personFacingTextFaults(text: string): readonly string[] {
  return [...internalTermFaults(text), ...codeIdentifierFaults(text), ...generatedNameFaults(text), ...stutterFaults(text)];
}
