import { CLIENT_GATEWAY_PROTOCOL_VERSION } from "../../index.ts";
import type { ClientGatewayClientMessage } from "../../index.ts";

type Payload<T extends ClientGatewayClientMessage["type"]> = Extract<ClientGatewayClientMessage, { type: T }>["payload"];
let nextId = 0;
export class RecordingMessages {
  private static header() { return { id: `message.${++nextId}`, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now() }; }
  static hello(payload: Payload<"client.hello">): ClientGatewayClientMessage { return { ...this.header(), type: "client.hello", payload }; }
  static start(payload: Payload<"client.start_recording">): ClientGatewayClientMessage { return { ...this.header(), type: "client.start_recording", payload }; }
  static stop(payload: Payload<"client.stop_recording">): ClientGatewayClientMessage { return { ...this.header(), type: "client.stop_recording", payload }; }
  static entry(payload: Payload<"client.recording_entry">): ClientGatewayClientMessage { return { ...this.header(), type: "client.recording_entry", payload }; }
  static event(payload: Payload<"client.recording_event">): ClientGatewayClientMessage { return { ...this.header(), type: "client.recording_event", payload }; }
  static snapshot(payload: Payload<"client.snapshot">): ClientGatewayClientMessage { return { ...this.header(), type: "client.snapshot", payload }; }
  static state(payload: Payload<"client.state_update">): ClientGatewayClientMessage { return { ...this.header(), type: "client.state_update", payload }; }
  static error(payload: Payload<"client.error">): ClientGatewayClientMessage { return { ...this.header(), type: "client.error", payload }; }
  static result(payload: Payload<"client.action_result">): ClientGatewayClientMessage { return { ...this.header(), type: "client.action_result", payload }; }
}
