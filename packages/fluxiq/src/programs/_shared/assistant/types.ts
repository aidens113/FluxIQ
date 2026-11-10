import type { AssistantConsequence, PanelContextKey, ProgramApiInput } from "@fluxiq/contracts/program-api-inputs";
import type { IamAccessLevel } from "@fluxiq/contracts/iam";
import type { Permission } from "../../identity-access/index.ts";
import type { ProgramEndpointResource } from "../iam/index.ts";

/**
 * How the panel assistant may call an endpoint: its input (parser plus JSON
 * Schema, from `@fluxiq/contracts/program-api-inputs`), one plain sentence of
 * what it does, the words people use for it, and, only where the derived
 * class is wrong, its consequence. `contextArgs` maps an input field to the
 * panel context key that fills it.
 *
 * - `spends`: the US dollars a call commits, read from its input as the
 *   input parses it (0 when it commits none). Required when the input has a
 *   money field (`usdAmount`); the assistant asks before a call whose spend is
 *   more than what is left of the message's allowance, and counts it once it
 *   runs. Typed on the parsed input: annotate the parameter with the input's
 *   type (`(input: CarryOnTaskAttemptInput) => input.addUsd`).
 * - `target`: the input fields that hold what the call acts on, each with the
 *   plain word for one such thing (`{ categoryId: "category" }`), where the
 *   registration's IAM `resource` does not name it. The card names these, and
 *   any other input that could widen the act makes the call ask first.
 *   A `delete` or `security` act needs one, from `resource` or here
 *   (`assistantTargetProblem`).
 */
export type ProgramEndpointAssistantTool = {
  input: ProgramApiInput<unknown>;
  summary: string;
  phrases?: readonly string[];
  consequence?: AssistantConsequence | "per-call";
  contextArgs?: Readonly<Record<string, PanelContextKey>>;
  spends?(input: unknown): number;
  target?: Readonly<Record<string, string>>;
};

/** An endpoint the assistant is never offered; `hidden` says why, in a sentence. */
export type ProgramEndpointAssistantHidden = { hidden: string };

/** A registration's `assistant` field: a tool, or a reason it stays hidden. */
export type ProgramEndpointAssistant = ProgramEndpointAssistantTool | ProgramEndpointAssistantHidden;

/**
 * The structural shape of one registration the assistant modules read
 * (`GlobalProgramApiRegistry.endpoints()` returns a superset).
 */
export type AssistantEndpointSummary = {
  programId: string;
  endpoint: string;
  permission: Permission;
  classification: string;
  accessLevel?: IamAccessLevel;
  assistant?: ProgramEndpointAssistant;
};

/** What the consequence derivation reads about one endpoint. */
export type AssistantConsequenceSubject = {
  programId: string;
  endpoint: string;
  classification: string;
  accessLevel: IamAccessLevel;
  declared?: AssistantConsequence | "per-call";
};

/** One thing a call acts on as a person names it, before its name is looked up: its kind ("Flow"), id, the selection key that names it, and its project. */
export type AssistantTargetItem = { kind: string; id: string; contextKey?: PanelContextKey; projectId?: string };

/** What `assistantTargetProblem` reads about one registration. */
export type AssistantTargetSubject = {
  programId: string;
  endpoint: string;
  classification: string;
  accessLevel: IamAccessLevel;
  resource?: ProgramEndpointResource;
  assistant: ProgramEndpointAssistantTool;
};
