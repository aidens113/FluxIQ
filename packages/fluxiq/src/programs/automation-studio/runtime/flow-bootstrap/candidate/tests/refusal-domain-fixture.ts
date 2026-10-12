// A candidate submission's surroundings for the refusal tests: the web
// domain's real node definitions (`../../plan/tests/`), the few parameters and
// nodes the live scripts use that the copy lacks, and a stub of the domain's
// plan-node resolution that refuses the two things a domain refuses a written
// step for -- an undeclared consequence and a handle no view printed.
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry, canonicalBuiltinAutomationNodeDefinitions, type AutomationNodePort, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";

export const REFUSAL_TEST_RESOLUTION = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };

/** A handle the stub has never printed: every handle written with this prefix is refused. */
export const UNPRINTED_HANDLE_PREFIX = "t9";

const ROW_INPUT: AutomationNodePort = { id: "item", label: "Item", valueType: "any", role: "data", required: false };
const TYPE_ID = "web.output.dom-type";
const CLICK_ID = "web.output.dom-click";

/**
 * The domain's definitions with what the live scripts use and the copy lacks:
 * Type Text's `submit`, a click that takes a loop's row, and the next-page
 * node, whose `ended` route is how a `repeat while` span ends. `extra` adds
 * definitions a corpus case needs.
 */
export function refusalTestRegistry(extra: readonly AutomationStudioNodeDefinition[] = [], omit: readonly string[] = []): AutomationStudioNodeRegistry {
  const definitions = webDomainNodeDefinitionsFixture();
  // `omit` takes a built-in out, for a library that does not offer it.
  const registry = new AutomationStudioNodeRegistry(canonicalBuiltinAutomationNodeDefinitions.filter((definition) => !omit.includes(definition.id)));
  for (const definition of definitions) {
    if (definition.id === TYPE_ID) registry.register({ ...definition, parameters: [...definition.parameters, { id: "submit", label: "Submit", valueType: "boolean", defaultValue: false, allowStateBinding: true }] });
    else if (definition.id === CLICK_ID) registry.register({ ...definition, inputs: [...definition.inputs, ROW_INPUT] });
    else registry.register(definition);
  }
  const click = definitions.find((definition) => definition.id === CLICK_ID)!;
  registry.register({
    ...click,
    id: "web.output.dom-next_page",
    label: "Next Page",
    description: "Go to the next page of a listing, answering ended when there is none.",
    source: { kind: "importer", domainId: "web-automation", packageId: "@fluxiq-web-extension/domain", implementationKey: "web.dom.next_page" },
    outputAction: { fixedOutputId: "web.dom.next_page" },
    outputs: [...click.outputs, { id: "ended", label: "Ended", valueType: "any", role: "branch" }],
    parameters: [{ id: "nextPage", label: "Next Page", valueType: "object", allowStateBinding: true }, ...click.parameters.filter((parameter) => parameter.id !== "selector")]
  });
  for (const definition of extra) registry.register(definition);
  return registry;
}

/** Whether a step must say what it lastingly does, as the web domain decides it: every press, and a type that sends its form. */
function mustDeclare(definitionId: string, parameters: JsonObject): boolean {
  return definitionId === CLICK_ID || (definitionId === TYPE_ID && parameters.submit === true);
}

/** Every handle in a value, as written. */
function handlesIn(value: JsonValue | undefined, into: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((item) => handlesIn(item, into));
  else if (value && typeof value === "object") {
    if (typeof value.handle === "string") into.push(value.handle);
    for (const nested of Object.values(value)) handlesIn(nested, into);
  }
  return into;
}

/** The value with each handle resolved to a selector, as the domain resolves one it printed. */
function resolved(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(resolved);
  if (value && typeof value === "object") {
    if (typeof value.handle === "string") return { selector: `#${value.handle}` };
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, resolved(nested)]));
  }
  return value;
}

/** The stub of the domain's plan-node resolution (header). */
export const REFUSAL_TEST_BINDING = {
  resolvePlanNodeParameters: async (input: { nodeDefinitionId: string; parameters: JsonObject; declaredConsequences?: readonly string[] | undefined }) => {
    const unprinted = Object.entries(input.parameters).find(([, value]) => handlesIn(value).some((handle) => handle.startsWith(UNPRINTED_HANDLE_PREFIX)));
    if (unprinted) return { status: "refused" as const, issueCodes: ["web.handle.unknown", `web.handle.unknown:${unprinted[0]}`] };
    if (input.declaredConsequences === undefined && mustDeclare(input.nodeDefinitionId, input.parameters)) {
      return { status: "refused" as const, issueCodes: ["web.step.consequences_undeclared", "web.step.expected.consequences_classes_or_none"] };
    }
    return { status: "resolved" as const, parameters: resolved(input.parameters) as JsonObject };
  }
};

/** What a candidate submission controller is made with, for a registry. */
export function refusalTestSubmission(registry: AutomationStudioNodeRegistry = refusalTestRegistry()) {
  return {
    projectId: "project.test",
    flowId: "flow.test",
    registry,
    resolution: REFUSAL_TEST_RESOLUTION,
    baseDependencyDigest: "accepted.base",
    binding: REFUSAL_TEST_BINDING,
    // A gate that permits what is declared: what is tested is where a refusal points, not a grant.
    permissionFor: () => async () => ({ permitted: true as const })
  };
}
