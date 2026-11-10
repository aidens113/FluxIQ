import type { AssistantConsequence } from "@fluxiq/contracts/program-api-inputs";
import type { GlobalProgramApiRegistry, ProgramApiActor } from "../api.ts";
import type { ProgramApiAuthorizeInput } from "../iam/index.ts";
import { assistantToolOf, type AssistantTool } from "./tool.ts";
import { findAssistantTools } from "./find-assistant-tools.ts";
import { assistantRunConsequences, type AssistantRunTarget } from "./run-consequences.ts";

/** The registry calls the catalog makes: the registrations, and a decision for one actor. */
export type AssistantCatalogRegistry = Pick<GlobalProgramApiRegistry, "endpoints" | "authorize">;

// What an unresolved run may do, until its Flow says otherwise: everything a Flow can.
const UNRESOLVED_RUN: AssistantRunTarget = { lastingClasses: ["send_or_publish", "move_money", "delete"], permittedConsequences: [] };

/**
 * The tools the panel assistant may be offered, read from the registry's
 * `assistant` declarations. Build it once every program has registered; the
 * tool list is read on first use and kept.
 *
 * The catalog only narrows what a model is shown. Every call still goes
 * through `registry.call` with the person's own actor, which decides it again.
 */
export class AssistantToolCatalog {
  private readonly registry: AssistantCatalogRegistry;
  private declared: readonly AssistantTool[] | undefined;

  constructor(registry: AssistantCatalogRegistry) {
    this.registry = registry;
  }

  /** Every declared tool, by name. */
  tools(): readonly AssistantTool[] {
    this.declared ??= Object.freeze(this.registry.endpoints()
      .map((endpoint) => assistantToolOf(endpoint))
      .filter((tool): tool is AssistantTool => tool !== undefined)
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)));
    return this.declared;
  }

  /**
   * The tools `actor` may call, decided by `registry.authorize` on the
   * workspace (an operator program's tools on that program). A tool refused
   * on one project only still appears; the call itself refuses it.
   */
  async listFor(actor: ProgramApiActor): Promise<AssistantTool[]> {
    const allowed: AssistantTool[] = [];
    for (const tool of this.tools()) {
      const input: ProgramApiAuthorizeInput = { actor, action: tool.action, permission: tool.permission, programId: tool.programId };
      if (tool.action.startsWith("ops:")) input.resources = { kind: "program" };
      const decision = await this.registry.authorize(input);
      if (decision.allowed) allowed.push(tool);
    }
    return allowed;
  }

  /** The tools matching `query` by words (`findAssistantTools`), among `among` (every tool by default). */
  find(query: string, options: { among?: readonly AssistantTool[]; limit?: number } = {}): AssistantTool[] {
    return findAssistantTools(options.among ?? this.tools(), query, options.limit);
  }

  /** One tool by name: its JSON Schema, consequence, summary and context arguments. */
  describe(name: string): AssistantTool | undefined {
    return this.tools().find((tool) => tool.name === name);
  }

  /**
   * The classes a call on `name` has: its own, or for a `per-call` run its
   * target Flow's (`assistantRunConsequences`). A run whose Flow is not given
   * is treated as able to send, pay and delete, so it is asked about.
   */
  consequencesOf(name: string, target?: AssistantRunTarget): readonly AssistantConsequence[] {
    const tool = this.describe(name);
    if (tool === undefined) throw new Error(`Unknown assistant tool: ${name}`);
    if (tool.consequence !== "per-call") return [tool.consequence];
    return assistantRunConsequences(target ?? UNRESOLVED_RUN);
  }
}
