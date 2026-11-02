import type { ClientGatewayActionCommand, ClientGatewayActionResult } from "../contracts.ts";
import { ClientGatewayCommandOutcome, type ClientGatewayDurableActionOptions, type ClientGatewayDurableDispatchResult } from "../service/command-ledger/index.ts";
import type { IoRegistry } from "../../io/index.ts";
import type { ClientGatewayRecordingBridgeOptions } from "./options.ts";
import type { StartClientRecordingInput } from "./start-input.ts";
import { RecordingBridgeState } from "./internal/index.ts";

export class ClientGatewayRecordingBridge<TTarget, TEvidence> {
  private readonly state: RecordingBridgeState<TTarget, TEvidence>;
  constructor(options: ClientGatewayRecordingBridgeOptions<TTarget, TEvidence>) {
    this.state = new RecordingBridgeState(options);
    options.gateway.onEvent(event => this.state.handleGatewayEvent(event));
  }
  bindIoRegistry(io: IoRegistry | undefined): this {
    this.state.io = io;
    return this;
  }
  startRecording(input: StartClientRecordingInput) { return this.state.startRecording(input); }
  stopRecording(sessionId: string) { return this.state.stopRecording(sessionId); }
  async executeAction(sessionId: string, command: ClientGatewayActionCommand): Promise<ClientGatewayActionResult>;
  async executeAction(sessionId: string, command: ClientGatewayActionCommand, options: ClientGatewayDurableActionOptions): Promise<ClientGatewayDurableDispatchResult<ClientGatewayActionResult>>;
  async executeAction(sessionId: string, command: ClientGatewayActionCommand, options?: ClientGatewayDurableActionOptions): Promise<ClientGatewayActionResult | ClientGatewayDurableDispatchResult<ClientGatewayActionResult>> {
    if (arguments.length >= 3) {
      const response = this.state.gateway.executeAction(sessionId, command, options!);
      const outcome = await response.result;
      if (outcome.status !== "completed" || this.state.gateway.isScopedSession(sessionId)) return outcome;
      try {
        await this.state.appendActionResult(sessionId, command, outcome.result);
      } catch (error) {
        await ClientGatewayCommandOutcome.stop(options!.context, "bridge.capture_failed");
        throw error;
      }
      return outcome;
    }
    const response = this.state.gateway.executeAction(sessionId, command);
    const result = await response.result;
    // A channel-scoped session's answer is replayed or scripted: it is never taken in as a live observation.
    if (!this.state.gateway.isScopedSession(sessionId)) await this.state.appendActionResult(sessionId, command, result);
    return result;
  }
}
