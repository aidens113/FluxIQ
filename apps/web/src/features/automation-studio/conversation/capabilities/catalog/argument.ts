// The arguments enough capabilities take that declaring them once is worth it.
//
// Each names the context key it can be taken from, which is what lets a person
// say "run it" and mean the Flow on their screen. The describing sentence is
// written for whoever has to supply the value -- a person or a model -- so it
// says what the thing is rather than what type it has.

import type { PanelCapabilityArgument } from "../contract";

export const PROJECT: PanelCapabilityArgument = {
  name: "projectId",
  kind: "id",
  describe: "The project it belongs to.",
  required: true,
  fromContext: "projectId"
};

export const FLOW: PanelCapabilityArgument = {
  name: "flowId",
  kind: "id",
  describe: "The Flow it is about.",
  required: true,
  fromContext: "flowId"
};

export const RUN: PanelCapabilityArgument = {
  name: "runId",
  kind: "id",
  describe: "The run it is about.",
  required: true,
  fromContext: "runId"
};

export const SUBFLOW: PanelCapabilityArgument = {
  name: "subflowId",
  kind: "id",
  describe: "The part of the Flow it is about.",
  required: true,
  fromContext: "subflowId"
};

export const RECORDING: PanelCapabilityArgument = {
  name: "recordingId",
  kind: "id",
  describe: "The recording it is about.",
  required: true,
  fromContext: "recordingId"
};

/**
 * Re-authorization, on the few capabilities that delete something.
 *
 * It is not a permission question. The person already asked for the thing; this
 * is the panel making sure it is still them before something goes for good.
 */
export const PIN: PanelCapabilityArgument = {
  name: "authorizationPin",
  kind: "text",
  describe: "Your security PIN, asked for again before anything is deleted.",
  required: true
};
