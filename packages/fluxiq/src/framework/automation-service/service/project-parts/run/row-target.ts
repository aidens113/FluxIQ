// The control a step of a part would press on this row, in the host's own words.
//
// Which control a row's press means is the domain's to say, and Core never reads its form:
// a web step's row goes into its recorded element's context, which is how the page keeps a
// press to that row (the web domain's `targets/row-scope.ts`). So the step's own implementation
// is asked what it would send, and what it hands back goes to the page unread, as a question
// about a control rather than a press. The page answers it through the same resolver the press
// itself goes through, with the same rule about two rows that look alike.
//
// **Asked of a node only when asking cannot act.** An importer's node declaring `outputAction`
// hands its act back as a `policy.output.dispatch` effect for the executor to send, so running
// its implementation sends nothing; that is the contract Core's native runtime holds it to. For
// any other node, running it would be doing it, so it is never asked, and the step stops for
// want of a check. So does an answer that is not exactly one such effect.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../../../flows/executable/graph/index.ts";
import type { AutomationStudioRunCheckpointRow } from "../../../../../runtime/automation-host/index.ts";
import type { AutomationStudioNativeNodeRuntime } from "../../../../../runtime/native-nodes/index.ts";
import { automationStudioPartControlTarget, automationStudioPartSteps } from "../../../../../runtime/project-parts/index.ts";

const DISPATCH_EFFECT = "policy.output.dispatch";

type ProjectPartRowFound = Extract<AutomationStudioRunCheckpointRow, { outcome: "found" }>;

export async function projectPartRowTarget(input: {
  native: Pick<AutomationStudioNativeNodeRuntime, "getDefinition" | "execute"> | undefined;
  node: AutomationStudioFlowNode;
  row: ProjectPartRowFound;
  controlKeys: ReadonlySet<string>;
  signal?: AbortSignal | undefined;
}): Promise<JsonObject | undefined> {
  const { native, node, row } = input;
  const definition = native?.getDefinition(node.definitionId);
  if (!native || !definition?.outputAction || definition.source.kind !== "importer") return undefined;
  const asked = { ...node, parameterValues: { ...row.parameters } };
  const said = await native.execute(asked, { ...row.inputs }, input.signal);
  const effects = said?.result.effects ?? [];
  if (said?.result.status !== "success" || effects.length !== 1 || effects[0]!.type !== DISPATCH_EFFECT) return undefined;
  const parameters = record(record(effects[0]!.payload)?.parameters);
  if (!parameters) return undefined;
  const step = automationStudioPartSteps({ nodes: [{ ...node, parameterValues: parameters }], edges: [] })[0];
  return step ? automationStudioPartControlTarget(step, input.controlKeys) : undefined;
}

function record(value: JsonValue | undefined): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}
