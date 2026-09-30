// Every panel capability, declared once.
//
// This is the list the conversation answers "what can you do?" from, the list
// nearest-match resolution searches, and the list `tests/coverage.test.ts`
// matches the panel's own command modules against. Adding a control to the
// panel without adding it here fails that test; adding it here without a
// handler does not compile, because `invoke` is a required property with no
// default.
//
// **Each handler calls the command module the button calls.** Where a command
// module takes a scope object or a class the conversation has no way to build
// -- the graph editor's `AutomationFlowCommandCapabilities`, the live session's
// domain command class -- the handler posts that module's own exported endpoint
// constant rather than a string of its own, so the endpoint is still declared
// in one place and a rename still reaches both callers.
//
// **Nothing here asks a person for permission to do ordinary work.** The only
// capabilities that stop are the ones whose `consequences` name `delete` or
// `move_money`, and they stop to re-authorize rather than to ask whether they
// may. Running a Flow, editing it, changing a setting,
// rolling a version back and inspecting a run all simply happen: the person
// asked for the panel to be operable from the chat window, and that ask is the
// permission.
//
// The order is the order a tie breaks in, so the plainer request comes first.

import type { PanelCapability } from "../contract";
import { ADAPTATION_CAPABILITIES } from "./adaptations";
import { CONVERSATION_CAPABILITIES } from "./conversations";
import { FLOW_CAPABILITIES } from "./flows";
import { PROJECT_CAPABILITIES } from "./projects";
import { RECORDING_CAPABILITIES } from "./recordings";
import { RUNNING_CAPABILITIES } from "./running";
import { SETTINGS_CAPABILITIES } from "./settings";
import { VERSION_CAPABILITIES } from "./versions";

export const PANEL_CAPABILITIES: readonly PanelCapability[] = Object.freeze([
  ...FLOW_CAPABILITIES,
  ...RUNNING_CAPABILITIES,
  ...VERSION_CAPABILITIES,
  ...ADAPTATION_CAPABILITIES,
  ...SETTINGS_CAPABILITIES,
  ...PROJECT_CAPABILITIES,
  ...RECORDING_CAPABILITIES,
  ...CONVERSATION_CAPABILITIES
]);
