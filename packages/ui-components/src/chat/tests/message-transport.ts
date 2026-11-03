// Test support: a `ChatTransport` that carries each port call as the message
// the extension's background took before the ports existed, to a fake
// `request`, and flattens the reply the way the ports promise. The chat's tests
// were written against that `request(message)`, so they keep their fakes and
// their assertions on the messages sent; only the way a fake reaches the chat
// changed. Nothing in production code imports this.

import type {
  ChatActivityPort,
  ChatConversationPort,
  ChatModelsPort,
  ChatOverlayPreference,
  ChatRecordingsPort,
  ChatResult,
  ChatRunPort,
  ChatTransport
} from "../ports/index.ts";

/** One message to the fake, as the extension's panel sent it. */
export type TestMessage = { type: string; [key: string]: unknown };

/** The fake background: answers a message with the reply the extension's relay would have. */
export type TestRequest = (message: TestMessage) => Promise<ChatResult<unknown>>;

/** The message types the fakes answer, named as the extension names them. */
export const TEST_MESSAGES = {
  listRecordings: "fluxiq.listRecordings",
  panelOpenFluxIQ: "fluxiq.panel.openFluxIQ",
  panelConversationRead: "fluxiq.panel.conversationRead",
  panelConversationSend: "fluxiq.panel.conversationSend",
  panelConversationAnswer: "fluxiq.panel.conversationAnswer",
  panelStopRun: "fluxiq.panel.stopRun",
  panelTakeOverRun: "fluxiq.panel.takeOverRun",
  panelHandBackRun: "fluxiq.panel.handBackRun",
  panelModelReadiness: "fluxiq.panel.modelReadiness"
} as const;

/** The activity messages the fakes answer and push. */
export const TEST_ACTIVITY_MESSAGES = {
  read: "fluxiq.panel.activityRead",
  changed: "fluxiq.activity.changed",
  setOverlay: "fluxiq.panel.activityOverlay"
} as const;

/** A listener for what the fake background broadcasts; answers an unsubscribe. */
export type TestListen = (listener: (message: unknown) => void) => () => void;

/** What a transport may leave out, as a client without it does. */
export type TestOmission = "recordings" | "models" | "openInstructions" | "setOverlay";

export type MessageTransportOptions = {
  /** The fake's broadcast; without it nothing is ever pushed. */
  listen?: TestListen;
  omit?: readonly TestOmission[];
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** The relay's `{ ok: true, payload }` reply, as the payload. */
function payloadOf(result: ChatResult<unknown>): ChatResult<Record<string, unknown>> {
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: record(record(result.value)?.payload) ?? {} };
}

/** A relay reply of `{ ok: false }` inside a successful result is a failed result. */
function refusal(result: ChatResult<unknown>): ChatResult<never> | undefined {
  if (!result.ok) {
    return result;
  }
  const reply = record(result.value);
  if (reply?.ok !== false) {
    return undefined;
  }
  const sentence = typeof reply.sentence === "string" ? reply.sentence : "FluxIQ refused that.";
  return typeof reply.code === "string" ? { ok: false, sentence, code: reply.code } : { ok: false, sentence };
}

function stateOf(result: ChatResult<unknown>): ChatResult<{ state?: unknown }> {
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: { state: record(result.value)?.state } };
}

/** The conversation port over `request`. */
export function conversationOver(request: TestRequest): ChatConversationPort {
  return {
    listThreads: async (query) => payloadOf(await request({ type: TEST_MESSAGES.panelConversationRead, kind: "list", ...query })),
    readThread: async (query) => payloadOf(await request({ type: TEST_MESSAGES.panelConversationRead, kind: "get", ...query })),
    send: async (message) => payloadOf(await request({ type: TEST_MESSAGES.panelConversationSend, ...message })),
    answer: async (answer) => payloadOf(await request({ type: TEST_MESSAGES.panelConversationAnswer, ...answer }))
  };
}

/** The activity port over `request`, hearing pushes from `listen`; the setOverlay is left out when `withOverlay` is false. */
export function activityOver(request: TestRequest, listen?: TestListen, withOverlay = true): ChatActivityPort {
  const activity: ChatActivityPort = {
    read: async () => stateOf(await request({ type: TEST_ACTIVITY_MESSAGES.read })),
    subscribe: (listener) => {
      if (listen === undefined) {
        return () => undefined;
      }
      return listen((message) => {
        const pushed = record(message);
        if (pushed?.type === TEST_ACTIVITY_MESSAGES.changed) {
          listener(pushed.state);
        }
      });
    }
  };
  if (!withOverlay) {
    return activity;
  }
  return {
    ...activity,
    setOverlay: async (overlay: ChatOverlayPreference) => stateOf(await request({ type: TEST_ACTIVITY_MESSAGES.setOverlay, overlay }))
  };
}

/** The run port over `request`; `openInstructions` is left out when `withInstructions` is false. */
export function runsOver(request: TestRequest, withInstructions = true): ChatRunPort {
  const runs: ChatRunPort = {
    stop: async (target) => {
      const result = await request({ type: TEST_MESSAGES.panelStopRun, ...target });
      const failed = refusal(result);
      if (failed !== undefined) {
        return failed;
      }
      const payload = payloadOf(result);
      if (!payload.ok) {
        return payload;
      }
      return payload.value.cancellationRequested === false ? { ok: true, value: { cancellationRequested: false } } : { ok: true, value: {} };
    },
    takeOver: async (target) => refusal(await request({ type: TEST_MESSAGES.panelTakeOverRun, ...target })) ?? { ok: true, value: undefined },
    handBack: async (target) => refusal(await request({ type: TEST_MESSAGES.panelHandBackRun, ...target })) ?? { ok: true, value: undefined }
  };
  if (!withInstructions) {
    return runs;
  }
  return {
    ...runs,
    openInstructions: async (runId) => {
      const result = await request({ type: TEST_MESSAGES.panelOpenFluxIQ, runId });
      return result.ok ? { ok: true, value: undefined } : result;
    }
  };
}

/** The recordings port over `request`. */
export function recordingsOver(request: TestRequest): ChatRecordingsPort {
  return {
    list: async (query) => {
      const result = await request({ type: TEST_MESSAGES.listRecordings, ...query });
      if (!result.ok) {
        return result;
      }
      const items = record(record(result.value)?.recordings)?.items;
      return { ok: true, value: Array.isArray(items) ? { items } : {} };
    }
  };
}

/** The model-keys port over `request`. */
export function modelsOver(request: TestRequest): ChatModelsPort {
  return {
    readKeys: async () => {
      const payload = payloadOf(await request({ type: TEST_MESSAGES.panelModelReadiness }));
      return payload.ok ? { ok: true, value: { keys: payload.value.keys } } : payload;
    }
  };
}

/** A `ChatTransport` over `request`, sending the old message shapes. */
export function messageTransport(request: TestRequest, options: MessageTransportOptions = {}): ChatTransport {
  const omit = new Set(options.omit ?? []);
  return {
    conversation: conversationOver(request),
    activity: activityOver(request, options.listen, !omit.has("setOverlay")),
    runs: runsOver(request, !omit.has("openInstructions")),
    ...(omit.has("recordings") ? {} : { recordings: recordingsOver(request) }),
    ...(omit.has("models") ? {} : { models: modelsOver(request) })
  };
}
