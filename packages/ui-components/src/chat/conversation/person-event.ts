// Answers require a person's activation: a control that answers a question acts
// only on an event the browser itself made from a person's input
// (`isTrusted`). Browsers set it on every event they deliver from real input
// and never on one a script made, so an answer control ignores the latter.

/** Whether `event` came from a person's input, as the browser marks it. */
export function isPersonEvent(event: { isTrusted?: boolean }): boolean {
  return event.isTrusted === true;
}
