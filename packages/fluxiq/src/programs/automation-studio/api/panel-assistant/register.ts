// The panel assistant's endpoints: its threads, a turn's attachment, renaming
// and deleting a thread, a message, the answer to its Allow card, and the
// per-message spending allowance.
//
// Every endpoint is the person's own: a thread lives in their own database, so
// each takes the signed-in user from the actor and never from the payload, and
// declares `endpointResource.selfUser()`. Each is hidden from the assistant's
// tools, since they are its own chat. A paired client (the extension) keeps its
// own threads and interpreter and is refused here.
//
// Renaming and deleting a thread are `authoring`, as `rename-conversation` and
// `delete-conversation` are: a person's own chat history, changed from the dock's
// own list, never takes a PIN. A thread the person does not have answers
// `conversation_not_found`, whoever else holds one under that id, because the
// only database looked in is their own. A delete is refused with
// `conversation_run_active` while a message's or a card's work still uses the
// thread (`runtime/conversations/assistant/thread-use.ts`). An attachment that
// refers to a project's record is read in the project the request names, which
// IAM decides separately (`./project-attachments.ts`).
//
// `send-panel-message` answers once the message is stored; the work goes on in
// the background and every step lands in the thread, which the dock reads as it
// reads any thread. `answer-panel-ask` likewise answers once the answer is
// stored.
//
// Registering touches nothing on the service: the threads' root is read on the
// first request (`tests/llm-generation.test.ts` pins that for every Studio
// endpoint). The host binds the model and the settings afterwards through
// `panelAssistantOf(registry)`.

import path from "node:path";
import { iamActionName } from "@fluxiq/contracts/iam";
import { iamEndpointAccessLevel, iamProgramService } from "../../../../platform/iam/catalog/index.ts";
import { PanelAssistant, PanelAssistantThreads } from "../../../../runtime/conversations/assistant/index.ts";
import type { GlobalProgramApiRegistry, ProgramApiActor, ProgramApiHandler, ProgramEndpointClassification } from "../../../_shared/api.ts";
import { endpointResource } from "../../../_shared/iam/index.ts";
import type { Permission } from "../../../identity-access/index.ts";
import { PANEL_ASSISTANT_ENDPOINTS } from "./endpoints.ts";
import { rememberPanelAssistant } from "./panel-assistant-of.ts";
import { panelAssistantProjectAttachments, type PanelAssistantProjectReads } from "./project-attachments.ts";
import { panelAssistantPrograms } from "./programs-port.ts";

const PROGRAM = "automation-studio";

/** The project id a panel thread reads back with: naming it names no project. */
const PANEL_PROJECT = "panel";

/** What the endpoints need: the registry, where the service keeps its projects, and what reads a project's attachment (each read on first use). */
export type PanelAssistantApiDependencies = {
  readonly registry: GlobalProgramApiRegistry;
  readonly service: { readonly projectPaths: { readonly root: string | undefined } } & PanelAssistantProjectReads;
};

