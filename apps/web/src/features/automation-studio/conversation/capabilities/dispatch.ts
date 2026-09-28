// Running a capability: fill in what the panel already knows, then do it.
//
// **What is on screen counts as an argument.** A person who says "run it" while
// looking at a Flow has named the Flow. Every argument declaring `fromContext`
// is taken from what the panel currently has open when the request leaves it
// out, so the fewest words that could possibly work do work. That is the same
// rule that says a node must be usable on minimal parameters: whatever can be
// derived is derived, and nothing is demanded up front that the panel could
// have supplied itself.
//
// **An unknown id resolves rather than refuses.** A model that writes
// `flow.run` when the catalog says `run.execute` gets the capability it meant,
// with the confidence recorded so the caller can say which one it took. A
// refusal there would be a chat window declining to operate the panel over a
// spelling.
//
// **Only deleting and moving money stop.** `asks` is returned for exactly those
// two consequence classes and means the person re-authorizes, not that the
// panel is asking whether it may. Everything else runs: editing a Flow,
// changing a setting, granting a model run, rolling a version back. The
// person's instruction is the grant.

import {
  panelCapabilityAsksFirst,
  type PanelCapability,
  type PanelCapabilityArguments,
  type PanelCapabilityContext,
  type PanelCapabilityOutcome
} from "./contract";
import { panelCapability } from "./registry";
import { resolvePanelCapability } from "./resolver";

export type PanelCapabilityRequest = {
  /** The capability's id, when whoever asked already has one. */
  capabilityId?: string;
  /** What the person wrote, used when no id was given or the id is not one we know. */
  request?: string;
  arguments?: PanelCapabilityArguments;
};

export type PanelCapabilityDispatch = {
  /** Null only when the catalog is empty, which the build does not allow. */
  capability: PanelCapability | null;
  /** How sure the match is. One when the id was given and known. */
  confidence: number;
  /** The arguments actually sent, after the panel's own context filled the gaps. */
  arguments: PanelCapabilityArguments;
  outcome: PanelCapabilityOutcome;
};

function contextValue(context: PanelCapabilityContext, key: string): string | null {
  const value = (context as unknown as Record<string, unknown>)[key];
  return typeof value === "string" && value ? value : null;
}

/** The request's own arguments, with every `fromContext` gap filled from what is open. */
export function panelCapabilityArguments(
  capability: PanelCapability,
  context: PanelCapabilityContext,
  supplied: PanelCapabilityArguments = {}
): PanelCapabilityArguments {
  const filled: Record<string, PanelCapabilityArguments[string]> = { ...supplied };
  for (const argument of capability.arguments) {
    const given = filled[argument.name];
    if (given !== undefined && given !== null && given !== "") continue;
    if (argument.name === "authorizationPin" && context.authorizationPin) {
      filled[argument.name] = context.authorizationPin;
      continue;
    }
    if (!argument.fromContext) continue;
    const fromContext = contextValue(context, argument.fromContext);
    if (fromContext) filled[argument.name] = fromContext;
  }
  return filled;
}

/** Required arguments that are still missing, so a caller can ask for those and nothing else. */
export function panelCapabilityMissingArguments(
  capability: PanelCapability,
  args: PanelCapabilityArguments
): string[] {
  return capability.arguments
    .filter((argument) => argument.required)
    .filter((argument) => {
      const value = args[argument.name];
      return value === undefined || value === null || value === "";
    })
    .map((argument) => argument.name);
}

function describeMissing(capability: PanelCapability, missing: readonly string[]): PanelCapabilityOutcome {
  const wanted = capability.arguments
    .filter((argument) => missing.includes(argument.name))
    .map((argument) => `${argument.name} -- ${argument.describe}`);
  return {
    status: "failed",
    summary: `"${capability.title}" still needs ${missing.length === 1 ? "one thing" : `${missing.length} things`}.`,
    error: wanted.join(" ")
  };
}

export async function dispatchPanelCapability(
  context: PanelCapabilityContext,
  request: PanelCapabilityRequest
): Promise<PanelCapabilityDispatch> {
  const named = request.capabilityId ? panelCapability(request.capabilityId) : null;
  const resolution = named ? null : resolvePanelCapability(request.request ?? request.capabilityId ?? "");
  const capability = named ?? resolution?.best?.capability ?? null;
  const confidence = named ? 1 : resolution?.best?.confidence ?? 0;

  if (!capability) {
    return {
      capability: null,
      confidence: 0,
      arguments: {},
      outcome: { status: "failed", summary: "There is nothing the panel can do yet.", error: "The capability catalog is empty." }
    };
  }

  const args = panelCapabilityArguments(capability, context, request.arguments);
  const asksFirst = panelCapabilityAsksFirst(capability);
  const missing = panelCapabilityMissingArguments(capability, args);

  // Re-authorization first, because the PIN is the thing being asked for and
  // listing it beside a missing Flow id would read as two unrelated problems.
  if (asksFirst && missing.includes("authorizationPin")) {
    return {
      capability,
      confidence,
      arguments: args,
      outcome: {
        status: "asks",
        summary: `${capability.title} needs you to re-enter your PIN first.`,
        consequences: capability.consequences
      }
    };
  }
  if (missing.length) return { capability, confidence, arguments: args, outcome: describeMissing(capability, missing) };

  try {
    return { capability, confidence, arguments: args, outcome: await capability.invoke(context, args) };
  } catch (error) {
    // A thrown transport is still an answer the person is owed. The panel says
    // what it was doing and hands back the reason rather than losing both.
    return {
      capability,
      confidence,
      arguments: args,
      outcome: {
        status: "failed",
        summary: `"${capability.title}" did not finish.`,
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}
