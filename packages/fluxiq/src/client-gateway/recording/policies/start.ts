import type { ClientGatewaySession, ClientGatewayStartRecordingRequest } from "../../index.ts";
import type { JsonObject } from "../../../core/index.ts";
import type { RecordingDescriptionOutcome } from "./description.ts";
import type { RecordingStartContext } from "./start-context.ts";

/** Required host policy resolves the final effective address; requests cannot override it later. */
export interface RecordingStartPolicy {
  description(value: unknown, origin: "host" | "client"): RecordingDescriptionOutcome;
  context(input: { session: ClientGatewaySession; request: ClientGatewayStartRecordingRequest; origin: "host" | "client" }): RecordingStartContext | Promise<RecordingStartContext>;
  recheck?(input: { session: ClientGatewaySession; request: ClientGatewayStartRecordingRequest; context: Extract<RecordingStartContext, { ok: true }> }): void | Promise<void>;
  readonly diagnosticMetadata: JsonObject;
}
