// What a chat holds of the person's answer about dangerous acts, beside its Flow (t976, F21).
//
// **Why beside the Flow.** A chat is the Flow's thread (`conversationOfFlow`): every attempt the
// chat starts, a person's Run again, and the saved Flow's runs those attempts make, all run on that
// one Flow. The user's rule is one question per chat, so the answer is kept where every one of them
// reads it, and outlives the process an attempt ran in.
//
// **What is kept.** The gated classes the person allowed and the ones they refused (with the
// request their no answered, which a later refusal carries), and, per instruction, the classes its
// read found plus any a run met that nobody foresaw: so a later attempt at the same words knows
// what to ask about without reading them again, and asks about the unforeseen class when it starts.
// Only Core's closed class names and Core's own ids are written; never the person's words, which
// are kept as a digest only.
//
// **A record it cannot read is refused, never read as none here.** A store that cannot be read
// throws; a record whose shape is wrong reads as none, since nothing in it can be trusted. The
// start step (`./start.ts`) then asks the person again, the safe side of a permission, and the
// next answer replaces it. With no data root it lives in memory for this service.

import path from "node:path";
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioConsequencesInOrder, automationStudioDestructiveConsequences, isAutomationStudioActionConsequence, type AutomationStudioActionConsequence } from "../../../../../runtime/action-permission-requests/index.ts";
import type { AutomationStudioFlowBootstrapPermissionHeard } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import { ProgramJsonStore } from "../../../../persistence/program-state/storage.ts";
import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../paths/index.ts";
import type { AutomationStudioProjectStore } from "../../projects/index.ts";
import type { AutomationStudioAnswerFirstChatPermission } from "./chat.ts";

const STORE_FILE = "chat-permission.json";
const KIND = "answer_first_chat_permission";
/** How many instructions' classes one chat keeps, newest last. */
const KEPT_NEEDS = 20;

type Stored = { kind: typeof KIND; schemaVersion: 1; projectId: string; flowId: string; chat: AutomationStudioAnswerFirstChatPermission };

const EMPTY: AutomationStudioAnswerFirstChatPermission = Object.freeze({ granted: [], declined: [], declinedRequestId: null, unforeseen: [], needs: [] }) as AutomationStudioAnswerFirstChatPermission;

