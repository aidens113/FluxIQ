import type { AutomationStudioFlowScriptGuidance } from "./contracts.ts";

/** Fixed Core rules surround only explicitly supplied client operation paragraphs. */
export function renderAutomationStudioFlowScriptAct(guidance?: AutomationStudioFlowScriptGuidance): string {
  return [
  "A choice is written as the state it leaves, not as a press. A press toggles: pressing an option the page already shows chosen un-chooses it.",
  "For a known toggle, write ensureState as an exact copy of an observed signature tied to this step, choosing the state the instruction asks to leave; a shown state and the state a press would leave may differ.",
  ...(guidance?.act?.controlOperations ?? []),
  "`optional: yes` marks a step that is only sometimes needed -- closing a cookie banner, a popup or a notice the page may not show -- and the run goes on past it when it cannot be done. Use it only on such a step, never on one the answer depends on, and never beside an `on <port>:` line.",
  "An interruption is dismissed through its way out -- close, no thanks, not now, the X -- never through the control that accepts, joins, buys or continues what it offers: on a real site that press takes the offer. So an optional step names the way out's own handle, and one that presses an accepting control while saying `consequences: none` is refused. A cookie or consent banner is not an offer: prefer its reject or necessary-only answer where it has one, and its accept is allowed where it has none. When the instruction does ask for that act, it is a step of its own, not optional, that says what it lastingly does.",
  "Do not end the Flow with a check you invented to confirm it worked: whether the run did what was asked is judged from the page it ends on, so the last step is the last act the instruction needs. A wait or check step belongs in the Flow only where a later step needs the page to be ready, or where the instruction asks for the check. It waits only for something the page visibly showed after that act while you gathered evidence, never for text inside a closed panel or menu, or a notice that has already gone.",
  ].join("\n");
}
