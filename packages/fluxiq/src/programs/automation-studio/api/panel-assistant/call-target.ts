// What a call acts on, in a person's words, for the assistant's consent check
// and its Allow card.
//
// **The target is what the registration declares.** Every live registration
// declares `resource` from the payload fields its handler acts on
// (`endpointResource`: "if the handler acts on `payload.projectId`, the
// resource is `project("projectId")`"), and an assistant tool whose resource
// does not name what it acts on (a category, a session, the recordings of a
// project) declares `target`: the input fields that hold it, each with its
// plain word. Those declarations, not whichever id the input happens to carry,
// say what the call acts on. Reading "the most specific id present" let a
// model widen a call: `delete-project` with a `flowId` beside its `projectId`
// was described as that Flow, so "delete Old search" deleted the whole project
// at once (review P9-R2).
//
// - With a declared `target`, the items are the things its fields hold.
// - Otherwise they are the resources IAM decides on. A registration without a
//   resource, or one on the workspace, the program or the caller's own user,
//   has no target a person could name: undefined.
//
// **Partial.** The target's fields are the declared ones and those the
// resource reads (`assistantProbedResource`). Any other input that could widen
// the act makes the target `partial`: an id (`id`, `…Id`, `…Ids`), a list, a
// flag, a number, a nested object, one of a fixed set of words ("all"), or a
// field the input does not declare (its handler may still read it). A partial
// target is never clearly asked, so the call always waits on a card, which
// names the target in the tool's own words. Free text (a reason, a new name)
// says how, not what, so it widens nothing.
//
// A Flow's and a project's name are read through the registry as the person,
// `via: "assistant"`, so a name they may not read is never shown; anything
// else is named by what is selected or not at all.

import type { PanelContextKey, ProgramApiJsonSchema } from "@fluxiq/contracts/program-api-inputs";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { PanelAssistantContext, PanelAssistantTarget, PanelAssistantTargetItem, PanelAssistantToolCall } from "../../../../runtime/conversations/assistant/index.ts";
import { assistantProbedResource, assistantResourceItem, type AssistantTargetItem } from "../../../_shared/assistant/index.ts";
import type { GlobalProgramApiRegistry, ProgramApiActor, ProgramApiEndpointSummary } from "../../../_shared/api.ts";
import type { ProgramResourceRef } from "../../../_shared/iam/index.ts";

type SchemaProperty = Readonly<Record<string, unknown>>;

/** Reads a target's names through `registry` as the person, `via: "assistant"`. */
export class PanelAssistantCallTargets {
  constructor(private readonly registry: GlobalProgramApiRegistry) {}

  /** What `call` acts on, or undefined when no person could name it. */
  async describe(call: PanelAssistantToolCall, actor: ProgramApiActor): Promise<PanelAssistantTarget | undefined> {
    const registration = this.registry.endpoints().find((endpoint) => endpoint.programId === call.tool.programId && endpoint.endpoint === call.tool.endpoint);
    if (registration === undefined) return undefined;
    const declared = declaredTarget(registration);
    const named = declared === undefined ? resourceItems(registration, call, actor) : targetItems(declared, call);
    if (named === undefined || named.length === 0) return undefined;
    const items: PanelAssistantTargetItem[] = [];
    for (const item of named) items.push(await this.withName(item, actor));
    return widened(registration, declared, call) ? { items, partial: true } : { items };
  }

  /** The names of the selected project and Flow, for the context line. */
  async selectionNames(context: PanelAssistantContext, actor: ProgramApiActor): Promise<{ project?: string; flow?: string }> {
    const project = context.projectId ? await this.projectName(context.projectId, actor) : undefined;
    const flow = context.projectId && context.flowId ? await this.flowName(context.projectId, context.flowId, actor) : undefined;
    return { ...(project ? { project } : {}), ...(flow ? { flow } : {}) };
  }

  private async withName(item: AssistantTargetItem, actor: ProgramApiActor): Promise<PanelAssistantTargetItem> {
    const name = item.kind === "Flow" && item.projectId ? await this.flowName(item.projectId, item.id, actor) : item.kind === "project" ? await this.projectName(item.id, actor) : undefined;
    return { kind: item.kind, id: item.id, ...(name ? { name } : {}), ...(item.contextKey ? { contextKey: item.contextKey } : {}) };
  }

