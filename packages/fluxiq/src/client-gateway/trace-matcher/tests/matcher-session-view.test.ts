// P4 session view: the trace matcher's session is attached with the public view
// the trace recorded when it first claimed the session (`session.claimed`),
// else with a view the caller supplies -- never a supplied one over a recorded
// one -- and never with a made-up default: with neither there is no view, and
// attaching is refused before any session exists.

import { describe, expect, it } from "vitest";
import { ClientGatewayService, ClientGatewayTraceMatcher, type ClientGatewayClientHello, type ClientGatewayTraceMatcherGateway } from "../../index.ts";
import { copiedTraceStore, isClaimRecord, recordedTraceEvents, renumberedEvents } from "../../trace-replay/tests/trace-copy.ts";
import { ACTIONS, recordEpisode, succeeded, type Script } from "./episode-recording.ts";
import { openTrial, PROTOCOL, TRIAL_SCOPE } from "./trial-gateway.ts";

const SEARCH = { actionType: "example.search", parameters: { query: "lamps" } };

const PLAIN: Script = (command) => [{ delayMs: 1, act: (client, commandId) => client.say(succeeded(commandId, { answered: command.actionType })) }];

/** A view a caller supplies: unlike the recorded one in type, name and capabilities, so the two can be told apart. */
const SUPPLIED: ClientGatewayClientHello = { clientType: "custom", name: "Supplied client", capabilities: [{ ...ACTIONS }, { id: "supplied.extra", kind: "action" }], metadata: { domainId: "example.domain" } };

async function recordSearch(traceId: string) {
  return recordEpisode({ traceId, script: PLAIN, drive: async (episode) => void (await episode.execute(SEARCH)) });
}

/** A copy of the recording with its claim records taken away and its manifest's last sequence lowered to match, as a trace captured before they existed. */
async function withoutClaims(recorded: Awaited<ReturnType<typeof recordSearch>>) {
  const events = await recordedTraceEvents(recorded.trace);
  expect(events.some(isClaimRecord)).toBe(true);
  const kept = renumberedEvents(events.filter((event) => !isClaimRecord(event)));
  const store = await copiedTraceStore(recorded.trace, kept);
  const manifest = await store.readManifest(recorded.trace.traceId);
  if (manifest === undefined) throw new Error("the copy has no manifest");
  await store.writeManifest({ ...manifest, completeness: { ...manifest.completeness, lastSequence: kept.length } });
  return store;
}

/** A gateway port that counts the sessions it was asked to attach. */
function countingPort(): { port: ClientGatewayTraceMatcherGateway; attached: ClientGatewayClientHello[] } {
  const gateway = new ClientGatewayService({ commandTimeoutMs: 60_000, channelScope: { current: () => undefined } });
  const attached: ClientGatewayClientHello[] = [];
  return {
    attached,
    port: {
      attachScopedSession: (input) => {
        attached.push(input.hello);
        return gateway.attachScopedSession(input);
      },
      receiveRaw: (sessionId, text) => gateway.receiveRaw(sessionId, text),
      receiveTraceArtifact: (sessionId, upload) => gateway.receiveTraceArtifact(sessionId, upload)
    }
  };
}

describe("the trace matcher's session view", () => {
  it("is the view the trace recorded, even when the caller supplies another", async () => {
    const recorded = await recordSearch("trace.view.recorded");
    const trial = await openTrial({ store: recorded.trace.store, traceId: recorded.trace.traceId, sessionView: SUPPLIED });

    expect(trial.matcher.sessionView(SUPPLIED)).toMatchObject({ source: "recorded", view: { clientType: "extension", name: "client.matcher" } });
    expect(trial.matcher.sessionView()).toMatchObject({ source: "recorded" });
    expect(trial.session).toMatchObject({ clientType: "extension", name: "client.matcher" });
    expect(trial.session.capabilities.map((capability) => capability.id)).toEqual(["example.actions"]);
    const answer = await trial.execute(SEARCH);
    expect(answer.status).toBe("succeeded");
    await trial.close();
  });

  it("is the supplied view when the trace recorded none, and the trace is matched through it", async () => {
    const recorded = await recordSearch("trace.view.supplied");
    const store = await withoutClaims(recorded);
    const trial = await openTrial({ store, traceId: recorded.trace.traceId, sessionView: SUPPLIED });

    expect(trial.matcher.sessionView(SUPPLIED)).toEqual({ source: "supplied", view: SUPPLIED });
    expect(trial.session).toMatchObject({ clientType: "custom", name: "Supplied client" });
    expect(trial.session.capabilities.map((capability) => capability.id)).toEqual(["example.actions", "supplied.extra"]);
    await trial.matcher.deliverOpening();
    const answer = await trial.execute(SEARCH);
    await trial.matcher.settled();
    expect(answer.status).toBe("succeeded");
    expect(trial.matcher.report()).toMatchObject({ refusal: null, recordedOperations: 1, gaps: [] });
    expect(trial.matcher.report().matchedOperations.map((operation) => operation.actionType)).toEqual(["example.search"]);
    await trial.close();
  });

  it("does not exist when the trace recorded none and the caller supplied none: attaching is refused and no session is made", async () => {
    const recorded = await recordSearch("trace.view.none");
    const store = await withoutClaims(recorded);
    const { port, attached } = countingPort();
    const matcher = await ClientGatewayTraceMatcher.load({ store, traceId: recorded.trace.traceId, gateway: port, clock: { advance: async () => undefined }, contractVersions: PROTOCOL });

    expect(matcher.report().refusal).toBeNull();
    expect(matcher.sessionView()).toBeNull();
    expect(() => matcher.attach(TRIAL_SCOPE)).toThrow(/session view/);
    expect(attached).toEqual([]);
  });
});
