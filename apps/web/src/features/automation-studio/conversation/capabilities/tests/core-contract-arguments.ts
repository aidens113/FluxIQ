// What a capability is given in the contract test: the arguments Core's
// conversation layer would hand it, built from the capability's own
// declaration.
//
// **Synthesized, not listed.** Every argument is filled from its name and kind:
// an id from the seeded Core, a word from `WORDS`. A capability added tomorrow
// is therefore exercised without anyone writing an entry for it, and one whose
// argument this file cannot fill fails with a sentence naming the argument,
// instead of passing because nothing tried it.
//
// **Variants, where a capability chooses between endpoints.** Turning part of a
// Flow off and archiving it reach different handlers, so each is sent. An
// override replaces the synthesized value only where the declaration cannot say
// what a meaningful value is: a JSON structure, or a word that picks a branch.
//
// The PIN is never an argument here. Core's conversation layer never takes one
// from the model; it arrives only through the confirmation the panel asks for,
// which the test supplies as context exactly when the capability asks first.

import type { PanelCapability, PanelCapabilityArgumentValue, PanelCapabilityArguments } from "../contract";
import type { ContractWorld } from "./core-contract-world";

/** One way of asking for a capability. */
export type ContractVariant = { label: string; arguments: PanelCapabilityArguments };

type Ids = ContractWorld["ids"];
type Override = (ids: Ids) => Readonly<Record<string, PanelCapabilityArgumentValue | undefined>>;

/** A plain value for a text argument, by its name. */
const WORDS: Readonly<Record<string, string>> = {
  name: "Contract name",
  description: "Kept by the capability contract test.",
  instruction: "Collect the price of the kettle.",
  text: "Always check the price twice.",
  version: "2.0.0",
  changelog: "Tightened the price check.",
  reason: "It made the Flow worse.",
  title: "About the kettle Flow",
  purpose: "build_and_adapt",
  subjectKind: "flow"
};

/** An id argument, by its name, from what the world seeded. */
function idFor(ids: Ids, name: string): string | undefined {
  const table: Record<string, string> = {
    projectId: ids.projectId,
    flowId: ids.flowId,
    subflowId: ids.subflowId,
    runId: ids.runId,
    recordingId: ids.recordingId,
    adaptationId: ids.adaptationId,
    routeId: ids.routeId,
    trustedClientId: ids.trustedClientId,
    llmExecutionGrantId: ids.llmExecutionGrantId,
    subjectId: ids.flowId
  };
  return table[name];
}

/**
 * The branches a capability picks between, and the structures a JSON argument
 * holds. Keyed by capability id; each entry is one variant.
 */
const OVERRIDES: Readonly<Record<string, Readonly<Record<string, Override>>>> = {
  "flow.settings": {
    "a setting and a Flow field": () => ({ settings: { trainingMode: "normal", description: "Checks the kettle price." } })
  },
  "subflow.settings": {
    "its description and role": () => ({ settings: { description: "Handles the checkout page.", role: "site" } })
  },
  "subflow.turnOn": {
    disable: () => ({ state: "disable" }),
    enable: () => ({ state: "enable" }),
    archive: () => ({ state: "archive" })
  },
  "subflow.rename": {
    rename: () => ({ action: "rename", name: "Checkout page" }),
    duplicate: () => ({ action: "duplicate", name: "Checkout page copy" })
  },
  "route.save": {
    "a named route with a condition": (ids) => ({
      route: {
        name: "When it is sold out",
        targetSubflowId: ids.subflowId,
        conditionSummary: "The page says sold out.",
        conditionSignalPath: "page.stock",
        conditionOperator: "equals",
        conditionExpected: "sold out"
      }
    })
  },
  "route.fallback": {
    "to a part of the Flow": (ids) => ({ fallback: { kind: "subflow", targetSubflowId: ids.subflowId } }),
    "to failing with a message": () => ({ fallback: { kind: "fail", message: "Nothing matched the page." } })
  },
  "recording.note": {
    note: () => ({ asMarker: false }),
    marker: () => ({ asMarker: true })
  },
  "recording.delete": {
    one: () => ({ recordingIds: undefined }),
    several: (ids) => ({ recordingId: undefined, recordingIds: [ids.recordingId] })
  },
  "version.rollBack": {
    "the latest change": () => ({ adaptationId: undefined }),
    "a named change": (ids) => ({ adaptationId: ids.adaptationId })
  },
  "version.deprecate": {
    "the published version": (ids) => ({ version: ids.version })
  },
  "data.delete": {
    "everything the run collected": () => ({ datasetId: undefined })
  },
  "conversation.start": {
    "about a Flow": () => ({}),
    "about the project": () => ({ subjectKind: undefined, subjectId: undefined })
  }
};

/** Every argument the capability declares, filled, or the reason one cannot be. */
function synthesize(capability: PanelCapability, ids: Ids): PanelCapabilityArguments {
  const filled: Record<string, PanelCapabilityArgumentValue> = {};
  for (const argument of capability.arguments) {
    if (argument.name === "authorizationPin") continue;
    if (argument.kind === "id") {
      const id = idFor(ids, argument.name);
      if (id !== undefined) filled[argument.name] = id;
      else if (argument.required) throw new Error(`${capability.id} cannot be exercised: the contract world seeds nothing for its id argument "${argument.name}". Seed it in core-contract-world.ts.`);
      continue;
    }
    if (argument.kind === "boolean") { filled[argument.name] = false; continue; }
    if (argument.kind === "number") { filled[argument.name] = 1; continue; }
    if (argument.kind === "json") {
      if (argument.required) throw new Error(`${capability.id} cannot be exercised: its JSON argument "${argument.name}" needs a representative structure in OVERRIDES.`);
      continue;
    }
    const word = WORDS[argument.name];
    if (word !== undefined) filled[argument.name] = word;
    else if (argument.required) throw new Error(`${capability.id} cannot be exercised: add a representative value for "${argument.name}" to WORDS.`);
  }
  return filled;
}

/** The ways the contract test asks for this capability. Always at least one. */
export function contractVariants(capability: PanelCapability, ids: Ids): ContractVariant[] {
  const overrides = OVERRIDES[capability.id];
  if (!overrides) return [{ label: "as declared", arguments: synthesize(capability, ids) }];
  return Object.entries(overrides).map(([label, override]) => {
    const merged: Record<string, PanelCapabilityArgumentValue> = { ...synthesize({ ...capability, arguments: capability.arguments.filter((argument) => !(argument.name in override(ids))) }, ids) };
    for (const [name, value] of Object.entries(override(ids))) if (value !== undefined) merged[name] = value;
    return { label, arguments: merged };
  });
}

/** Capability ids with overrides, so the test can refuse overrides for a capability that no longer exists. */
export function contractOverrideIds(): string[] {
  return Object.keys(OVERRIDES);
}
