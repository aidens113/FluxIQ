// Which assistant a registry's endpoints serve, so the host can bind its model
// and settings after registering (`programs/_shared/runtime.ts`, which holds
// Secret Keys), and a test or the e2e fixture host can bind a scripted model.
// Keyed by the registry itself: two registries never share an assistant.

import type { PanelAssistant } from "../../../../runtime/conversations/assistant/index.ts";
import type { GlobalProgramApiRegistry, ProgramApiActor } from "../../../_shared/api.ts";

const assistants = new WeakMap<GlobalProgramApiRegistry, PanelAssistant<ProgramApiActor>>();

/** Records the assistant `registry`'s panel endpoints serve. Called once, at registration. */
export function rememberPanelAssistant(registry: GlobalProgramApiRegistry, assistant: PanelAssistant<ProgramApiActor>): void {
  if (assistants.has(registry)) throw new Error("The panel assistant's endpoints are already registered on this registry.");
  assistants.set(registry, assistant);
}

/** The assistant `registry`'s panel endpoints serve, or undefined when they are not registered on it. */
export function panelAssistantOf(registry: GlobalProgramApiRegistry): PanelAssistant<ProgramApiActor> | undefined {
  return assistants.get(registry);
}
