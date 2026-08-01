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
    clientType: "browser-extension",
    name: "Mock Browser Extension",
    version: "0.1.0",
    ...(sessionToken ? { token: sessionToken } : {}),
    capabilities: [
      { id: "browser.recording", label: "Browser recording", kind: "recording" },
      { id: "browser.state", label: "Browser state", kind: "state" },
      { id: "browser.snapshot", label: "DOM snapshot", kind: "snapshot" },
      { id: "browser.actions", label: "Browser actions", kind: "action", actionTypes: ["click", "type", "navigate", "snapshot"] }
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
    sendBrowserState();
  }
  if (message.type === "server.capture_snapshot") {
    send("client.dom_snapshot", {
      kind: "dom",
      timestamp: Date.now(),
      state: {
        url: "https://example.local/mock",
        title: "Mock page",
        elements: [{ selector: "#demo", text: "Demo button" }]
      },
      metadata: { requestedBy: message.id }
    });
  }
  if (message.type === "server.start_recording") {
    send("client.recording_event", {
      recordingId: message.payload.recordingId,
      eventType: "recording.started",
      timestamp: Date.now(),
      payload: { url: "https://example.local/mock" }
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

function sendBrowserState() {
  send("client.browser_state", {
    activeTabId: "mock.tab.1",
    tabs: [{
      tabId: "mock.tab.1",
      url: "https://example.local/mock",
      title: "Mock page",
      active: true,
      viewport: { width: 1440, height: 900, deviceScaleFactor: 1 }
    }],
    permissions: ["tabs", "scripting"],
    recording: false,
    metadata: { mock: true }
  });
}
