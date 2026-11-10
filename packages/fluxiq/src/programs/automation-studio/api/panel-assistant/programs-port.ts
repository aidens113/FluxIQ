// The program API as the panel assistant uses it (`PanelAssistantPrograms`):
// the registry's declared tools through `AssistantToolCatalog`, and every call
// through `GlobalProgramApiRegistry.call` as the person's own actor with
// `via: "assistant"`, so IAM decides each one and writes it to the audit.
//
// **No speculative decisions.** `AssistantToolCatalog.listFor` decides every
// tool for the actor with `registry.authorize`, which writes an audit row per
// decision: about a hundred rows for every message, none of them a request
// anyone made. The cause is deciding before anything is asked, so the
// assistant does not: it offers the declared tools and lets the call decide,
// which is the gate in any case. A refused call comes back as a plain refusal
// the model reads, and the audit holds exactly the calls that were made.

import type { JsonObject } from "../../../../core/index.ts";
import type { PanelAssistantPrograms, PanelAssistantToolCall } from "../../../../runtime/conversations/assistant/index.ts";
import { assistantCallSpend, AssistantToolCatalog } from "../../../_shared/assistant/index.ts";
import type { GlobalProgramApiRegistry, ProgramApiActor, ProgramApiEndpointSummary } from "../../../_shared/api.ts";
import { PanelAssistantCallTargets } from "./call-target.ts";

type Port = PanelAssistantPrograms<ProgramApiActor>;

/** How many tools one `find_tools` answers. */
const FOUND = 8;

/** The assistant's port over `registry`. The catalog reads the declarations on first use, once every program has registered. */
export function panelAssistantPrograms(registry: GlobalProgramApiRegistry): Port {
  const catalog = new AssistantToolCatalog(registry);
  const targets = new PanelAssistantCallTargets(registry);
  const registrationOf = registrations(registry);
  return {
    tools: () => catalog.tools(),
    find: (query) => catalog.find(query, { limit: FOUND }),
    // A run's Flow is not looked up yet, so a run is treated as able to send, pay and delete, and asked about (`AssistantToolCatalog.consequencesOf`).
    consequencesOf: async (call) => catalog.consequencesOf(call.tool.name),
    describeTarget: (call, actor) => targets.describe(call, actor),
    // What the endpoint declares it spends (`spends`); review P9-R2 found a call adding budget ran unasked, and S2 replaced reading `…Usd` field names with the declaration.
    projectedCostUsd: async (call) => assistantCallSpend(registrationOf(call)?.assistant, call.input),
    selectionNames: (context, actor) => targets.selectionNames(context, actor),
    needsPress: destructiveCalls(registry),
    call: assistantCall(registry),
    mintPress: pressMint(registry)
  };
}

/** Each call's registration, read once after every program registered. */
function registrations(registry: GlobalProgramApiRegistry): (call: PanelAssistantToolCall) => ProgramApiEndpointSummary | undefined {
  let byKey: ReadonlyMap<string, ProgramApiEndpointSummary> | undefined;
  return (call) => {
    byKey ??= new Map(registry.endpoints().map((endpoint) => [`${endpoint.programId}:${endpoint.endpoint}`, endpoint]));
    return byKey.get(`${call.tool.programId}:${call.tool.endpoint}`);
  };
}

/** Whether a call's endpoint is `destructive`, which only a person's press (or PIN) confirms. Read once, after every program registered. */
function destructiveCalls(registry: GlobalProgramApiRegistry): Port["needsPress"] {
  let destructive: ReadonlySet<string> | undefined;
  return (call: PanelAssistantToolCall) => {
    destructive ??= new Set(registry.endpoints().filter((endpoint) => endpoint.classification === "destructive").map((endpoint) => `${endpoint.programId}:${endpoint.endpoint}`));
    return destructive.has(`${call.tool.programId}:${call.tool.endpoint}`);
  };
}

/** One call as the person, `via: "assistant"`, with the grant server code minted when there is one. */
function assistantCall(registry: GlobalProgramApiRegistry): Port["call"] {
  return (call, actor, options) => registry.call<JsonObject, unknown>({
    programId: call.tool.programId,
    endpoint: call.tool.endpoint,
    scope: options.scope,
    payload: call.input,
    actor,
    via: "assistant",
    ...(options.pressGrant === undefined ? {} : { pressGrant: options.pressGrant })
  });
}

/** A grant for exactly this call, minted for the person's own request (never `via`), earned as `consent` says. */
function pressMint(registry: GlobalProgramApiRegistry): Port["mintPress"] {
  return async (call, actor, scope, consent) => {
    const minted = await registry.mintPressGrant({ actor, scope, consent, programId: call.tool.programId, endpoint: call.tool.endpoint, payload: call.input });
    return minted.ok && minted.payload ? { ok: true, grant: minted.payload.grant } : { ok: false, error: minted.error ?? "The action could not be confirmed." };
  };
}
