import type { AutomationStudioSubflowCardPort } from "@fluxiq/contracts/automation";
import type { AutomationStudioPartGraph } from "./types.ts";
import { screenedPartWords } from "./words.ts";

/**
 * A graph's ports as a card shows them: the id, the name when it is words a
 * person reads (else the id when that is), and whether a run must supply it.
 * Undefined when a port can be shown by neither.
 */
export function partPortsOf(ports: AutomationStudioPartGraph["interface"]["inputs"]): AutomationStudioSubflowCardPort[] | undefined {
  const shown: AutomationStudioSubflowCardPort[] = [];
  for (const port of ports) {
    const name = screenedPartWords(port.name, "port") ?? screenedPartWords(port.id, "port");
    if (!name) return undefined;
    shown.push({ id: port.id, name, required: port.required === true });
  }
  return shown;
}
