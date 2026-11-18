import type { JsonObject } from "../../core.js";
import type { ClientGatewayRunContext } from "../../platform/index.ts";
import type { ClientGatewayHostLease } from "./host-lease.ts";

export type ClientGatewayActionCommand = {
  actionType: string;
  parameters?: JsonObject;
  target?: JsonObject;
  timeoutMs?: number;
  metadata?: JsonObject;
  /** How human the run's input looks, a whole number 0 to 100 (`humannessSchema`). Present only when the run's options set it, 0 included; absent means the client's own setting, else 0. */
  humanness?: number;
  /** Core marks a command whose step declared no lasting consequence and is not marked as acting on the world, sent at a humanness above 0: the client may precede its press with one misclick on an inert point. Absent everywhere else, and absent means the client never misclicks. */
  humannessMisclick?: true;
  /** Absent when no host lease is in force: the command runs as it always has. */
  lease?: ClientGatewayHostLease;
  /**
   * Gateway 0.2: who and what the command serves (`ClientGatewayRunContext`).
   * A 0.2 gateway sets it on every command; absent from a 0.1 gateway.
   */
  runContext?: ClientGatewayRunContext;
};