/** Registers the endpoints and answers the assistant they serve. */
export function registerPanelAssistantEndpoints(dependencies: PanelAssistantApiDependencies): PanelAssistant<ProgramApiActor> {
  const { registry, service } = dependencies;
  let threads: PanelAssistantThreads | undefined;
  const assistant = new PanelAssistant<ProgramApiActor>({
    programs: panelAssistantPrograms(registry),
    threads: () => {
      if (threads) return threads;
      const projectsRoot = service.projectPaths.root;
      if (!projectsRoot) throw new Error("The assistant's conversations need a workspace that keeps its data on disk.");
      // Beside the projects' root, never inside it: no project's id can name a panel database.
      threads = new PanelAssistantThreads({ rootDir: path.join(path.dirname(projectsRoot), "panel-assistant") });
      return threads;
    }
  });
  rememberPanelAssistant(registry, assistant);
  const register = (endpoint: string, permission: Permission, classification: ProgramEndpointClassification, hidden: string, handler: (actor: ProgramApiActor, payload: Record<string, unknown>, scope: { domainId?: string | null }) => Promise<unknown>): void => {
    const action = iamActionName(iamProgramService(PROGRAM), endpoint);
    const run: ProgramApiHandler = async (request) => {
      const actor = request.actor;
      if (!actor) return { ok: false, error: "Sign in to use the assistant.", errorCode: "authorization.required" };
      if (actor.channel === "paired-client") return { ok: false, error: "The assistant is used from the FluxIQ panel.", errorCode: "authorization.forbidden" };
      return { ok: true, payload: await handler(actor, payloadOf(request.payload), request.scope) };
    };
    registry.register({ programId: PROGRAM, endpoint, permission, classification, action, accessLevel: iamEndpointAccessLevel(action, endpoint, classification), resource: endpointResource.selfUser(), assistant: { hidden }, handler: run });
  };

  register(PANEL_ASSISTANT_ENDPOINTS.listThreads, "programs.read", "read", "The assistant's own list of chats, which the dock shows.", async (actor, payload) => ({ conversations: await assistant.listThreads(actor, { limit: payload.limit }) }));
  register(PANEL_ASSISTANT_ENDPOINTS.getThread, "programs.read", "read", "The assistant's own chat, which the dock reads.", async (actor, payload) => {
    const thread = await assistant.readThread(actor, { conversationId: text(payload.conversationId, "conversationId"), limit: payload.limit, ...(typeof payload.sinceTurnId === "string" ? { sinceTurnId: payload.sinceTurnId } : {}) });
    if (!thread) throw new Error("That conversation does not exist.");
    return { conversation: thread };
  });
  register(PANEL_ASSISTANT_ENDPOINTS.getThreadAttachment, "programs.read", "read", "The dock fetches a turn's attachment to draw it; a person does not ask for it in words.", async (actor, payload, scope) => {
    const inProject = panelAssistantProjectAttachments(registry, service, { actor, scope, action: iamActionName(iamProgramService(PROGRAM), PANEL_ASSISTANT_ENDPOINTS.getThreadAttachment) });
    const read = { conversationId: text(payload.conversationId, "conversationId"), turnId: text(payload.turnId, "turnId"), projectId: projectOf(payload.projectId) };
    return { attachment: await assistant.readAttachment(actor, read, inProject) };
  });
  register(PANEL_ASSISTANT_ENDPOINTS.renameThread, "programs.write", "authoring", "A person renames one of their chats from the dock's own list.", async (actor, payload) => ({ conversation: await assistant.renameThread(actor, { conversationId: text(payload.conversationId, "conversationId"), title: payload.title }) }));
  register(PANEL_ASSISTANT_ENDPOINTS.deleteThread, "programs.write", "authoring", "A person deletes one of their chats from the dock's own list; the assistant never removes its own chat.", async (actor, payload) => assistant.deleteThread(actor, { conversationId: text(payload.conversationId, "conversationId") }));
  register(PANEL_ASSISTANT_ENDPOINTS.openThread, "programs.write", "authoring", "The dock's New chat button opens the assistant's chat.", async (actor, payload) => ({ conversation: await assistant.openThread(actor, { title: typeof payload.title === "string" ? payload.title : null }) }));
  register(PANEL_ASSISTANT_ENDPOINTS.send, "programs.write", "authoring", "A person's own message to the assistant.", async (actor, payload, scope) => {
    const sent = await assistant.send(actor, scope, {
      text: text(payload.text, "text"),
      onScreen: payload.onScreen,
      ...(typeof payload.conversationId === "string" && payload.conversationId ? { conversationId: payload.conversationId } : {}),
      ...(typeof payload.title === "string" ? { title: payload.title } : {})
    });
    return { conversation: sent.conversation, turn: sent.turn };
  });
  register(PANEL_ASSISTANT_ENDPOINTS.answer, "programs.write", "authoring", "Only a person's own press answers the assistant's Allow card.", async (actor, payload, scope) => {
    const kind = payload.kind;
    if (kind !== "grant" && kind !== "deny") throw new Error("An answer to the assistant is grant (Allow) or deny (Don't).");
    const answered = await assistant.answer(actor, scope, { askId: text(payload.askId, "askId"), kind });
    return { ask: answered.ask };
  });
  register(PANEL_ASSISTANT_ENDPOINTS.getAllowance, "programs.read", "read", "Settings shows the assistant's spending allowance.", async () => assistant.allowance());
  register(PANEL_ASSISTANT_ENDPOINTS.setAllowance, "secrets.manage", "authoring", "The assistant does not change its own spending allowance; a person sets it in Settings.", async (_actor, payload) => assistant.setAllowance(payload.allowanceUsd));
  return assistant;
}

function payloadOf(payload: unknown): Record<string, unknown> {
  return payload !== null && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
}

/** The project a request names, or null when it names none or names the panel thread's own `panel`. */
function projectOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() && value.trim() !== PANEL_PROJECT ? value.trim() : null;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value;
}
