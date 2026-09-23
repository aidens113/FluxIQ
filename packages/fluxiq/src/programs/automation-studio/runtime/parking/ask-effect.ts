import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioActionConsequence, AutomationStudioActionPermissionRequest } from "../action-permissions/index.ts";
import type { AutomationStudioAsk, AutomationStudioAskControl, AutomationStudioAskDraft, AutomationStudioAskKind, AutomationStudioAskOption, AutomationStudioAskRoutes } from "./ask.ts";

/**
 * The effect anything executing inside a run emits to ask the person something.
 *
 * An effect rather than a field on the node result, so the capability is open
 * to every part of a run at once: a built-in node, a domain adapter answering a
 * dispatch, a permission gate. The executor reads it where it reads the rest of
 * an attempt's effects, and never hands it to a host dispatcher -- no domain is
 * asked to know what an ask is.
 */
export const AUTOMATION_STUDIO_ASK_EFFECT = "ask.requested";

/** The effect for a drafted ask, ready to return from a node's `effects`. */
export function automationStudioAskEffect(draft: AutomationStudioAskDraft): { type: string; payload: JsonValue } {
  return { type: AUTOMATION_STUDIO_ASK_EFFECT, payload: draft as unknown as JsonValue };
}

/**
 * The ask an attempt raised, completed with the pending status and the account
 * of where it came from that only the runtime can supply. It keeps an id the
 * raiser gave it and is otherwise named after the attempt, which is unique
 * within the run.
 *
 * Every field is read the way the conversation store will have to accept it --
 * an option with its label and its route, a route that may be null, a
 * consequence class that is one of the five Core names -- because this ask is
 * the one that goes into the thread, not a runtime copy of it.
 *
 * Returns nothing when no attempt effect is an ask, and nothing when the
 * payload is not one: a malformed payload must not park a run on a question
 * nobody can read, and an attempt that emitted rubbish is better carried on
 * from than stopped forever.
 */
export function automationStudioAskInEffects(
  effects: ReadonlyArray<{ type: string; payload?: JsonValue }>,
  raisedBy: AutomationStudioAsk["raisedBy"] & { askId: string }
): AutomationStudioAsk | undefined {
  const effect = effects.find((candidate) => candidate.type === AUTOMATION_STUDIO_ASK_EFFECT);
  if (!effect) return undefined;
  const draft = askDraft(effect.payload);
  if (!draft) return undefined;
  const { askId, ...origin } = raisedBy;
  return { ...draft, askId: draft.askId ?? askId, status: "pending", raisedBy: origin };
}

/** A raised ask with everything normalized but the three things only the runtime can supply. */
type AutomationStudioNormalizedAskDraft = Omit<AutomationStudioAsk, "askId" | "status" | "raisedBy"> & { askId?: string };

const ASK_KINDS: ReadonlySet<string> = new Set<AutomationStudioAskKind>(["permission", "choice", "confirm", "open"]);

function askDraft(payload: JsonValue | undefined): AutomationStudioNormalizedAskDraft | undefined {
  if (!isRecord(payload)) return undefined;
  const { kind, parks, text } = payload;
  if (typeof kind !== "string" || !ASK_KINDS.has(kind)) return undefined;
  if (typeof parks !== "boolean" || typeof text !== "string" || !text.trim()) return undefined;
  const options = askOptions(payload.options);
  const routes = askRoutes(payload.routes);
  const consequences = askConsequences(payload.consequences);
  const missing = askConsequences(payload.missing);
  return {
    kind: kind as AutomationStudioAskKind,
    parks,
    text,
    ...(typeof payload.askId === "string" && payload.askId ? { askId: payload.askId } : {}),
    ...(options ? { options } : {}),
    ...(routes ? { routes } : {}),
    ...(typeof payload.timeoutMs === "number" && Number.isFinite(payload.timeoutMs) && payload.timeoutMs > 0 ? { timeoutMs: Math.floor(payload.timeoutMs) } : {}),
    ...(payload.onTimeout === "deny" || payload.onTimeout === "default" ? { onTimeout: payload.onTimeout } : {}),
    ...(consequences ? { consequences } : {}),
    ...(missing ? { missing } : {}),
    ...(isRecord(payload.control) ? { control: askControl(payload.control) } : {}),
    ...(askPermissionRequest(payload) ?? {})
  };
}

/**
 * An option with no label is labelled by its id, which is what an answer names
 * anyway. A label and a route are filled in here rather than left absent: a
 * thread read back a week later cannot infer either.
 */
function askOptions(value: JsonValue | undefined): AutomationStudioAskOption[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const options: AutomationStudioAskOption[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id) continue;
    options.push({
      id: entry.id,
      label: typeof entry.label === "string" && entry.label ? entry.label : entry.id,
      route: typeof entry.route === "string" && entry.route ? entry.route : null
    });
  }
  return options.length ? options : undefined;
}

/**
 * A route the raiser did not name is null, not a dropped routes object: the
 * ask's own model allows a null route, and the parked run fills it in from the
 * defaults. A routes object naming nothing at all is dropped, because it says
 * nothing the defaults do not already say.
 */
function askRoutes(value: JsonValue | undefined): AutomationStudioAskRoutes | undefined {
  if (!isRecord(value)) return undefined;
  const routes = { granted: route(value.granted), denied: route(value.denied), timedOut: route(value.timedOut) };
  return routes.granted || routes.denied || routes.timedOut ? routes : undefined;
}

function route(value: JsonValue | undefined): string | null {
  return typeof value === "string" && value ? value : null;
}

/**
 * The consequence classes as strings, checked against Core's five names by the
 * store rather than here.
 *
 * The check belongs at the write and cannot be done here: the browser bundle
 * reaches this module through `builtin.routine.approval`, and
 * `runtime/action-permissions/`'s barrel pulls `node:crypto` in with it, which
 * the extension's bundle guard refuses. So the vocabulary arrives as a type,
 * which is erased, and `runtime/conversations/inputs.ts` refuses a class that is
 * not one of the five -- loudly, at the one place that exists for what a write
 * has to satisfy, rather than by quietly dropping a class out of `missing` and
 * understating what is being asked for.
 */
function askConsequences(value: JsonValue | undefined): AutomationStudioActionConsequence[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const consequences = value.filter((entry): entry is AutomationStudioActionConsequence => typeof entry === "string" && entry.length > 0);
  return consequences.length ? consequences : undefined;
}

function askControl(value: Record<string, JsonValue>): AutomationStudioAskControl {
  return {
    name: typeof value.name === "string" && value.name ? value.name : null,
    kind: typeof value.kind === "string" && value.kind ? value.kind : null
  };
}

/**
 * A permission ask carries the request the gate built, whole. It is checked at
 * the one field the join turns on -- the request's `requestId` must be the ask
 * id, which is also what the store refuses on -- and otherwise travels as the
 * gate wrote it, because rebuilding it here would be a second, worse copy of
 * what Core already said.
 */
function askPermissionRequest(payload: Record<string, JsonValue>): { permissionRequest: AutomationStudioActionPermissionRequest } | undefined {
  const request = payload.permissionRequest;
  if (!isRecord(request) || typeof request.requestId !== "string" || !request.requestId) return undefined;
  const askId = typeof payload.askId === "string" ? payload.askId : "";
  if (askId && request.requestId !== askId) return undefined;
  return { permissionRequest: request as unknown as AutomationStudioActionPermissionRequest };
}

function isRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