export class AutomationStudioAnswerFirstChatPermissionStore {
  private readonly memory = new Map<string, Stored>();
  /** Per Flow, one read or write at a time, so an answer written as an attempt ends is read by the next one. */
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly paths: Pick<AutomationStudioProjectPaths, "root">, private readonly flows: Pick<AutomationStudioFlowPaths, "flowDirectory">, private readonly projects: Pick<AutomationStudioProjectStore, "ensureProjectStructure">) {}

  /** What the chat holds, or none. */
  async get(projectId: string, flowId: string): Promise<AutomationStudioAnswerFirstChatPermission | undefined> {
    return await this.queued(projectId, flowId, async () => structuredClone((await this.read(projectId, flowId))?.chat));
  }

  /** Keeps one answer the person gave: its classes join what they allowed or refused, and leave the other. */
  async heard(projectId: string, flowId: string, answer: Pick<AutomationStudioFlowBootstrapPermissionHeard, "outcome" | "classes" | "requestId">): Promise<void> {
    const classes = gated(answer.classes);
    if (!classes.length) return;
    await this.update(projectId, flowId, (chat) => answer.outcome === "granted"
      ? { ...chat, granted: gated([...chat.granted, ...classes]), declined: chat.declined.filter((consequence) => !classes.includes(consequence)) }
      : { ...chat, declined: gated([...chat.declined, ...classes]), granted: chat.granted.filter((consequence) => !classes.includes(consequence)), declinedRequestId: answer.requestId });
  }

  /** Adds `classes` to what `instruction` needs: its read's, or a class a run met that nobody foresaw. */
  async needs(projectId: string, flowId: string, instruction: string, classes: readonly string[]): Promise<void> {
    await this.update(projectId, flowId, (chat) => {
      const known = chat.needs.find((entry) => entry.instruction === instruction);
      const others = chat.needs.filter((entry) => entry !== known);
      return { ...chat, needs: [...others, { instruction, classes: gated([...(known?.classes ?? []), ...classes]) }].slice(-KEPT_NEEDS) };
    });
  }

  /** A runtime repair cannot identify a fresh instruction turn; keep its uncovered classes for the chat's next start. */
  async unforeseen(projectId: string, flowId: string, classes: readonly string[]): Promise<void> {
    await this.update(projectId, flowId, (chat) => ({ ...chat, unforeseen: gated([...chat.unforeseen, ...classes]) }));
  }

  private async update(projectId: string, flowId: string, change: (chat: AutomationStudioAnswerFirstChatPermission) => AutomationStudioAnswerFirstChatPermission): Promise<void> {
    await this.queued(projectId, flowId, async () => {
      const current = (await this.read(projectId, flowId))?.chat ?? structuredClone(EMPTY);
      await this.write({ kind: KIND, schemaVersion: 1, projectId, flowId, chat: change(current) });
    });
  }

  /** What is there; a record that cannot be read is none (header). */
  private async read(projectId: string, flowId: string): Promise<Stored | undefined> {
    if (!this.paths.root) return this.memory.get(JSON.stringify([projectId, flowId]));
    const value = await new ProgramJsonStore<JsonObject>(this.file(projectId, flowId), () => ({})).read();
    return readStored(value, projectId, flowId);
  }

  private async write(stored: Stored): Promise<void> {
    if (!this.paths.root) {
      this.memory.set(JSON.stringify([stored.projectId, stored.flowId]), structuredClone(stored));
      return;
    }
    await this.projects.ensureProjectStructure(stored.projectId);
    await new ProgramJsonStore<JsonObject>(this.file(stored.projectId, stored.flowId), () => ({})).write(stored as unknown as JsonObject);
  }

  private async queued<T>(projectId: string, flowId: string, work: () => Promise<T>): Promise<T> {
    const key = JSON.stringify([projectId, flowId]);
    const running = (this.queues.get(key) ?? Promise.resolve()).then(work, work);
    this.queues.set(key, running.then(() => undefined, () => undefined));
    return await running;
  }

  private file(projectId: string, flowId: string): string { return path.join(this.flows.flowDirectory(projectId, flowId), STORE_FILE); }
}

/** The gated classes among `values`, once each, in Core's order. */
function gated(values: readonly unknown[]): AutomationStudioActionConsequence[] {
  return automationStudioDestructiveConsequences(automationStudioConsequencesInOrder(values.filter((value): value is AutomationStudioActionConsequence => isAutomationStudioActionConsequence(value))));
}

function readStored(value: JsonObject, projectId: string, flowId: string): Stored | undefined {
  if (value.kind !== KIND || value.schemaVersion !== 1 || value.projectId !== projectId || value.flowId !== flowId) return undefined;
  const chat = value.chat;
  if (!chat || typeof chat !== "object" || Array.isArray(chat)) return undefined;
  const { granted, declined, declinedRequestId, needs, unforeseen = [] } = chat as Record<string, unknown>;
  if (!Array.isArray(granted) || !Array.isArray(declined) || !Array.isArray(needs) || (declinedRequestId !== null && typeof declinedRequestId !== "string")) return undefined;
  if (!Array.isArray(unforeseen)) return undefined;
  const kept: AutomationStudioAnswerFirstChatPermission["needs"] = [];
  for (const entry of needs) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
    const { instruction, classes } = entry as Record<string, unknown>;
    if (typeof instruction !== "string" || !Array.isArray(classes)) return undefined;
    kept.push({ instruction, classes: gated(classes) });
  }
  return { kind: KIND, schemaVersion: 1, projectId, flowId, chat: { granted: gated(granted), declined: gated(declined), declinedRequestId, unforeseen: gated(unforeseen), needs: kept } };
}
