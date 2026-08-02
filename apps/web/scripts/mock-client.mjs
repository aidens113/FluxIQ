const url = process.env.FLUXIQ_PUBLIC_CLIENT_WS_URL || "ws://127.0.0.1:4777/client";
if (typeof WebSocket === "undefined") {
  console.error("This mock client needs a Node runtime with global WebSocket support.");
  process.exit(1);
}

const socket = new WebSocket(url);
let sessionToken = process.env.FLUXIQ_CLIENT_SESSION_TOKEN || "";

socket.addEventListener("open", () => {
  console.log(`[mock-client] connected ${url}`);
  send("client.hello", {
    clientId: "mock.extension.local",
    clientType: "extension",
    name: "Mock Extension Client",
    version: "0.1.0",
    ...(sessionToken ? { token: sessionToken } : {}),
    capabilities: [
      { id: "sample.recording", label: "Sample recording", kind: "recording" },
      { id: "sample.state", label: "Sample state", kind: "state" },
      { id: "sample.snapshot", label: "Sample snapshot", kind: "snapshot" },
      { id: "sample.actions", label: "Sample actions", kind: "action", actionTypes: ["sample.action"] }
    ],
    metadata: { mock: true }
  });
});

socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  console.log("[mock-client] received", message.type, message.payload);
  if (message.type === "server.pairing_required") {
    console.log(`[mock-client] waiting for web-panel approval, reference ${message.payload.referenceCode ?? "unknown"}`);
  }
  if (message.type === "server.session_ready") {
    sessionToken = message.payload.token;
    console.log(`[mock-client] session token ${sessionToken}`);
    sendStateUpdate();
  }
  if (message.type === "server.capture_snapshot") {
    send("client.snapshot", {
      kind: "structured",
      timestamp: Date.now(),
      state: {
        contextId: "mock.context.1",
        label: "Mock context",
        items: [{ id: "item.1", label: "Demo item" }]
      },
      metadata: { requestedBy: message.id }
    });
  }
  if (message.type === "server.start_recording") {
    send("client.recording_event", {
      recordingId: message.payload.recordingId,
      eventType: "recording.started",
      timestamp: Date.now(),
      payload: { contextId: "mock.context.1" }
    });
  }
  if (message.type === "server.execute_action") {
    send("client.action_result", {
      commandId: message.payload.commandId,
      status: "succeeded",
      startedAt: Date.now(),
      completedAt: Date.now(),
      message: `Mock ${message.payload.actionType} completed.`,
      target: message.payload.target,
      payload: { parameters: message.payload.parameters || {} }
    });
  }
});

socket.addEventListener("close", () => console.log("[mock-client] disconnected"));
socket.addEventListener("error", (event) => console.error("[mock-client] socket error", event));

function send(type, payload) {
  socket.send(JSON.stringify({
    id: `mock.${Date.now()}.${Math.random().toString(36).slice(2)}`,
    type,
    protocolVersion: "0.1",
    timestamp: Date.now(),
    payload
  }));
}

function sendStateUpdate() {
  send("client.state_update", {
    activeContextId: "mock.context.1",
    contexts: [{
      contextId: "mock.context.1",
      label: "Mock context",
      active: true,
      dimensions: { width: 1440, height: 900 }
    }],
    state: { status: "ready" },
    recording: false,
    metadata: { mock: true }
  });
}
