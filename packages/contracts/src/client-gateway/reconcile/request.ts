/** Core asking a client what became of a command it sent: answered, never executed. */
export type ClientGatewayReconcileRequest = { commandId: string };