  private async flowName(projectId: string, flowId: string, actor: ProgramApiActor): Promise<string | undefined> {
    const read = await this.registry.call<JsonObject, { flow?: { name?: unknown } }>({ programId: "automation-studio", endpoint: "get-flow", scope: {}, actor, via: "assistant", payload: { projectId, flowId } });
    const name = read.ok ? read.payload?.flow?.name : undefined;
    return typeof name === "string" && name.trim() ? name.trim() : undefined;
  }

  private async projectName(projectId: string, actor: ProgramApiActor): Promise<string | undefined> {
    const read = await this.registry.call<JsonObject, { projects?: unknown }>({ programId: "automation-studio", endpoint: "projects", scope: {}, actor, via: "assistant", payload: {} });
    const listed: unknown = read.ok ? read.payload?.projects : undefined;
    const projects: Array<Record<string, unknown>> = Array.isArray(listed) ? listed.filter((project): project is Record<string, unknown> => project !== null && typeof project === "object") : [];
    const found = projects.find((project) => project.id === projectId || project.projectId === projectId);
    return typeof found?.name === "string" && found.name.trim() ? found.name.trim() : undefined;
  }
}

function declaredTarget(registration: ProgramApiEndpointSummary): Readonly<Record<string, string>> | undefined {
  const assistant = registration.assistant;
  return assistant === undefined || "hidden" in assistant ? undefined : assistant.target;
}

/** The resources IAM decides `call` on, as a person names them; undefined without a resource or when any could not be named. */
function resourceItems(registration: ProgramApiEndpointSummary, call: PanelAssistantToolCall, actor: ProgramApiActor): AssistantTargetItem[] | undefined {
  if (registration.resource === undefined) return undefined;
  const decided = registration.resource.of({ programId: call.tool.programId, endpoint: call.tool.endpoint, scope: {}, actor, via: "assistant", payload: call.input });
  const items = (isRefList(decided) ? decided : [decided]).map(assistantResourceItem);
  return items.every((item): item is AssistantTargetItem => item !== undefined) ? items : undefined;
}

/** The things the declared target fields hold, one per id; undefined when a field holds none. */
function targetItems(declared: Readonly<Record<string, string>>, call: PanelAssistantToolCall): AssistantTargetItem[] | undefined {
  const items: AssistantTargetItem[] = [];
  for (const [field, kind] of Object.entries(declared)) {
    const ids = idsIn(call.input[field]);
    if (!ids.length) return undefined;
    const contextKey: PanelContextKey | undefined = call.tool.contextArgs[field];
    for (const id of ids) items.push({ kind, id, ...(contextKey ? { contextKey } : {}) });
  }
  return items;
}

/** Whether any input outside the target's fields (declared, and read by the resource) could widen the act. */
function widened(registration: ProgramApiEndpointSummary, declared: Readonly<Record<string, string>> | undefined, call: PanelAssistantToolCall): boolean {
  const properties = propertiesOf(call.tool.inputSchema);
  const fields = [...new Set([...Object.keys(properties), ...Object.keys(call.input)])];
  const read = registration.resource === undefined ? [] : assistantProbedResource(registration.resource, fields).fields;
  const target = new Set([...read, ...Object.keys(declared ?? {})]);
  return Object.entries(call.input).some(([field, value]) => !target.has(field) && widens(field, value, Object.hasOwn(properties, field) ? properties[field] : undefined));
}

/** Whether one input outside the target could make the call act on more, or on something else; free text cannot. */
function widens(field: string, value: JsonValue | undefined, property: SchemaProperty | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (property === undefined || /^id$|Ids?$/u.test(field)) return true;
  if (typeof value !== "string") return true;
  return property.type !== "string" || property.enum !== undefined || property.const !== undefined;
}

function propertiesOf(schema: ProgramApiJsonSchema): Readonly<Record<string, SchemaProperty>> {
  const properties = schema.properties;
  return properties !== null && typeof properties === "object" ? (properties as Readonly<Record<string, SchemaProperty>>) : {};
}

function isRefList(refs: ProgramResourceRef | readonly ProgramResourceRef[]): refs is readonly ProgramResourceRef[] {
  return Array.isArray(refs);
}

function idsIn(value: JsonValue | undefined): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}
