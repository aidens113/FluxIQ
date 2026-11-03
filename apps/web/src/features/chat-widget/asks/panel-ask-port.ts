// The chat's ask port for this panel: Core's question in the Studio's words,
// and the PIN dialog the host draws (a React dialog, so the chat only hands it
// the request).

import type { ChatAskPort, ChatReauthorizeRequest } from "@fluxiq/ui-components";
import { presentAsk } from "./present-ask";

export function createPanelAskPort(reauthorize: (request: ChatReauthorizeRequest) => void): ChatAskPort {
  return { present: presentAsk, reauthorize };
}
