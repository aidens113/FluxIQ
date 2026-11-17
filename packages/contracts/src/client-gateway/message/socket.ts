export type ClientGatewaySocket = {
  send(message: string): void | Promise<void>;
  close?(code?: number, reason?: string): void | Promise<void>;
};
