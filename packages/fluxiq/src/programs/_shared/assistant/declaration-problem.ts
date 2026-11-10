import { isAssistantConsequence, isPanelContextKey } from "@fluxiq/contracts/program-api-inputs";
import type { ProgramEndpointAssistant, ProgramEndpointAssistantTool } from "./types.ts";

/**
 * What is wrong with a registration's `assistant` declaration, or undefined.
 * The registry refuses a registration with a problem, so a malformed
 * declaration fails at start-up rather than in front of a model: among the
 * rest, an input with a money field (`usdAmount`) and no `spends`. Whether
 * `contextArgs` name real input fields is checked by the parity test, which
 * builds every schema; registering does not, except for the tools
 * `assistantTargetProblem` reads.
 */
export function assistantDeclarationProblem(assistant: ProgramEndpointAssistant): string | undefined {
  if ("hidden" in assistant) {
    return typeof assistant.hidden === "string" && assistant.hidden.trim() ? undefined : "a hidden endpoint needs a reason";
  }
  if (typeof assistant.summary !== "string" || !assistant.summary.trim()) return "a tool needs a summary";
  if (typeof assistant.input?.jsonSchema !== "function" || typeof assistant.input.parse !== "function" || typeof assistant.input.moneyFields !== "function") return "a tool needs an input from programApiInput";
  if (assistant.phrases?.some((phrase) => typeof phrase !== "string" || !phrase.trim())) return "every phrase must be non-empty text";
  if (assistant.consequence !== undefined && assistant.consequence !== "per-call" && !isAssistantConsequence(assistant.consequence)) {
    return `unknown consequence ${JSON.stringify(assistant.consequence)}`;
  }
  for (const [field, key] of Object.entries(assistant.contextArgs ?? {})) {
    if (!isPanelContextKey(key)) return `contextArgs.${field} names unknown panel context key ${JSON.stringify(key)}`;
  }
  if (assistant.spends !== undefined && typeof assistant.spends !== "function") return "spends must be a function of the input";
  if (assistant.target !== undefined) {
    const entries = assistant.target !== null && typeof assistant.target === "object" ? Object.entries(assistant.target) : [];
    if (!entries.length) return "a target names at least one input field";
    for (const [field, word] of entries) {
      if (!field.trim() || typeof word !== "string" || !word.trim()) return `target.${field} needs the plain word for what it holds`;
    }
  }
  return moneyProblem(assistant);
}

// A call that commits money says how much, from a mark in its schema, not from a field's name.
function moneyProblem(assistant: ProgramEndpointAssistantTool): string | undefined {
  try {
    const money = assistant.input.moneyFields();
    return money.length && assistant.spends === undefined ? `its input takes money (${money.join(", ")}) but it declares no spends` : undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
