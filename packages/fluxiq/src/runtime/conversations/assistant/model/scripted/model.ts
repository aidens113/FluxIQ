import type { JsonValue } from "../../../../../core/index.ts";
import type { PanelAssistantModel, PanelAssistantModelTurn } from "../../types.ts";
import { panelAssistantScriptedValue } from "./answer-value.ts";
import type { PanelAssistantScript } from "./script.ts";

/**
 * An assistant model that replays a script instead of calling a provider, for
 * browser tests on the e2e fixture host (`../fixture-host-model-source.ts` is the
 * only way it is ever bound). The script is read again for every decision, so
 * a test can write it just before it types. Which decision comes next is read
 * from the transcript, not remembered: the scenario is the one whose `when`
 * words the person's latest message contains, and the position is how many
 * tool answers follow that message. That also holds after a person presses Allow
 * on a card, when the work goes on from the allowed call's answer alone, so a
 * scenario whose call waits for Allow has that call first. It never costs
 * anything.
 */
export function panelAssistantScriptedModel(readScript: () => Promise<PanelAssistantScript>): PanelAssistantModel {
  return {
    name: "scripted",
    decide: async (request) => {
      const script = await readScript();
      const lastPerson = request.transcript.map((turn) => turn.author).lastIndexOf("person");
      const said = (request.transcript[lastPerson]?.text ?? "").toLowerCase();
      const since = request.transcript.slice(lastPerson + 1);
      const scenario = script.scenarios.find((candidate) => said.includes(candidate.when.toLowerCase()));
      if (!scenario) return { decision: { reply: script.otherwise ?? "Nothing is scripted for that." }, costUsd: 0 };
      const next = scenario.turns[since.filter((turn) => turn.author === "tool").length];
      if (next === undefined) return { decision: { reply: script.after ?? "Done." }, costUsd: 0 };
      return { decision: panelAssistantScriptedValue(next, lastAnswerOf(since)), costUsd: 0 };
    }
  };
}

/** What the last tool answered in this message, or nothing. A tool entry that is not an answer (the loop's steer) is not JSON and holds none. */
function lastAnswerOf(since: readonly PanelAssistantModelTurn[]): JsonValue | undefined {
  const answered = since.filter((turn) => turn.author === "tool" && turn.text.trimStart().startsWith("{")).at(-1);
  return answered ? (JSON.parse(answered.text) as { answer?: JsonValue }).answer : undefined;
}
