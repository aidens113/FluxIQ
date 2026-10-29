/** A transport could not obtain an answer (unreachable listener, unreadable token file, a reply that is not a provisioning response). The message is safe to print: it never holds a body, token or password. */
export class AccountsTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountsTransportError";
  }
}
