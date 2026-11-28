/**
 * How every Allow card the assistant raises names its ask: `ask.assistant.<uuid>`. A card in a project's
 * thread is answered through that project's own `answer-ask`, which sees the prefix and hands the answer to
 * the assistant (`answerInProject`), so the exact call the card kept runs, and only for the person who
 * raised it; any other ask in the thread is answered as before.
 */
export const PANEL_ASSISTANT_CARD_ASK_PREFIX = "ask.assistant.";
